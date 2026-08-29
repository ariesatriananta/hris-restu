import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { env } from '../config.js'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import { buildPayrollWorkbook, type PayrollExportRow } from '../lib/payroll-output.js'
import { authenticate, requirePermission, type AuthContext } from '../middleware/authenticate.js'

const uuid = z.string().uuid()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const historyQuery = z.object({
  siteCode: z.string().trim().max(20).optional(),
  status: z.enum(['DRAFT','CALCULATED','APPROVED','CLOSED','CANCELLED']).optional(),
  dateFrom: isoDate.optional(), dateTo: isoDate.optional(), query: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(50),
})
const compareQuery = z.object({ baseRunUid: uuid, targetRunUid: uuid })
const outputInput = z.object({ type: z.enum(['SUMMARY','PAYMENT']), idempotencyKey: uuid,
  employeeResultUids:z.array(uuid).max(500).optional(),query:z.string().trim().max(100).optional() }).strict()
const issueInput = z.object({ employeeResultUids: z.array(uuid).max(500).optional(), idempotencyKey: uuid }).strict()

function isSuper(auth: AuthContext) { return auth.roles.includes('SUPER_ADMIN') }
function isGlobal(auth: AuthContext) { return isSuper(auth) || auth.roles.includes('DIRECTOR') }
function enforceSite(auth: AuthContext, siteCode: string) {
  if (!isGlobal(auth) && !auth.siteAccess.includes(siteCode)) throw new ApiError(403,'Akses site Payroll ditolak.')
}
function money(value: unknown) {
  const text = String(value ?? '0.00'); const [integer,fraction=''] = text.split('.')
  return `${integer}.${fraction.padEnd(2,'0').slice(0,2)}`
}
function moneyToCents(value: unknown) {
  const normalized = money(value)
  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [integer, fraction = '00'] = unsigned.split('.')
  const cents = BigInt(integer || '0') * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))
  return negative ? -cents : cents
}
function centsToMoney(value: bigint) {
  const negative = value < 0n
  const absolute = negative ? -value : value
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}
export function exactMoneyDelta(target: unknown, base: unknown) {
  return centsToMoney(moneyToCents(target) - moneyToCents(base))
}
function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string,unknown>
  try { return JSON.parse(String(value ?? '{}')) as Record<string,unknown> } catch { return {} }
}
function runDto(row: RowDataPacket, prefix='') {
  const pick=(key:string)=>row[`${prefix}${key}`]
  return { uid:pick('Uid'),runNumber:Number(pick('Number')),runType:pick('Type') as 'SIMULATION'|'FINAL',status:pick('Status'),
    employeeCount:Number(pick('EmployeeCount')??0),totalPieceRateAmount:money(pick('PieceRate')),
    totalBasicSalaryAmount:money(pick('BasicSalary')),
    totalEarnings:money(pick('Earnings')),totalDeductions:money(pick('Deductions')),totalNetPay:money(pick('NetPay')),
    startedAt:pick('StartedAt')??null,finishedAt:pick('FinishedAt')??null,isCurrent:Boolean(Number(pick('IsCurrent')??0)) }
}

const runColumns = (alias: string, prefix: string) => `${alias}.uid ${prefix}Uid,${alias}.run_number ${prefix}Number,
 ${alias}.run_type ${prefix}Type,${alias}.status ${prefix}Status,${alias}.employee_count ${prefix}EmployeeCount,
 ${alias}.total_piece_rate_amount ${prefix}PieceRate,${alias}.total_earnings ${prefix}Earnings,
 ${alias}.total_basic_salary_amount ${prefix}BasicSalary,
 ${alias}.total_deductions ${prefix}Deductions,${alias}.total_net_pay ${prefix}NetPay,
 CONCAT(DATE_FORMAT(${alias}.calculation_started_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') ${prefix}StartedAt,
 IF(${alias}.calculation_finished_at IS NULL,NULL,CONCAT(DATE_FORMAT(${alias}.calculation_finished_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00')) ${prefix}FinishedAt`

