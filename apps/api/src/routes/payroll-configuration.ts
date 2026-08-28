import { randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  assertNoEffectiveOverlap,
  assertSalaryEffectiveDate,
  assertWagePolicyMatrix,
  isPayrollPeriodStart,
  previewPayrollPeriods,
  timePayrollEmployeeTypes,
  wageMatrix,
} from '../lib/payroll-time-policy.js'
import { authenticate, requirePermission, type AuthContext } from '../middleware/authenticate.js'

const uid = z.string().uuid()
const idempotencyKey = z.string().trim().min(8).max(100)
const employeeType = z.enum(timePayrollEmployeeTypes)
const status = z.enum(['ACTIVE', 'CANCELLED'])
const policyInput = z.object({
  siteUid: uid,
  employeeType,
  wageBasis: z.enum(['PIECE_RATE', 'TIME_BASED']),
  payFrequency: z.enum(['WEEKLY', 'MONTHLY']),
  cutoffType: z.enum(['WEEK_END', 'LAST_DAY', 'DAY_OF_MONTH']),
  cutoffDay: z.number().int().min(1).max(31).nullable().optional(),
  effectiveFrom: z.string().date(),
})
const createPolicyInput = policyInput.extend({
  reason: z.string().trim().min(5).max(500),
  notes: z.string().trim().max(500).nullable().optional(),
  idempotencyKey,
})
const rateInput = z.object({
  employeeUid: uid,
  siteUid: uid,
  dailyRate: z.coerce.number().positive().max(999_999_999_999),
  currency: z.literal('IDR').default('IDR'),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  reason: z.string().trim().min(5).max(500),
  idempotencyKey,
})
const salaryInput = z.object({
  employeeUid: uid,
  basicSalary: z.coerce.number().positive().max(999_999_999_999),
  currency: z.literal('IDR').default('IDR'),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable().optional(),
  reason: z.string().trim().min(5).max(255),
  idempotencyKey,
})
const correctionInput = z.object({
  amount: z.coerce.number().positive().max(999_999_999_999),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  reason: z.string().trim().min(5).max(500),
  idempotencyKey,
})
const cancellationInput = z.object({ reason: z.string().trim().min(5).max(500), idempotencyKey })

function isGlobal(auth: AuthContext) { return auth.roles.includes('SUPER_ADMIN') || auth.roles.includes('DIRECTOR') }
function canSeeNominal(auth: AuthContext) { return auth.roles.includes('SUPER_ADMIN') || auth.roles.includes('PAYROLL_FINANCE') }
function assertSuper(auth: AuthContext) { if (!auth.roles.includes('SUPER_ADMIN')) throw new ApiError(403, 'Kebijakan Payroll hanya dapat dikelola Super Admin.') }
function enforceSite(auth: AuthContext, site: string) { if (!isGlobal(auth) && !auth.siteAccess.includes(site)) throw new ApiError(403, 'Akses site Payroll ditolak.') }
function dateMinusOne(date: string) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10) }

async function siteByUid(siteUid: string, auth: AuthContext, conn: Pick<PoolConnection, 'query'> = pool) {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT id,uid,code,name FROM sites WHERE uid=? AND is_active=1', [siteUid])
  const site = rows[0]
  if (!site) throw new ApiError(422, 'Site tidak ditemukan atau tidak aktif.')
  enforceSite(auth, String(site.code))
  return site
}

function policyDto(row: RowDataPacket) {
  return {
    uid: row.uid, employeeType: row.employeeType, wageBasis: row.wageBasis,
    payFrequency: row.payFrequency, cutoffType: row.cutoffType,
    cutoffDay: row.cutoffDay == null ? null : Number(row.cutoffDay), weekStartsOn: Number(row.weekStartsOn),
    prorateBasis: row.prorateBasis, attendancePayRule: row.attendancePayRule,
    deductionDivisor: row.deductionDivisor, roundingMode: row.roundingMode,
    roundingScale: Number(row.roundingScale), currency: row.currency,
    effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo, status: row.status,
    notes: row.notes ?? null,
    site: { uid: row.siteUid, code: row.siteCode, name: row.siteName },
    nextPeriods: row.status === 'ACTIVE' ? previewPayrollPeriods({ effectiveFrom: row.effectiveFrom, payFrequency: row.payFrequency, cutoffType: row.cutoffType, cutoffDay: row.cutoffDay }) : [],
  }
}

