import { randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  assertWagePolicyMatrix,
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
  notes: z.string().trim().max(500).nullable().optional(),
  reason: z.string().trim().min(5).max(500),
  idempotencyKey,
})
const salaryInput = z.object({
  employeeUid: uid,
  basicSalary: z.coerce.number().positive().max(999_999_999_999),
  currency: z.literal('IDR').default('IDR'),
  reason: z.string().trim().min(5).max(255),
  idempotencyKey,
})
const correctionInput = z.object({
  amount: z.coerce.number().positive().max(999_999_999_999),
  notes: z.string().trim().max(500).nullable().optional(),
  reason: z.string().trim().min(5).max(500),
  idempotencyKey,
})
const cancellationInput = z.object({ reason: z.string().trim().min(5).max(500), idempotencyKey })
const minimumWageInput = z.object({
  siteUid: uid,
  wageYear: z.coerce.number().int().min(2000).max(2100),
  amount: z.coerce.number().positive().max(999_999_999_999),
  currency: z.literal('IDR').default('IDR'),
  regulationReference: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  reason: z.string().trim().min(5).max(500),
  idempotencyKey,
})
const minimumWageCorrectionInput = minimumWageInput.omit({ siteUid: true, wageYear: true })

function isGlobal(auth: AuthContext) { return auth.roles.includes('SUPER_ADMIN') || auth.roles.includes('DIRECTOR') }
function canSeeNominal(auth: AuthContext) { return auth.roles.includes('SUPER_ADMIN') || auth.roles.includes('PAYROLL_FINANCE') }
function assertSuper(auth: AuthContext) { if (!auth.roles.includes('SUPER_ADMIN')) throw new ApiError(403, 'Kebijakan Payroll hanya dapat dikelola Super Admin.') }
function enforceSite(auth: AuthContext, site: string) { if (!isGlobal(auth) && !auth.siteAccess.includes(site)) throw new ApiError(403, 'Akses site Payroll ditolak.') }
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
    status: row.status,
    notes: row.notes ?? null,
    site: { uid: row.siteUid, code: row.siteCode, name: row.siteName },
    nextPeriods: row.status === 'ACTIVE' ? previewPayrollPeriods({ effectiveFrom: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()), payFrequency: row.payFrequency, cutoffType: row.cutoffType, cutoffDay: row.cutoffDay }) : [],
  }
}