async function loadRun(auth: AuthContext, runUid: string, executor: Pick<typeof pool,'query'>=pool) {
  const [rows]=await executor.query<RowDataPacket[]>(`SELECT pr.id runId,pr.payroll_period_id periodId,pp.uid periodUid,
    pp.period_code periodCode,pp.period_name periodName,DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
    DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,DATE_FORMAT(pp.payment_date,'%Y-%m-%d') paymentDate,
    pp.status periodStatus,pp.payroll_basis payrollBasis,pp.pay_frequency payFrequency,
    pp.employee_type_code employeeTypeCode,pp.current_run_id currentRunId,
    s.id siteId,s.code siteCode,s.name siteName,
    ${runColumns('pr','run')},(pp.current_run_id=pr.id) runIsCurrent
    FROM payroll_runs pr JOIN payroll_periods pp ON pp.id=pr.payroll_period_id JOIN sites s ON s.id=pp.site_id WHERE pr.uid=?`,[runUid])
  if(!rows[0]) throw new ApiError(404,'Run Payroll tidak ditemukan.')
  enforceSite(auth,String(rows[0].siteCode)); return rows[0]
}
function assertCompleted(row:RowDataPacket){ if(row.runStatus!=='COMPLETED') throw new ApiError(409,'Output hanya tersedia untuk run Payroll yang sudah selesai.') }
function isOfficial(row:RowDataPacket){ return row.periodStatus==='CLOSED'&&row.runType==='FINAL'&&Number(row.currentRunId)===Number(row.runId) }
async function employeeRows(runId:number, options?:{ids?:string[];query?:string}) {
  const values:unknown[]=[runId],conditions:string[]=[]
  if(options?.ids?.length){ conditions.push(`result.uid IN (${options.ids.map(()=>'?').join(',')})`); values.push(...options.ids) }
  if(options?.query){conditions.push('(result.employee_number_snapshot LIKE ? OR result.employee_name_snapshot LIKE ?)');values.push(`%${options.query}%`,`%${options.query}%`)}
  const filter=conditions.length?` AND ${conditions.join(' AND ')}`:''
  const [rows]=await pool.query<RowDataPacket[]>(`SELECT result.* FROM payroll_employee_results result
    WHERE result.payroll_run_id=?${filter} ORDER BY result.employee_name_snapshot,result.employee_number_snapshot`,values)
  if(options?.ids?.length&&!options.query&&rows.length!==new Set(options.ids).size) throw new ApiError(422,'Pilihan karyawan tidak seluruhnya berasal dari run Payroll ini.')
  return rows
}

async function companySnapshot(row:RowDataPacket) {
  const [snapshots]=await pool.query<RowDataPacket[]>(`SELECT company_name companyName,legal_address legalAddress,phone,email,website,
    tax_number taxNumber,logo_file_uid logoFileUid,snapshot_source snapshotSource FROM payroll_period_company_snapshots WHERE payroll_period_id=?`,[row.periodId])
  if(snapshots[0]) {
    const snapshot=snapshots[0]
    let logoUrl:string|null=null
    if(snapshot.logoFileUid){
      const [files]=await pool.query<RowDataPacket[]>(`SELECT storage_path storagePath FROM files WHERE uid=? AND mime_type IN ('image/jpeg','image/png','image/webp') LIMIT 1`,[snapshot.logoFileUid])
      if(files[0]) logoUrl=`${env.R2_PUBLIC_BASE_URL.replace(/\/$/,'')}/${files[0].storagePath}`
    }
    return {...snapshot,logoUrl}
  }
  const [settings]=await pool.query<RowDataPacket[]>(`SELECT setting_value settingValue FROM system_settings WHERE site_id IS NULL AND setting_key='company.profile' LIMIT 1`)
  const profile=parseJson(settings[0]?.settingValue)
  let logoUrl:string|null=null
  if(typeof profile.logoFileUid==='string'){
    const [files]=await pool.query<RowDataPacket[]>(`SELECT storage_path storagePath FROM files WHERE uid=? AND mime_type IN ('image/jpeg','image/png','image/webp') LIMIT 1`,[profile.logoFileUid])
    if(files[0]) logoUrl=`${env.R2_PUBLIC_BASE_URL.replace(/\/$/,'')}/${files[0].storagePath}`
  }
  return {companyName:String(profile.companyName??'PT Restu Sejati Inti Abadi'),legalAddress:String(profile.legalAddress??'Alamat perusahaan belum tersedia'),
    phone:profile.phone??null,email:profile.email??null,website:profile.website??null,taxNumber:profile.taxNumber??null,
    logoFileUid:profile.logoFileUid??null,logoUrl,snapshotSource:'LIVE_PREVIEW'}
}