const policySelect = `SELECT ppv.*,ppv.employee_type_code employeeType,ppv.wage_basis wageBasis,
 ppv.pay_frequency payFrequency,ppv.cutoff_type cutoffType,ppv.cutoff_day cutoffDay,
 ppv.week_starts_on weekStartsOn,ppv.prorate_basis prorateBasis,
 ppv.attendance_pay_rule attendancePayRule,ppv.deduction_divisor deductionDivisor,
 ppv.rounding_mode roundingMode,ppv.rounding_scale roundingScale,
 DATE_FORMAT(ppv.effective_from,'%Y-%m-%d') effectiveFrom,
 DATE_FORMAT(ppv.effective_to,'%Y-%m-%d') effectiveTo,
 s.uid siteUid,s.code siteCode,s.name siteName
 FROM payroll_policy_versions ppv JOIN sites s ON s.id=ppv.site_id` 

function nominalDto(row: RowDataPacket, auth: AuthContext, field: 'dailyRate' | 'basicSalary') {
  const visible = canSeeNominal(auth)
  return {
    uid: row.uid,
    employee: { uid: row.employeeUid, employeeNumber: row.employeeNumber, fullName: row.fullName, employeeType: row.employeeType },
    site: { uid: row.siteUid, code: row.siteCode, name: row.siteName },
    [field]: visible ? String(row[field]) : null,
    nominalMasked: !visible,
    currency: row.currency, effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
    status: row.status, notes: row.notes ?? row.reason ?? null,
  }
}

async function assertEmployeeCoverage(conn: PoolConnection, input: { employeeUid: string; siteUid?: string; effectiveFrom: string; allowedTypes: string[] }) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT e.id,e.uid,e.employee_number employeeNumber,e.full_name fullName,
            et.code employeeType,s.id siteId,s.uid siteUid,s.code siteCode,s.name siteName,
            DATE_FORMAT(eh.effective_from,'%Y-%m-%d') eligibilityStart
       FROM employees e JOIN employee_employment_histories eh ON eh.employee_id=e.id
       JOIN employee_types et ON et.id=eh.employee_type_id
       JOIN employee_statuses es ON es.id=eh.employee_status_id AND es.allows_attendance=1
       JOIN sites s ON s.id=eh.site_id
      WHERE e.uid=? AND (? IS NULL OR s.uid=?)
        AND eh.effective_from<=? AND (eh.effective_to IS NULL OR eh.effective_to>=?)
      FOR UPDATE`,
    [input.employeeUid, input.siteUid ?? null, input.siteUid ?? null, input.effectiveFrom, input.effectiveFrom]
  )
  if (rows.length !== 1) throw new ApiError(422, 'Histori employment pada tanggal efektif tidak tunggal atau tidak eligible.')
  const employee = rows[0]
  if (!input.allowedTypes.includes(String(employee.employeeType))) throw new ApiError(422, `Master ini hanya berlaku untuk karyawan ${input.allowedTypes.join('/')} pada tanggal efektif.`)
  const [contracts] = await conn.query<RowDataPacket[]>(
    `SELECT ct.code FROM employee_contracts c JOIN contract_types ct ON ct.id=c.contract_type_id
      WHERE c.employee_id=? AND c.status IN ('ACTIVE','SCHEDULED') AND c.start_date<=?
        AND (c.end_date IS NULL OR c.end_date>=?)`, [employee.id, input.effectiveFrom, input.effectiveFrom]
  )
  const expected = employee.employeeType === 'TRAINING' ? ['TRAINING'] : ['PKWT', 'PKWTT']
  if (contracts.length !== 1 || !expected.includes(String(contracts[0].code))) throw new ApiError(422, 'Kontrak efektif tidak tunggal atau tidak sesuai dengan jenis karyawan.')
  return employee
}

async function assertNoImmutablePayrollForEmployee(conn: PoolConnection, employeeId: number, from: string, to?: string | null) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pp.period_code periodCode FROM payroll_employee_results per
      JOIN payroll_runs pr ON pr.id=per.payroll_run_id
      JOIN payroll_periods pp ON pp.id=per.payroll_period_id
     WHERE per.employee_id=? AND pp.period_start<=COALESCE(?,'9999-12-31') AND pp.period_end>=?
       AND (pp.status IN ('APPROVED','CLOSED') OR pr.run_type='FINAL') LIMIT 1`,
    [employeeId, to ?? null, from]
  )
  if (rows[0]) throw new ApiError(409, `Master sudah dipakai Payroll immutable ${String(rows[0].periodCode)}.`)
}

export const payrollConfigurationRouter = Router()
payrollConfigurationRouter.use(authenticate)

