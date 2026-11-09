import { z } from 'zod'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { pool } from '../db.js'
import { businessDate } from '../lib/contract-lifecycle.js'
import { ApiError } from '../lib/errors.js'
import {
  canViewProductionWages,
  redactProductionFinancials,
} from '../lib/production-access-policy.js'
import { isQc } from '../lib/production-module-access.js'
import { readProductionQcBatch } from '../lib/production-qc-storage.js'
import { qcTransactionPredicate } from '../lib/production-transaction-module.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const uid = z.string().uuid()
const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
function csv<T>(value: unknown, schema: z.ZodType<T>): T[] {
  const entries =
    value === undefined
      ? []
      : z.union([z.string(), z.array(z.string())]).parse(value)
  return [
    ...new Set(
      z.array(schema).parse(
        (Array.isArray(entries) ? entries : [entries])
          .flatMap((entry) => entry.split(','))
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ),
  ]
}
function input(raw: Record<string, unknown>, auth: AuthContext) {
  const today = businessDate()
  const date = z
    .string()
    .date()
    .parse(raw.date ?? today)
  if (!canViewProductionWages(auth) && date !== today)
    throw new ApiError(
      403,
      'Tanggal Ringkasan Produksi hanya dapat diubah oleh HR atau Superadmin.'
    )
  return {
    date,
    today,
    sites: csv(raw.site, siteCode),
    modules: csv(raw.moduleUid, uid),
    jobUid: raw.jobUid === undefined ? undefined : uid.parse(raw.jobUid),
    unitUid: raw.unitUid === undefined ? undefined : uid.parse(raw.unitUid),
    query: z.string().trim().max(150).optional().parse(raw.query),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .default(1)
      .parse(raw.page),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .default(50)
      .parse(raw.pageSize),
  }
}
type Input = ReturnType<typeof input>
function metadata(params: Input, auth: AuthContext) {
  return {
    effectiveDate: params.date,
    serverToday: params.today,
    canChangeDate: canViewProductionWages(auth),
    canViewWages: canViewProductionWages(auth),
  }
}
function filter(
  auth: AuthContext,
  params: Input,
  options: { job?: boolean; search?: boolean; employeeUid?: string } = {}
) {
  const conditions = ["pt.status='POSTED'", 'pt.business_date=?']
  const values: unknown[] = [params.date]
  const global =
    !isQc(auth) &&
    auth.roles.some((role) => role === 'SUPER_ADMIN' || role === 'DIRECTOR')
  if (!global) {
    conditions.push(
      `s.code IN (${auth.siteAccess.map(() => '?').join(',') || 'NULL'})`
    )
    values.push(...auth.siteAccess)
  }
  if (params.sites.length) {
    if (!global && params.sites.some((site) => !auth.siteAccess.includes(site)))
      throw new ApiError(403, 'Akses site Produksi ditolak.')
    conditions.push(`s.code IN (${params.sites.map(() => '?').join(',')})`)
    values.push(...params.sites)
  }
  const scope = qcTransactionPredicate(auth, 'pt')
  conditions.push(`(${scope.sql})`)
  values.push(...scope.params)
  if (params.modules.length) {
    conditions.push(`pm.uid IN (${params.modules.map(() => '?').join(',')})`)
    values.push(...params.modules)
  }
  if (options.job) {
    if (!params.jobUid)
      throw new ApiError(422, 'Pilih jenis pekerjaan terlebih dahulu.')
    conditions.push('j.uid=?')
    values.push(params.jobUid)
    if (params.unitUid) {
      conditions.push('u.uid=?')
      values.push(params.unitUid)
    }
  }
  if (options.search && params.query) {
    // Literal search: user-entered % and _ are not wildcard operators.
    const term = `%${params.query.replace(/[!%_]/g, '!$&')}%`
    conditions.push(
      "(e.employee_number LIKE ? ESCAPE '!' OR e.full_name LIKE ? ESCAPE '!')"
    )
    values.push(term, term)
  }
  if (options.employeeUid) {
    conditions.push('e.uid=?')
    values.push(options.employeeUid)
  }
  return { sql: conditions.join(' AND '), values }
}
const from = `FROM production_transactions pt
  JOIN employees e ON e.id=pt.employee_id
  JOIN sites s ON s.id=pt.site_id
  JOIN production_jobs j ON j.id=pt.production_job_id
  JOIN work_units u ON u.id=pt.unit_id
  LEFT JOIN production_modules pm ON pm.id=pt.production_module_id`
// One scalar per fact: a defect can overlap another defect on the same piece.
// The QC child rows never multiply transaction quantities or financial sums.
const rejects = `(SELECT COALESCE(SUM(d.quantity),0) FROM production_transaction_qc h
  JOIN production_transaction_qc_defects d ON d.production_transaction_qc_id=h.id
  WHERE h.production_transaction_id=pt.id)`
const sums = `COUNT(*) transactionCount,CAST(SUM(pt.quantity) AS CHAR) quantity,
  CAST(SUM(pt.payable_quantity) AS CHAR) payableQuantity,SUM(${rejects}) rejectOccurrences`
const wageSum = (auth: AuthContext) =>
  canViewProductionWages(auth)
    ? ',CAST(SUM(pt.gross_amount) AS CHAR) grossAmount'
    : ''
const unitColumns =
  'u.uid unitUid,u.code unitCode,u.name unitName,u.decimal_precision decimalPrecision'
const jobColumns = 'j.uid jobUid,j.code jobCode,j.name jobName'
function unit(row: RowDataPacket) {
  return {
    uid: String(row.unitUid),
    code: String(row.unitCode),
    name: String(row.unitName),
    decimalPrecision: Number(row.decimalPrecision),
  }
}
function job(row: RowDataPacket) {
  return {
    uid: String(row.jobUid),
    code: String(row.jobCode),
    name: String(row.jobName),
  }
}
function totals(row: RowDataPacket, auth: AuthContext) {
  return {
    quantity: String(row.quantity ?? '0'),
    payableQuantity: String(row.payableQuantity ?? '0'),
    transactionCount: Number(row.transactionCount),
    rejectOccurrences: Number(row.rejectOccurrences ?? 0),
    ...(canViewProductionWages(auth)
      ? { grossAmount: String(row.grossAmount ?? '0') }
      : {}),
  }
}
const groupColumns = `e.uid,e.employee_number,e.full_name,s.uid,s.code,s.name,j.uid,j.code,j.name,u.uid,u.code,u.name,u.decimal_precision`
const groupKey = (row: RowDataPacket) =>
  `${row.employeeUid}:${row.siteUid}:${row.unitUid}`

export const productionDailySummaryRouter = Router()
productionDailySummaryRouter.use(
  '/daily-summary',
  authenticate,
  requirePermission('production.view'),
  (_req, res, next) => {
    const json = res.json.bind(res)
    res.json = (body: unknown) => {
      const auth = res.locals.auth as AuthContext
      const redacted = redactProductionFinancials(body, auth)
      // Capability metadata is not a financial value; the generic redactor intentionally strips wage keys.
      return json(
        body && typeof body === 'object' && 'canViewWages' in body
          ? {
              ...(redacted as object),
              canViewWages: canViewProductionWages(auth),
            }
          : redacted
      )
    }
    next()
  }
)

productionDailySummaryRouter.get('/daily-summary', async (req, res) => {
  const auth = res.locals.auth as AuthContext
  const params = input(req.query, auth)
  // Text search and selected job/unit never make tabs disappear.
  const where = filter(auth, params)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${jobColumns},${unitColumns},
    COUNT(DISTINCT pt.employee_id) employeeCount,${sums}${wageSum(auth)}
    ${from} WHERE ${where.sql}
    GROUP BY j.uid,j.code,j.name,u.uid,u.code,u.name,u.decimal_precision ORDER BY j.name,j.uid,u.code,u.uid`,
    where.values
  )
  // Count workers separately: one person can have facts with two units.
  const [counts] = await pool.query<RowDataPacket[]>(
    `SELECT j.uid jobUid,COUNT(DISTINCT pt.employee_id) employeeCount
    ${from} WHERE ${where.sql} GROUP BY j.uid`,
    where.values
  )
  const employeeCounts = new Map(
    counts.map((row) => [String(row.jobUid), Number(row.employeeCount)])
  )
  const tabs = new Map<
    string,
    {
      jobUid: string
      jobCode: string
      jobName: string
      employeeCount: number
      transactionCount: number
      units: unknown[]
    }
  >()
  for (const row of rows) {
    const key = String(row.jobUid)
    const tab = tabs.get(key) ?? {
      jobUid: key,
      jobCode: String(row.jobCode),
      jobName: String(row.jobName),
      employeeCount: employeeCounts.get(key) ?? 0,
      transactionCount: 0,
      units: [],
    }
    tab.transactionCount += Number(row.transactionCount)
    tab.units.push({
      unitUid: String(row.unitUid),
      unitCode: String(row.unitCode),
      unitName: String(row.unitName),
      decimalPrecision: Number(row.decimalPrecision),
      ...totals(row, auth),
    })
    tabs.set(key, tab)
  }
  res.json({ ...metadata(params, auth), tabs: [...tabs.values()] })
})

productionDailySummaryRouter.get(
  '/daily-summary/employees',
  async (req, res) => {
    const auth = res.locals.auth as AuthContext
    const params = input(req.query, auth)
    const where = filter(auth, params, { job: true, search: true })
    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) total FROM (
    SELECT e.uid ${from} WHERE ${where.sql} GROUP BY e.uid,s.uid,j.uid,u.uid
  ) employee_groups`,
      where.values
    )
    const [summary] = await pool.query<RowDataPacket[]>(
      `SELECT ${unitColumns},COUNT(DISTINCT pt.employee_id) employeeCount,${sums}${wageSum(auth)}
    ${from} WHERE ${where.sql} GROUP BY u.uid,u.code,u.name,u.decimal_precision ORDER BY u.code,u.uid`,
      where.values
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,
    s.uid siteUid,s.code siteCode,s.name siteName,${jobColumns},${unitColumns},${sums}${wageSum(auth)},
    DATE_FORMAT(MAX(pt.transaction_at),'%Y-%m-%dT%H:%i:%s+07:00') lastSubmittedAt
    ${from} WHERE ${where.sql} GROUP BY ${groupColumns}
    ORDER BY e.full_name,e.employee_number,e.uid,s.uid,u.uid LIMIT ? OFFSET ?`,
      [...where.values, params.pageSize, (params.page - 1) * params.pageSize]
    )
    const modules = new Map<
      string,
      { uid: string; code: string; name: string }[]
    >()
    if (rows.length) {
      const employeeUids = [
        ...new Set(rows.map((row) => String(row.employeeUid))),
      ]
      const [moduleRows] = await pool.query<RowDataPacket[]>(
        `SELECT DISTINCT e.uid employeeUid,s.uid siteUid,u.uid unitUid,
      pm.uid moduleUid,pm.code moduleCode,pm.name moduleName ${from}
      WHERE ${where.sql} AND e.uid IN (${employeeUids.map(() => '?').join(',')}) AND pm.id IS NOT NULL
      ORDER BY pm.name,pm.uid`,
        [...where.values, ...employeeUids]
      )
      for (const row of moduleRows) {
        const key = groupKey(row)
        const entries = modules.get(key) ?? []
        entries.push({
          uid: String(row.moduleUid),
          code: String(row.moduleCode),
          name: String(row.moduleName),
        })
        modules.set(key, entries)
      }
    }
    res.json({
      ...metadata(params, auth),
      items: rows.map((row) => ({
        employee: {
          uid: String(row.employeeUid),
          employeeNumber: String(row.employeeNumber),
          fullName: String(row.fullName),
        },
        site: {
          uid: String(row.siteUid),
          code: String(row.siteCode),
          name: String(row.siteName),
        },
        job: job(row),
        unit: unit(row),
        ...totals(row, auth),
        lastSubmittedAt: row.lastSubmittedAt,
        modules: modules.get(groupKey(row)) ?? [],
      })),
      summary: {
        units: summary.map((row) => ({
          unit: unit(row),
          employeeCount: Number(row.employeeCount),
          ...totals(row, auth),
        })),
      },
      page: params.page,
      pageSize: params.pageSize,
      total: Number(counts[0]?.total ?? 0),
    })
  }
)

productionDailySummaryRouter.get(
  '/daily-summary/employees/:uid/transactions',
  async (req, res) => {
    const auth = res.locals.auth as AuthContext
    const params = input(req.query, auth)
    const employeeUid = uid.parse(req.params.uid)
    const where = filter(auth, params, { job: true, search: true, employeeUid })
    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) total ${from} WHERE ${where.sql}`,
      where.values
    )
    if (!Number(counts[0]?.total))
      throw new ApiError(
        404,
        'Setoran karyawan tidak ditemukan dalam akses Anda.'
      )
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT pt.id,pt.uid,pt.transaction_number transactionNumber,
    DATE_FORMAT(pt.transaction_at,'%Y-%m-%dT%H:%i:%s+07:00') transactionAt,
    CAST(pt.quantity AS CHAR) quantity,CAST(pt.payable_quantity AS CHAR) payableQuantity,
    CAST(pt.quantity_deduction_percentage AS CHAR) deductionPercentage,
    ${rejects} rejectOccurrences,pt.payroll_locked_at payrollLockedAt,
    ${canViewProductionWages(auth) ? 'CAST(pt.gross_amount AS CHAR) grossAmount,CAST(pt.rate_snapshot AS CHAR) rateSnapshot,' : ''}
    e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,s.uid siteUid,s.code siteCode,s.name siteName,
    ${jobColumns},${unitColumns},pm.uid moduleUid,pm.code moduleCode,pm.name moduleName
    ${from} WHERE ${where.sql} ORDER BY pt.transaction_at DESC,pt.id DESC LIMIT ? OFFSET ?`,
      [...where.values, params.pageSize, (params.page - 1) * params.pageSize]
    )
    const qc = await readProductionQcBatch(
      pool,
      rows.map((row) => Number(row.id))
    )
    res.json({
      ...metadata(params, auth),
      items: rows.map((row) => ({
        uid: String(row.uid),
        transactionNumber: String(row.transactionNumber),
        transactionAt: row.transactionAt,
        businessDate: params.date,
        status: 'POSTED',
        employee: {
          uid: String(row.employeeUid),
          employeeNumber: String(row.employeeNumber),
          fullName: String(row.fullName),
        },
        site: {
          uid: String(row.siteUid),
          code: String(row.siteCode),
          name: String(row.siteName),
        },
        job: job(row),
        unit: unit(row),
        module: row.moduleUid
          ? {
              uid: String(row.moduleUid),
              code: String(row.moduleCode),
              name: String(row.moduleName),
            }
          : null,
        quantity: String(row.quantity),
        payableQuantity: String(row.payableQuantity),
        deductionPercentage: String(row.deductionPercentage),
        rejectOccurrences: Number(row.rejectOccurrences ?? 0),
        payrollLockedAt: row.payrollLockedAt ?? null,
        ...(canViewProductionWages(auth)
          ? {
              grossAmount: String(row.grossAmount),
              rateSnapshot: String(row.rateSnapshot),
            }
          : {}),
        qc: qc.get(Number(row.id)) ?? null,
      })),
      page: params.page,
      pageSize: params.pageSize,
      total: Number(counts[0].total),
    })
  }
)