async function payslipPayload(row:RowDataPacket, ids?:string[]) {
  assertCompleted(row); const official=isOfficial(row); const results=await employeeRows(Number(row.runId),{ids})
  const resultIds=results.map(result=>Number(result.id)); const components=new Map<number,RowDataPacket[]>(),production=new Map<number,RowDataPacket[]>(),attendance=new Map<number,RowDataPacket>(),weeklyTime=new Map<number,RowDataPacket[]>(),monthly=new Map<number,RowDataPacket>()
  if(resultIds.length){
    const placeholders=resultIds.map(()=>'?').join(',')
    const [componentRows]=await pool.query<RowDataPacket[]>(`SELECT payroll_employee_result_id resultId,component_code_snapshot code,
      component_name_snapshot name,component_category category,amount,notes FROM payroll_employee_component_details
      WHERE payroll_employee_result_id IN (${placeholders}) ORDER BY component_category,component_name_snapshot,id`,resultIds)
    const [productionRows]=await pool.query<RowDataPacket[]>(`SELECT payroll_employee_result_id resultId,job_name_snapshot jobName,
      unit_name_snapshot unitName,SUM(quantity_snapshot) quantity,SUM(amount_snapshot) amount FROM payroll_production_details
      WHERE payroll_employee_result_id IN (${placeholders}) GROUP BY payroll_employee_result_id,job_name_snapshot,unit_name_snapshot
      ORDER BY job_name_snapshot,unit_name_snapshot`,resultIds)
    const [attendanceRows]=await pool.query<RowDataPacket[]>(`SELECT payroll_employee_result_id resultId,scheduled_days scheduledDays,present_days presentDays,
      absent_days absentDays,leave_days leaveDays,sick_days sickDays,permission_days permissionDays,holiday_days holidayDays,
      late_minutes lateMinutes,early_leave_minutes earlyLeaveMinutes FROM payroll_attendance_summaries
      WHERE payroll_employee_result_id IN (${placeholders})`,resultIds)
    if(row.payrollBasis==='TIME_BASED'&&row.payFrequency==='WEEKLY'){
      const [timeRows]=await pool.query<RowDataPacket[]>(`SELECT payroll_employee_result_id resultId,daily_rate_snapshot dailyRate,
        SUM(is_payable=1) payableDays,SUM(is_payable=1 AND is_scheduled=0) offdayPresentDays,
        ROUND(SUM(amount_snapshot),0) amount
        FROM payroll_time_details WHERE payroll_employee_result_id IN (${placeholders})
        GROUP BY payroll_employee_result_id,daily_rate_snapshot ORDER BY daily_rate_snapshot`,resultIds)
      for(const item of timeRows){const list=weeklyTime.get(Number(item.resultId))??[];list.push(item);weeklyTime.set(Number(item.resultId),list)}
    }
    if(row.payrollBasis==='TIME_BASED'&&row.payFrequency==='MONTHLY'){
      const [monthlyRows]=await pool.query<RowDataPacket[]>(`SELECT payroll_employee_result_id resultId,
        full_basic_salary_snapshot fullBasicSalary,period_calendar_days periodCalendarDays,
        eligible_calendar_days eligibleCalendarDays,prorated_basic_salary proratedBasicSalary,
        scheduled_work_days scheduledWorkDays,alpha_days alphaDays,permission_days permissionDays,
        alpha_deduction alphaDeduction,permission_deduction permissionDeduction
        FROM payroll_monthly_summaries WHERE payroll_employee_result_id IN (${placeholders})`,resultIds)
      for(const item of monthlyRows) monthly.set(Number(item.resultId),item)
    }
    for(const item of componentRows){const list=components.get(Number(item.resultId))??[];list.push(item);components.set(Number(item.resultId),list)}
    for(const item of productionRows){const list=production.get(Number(item.resultId))??[];list.push(item);production.set(Number(item.resultId),list)}
    for(const item of attendanceRows) attendance.set(Number(item.resultId),item)
  }
  return { period:{uid:row.periodUid,periodCode:row.periodCode,periodName:row.periodName,periodStart:row.periodStart,periodEnd:row.periodEnd,
      paymentDate:row.paymentDate??null,status:row.periodStatus,payrollBasis:row.payrollBasis,payFrequency:row.payFrequency,
      employeeType:row.employeeTypeCode,site:{code:row.siteCode,name:row.siteName}},
    run:runDto(row,'run'),document:{kind:official?'OFFICIAL':'SIMULATION',watermark:official?null:'SIMULASI',official,closedDoesNotMeanPaid:true,company:await companySnapshot(row)},
    employees:results.map(result=>({employeeResultUid:result.uid,employeeNumber:result.employee_number_snapshot,fullName:result.employee_name_snapshot,
      employeeType:result.employee_type_snapshot,departmentName:result.department_name_snapshot,positionName:result.position_name_snapshot,
      bank:{bankName:result.bank_name_snapshot??null,accountLast4:result.bank_account_number_snapshot?String(result.bank_account_number_snapshot).slice(-4):null},
      totals:{pieceRateAmount:money(result.piece_rate_amount),basicSalaryAmount:money(result.basic_salary_amount),additionalEarnings:money(result.additional_earnings),grossEarnings:money(result.gross_earnings),
        totalDeductions:money(result.total_deductions),netPay:money(result.net_pay)},
      weeklyTime:weeklyTime.has(Number(result.id))?{
        payableDays:(weeklyTime.get(Number(result.id))??[]).reduce((sum,item)=>sum+Number(item.payableDays),0),
        offdayPresentDays:(weeklyTime.get(Number(result.id))??[]).reduce((sum,item)=>sum+Number(item.offdayPresentDays),0),
        baseAmount:money(result.basic_salary_amount),
        rateBreakdown:(weeklyTime.get(Number(result.id))??[]).map(item=>({dailyRate:money(item.dailyRate),payableDays:Number(item.payableDays),amount:money(item.amount)})),
      }:null,
      monthly:monthly.has(Number(result.id))?{
        fullBasicSalary:money(monthly.get(Number(result.id))?.fullBasicSalary),
        periodCalendarDays:Number(monthly.get(Number(result.id))?.periodCalendarDays??0),
        eligibleCalendarDays:Number(monthly.get(Number(result.id))?.eligibleCalendarDays??0),
        proratedBasicSalary:money(monthly.get(Number(result.id))?.proratedBasicSalary),
        scheduledWorkDays:Number(monthly.get(Number(result.id))?.scheduledWorkDays??0),
        alphaDays:Number(monthly.get(Number(result.id))?.alphaDays??0),
        permissionDays:Number(monthly.get(Number(result.id))?.permissionDays??0),
        alphaDeduction:money(monthly.get(Number(result.id))?.alphaDeduction),
        permissionDeduction:money(monthly.get(Number(result.id))?.permissionDeduction),
      }:null,
      attendance:attendance.has(Number(result.id))?Object.fromEntries(['scheduledDays','presentDays','absentDays','leaveDays','sickDays','permissionDays','holidayDays','lateMinutes','earlyLeaveMinutes'].map(key=>[key,Number(attendance.get(Number(result.id))?.[key]??0)])):null,
      components:(components.get(Number(result.id))??[]).map(item=>({code:item.code,name:item.name,category:item.category,amount:money(item.amount),notes:item.notes??null})),
      productionSummary:(production.get(Number(result.id))??[]).map(item=>({jobName:item.jobName,unitName:item.unitName,quantity:String(item.quantity),amount:money(item.amount)}))})) }
}