const policySelect = `SELECT ppv.*,ppv.employee_type_code employeeType,ppv.wage_basis wageBasis,
 ppv.pay_frequency payFrequency,ppv.cutoff_type cutoffType,ppv.cutoff_day cutoffDay,
 ppv.week_starts_on weekStartsOn,ppv.prorate_basis prorateBasis,
 ppv.attendance_pay_rule attendancePayRule,ppv.deduction_divisor deductionDivisor,
 ppv.rounding_mode roundingMode,ppv.rounding_scale roundingScale,
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
    currency: row.currency,
    status: row.status, notes: row.notes ?? row.reason ?? null,
  }
}

function minimumWageDto(row: RowDataPacket) {
  return {
    uid: String(row.uid),
    site: { uid: String(row.siteUid), code: String(row.siteCode), name: String(row.siteName) },
    wageYear: Number(row.wageYear),
    amount: String(row.amount),
    currency: 'IDR' as const,
    regulationReference: row.regulationReference == null ? null : String(row.regulationReference),
    notes: row.notes == null ? null : String(row.notes),
    status: String(row.status),
    cancellationReason: row.cancellationReason == null ? null : String(row.cancellationReason),
    cancelledAt: row.cancelledAt == null ? null : String(row.cancelledAt),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  }
}

const minimumWageSelect = `SELECT mw.id,mw.uid,mw.site_id siteId,mw.wage_year wageYear,
 mw.amount,mw.currency,mw.regulation_reference regulationReference,mw.notes,mw.status,
 mw.cancellation_reason cancellationReason,
 DATE_FORMAT(mw.cancelled_at,'%Y-%m-%dT%H:%i:%s') cancelledAt,
 DATE_FORMAT(mw.created_at,'%Y-%m-%dT%H:%i:%s') createdAt,
 DATE_FORMAT(mw.updated_at,'%Y-%m-%dT%H:%i:%s') updatedAt,
 s.uid siteUid,s.code siteCode,s.name siteName
 FROM site_minimum_wages mw JOIN sites s ON s.id=mw.site_id`

async function assertEmployeeCoverage(conn: PoolConnection, input: { employeeUid: string; siteUid?: string; allowedTypes: string[] }) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT e.id,e.uid,e.employee_number employeeNumber,e.full_name fullName,
            et.code employeeType,s.id siteId,s.uid siteUid,s.code siteCode,s.name siteName
       FROM employees e
       JOIN employee_types et ON et.id=e.employee_type_id
       JOIN employee_statuses es ON es.id=e.employee_status_id AND es.allows_attendance=1
       JOIN sites s ON s.id=e.current_site_id
      WHERE e.uid=? AND (? IS NULL OR s.uid=?)
      FOR UPDATE`,
    [input.employeeUid, input.siteUid ?? null, input.siteUid ?? null]
  )
  if (rows.length !== 1) throw new ApiError(422, 'Karyawan tidak ditemukan, tidak aktif, atau tidak sesuai site saat ini.')
  const employee = rows[0]
  if (!input.allowedTypes.includes(String(employee.employeeType))) throw new ApiError(422, `Master ini hanya berlaku untuk karyawan ${input.allowedTypes.join('/')} saat ini.`)
  const [contracts] = await conn.query<RowDataPacket[]>(
    `SELECT ct.code FROM employee_contracts c JOIN contract_types ct ON ct.id=c.contract_type_id
      WHERE c.employee_id=? AND c.status='ACTIVE' AND c.start_date<=CURDATE()
        AND (c.end_date IS NULL OR c.end_date>=CURDATE())`, [employee.id]
  )
  const expected = employee.employeeType === 'TRAINING' ? ['TRAINING'] : ['PKWT', 'PKWTT']
  if (contracts.length !== 1 || !expected.includes(String(contracts[0].code))) throw new ApiError(422, 'Kontrak aktif tidak tunggal atau tidak sesuai dengan jenis karyawan.')
  return employee
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
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
    res.json({ data: { site, policy: { ...input, ...defaults, cutoffDay: input.cutoffDay ?? null, weekStartsOn: 1, roundingMode: 'HALF_UP', roundingScale: 0, currency: 'IDR' }, nextPeriods: previewPayrollPeriods({ ...input, effectiveFrom: today, count: 3 }) } })
  } catch (error) { next(error) }
})