payrollConfigurationRouter.get('/configuration/meta', requirePermission('payroll.view'), async (_req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const where = isGlobal(auth) ? '' : `AND s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`
    const [sites] = await pool.query<RowDataPacket[]>(`SELECT uid,code,name FROM sites s WHERE is_active=1 ${where} ORDER BY name`, isGlobal(auth) ? [] : auth.siteAccess)
    const [employees] = await pool.query<RowDataPacket[]>(
      `SELECT e.uid,e.employee_number employeeNumber,e.full_name fullName,et.code employeeType,
              s.uid siteUid,s.code siteCode,s.name siteName
         FROM employees e JOIN employee_types et ON et.id=e.employee_type_id
         JOIN employee_statuses es ON es.id=e.employee_status_id AND es.allows_attendance=1
         JOIN sites s ON s.id=e.current_site_id
        WHERE et.code IN ('HARIAN','TRAINING','BULANAN') ${where}
        ORDER BY e.full_name,e.employee_number`,
      isGlobal(auth) ? [] : auth.siteAccess
    )
    res.json({ data: {
      sites, employees: employees.map((row) => ({ uid: row.uid, employeeNumber: row.employeeNumber, fullName: row.fullName, employeeType: row.employeeType, site: { uid: row.siteUid, code: row.siteCode, name: row.siteName } })), employeeTypes: timePayrollEmployeeTypes,
      wageMatrix, cutoffTypes: ['WEEK_END','LAST_DAY','DAY_OF_MONTH'], currencies: ['IDR'],
      capabilities: { canManagePolicy: auth.roles.includes('SUPER_ADMIN'), canManageRates: auth.roles.includes('SUPER_ADMIN') || auth.permissions.includes('payroll.rate.manage'), canSeeNominal: canSeeNominal(auth) },
    } })
  } catch (error) { next(error) }
})

payrollConfigurationRouter.post('/configuration/policies/preview', requirePermission('payroll.policy.view'), async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const input = policyInput.parse(req.body)
    const site = await siteByUid(input.siteUid, auth)
    const defaults = assertWagePolicyMatrix(input)
    res.json({ data: { site, policy: { ...input, ...defaults, cutoffDay: input.cutoffDay ?? null, weekStartsOn: 1, roundingMode: 'HALF_UP', roundingScale: 0, currency: 'IDR' }, nextPeriods: previewPayrollPeriods({ ...input, count: 3 }) } })
  } catch (error) { next(error) }
})

payrollConfigurationRouter.get('/configuration/policies', requirePermission('payroll.policy.view'), async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const where: string[] = []; const values: unknown[] = []
    if (!isGlobal(auth)) { where.push(`s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`); values.push(...auth.siteAccess) }
    if (req.query.site) { const site = String(req.query.site); enforceSite(auth, site); where.push('s.code=?'); values.push(site) }
    if (req.query.employeeType) { where.push('ppv.employee_type_code=?'); values.push(employeeType.parse(req.query.employeeType)) }
    if (req.query.status) { where.push('ppv.status=?'); values.push(status.parse(req.query.status)) }
    const [rows] = await pool.query<RowDataPacket[]>(`${policySelect}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ppv.effective_from DESC,ppv.id DESC`, values)
    res.json({ data: rows.map(policyDto), meta: { total: rows.length } })
  } catch (error) { next(error) }
})