async function insertOutputAudit(conn:PoolConnection,input:{auth:AuthContext;request:Parameters<typeof writeAudit>[0]['request'];row:RowDataPacket;type:'SUMMARY_EXPORT'|'PAYMENT_EXPORT'|'SLIP_PRINT';key:string;count:number;selection?:unknown;checksum?:string}){
  const [existing]=await conn.query<RowDataPacket[]>(`SELECT id,uid,payroll_run_id runId,output_type outputType,
    selection_json selectionJson,checksum_sha256 checksumSha256 FROM payroll_output_audits WHERE idempotency_key=? FOR UPDATE`,[input.key])
  if(existing[0]){
    if(Number(existing[0].runId)!==Number(input.row.runId)||existing[0].outputType!==input.type) throw new ApiError(409,'Idempotency key sudah digunakan untuk output Payroll lain.')
    const oldSelection=JSON.stringify(parseJson(existing[0].selectionJson)),newSelection=JSON.stringify(input.selection??{})
    if(oldSelection!==newSelection||(input.checksum&&existing[0].checksumSha256!==input.checksum)) throw new ApiError(409,'Idempotency key sudah digunakan dengan pilihan output Payroll yang berbeda.')
    return {uid:String(existing[0].uid),replay:true}
  }
  const uid=randomUUID(); await conn.execute(`INSERT INTO payroll_output_audits(uid,payroll_period_id,payroll_run_id,output_type,idempotency_key,
    employee_result_count,selection_json,checksum_sha256,generated_by,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [uid,input.row.periodId,input.row.runId,input.type,input.key,input.count,input.selection?JSON.stringify(input.selection):null,input.checksum??null,input.auth.id,input.auth.id,input.auth.id])
  await writeAudit({auth:input.auth,request:input.request,module:'PAYROLL',siteId:Number(input.row.siteId),action:input.type==='SLIP_PRINT'?'PRINT':'EXPORT',
    table:'payroll_output_audits',recordUid:uid,description:input.type==='SLIP_PRINT'?'Menerbitkan data cetak slip Payroll.':'Mengekspor data Payroll.',
    afterData:{outputType:input.type,runUid:input.row.runUid,employeeResultCount:input.count,checksumSha256:input.checksum??null}},conn)
  return {uid,replay:false}
}

export const payrollHistoryRouter=Router()
payrollHistoryRouter.use(authenticate)
payrollHistoryRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('Pragma','no-cache');next()})

payrollHistoryRouter.get('/history',requirePermission('payroll.view'),async(req,res,next)=>{try{
  const auth=res.locals.auth as AuthContext,input=historyQuery.parse(req.query),where=['1=1'],values:unknown[]=[]
  if(!isGlobal(auth)){if(!auth.siteAccess.length)return res.json({data:[],meta:{page:input.page,pageSize:input.pageSize,total:0,totalPages:0,sites:[],capabilities:{canExport:false,canPaymentExport:false,canPrint:false}}});where.push(`s.code IN (${auth.siteAccess.map(()=>'?').join(',')})`);values.push(...auth.siteAccess)}
  if(input.siteCode){enforceSite(auth,input.siteCode);where.push('s.code=?');values.push(input.siteCode)}
  if(input.status){where.push('pp.status=?');values.push(input.status)} if(input.dateFrom){where.push('pp.period_end>=?');values.push(input.dateFrom)} if(input.dateTo){where.push('pp.period_start<=?');values.push(input.dateTo)}
  if(input.query){where.push('(pp.period_code LIKE ? OR pp.period_name LIKE ?)');values.push(`%${input.query}%`,`%${input.query}%`)}
  const [counts]=await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM payroll_periods pp JOIN sites s ON s.id=pp.site_id WHERE ${where.join(' AND ')}`,values)
  const [rows]=await pool.query<RowDataPacket[]>(`SELECT pp.uid,pp.period_code periodCode,pp.period_name periodName,DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
    DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,DATE_FORMAT(pp.payment_date,'%Y-%m-%d') paymentDate,pp.status,pp.payroll_basis payrollBasis,
    pp.pay_frequency payFrequency,pp.employee_type_code employeeType,
    CONCAT(DATE_FORMAT(pp.created_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') createdAt,IF(pp.closed_at IS NULL,NULL,CONCAT(DATE_FORMAT(pp.closed_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00')) closedAt,
    s.code siteCode,s.name siteName,COUNT(allrun.id) runCount,SUM(allrun.status='COMPLETED') completedRunCount,SUM(allrun.status='FAILED') failedRunCount,
    ${runColumns('current','current')},(pp.current_run_id=current.id) currentIsCurrent FROM payroll_periods pp JOIN sites s ON s.id=pp.site_id
    LEFT JOIN payroll_runs allrun ON allrun.payroll_period_id=pp.id LEFT JOIN payroll_runs current ON current.id=pp.current_run_id
    WHERE ${where.join(' AND ')} GROUP BY pp.id,current.id ORDER BY pp.period_start DESC,pp.id DESC LIMIT ? OFFSET ?`,[...values,input.pageSize,(input.page-1)*input.pageSize])
  const siteWhere=isGlobal(auth)?'s.is_active=1':`s.is_active=1 AND s.code IN (${auth.siteAccess.map(()=>'?').join(',')})`
  const [siteRows]=await pool.query<RowDataPacket[]>(`SELECT s.uid,s.code,s.name FROM sites s WHERE ${siteWhere} ORDER BY s.name`,isGlobal(auth)?[]:auth.siteAccess)
  const total=Number(counts[0]?.total??0),superUser=isSuper(auth)
  res.json({data:rows.map(row=>({uid:row.uid,periodCode:row.periodCode,periodName:row.periodName,periodStart:row.periodStart,periodEnd:row.periodEnd,paymentDate:row.paymentDate??null,
    status:row.status,payrollBasis:row.payrollBasis,payFrequency:row.payFrequency,employeeType:row.employeeType,
    site:{code:row.siteCode,name:row.siteName},currentRun:row.currentUid?runDto(row,'current'):null,
    runCount:Number(row.runCount),completedRunCount:Number(row.completedRunCount),failedRunCount:Number(row.failedRunCount),createdAt:row.createdAt,closedAt:row.closedAt??null})),
    meta:{page:input.page,pageSize:input.pageSize,total,totalPages:Math.ceil(total/input.pageSize),sites:siteRows,capabilities:{canExport:superUser||auth.permissions.includes('payroll.export'),canPaymentExport:superUser||auth.permissions.includes('payroll.payment_export'),canPrint:superUser||auth.permissions.includes('payroll.print')}}})
}catch(error){next(error)}})