payrollConfigurationRouter.get('/configuration/policies', requirePermission('payroll.policy.view'), async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page)
    const pageSize = z.coerce.number().int().min(10).max(500).default(50).parse(req.query.pageSize)
    const sortBy = z.enum(['site', 'employeeType', 'status']).default('site').parse(req.query.sortBy)
    const sortDirection = z.enum(['asc', 'desc']).default('desc').parse(req.query.sortDirection)
    const where: string[] = []; const values: unknown[] = []
    if (!isGlobal(auth)) { where.push(`s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`); values.push(...auth.siteAccess) }
    if (req.query.site) { const site = String(req.query.site); enforceSite(auth, site); where.push('s.code=?'); values.push(site) }
    if (req.query.employeeType) { where.push('ppv.employee_type_code=?'); values.push(employeeType.parse(req.query.employeeType)) }
    if (req.query.status) { where.push('ppv.status=?'); values.push(status.parse(req.query.status)) }
    const query = z.string().trim().max(150).default('').parse(req.query.query)
    if (query) { where.push('(s.name LIKE ? OR s.code LIKE ? OR ppv.employee_type_code LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`) }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const orderColumns = { site: 's.name', employeeType: 'ppv.employee_type_code', status: 'ppv.status' } as const
    const [countRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM payroll_policy_versions ppv JOIN sites s ON s.id=ppv.site_id${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`${policySelect}${clause} ORDER BY ${orderColumns[sortBy]} ${sortDirection.toUpperCase()},ppv.id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    const total = Number(countRows[0]?.total ?? 0)
    res.json({ data: rows.map(policyDto), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } })
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
    const [existing] = await conn.query<RowDataPacket[]>(`${policySelect} WHERE ppv.site_id=? AND ppv.employee_type_code=? FOR UPDATE`, [site.id,input.employeeType])
    const current = existing[0]
    let policyId: number
    let policyUid: string
    if (current) {
      policyId = Number(current.id); policyUid = String(current.uid)
      await conn.execute(`UPDATE payroll_policy_versions SET wage_basis=?,pay_frequency=?,cutoff_type=?,cutoff_day=?,week_starts_on=1,prorate_basis=?,attendance_pay_rule=?,deduction_divisor=?,rounding_mode='HALF_UP',rounding_scale=0,currency='IDR',status='ACTIVE',notes=?,cancelled_at=NULL,cancelled_by=NULL,cancellation_reason=NULL,updated_by=? WHERE id=?`, [input.wageBasis,input.payFrequency,input.cutoffType,input.cutoffDay ?? null,defaults.prorateBasis,defaults.attendancePayRule,defaults.deductionDivisor,input.notes ?? null,auth.id,policyId])
    } else {
      policyUid = randomUUID()
      const [insert] = await conn.execute<ResultSetHeader>(`INSERT INTO payroll_policy_versions(uid,site_id,employee_type_code,wage_basis,pay_frequency,cutoff_type,cutoff_day,week_starts_on,prorate_basis,attendance_pay_rule,deduction_divisor,rounding_mode,rounding_scale,currency,status,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [policyUid,site.id,input.employeeType,input.wageBasis,input.payFrequency,input.cutoffType,input.cutoffDay ?? null,1,defaults.prorateBasis,defaults.attendancePayRule,defaults.deductionDivisor,'HALF_UP',0,'IDR','ACTIVE',input.notes ?? null,auth.id,auth.id])
      policyId = insert.insertId
    }
    const [created] = await conn.query<RowDataPacket[]>(`${policySelect} WHERE ppv.id=?`, [policyId])
    const revisionType = current ? (current.status === 'CANCELLED' ? 'REACTIVATION' : 'CORRECTION') : 'CREATE'
    await conn.execute(`INSERT INTO payroll_policy_revisions(uid,payroll_policy_version_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by) VALUES(?,?,?,?,?,?,?,?)`, [randomUUID(),policyId,revisionType,input.idempotencyKey,current ? JSON.stringify(policyDto(current)) : null,JSON.stringify(policyDto(created[0])),input.reason,auth.id])
    await writeAudit({ auth,request:req,module:'PAYROLL',siteId:Number(site.id),action:current?'UPDATE':'CREATE',table:'payroll_policy_versions',recordId:policyId,recordUid:policyUid,description:`Menyimpan policy Payroll ${input.employeeType} yang berlaku saat ini.`,reason:input.reason,afterData:policyDto(created[0]) },conn)
    await conn.commit(); res.status(current ? 200 : 201).json({ data: policyDto(created[0]) })
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
    await conn.execute(`UPDATE payroll_policy_versions SET status='CANCELLED',cancelled_at=NOW(3),cancelled_by=?,cancellation_reason=?,updated_by=? WHERE id=?`, [auth.id,input.reason,auth.id,policy.id])
    const [afterRows] = await conn.query<RowDataPacket[]>(`${policySelect} WHERE ppv.id=?`, [policy.id]); const after = policyDto(afterRows[0])
    await conn.execute(`INSERT INTO payroll_policy_revisions(uid,payroll_policy_version_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by) VALUES(?,?,?,?,?,?,?,?)`, [randomUUID(),policy.id,'CANCELLATION',input.idempotencyKey,JSON.stringify(policyDto(policy)),JSON.stringify(after),input.reason,auth.id])
    await writeAudit({ auth,request:req,module:'PAYROLL',siteId:Number(policy.site_id),action:'UPDATE',table:'payroll_policy_versions',recordId:Number(policy.id),recordUid:policyUid,description:'Menonaktifkan policy Payroll saat ini.',reason:input.reason },conn)
    await conn.commit(); res.json({ data: after })
  } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
})

payrollConfigurationRouter.get('/configuration/minimum-wages', requirePermission('payroll.view'), async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page)
    const pageSize = z.coerce.number().int().min(10).max(500).default(50).parse(req.query.pageSize)
    const sortBy = z.enum(['site', 'wageYear', 'amount', 'status', 'updatedAt']).default('wageYear').parse(req.query.sortBy)
    const sortDirection = z.enum(['asc', 'desc']).default('desc').parse(req.query.sortDirection)
    const where: string[] = []
    const values: unknown[] = []
    if (!isGlobal(auth)) {
      where.push(`s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`)
      values.push(...auth.siteAccess)
    }
    if (req.query.site) {
      enforceSite(auth, String(req.query.site))
      where.push('s.code=?')
      values.push(String(req.query.site))
    }
    if (req.query.year) {
      where.push('mw.wage_year=?')
      values.push(z.coerce.number().int().min(2000).max(2100).parse(req.query.year))
    }
    if (req.query.status) {
      where.push('mw.status=?')
      values.push(status.parse(req.query.status))
    }
    const query = z.string().trim().max(150).default('').parse(req.query.query)
    if (query) {
      where.push('(s.name LIKE ? OR s.code LIKE ? OR mw.regulation_reference LIKE ?)')
      values.push(`%${query}%`, `%${query}%`, `%${query}%`)
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const orderColumns = { site: 's.name', wageYear: 'mw.wage_year', amount: 'mw.amount', status: 'mw.status', updatedAt: 'mw.updated_at' } as const
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) total FROM site_minimum_wages mw JOIN sites s ON s.id=mw.site_id${clause}`,
      values
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      `${minimumWageSelect}${clause} ORDER BY ${orderColumns[sortBy]} ${sortDirection.toUpperCase()},mw.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize]
    )
    const total = Number(countRows[0]?.total ?? 0)
    res.json({ data: rows.map(minimumWageDto), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } })
  } catch (error) { next(error) }
})