payrollConfigurationRouter.post('/configuration/policies', requirePermission('payroll.policy.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext; assertSuper(auth)
    const input = createPolicyInput.parse(req.body); const defaults = assertWagePolicyMatrix(input)
    await conn.beginTransaction()
    const [retry] = await conn.query<RowDataPacket[]>('SELECT payroll_policy_version_id policyId FROM payroll_policy_revisions WHERE idempotency_key=? FOR UPDATE', [input.idempotencyKey])
    if (retry[0]) { await conn.rollback(); const [rows] = await pool.query<RowDataPacket[]>(`${policySelect} WHERE ppv.id=?`, [retry[0].policyId]); res.json({ data: policyDto(rows[0]) }); return }
    const site = await siteByUid(input.siteUid, auth, conn)
    const [overlap] = await conn.query<RowDataPacket[]>(`SELECT id,uid,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom,DATE_FORMAT(effective_to,'%Y-%m-%d') effectiveTo FROM payroll_policy_versions WHERE site_id=? AND employee_type_code=? AND status='ACTIVE' AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) FOR UPDATE`, [site.id,input.employeeType,input.effectiveFrom,input.effectiveFrom])
    const current = overlap[0]
    if (current && input.effectiveFrom <= current.effectiveFrom) throw new ApiError(409, 'Versi policy baru harus berlaku setelah versi aktif sebelumnya.')
    if (current) await conn.execute('UPDATE payroll_policy_versions SET effective_to=?,updated_by=? WHERE id=?', [dateMinusOne(input.effectiveFrom),auth.id,current.id])
    const [insert] = await conn.execute<ResultSetHeader>(`INSERT INTO payroll_policy_versions(uid,site_id,employee_type_code,wage_basis,pay_frequency,cutoff_type,cutoff_day,week_starts_on,prorate_basis,attendance_pay_rule,deduction_divisor,rounding_mode,rounding_scale,currency,effective_from,status,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [randomUUID(),site.id,input.employeeType,input.wageBasis,input.payFrequency,input.cutoffType,input.cutoffDay ?? null,1,defaults.prorateBasis,defaults.attendancePayRule,defaults.deductionDivisor,'HALF_UP',0,'IDR',input.effectiveFrom,'ACTIVE',input.notes ?? null,auth.id,auth.id])
    const [created] = await conn.query<RowDataPacket[]>(`${policySelect} WHERE ppv.id=?`, [insert.insertId])
    await conn.execute(`INSERT INTO payroll_policy_revisions(uid,payroll_policy_version_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by) VALUES(?,?,?,?,?,?,?,?)`, [randomUUID(),insert.insertId,'CREATE',input.idempotencyKey,current ? JSON.stringify(current) : null,JSON.stringify(policyDto(created[0])),input.reason,auth.id])
    await writeAudit({ auth,request:req,module:'PAYROLL',siteId:Number(site.id),action:'CREATE',table:'payroll_policy_versions',recordId:insert.insertId,recordUid:String(created[0].uid),description:`Membuat versi policy Payroll ${input.employeeType}.`,reason:input.reason,afterData:policyDto(created[0]) },conn)
    await conn.commit(); res.status(201).json({ data: policyDto(created[0]) })
  } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
})

payrollConfigurationRouter.post('/configuration/policies/:uid/cancel', requirePermission('payroll.policy.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext; assertSuper(auth)
    const input = cancellationInput.parse(req.body); const policyUid = uid.parse(req.params.uid)
    await conn.beginTransaction()
    const [retry] = await conn.query<RowDataPacket[]>('SELECT payroll_policy_version_id policyId FROM payroll_policy_revisions WHERE idempotency_key=? FOR UPDATE', [input.idempotencyKey])
    if (retry[0]) { await conn.rollback(); const [rows] = await pool.query<RowDataPacket[]>(`${policySelect} WHERE ppv.id=?`, [retry[0].policyId]); res.json({ data: policyDto(rows[0]) }); return }
    const [rows] = await conn.query<RowDataPacket[]>(`${policySelect} WHERE ppv.uid=? FOR UPDATE`, [policyUid]); const policy = rows[0]
    if (!policy) throw new ApiError(404, 'Policy Payroll tidak ditemukan.')
    enforceSite(auth, String(policy.siteCode)); if (policy.status !== 'ACTIVE') throw new ApiError(409, 'Policy Payroll sudah dibatalkan.')
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    if (String(policy.effectiveFrom) <= today) throw new ApiError(409, 'Policy yang sudah mulai berlaku tidak dapat dibatalkan. Buat versi baru untuk periode berikutnya.')
    const previousEnd = dateMinusOne(String(policy.effectiveFrom))
    const [previousRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM payroll_policy_versions WHERE site_id=? AND employee_type_code=? AND status='ACTIVE' AND effective_to=? ORDER BY effective_from DESC LIMIT 1 FOR UPDATE`, [policy.site_id,policy.employeeType,previousEnd])
    if (!previousRows[0]) throw new ApiError(409, 'Policy tidak dapat dibatalkan karena versi sebelumnya tidak ditemukan; pembatalan akan membuat gap.')
    await conn.execute(`UPDATE payroll_policy_versions SET status='CANCELLED',cancelled_at=NOW(3),cancelled_by=?,cancellation_reason=?,updated_by=? WHERE id=?`, [auth.id,input.reason,auth.id,policy.id])
    await conn.execute('UPDATE payroll_policy_versions SET effective_to=NULL,updated_by=? WHERE id=?', [auth.id,previousRows[0].id])
    const [afterRows] = await conn.query<RowDataPacket[]>(`${policySelect} WHERE ppv.id=?`, [policy.id]); const after = policyDto(afterRows[0])
    await conn.execute(`INSERT INTO payroll_policy_revisions(uid,payroll_policy_version_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by) VALUES(?,?,?,?,?,?,?,?)`, [randomUUID(),policy.id,'CANCELLATION',input.idempotencyKey,JSON.stringify(policyDto(policy)),JSON.stringify(after),input.reason,auth.id])
    await writeAudit({ auth,request:req,module:'PAYROLL',siteId:Number(policy.site_id),action:'UPDATE',table:'payroll_policy_versions',recordId:Number(policy.id),recordUid:policyUid,description:'Membatalkan policy Payroll future-effective dan memulihkan versi sebelumnya.',reason:input.reason },conn)
    await conn.commit(); res.json({ data: after })
  } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
})