payrollHistoryRouter.get('/periods/:periodUid/compare',requirePermission('payroll.view'),async(req,res,next)=>{try{
  const auth=res.locals.auth as AuthContext,periodUid=uuid.parse(req.params.periodUid),input=compareQuery.parse(req.query)
  if(input.baseRunUid===input.targetRunUid) throw new ApiError(422,'Pilih dua run Payroll yang berbeda.')
  const [runs]=await pool.query<RowDataPacket[]>(`SELECT pr.id,pr.uid,pp.uid periodUid,pp.period_code periodCode,pp.period_name periodName,
    DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,
    pp.payroll_basis payrollBasis,pp.pay_frequency payFrequency,pp.employee_type_code employeeTypeCode,
    s.code siteCode,s.name siteName,
    ${runColumns('pr','run')},(pp.current_run_id=pr.id) runIsCurrent FROM payroll_runs pr JOIN payroll_periods pp ON pp.id=pr.payroll_period_id JOIN sites s ON s.id=pp.site_id
    WHERE pp.uid=? AND pr.uid IN (?,?)`,[periodUid,input.baseRunUid,input.targetRunUid])
  if(runs.length!==2) throw new ApiError(404,'Dua run Payroll pada periode yang sama tidak ditemukan.')
  enforceSite(auth,String(runs[0].siteCode)); if(runs.some(row=>row.runStatus!=='COMPLETED')) throw new ApiError(409,'Perbandingan hanya tersedia untuk dua run COMPLETED.')
  const base=runs.find(row=>row.uid===input.baseRunUid)!,target=runs.find(row=>row.uid===input.targetRunUid)!
  const [employees]=await pool.query<RowDataPacket[]>(`SELECT e.uid employeeUid,COALESCE(t.employee_number_snapshot,b.employee_number_snapshot) employeeNumber,
    COALESCE(t.employee_name_snapshot,b.employee_name_snapshot) fullName,b.piece_rate_amount basePieceRate,b.additional_earnings baseEarnings,
    b.basic_salary_amount baseBasicSalary,b.gross_earnings baseGross,b.total_deductions baseDeductions,b.net_pay baseNet,
    t.piece_rate_amount targetPieceRate,t.basic_salary_amount targetBasicSalary,t.additional_earnings targetEarnings,
    t.gross_earnings targetGross,t.total_deductions targetDeductions,t.net_pay targetNet,b.id baseId,t.id targetId FROM
    (SELECT employee_id FROM payroll_employee_results WHERE payroll_run_id=? UNION SELECT employee_id FROM payroll_employee_results WHERE payroll_run_id=?) population
    JOIN employees e ON e.id=population.employee_id LEFT JOIN payroll_employee_results b ON b.employee_id=population.employee_id AND b.payroll_run_id=?
    LEFT JOIN payroll_employee_results t ON t.employee_id=population.employee_id AND t.payroll_run_id=? ORDER BY fullName,employeeNumber`,[base.id,target.id,base.id,target.id])
  const amountSet=(row:RowDataPacket,prefix:string)=>({pieceRateAmount:money(row[`${prefix}PieceRate`]),basicSalaryAmount:money(row[`${prefix}BasicSalary`]),additionalEarnings:money(row[`${prefix}Earnings`]),grossEarnings:money(row[`${prefix}Gross`]),totalDeductions:money(row[`${prefix}Deductions`]),netPay:money(row[`${prefix}Net`])})
  res.json({data:{period:{uid:periodUid,periodCode:base.periodCode,periodName:base.periodName,site:{code:base.siteCode,name:base.siteName},periodStart:base.periodStart,periodEnd:base.periodEnd,
      payrollBasis:base.payrollBasis,payFrequency:base.payFrequency,employeeType:base.employeeTypeCode},
    baseRun:runDto(base,'run'),targetRun:runDto(target,'run'),summary:{employeeCountDelta:Number(target.runEmployeeCount)-Number(base.runEmployeeCount),
      totalPieceRateAmountDelta:exactMoneyDelta(target.runPieceRate,base.runPieceRate),totalBasicSalaryAmountDelta:exactMoneyDelta(target.runBasicSalary,base.runBasicSalary),totalEarningsDelta:exactMoneyDelta(target.runEarnings,base.runEarnings),
      totalDeductionsDelta:exactMoneyDelta(target.runDeductions,base.runDeductions),totalNetPayDelta:exactMoneyDelta(target.runNetPay,base.runNetPay)},
    employees:employees.map(row=>{const baseAmounts=row.baseId?amountSet(row,'base'):null,targetAmounts=row.targetId?amountSet(row,'target'):null
      const deltas={pieceRateAmount:exactMoneyDelta(row.targetPieceRate,row.basePieceRate),basicSalaryAmount:exactMoneyDelta(row.targetBasicSalary,row.baseBasicSalary),additionalEarnings:exactMoneyDelta(row.targetEarnings,row.baseEarnings),grossEarnings:exactMoneyDelta(row.targetGross,row.baseGross),totalDeductions:exactMoneyDelta(row.targetDeductions,row.baseDeductions),netPay:exactMoneyDelta(row.targetNet,row.baseNet)}
      return {employeeUid:row.employeeUid,employeeNumber:row.employeeNumber,fullName:row.fullName,change:!row.baseId?'ADDED':!row.targetId?'REMOVED':Object.values(deltas).some(v=>v!=='0.00')?'CHANGED':'UNCHANGED',base:baseAmounts,target:targetAmounts,deltas}})}})
}catch(error){next(error)}})