payrollConfigurationRouter.post('/configuration/minimum-wages', requirePermission('payroll.rate.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext
    const input = minimumWageInput.parse(req.body)
    await conn.beginTransaction()
    const [retry] = await conn.query<RowDataPacket[]>('SELECT site_minimum_wage_id sourceId FROM site_minimum_wage_revisions WHERE idempotency_key=? FOR UPDATE', [input.idempotencyKey])
    if (retry[0]) {
      await conn.rollback()
      const [rows] = await pool.query<RowDataPacket[]>(`${minimumWageSelect} WHERE mw.id=?`, [retry[0].sourceId])
      res.json({ data: minimumWageDto(rows[0]) })
      return
    }
    const site = await siteByUid(input.siteUid, auth, conn)
    const [existing] = await conn.query<RowDataPacket[]>('SELECT id,status FROM site_minimum_wages WHERE site_id=? AND wage_year=? FOR UPDATE', [site.id, input.wageYear])
    if (existing[0]) throw new ApiError(409, 'UMK untuk site dan tahun tersebut sudah tersedia. Koreksi atau aktifkan ulang data yang ada.')
    const recordUid = randomUUID()
    const [insert] = await conn.execute<ResultSetHeader>(
      `INSERT INTO site_minimum_wages(uid,site_id,wage_year,amount,currency,regulation_reference,notes,status,created_by,updated_by)
       VALUES(?,?,?,?,?,?,?,'ACTIVE',?,?)`,
      [recordUid, site.id, input.wageYear, input.amount, input.currency, input.regulationReference ?? null, input.notes ?? null, auth.id, auth.id]
    )
    const [createdRows] = await conn.query<RowDataPacket[]>(`${minimumWageSelect} WHERE mw.id=?`, [insert.insertId])
    const after = minimumWageDto(createdRows[0])
    await conn.execute(
      `INSERT INTO site_minimum_wage_revisions(uid,site_minimum_wage_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by)
       VALUES(?,?,?,?,?,?,?,?)`,
      [randomUUID(), insert.insertId, 'CREATE', input.idempotencyKey, null, JSON.stringify(after), input.reason, auth.id]
    )
    await writeAudit({ auth, request: req, module: 'PAYROLL', siteId: Number(site.id), action: 'CREATE', table: 'site_minimum_wages', recordId: insert.insertId, recordUid, description: `Membuat master UMK tahun ${input.wageYear}.`, reason: input.reason, afterData: after }, conn)
    await conn.commit()
    res.status(201).json({ data: after })
  } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
})