const dailySelect = `SELECT r.id,r.uid,r.daily_rate dailyRate,r.currency,DATE_FORMAT(r.effective_from,'%Y-%m-%d') effectiveFrom,DATE_FORMAT(r.effective_to,'%Y-%m-%d') effectiveTo,r.status,r.notes,e.id employeeId,e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,r.employee_type_code employeeType,s.id siteId,s.uid siteUid,s.code siteCode,s.name siteName FROM employee_daily_rate_histories r JOIN employees e ON e.id=r.employee_id JOIN sites s ON s.id=r.site_id`
const salarySelect = `SELECT sh.id,sh.uid,sh.basic_salary basicSalary,sh.currency,DATE_FORMAT(sh.effective_from,'%Y-%m-%d') effectiveFrom,DATE_FORMAT(sh.effective_to,'%Y-%m-%d') effectiveTo,COALESCE(sh.status,'ACTIVE') status,sh.reason,e.id employeeId,e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,'BULANAN' employeeType,s.id siteId,s.uid siteUid,s.code siteCode,s.name siteName FROM employee_salary_histories sh JOIN employees e ON e.id=sh.employee_id JOIN employee_employment_histories eh ON eh.employee_id=e.id AND eh.effective_from<=sh.effective_from AND (eh.effective_to IS NULL OR eh.effective_to>=sh.effective_from) JOIN sites s ON s.id=eh.site_id`

function effectiveRanges(rows: RowDataPacket[]) {
  return rows.map((row) => ({ effectiveFrom: String(row.effectiveFrom), effectiveTo: row.effectiveTo == null ? null : String(row.effectiveTo) }))
}

async function listNominals(req: Request, res: Response, next: NextFunction, kind: 'rate'|'salary') {
  try {
    const auth = res.locals.auth as AuthContext; const where: string[]=[]; const values: unknown[]=[]
    const siteColumn='s.code'; if (!isGlobal(auth)) { where.push(`${siteColumn} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`); values.push(...auth.siteAccess) }
    if (req.query.site) { enforceSite(auth,String(req.query.site)); where.push(`${siteColumn}=?`); values.push(String(req.query.site)) }
    if (req.query.status) { where.push(`${kind==='rate'?'r':'sh'}.status=?`); values.push(status.parse(req.query.status)) }
    if (req.query.employeeType && kind==='rate') { const parsed=z.enum(['HARIAN','TRAINING']).parse(req.query.employeeType); where.push('r.employee_type_code=?'); values.push(parsed) }
    const query=String(req.query.query??'').trim(); if(query){where.push('(e.full_name LIKE ? OR e.employee_number LIKE ?)');values.push(`%${query}%`,`%${query}%`)}
    const [rows]=await pool.query<RowDataPacket[]>(`${kind==='rate'?dailySelect:salarySelect}${where.length?` WHERE ${where.join(' AND ')}`:''} ORDER BY e.full_name,${kind==='rate'?'r':'sh'}.effective_from DESC`,values)
    res.json({data:rows.map((row)=>nominalDto(row,auth,kind==='rate'?'dailyRate':'basicSalary')),meta:{total:rows.length}})
  } catch(error){next(error)}
}
payrollConfigurationRouter.get('/configuration/daily-rates',requirePermission('payroll.view'),(req,res,next)=>listNominals(req,res,next,'rate'))
payrollConfigurationRouter.get('/configuration/salaries',requirePermission('payroll.view'),(req,res,next)=>listNominals(req,res,next,'salary'))