payrollHistoryRouter.post('/runs/:runUid/export',async(req,res,next)=>{try{
  const input=outputInput.parse(req.body),permission=input.type==='PAYMENT'?'payroll.payment_export':'payroll.export',auth=res.locals.auth as AuthContext
  if(!isSuper(auth)&&!auth.permissions.includes(permission)) throw new ApiError(403,'Anda tidak memiliki izin untuk export Payroll ini.')
  const row=await loadRun(auth,uuid.parse(req.params.runUid));assertCompleted(row);if(input.type==='PAYMENT'&&!isOfficial(row)) throw new ApiError(409,'Daftar Pembayaran hanya tersedia dari current run FINAL pada Payroll CLOSED.')
  const results=await employeeRows(Number(row.runId),{ids:input.employeeResultUids,query:input.query}); const exportRows:PayrollExportRow[]=results.map(result=>({employeeNumber:result.employee_number_snapshot,fullName:result.employee_name_snapshot,
    employeeType:result.employee_type_snapshot,departmentName:result.department_name_snapshot,positionName:result.position_name_snapshot,bankName:result.bank_name_snapshot,
    bankAccountNumber:result.bank_account_number_snapshot,bankAccountName:result.bank_account_name_snapshot,pieceRateAmount:money(result.piece_rate_amount),basicSalaryAmount:money(result.basic_salary_amount),additionalEarnings:money(result.additional_earnings),
    grossEarnings:money(result.gross_earnings),totalDeductions:money(result.total_deductions),netPay:money(result.net_pay)}))
  const workbook=await buildPayrollWorkbook({type:input.type,periodCode:row.periodCode,periodName:row.periodName,siteName:row.siteName,periodStart:row.periodStart,periodEnd:row.periodEnd,
    runNumber:Number(row.runNumber),runType:row.runType,runStatus:row.runStatus,payrollBasis:row.payrollBasis,
    employeeType:row.employeeTypeCode,payFrequency:row.payFrequency,rows:exportRows})
  const checksum=createHash('sha256').update(workbook).digest('hex'),conn=await pool.getConnection();let audit
  try{await conn.beginTransaction();audit=await insertOutputAudit(conn,{auth,request:req,row,type:input.type==='PAYMENT'?'PAYMENT_EXPORT':'SUMMARY_EXPORT',key:input.idempotencyKey,count:results.length,selection:{type:input.type,employeeResultUids:input.employeeResultUids??null,query:input.query??null},checksum});await conn.commit()}
  catch(error){await conn.rollback();throw error}finally{conn.release()}
  const filename=`payroll-${input.type.toLowerCase()}-${String(row.periodCode).toLowerCase().replace(/[^a-z0-9-]/g,'-')}.xlsx`
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="${filename}"`)
  res.setHeader('X-Payroll-Output-UID',audit.uid);res.send(workbook)
}catch(error){next(error)}})

payrollHistoryRouter.get('/runs/:runUid/payslips',requirePermission('payroll.view'),async(req,res,next)=>{try{
  const auth=res.locals.auth as AuthContext,row=await loadRun(auth,uuid.parse(req.params.runUid)),resultUid=req.query.employeeResultUid?uuid.parse(req.query.employeeResultUid):undefined
  res.json({data:await payslipPayload(row,resultUid?[resultUid]:undefined),meta:{}})
}catch(error){next(error)}})

payrollHistoryRouter.post('/runs/:runUid/payslips/issue',requirePermission('payroll.print'),async(req,res,next)=>{const conn=await pool.getConnection();try{
  const auth=res.locals.auth as AuthContext,input=issueInput.parse(req.body),row=await loadRun(auth,uuid.parse(req.params.runUid))
  const payload=await payslipPayload(row,input.employeeResultUids)
  await conn.beginTransaction();const audit=await insertOutputAudit(conn,{auth,request:req,row,type:'SLIP_PRINT',key:input.idempotencyKey,count:payload.employees.length,selection:{employeeResultUids:input.employeeResultUids??'ALL'}});await conn.commit()
  res.json({data:payload,meta:{issuanceUid:audit.uid,replay:audit.replay}})
}catch(error){await conn.rollback();next(error)}finally{conn.release()}})