async function reviseMinimumWage(req: Request, res: Response, next: NextFunction, action: 'correct' | 'cancel' | 'reactivate') {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext
    const input = action === 'correct' ? minimumWageCorrectionInput.parse(req.body) : cancellationInput.parse(req.body)
    const recordUid = uid.parse(req.params.uid)
    await conn.beginTransaction()
    const [retry] = await conn.query<RowDataPacket[]>('SELECT site_minimum_wage_id sourceId FROM site_minimum_wage_revisions WHERE idempotency_key=? FOR UPDATE', [input.idempotencyKey])
    if (retry[0]) {
      await conn.rollback()
      const [rows] = await pool.query<RowDataPacket[]>(`${minimumWageSelect} WHERE mw.id=?`, [retry[0].sourceId])
      res.json({ data: minimumWageDto(rows[0]) })
      return
    }
    const [rows] = await conn.query<RowDataPacket[]>(`${minimumWageSelect} WHERE mw.uid=? FOR UPDATE`, [recordUid])
    const row = rows[0]
    if (!row) throw new ApiError(404, 'Master UMK tidak ditemukan.')
    enforceSite(auth, String(row.siteCode))
    if (action === 'reactivate' && row.status !== 'CANCELLED') throw new ApiError(409, 'Master UMK masih aktif.')
    if (action !== 'reactivate' && row.status !== 'ACTIVE') throw new ApiError(409, 'Master UMK sudah dibatalkan.')
    const before = minimumWageDto(row)
    if (action === 'correct') {
      const corrected = input as z.infer<typeof minimumWageCorrectionInput>
      await conn.execute(
        `UPDATE site_minimum_wages SET amount=?,currency=?,regulation_reference=?,notes=?,updated_by=? WHERE id=?`,
        [corrected.amount, corrected.currency, corrected.regulationReference ?? null, corrected.notes ?? null, auth.id, row.id]
      )
    } else if (action === 'cancel') {
      await conn.execute(
        `UPDATE site_minimum_wages SET status='CANCELLED',cancelled_at=NOW(3),cancelled_by=?,cancellation_reason=?,updated_by=? WHERE id=?`,
        [auth.id, input.reason, auth.id, row.id]
      )
    } else {
      await conn.execute(
        `UPDATE site_minimum_wages SET status='ACTIVE',cancelled_at=NULL,cancelled_by=NULL,cancellation_reason=NULL,updated_by=? WHERE id=?`,
        [auth.id, row.id]
      )
    }
    const [afterRows] = await conn.query<RowDataPacket[]>(`${minimumWageSelect} WHERE mw.id=?`, [row.id])
    const after = minimumWageDto(afterRows[0])
    const revisionType = action === 'correct' ? 'CORRECTION' : action === 'cancel' ? 'CANCELLATION' : 'REACTIVATION'
    await conn.execute(
      `INSERT INTO site_minimum_wage_revisions(uid,site_minimum_wage_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by)
       VALUES(?,?,?,?,?,?,?,?)`,
      [randomUUID(), row.id, revisionType, input.idempotencyKey, JSON.stringify(before), JSON.stringify(after), input.reason, auth.id]
    )
    await writeAudit({ auth, request: req, module: 'PAYROLL', siteId: Number(row.siteId), action: 'UPDATE', table: 'site_minimum_wages', recordId: Number(row.id), recordUid, description: action === 'correct' ? 'Mengoreksi master UMK.' : action === 'cancel' ? 'Membatalkan master UMK.' : 'Mengaktifkan ulang master UMK.', reason: input.reason, beforeData: before, afterData: after }, conn)
    await conn.commit()
    res.json({ data: after })
  } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
}

payrollConfigurationRouter.post('/configuration/minimum-wages/:uid/correct', requirePermission('payroll.rate.manage'), (req, res, next) => reviseMinimumWage(req, res, next, 'correct'))
payrollConfigurationRouter.post('/configuration/minimum-wages/:uid/cancel', requirePermission('payroll.rate.manage'), (req, res, next) => reviseMinimumWage(req, res, next, 'cancel'))
payrollConfigurationRouter.post('/configuration/minimum-wages/:uid/reactivate', requirePermission('payroll.rate.manage'), (req, res, next) => reviseMinimumWage(req, res, next, 'reactivate'))

const dailySelect = `SELECT r.id,r.uid,r.daily_rate dailyRate,r.currency,r.status,r.notes,e.id employeeId,e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,r.employee_type_code employeeType,s.id siteId,s.uid siteUid,s.code siteCode,s.name siteName FROM employee_daily_rate_histories r JOIN employees e ON e.id=r.employee_id JOIN sites s ON s.id=r.site_id`
const salarySelect = `SELECT sh.id,sh.uid,sh.basic_salary basicSalary,sh.currency,COALESCE(sh.status,'ACTIVE') status,sh.reason,e.id employeeId,e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,'BULANAN' employeeType,s.id siteId,s.uid siteUid,s.code siteCode,s.name siteName FROM employee_salary_histories sh JOIN employees e ON e.id=sh.employee_id JOIN sites s ON s.id=e.current_site_id`