payrollConfigurationRouter.post('/configuration/daily-rates',requirePermission('payroll.rate.manage'),async(req,res,next)=>{
  const conn=await pool.getConnection(); try{const auth=res.locals.auth as AuthContext;const input=rateInput.parse(req.body);await conn.beginTransaction();
    const [retry]=await conn.query<RowDataPacket[]>('SELECT employee_daily_rate_history_id sourceId FROM employee_daily_rate_revisions WHERE idempotency_key=? FOR UPDATE',[input.idempotencyKey]);if(retry[0]){await conn.rollback();const [rows]=await pool.query<RowDataPacket[]>(`${dailySelect} WHERE r.id=?`,[retry[0].sourceId]);res.json({data:nominalDto(rows[0],auth,'dailyRate')});return}
    const employee=await assertEmployeeCoverage(conn,{employeeUid:input.employeeUid,siteUid:input.siteUid,effectiveFrom:input.effectiveFrom,allowedTypes:['HARIAN','TRAINING']});enforceSite(auth,String(employee.siteCode));
    const [existing]=await conn.query<RowDataPacket[]>(`SELECT DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom,DATE_FORMAT(effective_to,'%Y-%m-%d') effectiveTo FROM employee_daily_rate_histories WHERE employee_id=? AND status='ACTIVE' FOR UPDATE`,[employee.id]);assertNoEffectiveOverlap(effectiveRanges(existing),input)
    const rateUid=randomUUID();const [insert]=await conn.execute<ResultSetHeader>(`INSERT INTO employee_daily_rate_histories(uid,employee_id,site_id,employee_type_code,daily_rate,currency,effective_from,effective_to,status,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,[rateUid,employee.id,employee.siteId,employee.employeeType,input.dailyRate,input.currency,input.effectiveFrom,input.effectiveTo??null,'ACTIVE',input.notes??null,auth.id,auth.id]);const [rows]=await conn.query<RowDataPacket[]>(`${dailySelect} WHERE r.id=?`,[insert.insertId]);
    await conn.execute(`INSERT INTO employee_daily_rate_revisions(uid,employee_daily_rate_history_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by) VALUES(?,?,?,?,?,?,?,?)`,[randomUUID(),insert.insertId,'CREATE',input.idempotencyKey,null,JSON.stringify(rows[0]),input.reason,auth.id]);await writeAudit({auth,request:req,module:'PAYROLL',siteId:Number(employee.siteId),action:'CREATE',table:'employee_daily_rate_histories',recordId:insert.insertId,recordUid:rateUid,description:'Membuat tarif harian karyawan.',reason:input.reason},conn);await conn.commit();res.status(201).json({data:nominalDto(rows[0],auth,'dailyRate')})
  }catch(error){await conn.rollback();next(error)}finally{conn.release()}
})

payrollConfigurationRouter.post('/configuration/salaries',requirePermission('payroll.rate.manage'),async(req,res,next)=>{
  const conn=await pool.getConnection();try{const auth=res.locals.auth as AuthContext;const input=salaryInput.parse(req.body);await conn.beginTransaction();const [retry]=await conn.query<RowDataPacket[]>('SELECT employee_salary_history_id sourceId FROM employee_salary_history_revisions WHERE idempotency_key=? FOR UPDATE',[input.idempotencyKey]);if(retry[0]){await conn.rollback();const [rows]=await pool.query<RowDataPacket[]>(`${salarySelect} WHERE sh.id=?`,[retry[0].sourceId]);res.json({data:nominalDto(rows[0],auth,'basicSalary')});return}
    const employee=await assertEmployeeCoverage(conn,{employeeUid:input.employeeUid,effectiveFrom:input.effectiveFrom,allowedTypes:['BULANAN']});enforceSite(auth,String(employee.siteCode));const [existing]=await conn.query<RowDataPacket[]>(`SELECT DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom,DATE_FORMAT(effective_to,'%Y-%m-%d') effectiveTo FROM employee_salary_histories WHERE employee_id=? AND status='ACTIVE' FOR UPDATE`,[employee.id]);assertNoEffectiveOverlap(effectiveRanges(existing),input)
    const [policies]=await conn.query<RowDataPacket[]>(`SELECT pay_frequency payFrequency,cutoff_type cutoffType,cutoff_day cutoffDay,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom FROM payroll_policy_versions WHERE site_id=? AND employee_type_code='BULANAN' AND status='ACTIVE' AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`,[employee.siteId,input.effectiveFrom,input.effectiveFrom]);if(policies.length!==1)throw new ApiError(422,'Policy Payroll Bulanan pada tanggal efektif tidak tunggal.');const activePolicy=policies[0];const isPeriodStart=isPayrollPeriodStart({date:input.effectiveFrom,payFrequency:String(activePolicy.payFrequency) as 'WEEKLY'|'MONTHLY',cutoffType:String(activePolicy.cutoffType) as 'WEEK_END'|'LAST_DAY'|'DAY_OF_MONTH',cutoffDay:activePolicy.cutoffDay==null?null:Number(activePolicy.cutoffDay)});assertSalaryEffectiveDate({effectiveFrom:input.effectiveFrom,isInitial:existing.length===0,eligibilityStart:String(employee.eligibilityStart),allowedPeriodStarts:isPeriodStart?[input.effectiveFrom]:[]})
    const salaryUid=randomUUID();const [insert]=await conn.execute<ResultSetHeader>(`INSERT INTO employee_salary_histories(uid,employee_id,effective_from,effective_to,basic_salary,currency,reason,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)`,[salaryUid,employee.id,input.effectiveFrom,input.effectiveTo??null,input.basicSalary,input.currency,input.reason,'ACTIVE',auth.id,auth.id]);const [rows]=await conn.query<RowDataPacket[]>(`${salarySelect} WHERE sh.id=?`,[insert.insertId]);await conn.execute(`INSERT INTO employee_salary_history_revisions(uid,employee_salary_history_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by) VALUES(?,?,?,?,?,?,?,?)`,[randomUUID(),insert.insertId,'CREATE',input.idempotencyKey,null,JSON.stringify(rows[0]),input.reason,auth.id]);await writeAudit({auth,request:req,module:'PAYROLL',siteId:Number(employee.siteId),action:'CREATE',table:'employee_salary_histories',recordId:insert.insertId,recordUid:salaryUid,description:'Membuat histori gaji pokok.',reason:input.reason},conn);await conn.commit();res.status(201).json({data:nominalDto(rows[0],auth,'basicSalary')})
  }catch(error){await conn.rollback();next(error)}finally{conn.release()}
})

async function reviseNominal(req:Request,res:Response,next:NextFunction,kind:'rate'|'salary',action:'correct'|'cancel'){
  const conn=await pool.getConnection();try{const auth=res.locals.auth as AuthContext;const input=action==='correct'?correctionInput.parse(req.body):cancellationInput.parse(req.body);await conn.beginTransaction();const table=kind==='rate'?'employee_daily_rate_histories':'employee_salary_histories';const revisionTable=kind==='rate'?'employee_daily_rate_revisions':'employee_salary_history_revisions';const fk=kind==='rate'?'employee_daily_rate_history_id':'employee_salary_history_id';const select=kind==='rate'?dailySelect:salarySelect;const alias=kind==='rate'?'r':'sh';const [retry]=await conn.query<RowDataPacket[]>(`SELECT ${fk} sourceId FROM ${revisionTable} WHERE idempotency_key=? FOR UPDATE`,[input.idempotencyKey]);if(retry[0]){await conn.rollback();const [rows]=await pool.query<RowDataPacket[]>(`${select} WHERE ${alias}.id=?`,[retry[0].sourceId]);res.json({data:nominalDto(rows[0],auth,kind==='rate'?'dailyRate':'basicSalary')});return}
    const [rows]=await conn.query<RowDataPacket[]>(`${select} WHERE ${alias}.uid=? FOR UPDATE`,[String(req.params.uid)]);const row=rows[0];if(!row)throw new ApiError(404,'Master nominal tidak ditemukan.');enforceSite(auth,String(row.siteCode));if(row.status!=='ACTIVE')throw new ApiError(409,'Master nominal sudah dibatalkan.');await assertNoImmutablePayrollForEmployee(conn,Number(row.employeeId),String(row.effectiveFrom),row.effectiveTo?String(row.effectiveTo):null);const before=JSON.stringify(row)
    if(action==='cancel'){await conn.execute(`UPDATE ${table} SET status='CANCELLED',cancelled_at=NOW(3),cancelled_by=?,cancellation_reason=?,updated_by=? WHERE id=?`,[auth.id,input.reason,auth.id,row.id])}else{const corrected=input as z.infer<typeof correctionInput>;const [overlap]=await conn.query<RowDataPacket[]>(`SELECT DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom,DATE_FORMAT(effective_to,'%Y-%m-%d') effectiveTo FROM ${table} WHERE employee_id=? AND status='ACTIVE' AND id<>? FOR UPDATE`,[row.employeeId,row.id]);assertNoEffectiveOverlap(effectiveRanges(overlap),corrected);
      if(kind==='rate'){await assertEmployeeCoverage(conn,{employeeUid:String(row.employeeUid),siteUid:String(row.siteUid),effectiveFrom:corrected.effectiveFrom,allowedTypes:['HARIAN','TRAINING']})}
      if(kind==='salary'){const employee=await assertEmployeeCoverage(conn,{employeeUid:String(row.employeeUid),effectiveFrom:corrected.effectiveFrom,allowedTypes:['BULANAN']});const [policies]=await conn.query<RowDataPacket[]>(`SELECT pay_frequency payFrequency,cutoff_type cutoffType,cutoff_day cutoffDay FROM payroll_policy_versions WHERE site_id=? AND employee_type_code='BULANAN' AND status='ACTIVE' AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`,[employee.siteId,corrected.effectiveFrom,corrected.effectiveFrom]);if(policies.length!==1)throw new ApiError(422,'Policy Payroll Bulanan pada tanggal efektif tidak tunggal.');const policy=policies[0];const periodStart=isPayrollPeriodStart({date:corrected.effectiveFrom,payFrequency:String(policy.payFrequency) as 'WEEKLY'|'MONTHLY',cutoffType:String(policy.cutoffType) as 'WEEK_END'|'LAST_DAY'|'DAY_OF_MONTH',cutoffDay:policy.cutoffDay==null?null:Number(policy.cutoffDay)});assertSalaryEffectiveDate({effectiveFrom:corrected.effectiveFrom,isInitial:overlap.length===0,eligibilityStart:String(employee.eligibilityStart),allowedPeriodStarts:periodStart?[corrected.effectiveFrom]:[]})}
      await conn.execute(`UPDATE ${table} SET ${kind==='rate'?'daily_rate':'basic_salary'}=?,effective_from=?,effective_to=?,${kind==='rate'?'notes':'reason'}=?,updated_by=? WHERE id=?`,[corrected.amount,corrected.effectiveFrom,corrected.effectiveTo??null,corrected.notes??corrected.reason,auth.id,row.id])}
    const [afterRows]=await conn.query<RowDataPacket[]>(`${select} WHERE ${alias}.id=?`,[row.id]);await conn.execute(`INSERT INTO ${revisionTable}(uid,${fk},revision_type,idempotency_key,before_data,after_data,reason,revised_by) VALUES(?,?,?,?,?,?,?,?)`,[randomUUID(),row.id,action==='cancel'?'CANCELLATION':'CORRECTION',input.idempotencyKey,before,JSON.stringify(afterRows[0]),input.reason,auth.id]);await writeAudit({auth,request:req,module:'PAYROLL',siteId:Number(row.siteId),action:'UPDATE',table,recordId:Number(row.id),recordUid:String(row.uid),description:action==='cancel'?'Membatalkan master nominal Payroll.':'Mengoreksi master nominal Payroll.',reason:input.reason},conn);await conn.commit();res.json({data:nominalDto(afterRows[0],auth,kind==='rate'?'dailyRate':'basicSalary')})
  }catch(error){await conn.rollback();next(error)}finally{conn.release()}
}
for(const [path,kind] of [['daily-rates','rate'],['salaries','salary']] as const){payrollConfigurationRouter.post(`/configuration/${path}/:uid/correct`,requirePermission('payroll.rate.manage'),(req,res,next)=>reviseNominal(req,res,next,kind,'correct'));payrollConfigurationRouter.post(`/configuration/${path}/:uid/cancel`,requirePermission('payroll.rate.manage'),(req,res,next)=>reviseNominal(req,res,next,kind,'cancel'))}

payrollConfigurationRouter.get('/configuration/training-preflight',requirePermission('payroll.view'),async(req,res,next)=>{
  try{const auth=res.locals.auth as AuthContext;const siteFilter=String(req.query.site??'').trim();if(siteFilter)enforceSite(auth,siteFilter);const sites=!isGlobal(auth)?auth.siteAccess:siteFilter?[siteFilter]:[];const clause=sites.length?`AND s.code IN (${sites.map(()=>'?').join(',')})`:''
    const [summary]=await pool.query<RowDataPacket[]>(`SELECT COUNT(DISTINCT eh.employee_id) trainingEmployees,COUNT(DISTINCT pt.id) productionFacts,COUNT(DISTINCT CASE WHEN pp.status IN ('APPROVED','CLOSED') OR pr.run_type='FINAL' THEN per.id END) immutablePayrollRows FROM employee_employment_histories eh JOIN employee_types et ON et.id=eh.employee_type_id AND et.code='TRAINING' JOIN sites s ON s.id=eh.site_id LEFT JOIN production_transactions pt ON pt.employee_id=eh.employee_id AND pt.business_date BETWEEN eh.effective_from AND COALESCE(eh.effective_to,'9999-12-31') LEFT JOIN payroll_employee_results per ON per.employee_id=eh.employee_id AND per.employee_type_snapshot='TRAINING' LEFT JOIN payroll_runs pr ON pr.id=per.payroll_run_id LEFT JOIN payroll_periods pp ON pp.id=per.payroll_period_id WHERE 1=1 ${clause}`,sites)
    const row=summary[0]??{};const immutable=Number(row.immutablePayrollRows??0);res.json({data:{status:immutable>0?'BLOCKED':'READY',summary:{trainingEmployees:Number(row.trainingEmployees??0),productionFacts:Number(row.productionFacts??0),immutablePayrollRows:immutable},blockers:immutable>0?[{code:'IMMUTABLE_TRAINING_PAYROLL',message:'Ditemukan Payroll immutable Training berbasis hasil. Remediasi owner wajib sebelum cutover.',count:immutable}]:[],notes:['Fakta Produksi Training dipertahankan untuk monitoring dan tidak dihapus.']}})
  }catch(error){next(error)}
})