async function listNominals(req: Request, res: Response, next: NextFunction, kind: 'rate'|'salary') {
  try {
    const auth = res.locals.auth as AuthContext; const where: string[]=[]; const values: unknown[]=[]
    const page=z.coerce.number().int().min(1).default(1).parse(req.query.page)
    const pageSize=z.coerce.number().int().min(10).max(500).default(50).parse(req.query.pageSize)
    const sortBy=z.enum(['employee','site','employeeType','amount','status']).default('employee').parse(req.query.sortBy)
    const sortDirection=z.enum(['asc','desc']).default('asc').parse(req.query.sortDirection)
    const siteColumn='s.code'; if (!isGlobal(auth)) { where.push(`${siteColumn} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`); values.push(...auth.siteAccess) }
    if (req.query.site) { enforceSite(auth,String(req.query.site)); where.push(`${siteColumn}=?`); values.push(String(req.query.site)) }
    if (req.query.status) { where.push(`${kind==='rate'?'r':'sh'}.status=?`); values.push(status.parse(req.query.status)) }
    if (req.query.employeeType && kind==='rate') { const parsed=z.enum(['HARIAN','TRAINING']).parse(req.query.employeeType); where.push('r.employee_type_code=?'); values.push(parsed) }
    const query=z.string().trim().max(150).default('').parse(req.query.query); if(query){where.push('(e.full_name LIKE ? OR e.employee_number LIKE ? OR s.name LIKE ? OR s.code LIKE ?)');values.push(`%${query}%`,`%${query}%`,`%${query}%`,`%${query}%`)}
    const alias=kind==='rate'?'r':'sh';const clause=where.length?` WHERE ${where.join(' AND ')}`:''
    const orderColumns={employee:'e.full_name',site:'s.name',employeeType:kind==='rate'?'r.employee_type_code':"'BULANAN'",amount:kind==='rate'?'r.daily_rate':'sh.basic_salary',status:`${alias}.status`} as const
    const countSource=kind==='rate'?'employee_daily_rate_histories r JOIN employees e ON e.id=r.employee_id JOIN sites s ON s.id=r.site_id':'employee_salary_histories sh JOIN employees e ON e.id=sh.employee_id JOIN sites s ON s.id=e.current_site_id'
    const [countRows]=await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM ${countSource}${clause}`,values)
    const [rows]=await pool.query<RowDataPacket[]>(`${kind==='rate'?dailySelect:salarySelect}${clause} ORDER BY ${orderColumns[sortBy]} ${sortDirection.toUpperCase()},${alias}.id DESC LIMIT ? OFFSET ?`,[...values,pageSize,(page-1)*pageSize])
    const total=Number(countRows[0]?.total??0)
    res.json({data:rows.map((row)=>nominalDto(row,auth,kind==='rate'?'dailyRate':'basicSalary')),meta:{page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))}})
  } catch(error){next(error)}
}
payrollConfigurationRouter.get('/configuration/daily-rates',requirePermission('payroll.view'),(req,res,next)=>listNominals(req,res,next,'rate'))
payrollConfigurationRouter.get('/configuration/salaries',requirePermission('payroll.view'),(req,res,next)=>listNominals(req,res,next,'salary'))

payrollConfigurationRouter.post('/configuration/daily-rates',requirePermission('payroll.rate.manage'),async(req,res,next)=>{
  const conn=await pool.getConnection(); try{const auth=res.locals.auth as AuthContext;const input=rateInput.parse(req.body);await conn.beginTransaction();
    const [retry]=await conn.query<RowDataPacket[]>('SELECT employee_daily_rate_history_id sourceId FROM employee_daily_rate_revisions WHERE idempotency_key=? FOR UPDATE',[input.idempotencyKey]);if(retry[0]){await conn.rollback();const [rows]=await pool.query<RowDataPacket[]>(`${dailySelect} WHERE r.id=?`,[retry[0].sourceId]);res.json({data:nominalDto(rows[0],auth,'dailyRate')});return}
    const employee=await assertEmployeeCoverage(conn,{employeeUid:input.employeeUid,siteUid:input.siteUid,allowedTypes:['HARIAN','TRAINING']});enforceSite(auth,String(employee.siteCode));
    const [existing]=await conn.query<RowDataPacket[]>(`${dailySelect} WHERE r.employee_id=? FOR UPDATE`,[employee.id]);const current=existing[0];let sourceId:number;let recordUid:string
    if(current){sourceId=Number(current.id);recordUid=String(current.uid);await conn.execute(`UPDATE employee_daily_rate_histories SET site_id=?,employee_type_code=?,daily_rate=?,currency=?,status='ACTIVE',notes=?,cancelled_at=NULL,cancelled_by=NULL,cancellation_reason=NULL,updated_by=? WHERE id=?`,[employee.siteId,employee.employeeType,input.dailyRate,input.currency,input.notes??null,auth.id,sourceId])}else{recordUid=randomUUID();const [insert]=await conn.execute<ResultSetHeader>(`INSERT INTO employee_daily_rate_histories(uid,employee_id,site_id,employee_type_code,daily_rate,currency,status,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,'ACTIVE',?,?,?)`,[recordUid,employee.id,employee.siteId,employee.employeeType,input.dailyRate,input.currency,input.notes??null,auth.id,auth.id]);sourceId=insert.insertId}
    const [rows]=await conn.query<RowDataPacket[]>(`${dailySelect} WHERE r.id=?`,[sourceId]);const revisionType=current?(current.status==='CANCELLED'?'REACTIVATION':'CORRECTION'):'CREATE'
    await conn.execute(`INSERT INTO employee_daily_rate_revisions(uid,employee_daily_rate_history_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by) VALUES(?,?,?,?,?,?,?,?)`,[randomUUID(),sourceId,revisionType,input.idempotencyKey,current?JSON.stringify(current):null,JSON.stringify(rows[0]),input.reason,auth.id]);await writeAudit({auth,request:req,module:'PAYROLL',siteId:Number(employee.siteId),action:current?'UPDATE':'CREATE',table:'employee_daily_rate_histories',recordId:sourceId,recordUid,description:'Menyimpan tarif harian yang berlaku saat ini.',reason:input.reason},conn);await conn.commit();res.status(current?200:201).json({data:nominalDto(rows[0],auth,'dailyRate')})
  }catch(error){await conn.rollback();next(error)}finally{conn.release()}
})

payrollConfigurationRouter.post('/configuration/salaries',requirePermission('payroll.rate.manage'),async(req,res,next)=>{
  const conn=await pool.getConnection();try{const auth=res.locals.auth as AuthContext;const input=salaryInput.parse(req.body);await conn.beginTransaction();const [retry]=await conn.query<RowDataPacket[]>('SELECT employee_salary_history_id sourceId FROM employee_salary_history_revisions WHERE idempotency_key=? FOR UPDATE',[input.idempotencyKey]);if(retry[0]){await conn.rollback();const [rows]=await pool.query<RowDataPacket[]>(`${salarySelect} WHERE sh.id=?`,[retry[0].sourceId]);res.json({data:nominalDto(rows[0],auth,'basicSalary')});return}
    const employee=await assertEmployeeCoverage(conn,{employeeUid:input.employeeUid,allowedTypes:['BULANAN']});enforceSite(auth,String(employee.siteCode));const [existing]=await conn.query<RowDataPacket[]>(`${salarySelect} WHERE sh.employee_id=? FOR UPDATE`,[employee.id]);const current=existing[0];let sourceId:number;let recordUid:string
    if(current){sourceId=Number(current.id);recordUid=String(current.uid);await conn.execute(`UPDATE employee_salary_histories SET basic_salary=?,currency=?,reason=?,status='ACTIVE',cancelled_at=NULL,cancelled_by=NULL,cancellation_reason=NULL,updated_by=? WHERE id=?`,[input.basicSalary,input.currency,input.reason,auth.id,sourceId])}else{recordUid=randomUUID();const [insert]=await conn.execute<ResultSetHeader>(`INSERT INTO employee_salary_histories(uid,employee_id,basic_salary,currency,reason,status,created_by,updated_by) VALUES(?,?,?,?,?,'ACTIVE',?,?)`,[recordUid,employee.id,input.basicSalary,input.currency,input.reason,auth.id,auth.id]);sourceId=insert.insertId}
    const [rows]=await conn.query<RowDataPacket[]>(`${salarySelect} WHERE sh.id=?`,[sourceId]);const revisionType=current?(current.status==='CANCELLED'?'REACTIVATION':'CORRECTION'):'CREATE';await conn.execute(`INSERT INTO employee_salary_history_revisions(uid,employee_salary_history_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by) VALUES(?,?,?,?,?,?,?,?)`,[randomUUID(),sourceId,revisionType,input.idempotencyKey,current?JSON.stringify(current):null,JSON.stringify(rows[0]),input.reason,auth.id]);await writeAudit({auth,request:req,module:'PAYROLL',siteId:Number(employee.siteId),action:current?'UPDATE':'CREATE',table:'employee_salary_histories',recordId:sourceId,recordUid,description:'Menyimpan gaji pokok yang berlaku saat ini.',reason:input.reason},conn);await conn.commit();res.status(current?200:201).json({data:nominalDto(rows[0],auth,'basicSalary')})
  }catch(error){await conn.rollback();next(error)}finally{conn.release()}
})

async function reviseNominal(req:Request,res:Response,next:NextFunction,kind:'rate'|'salary',action:'correct'|'cancel'){
  const conn=await pool.getConnection();try{const auth=res.locals.auth as AuthContext;const input=action==='correct'?correctionInput.parse(req.body):cancellationInput.parse(req.body);await conn.beginTransaction();const table=kind==='rate'?'employee_daily_rate_histories':'employee_salary_histories';const revisionTable=kind==='rate'?'employee_daily_rate_revisions':'employee_salary_history_revisions';const fk=kind==='rate'?'employee_daily_rate_history_id':'employee_salary_history_id';const select=kind==='rate'?dailySelect:salarySelect;const alias=kind==='rate'?'r':'sh';const [retry]=await conn.query<RowDataPacket[]>(`SELECT ${fk} sourceId FROM ${revisionTable} WHERE idempotency_key=? FOR UPDATE`,[input.idempotencyKey]);if(retry[0]){await conn.rollback();const [rows]=await pool.query<RowDataPacket[]>(`${select} WHERE ${alias}.id=?`,[retry[0].sourceId]);res.json({data:nominalDto(rows[0],auth,kind==='rate'?'dailyRate':'basicSalary')});return}
    const [rows]=await conn.query<RowDataPacket[]>(`${select} WHERE ${alias}.uid=? FOR UPDATE`,[String(req.params.uid)]);const row=rows[0];if(!row)throw new ApiError(404,'Master nominal tidak ditemukan.');enforceSite(auth,String(row.siteCode));if(row.status!=='ACTIVE')throw new ApiError(409,'Master nominal sudah dibatalkan.');const before=JSON.stringify(row)
    if(action==='cancel'){await conn.execute(`UPDATE ${table} SET status='CANCELLED',cancelled_at=NOW(3),cancelled_by=?,cancellation_reason=?,updated_by=? WHERE id=?`,[auth.id,input.reason,auth.id,row.id])}else{const corrected=input as z.infer<typeof correctionInput>;
      if(kind==='rate'){await assertEmployeeCoverage(conn,{employeeUid:String(row.employeeUid),siteUid:String(row.siteUid),allowedTypes:['HARIAN','TRAINING']})}
      if(kind==='salary'){await assertEmployeeCoverage(conn,{employeeUid:String(row.employeeUid),allowedTypes:['BULANAN']})}
      await conn.execute(`UPDATE ${table} SET ${kind==='rate'?'daily_rate':'basic_salary'}=?,${kind==='rate'?'notes':'reason'}=?,updated_by=? WHERE id=?`,[corrected.amount,corrected.notes??corrected.reason,auth.id,row.id])}
    const [afterRows]=await conn.query<RowDataPacket[]>(`${select} WHERE ${alias}.id=?`,[row.id]);await conn.execute(`INSERT INTO ${revisionTable}(uid,${fk},revision_type,idempotency_key,before_data,after_data,reason,revised_by) VALUES(?,?,?,?,?,?,?,?)`,[randomUUID(),row.id,action==='cancel'?'CANCELLATION':'CORRECTION',input.idempotencyKey,before,JSON.stringify(afterRows[0]),input.reason,auth.id]);await writeAudit({auth,request:req,module:'PAYROLL',siteId:Number(row.siteId),action:'UPDATE',table,recordId:Number(row.id),recordUid:String(row.uid),description:action==='cancel'?'Membatalkan master nominal Payroll.':'Mengoreksi master nominal Payroll.',reason:input.reason},conn);await conn.commit();res.json({data:nominalDto(afterRows[0],auth,kind==='rate'?'dailyRate':'basicSalary')})
  }catch(error){await conn.rollback();next(error)}finally{conn.release()}
}
for(const [path,kind] of [['daily-rates','rate'],['salaries','salary']] as const){payrollConfigurationRouter.post(`/configuration/${path}/:uid/correct`,requirePermission('payroll.rate.manage'),(req,res,next)=>reviseNominal(req,res,next,kind,'correct'));payrollConfigurationRouter.post(`/configuration/${path}/:uid/cancel`,requirePermission('payroll.rate.manage'),(req,res,next)=>reviseNominal(req,res,next,kind,'cancel'))}
