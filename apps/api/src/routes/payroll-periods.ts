import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  assertNoOverlappingPayrollPeriod,
  assertPayrollPeriodRange,
  payrollPeriodStatuses,
} from '../lib/payroll-policy.js'
import {
  evaluatePayrollReadiness,
  type PayrollReadiness,
} from '../lib/payroll-readiness.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const uuid = z.string().uuid()
const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const periodStatus = z.enum(payrollPeriodStatuses)
const createPeriodInput = z.object({
  siteUid: uuid,
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  paymentDate: z.string().date().nullable().optional(),
  periodName: z.string().trim().min(3).max(150).optional(),
  notes: z.string().trim().max(500).optional(),
})
const cancelInput = z.object({ reason: z.string().trim().min(5).max(500) })

type PeriodRow = RowDataPacket & {
  id: number
  uid: string
  siteId: number
  siteUid: string
  siteCode: string
  siteName: string
  periodCode: string
  periodName: string
  periodStart: string
  periodEnd: string
  paymentDate: string | null
  payrollBasis: 'PIECE_RATE'
  status: (typeof payrollPeriodStatuses)[number]
  notes: string | null
  createdAt: string
  cancelledAt: string | null
  cancellationReason: string | null
}

function isGlobalViewer(auth: AuthContext) {
  return auth.roles.includes('SUPER_ADMIN') || auth.roles.includes('DIRECTOR')
}

function enforceSite(auth: AuthContext, code: string) {
  if (!isGlobalViewer(auth) && !auth.siteAccess.includes(code)) {
    throw new ApiError(403, 'Akses site Payroll ditolak.')
  }
}

function csv<T>(raw: unknown, schema: z.ZodType<T>) {
  return [...new Set(String(raw ?? '').split(',').map((value) => value.trim()).filter(Boolean).map((value) => schema.parse(value)))]
}

function pagination(rawPage: unknown, rawPageSize: unknown) {
  const page = Number(rawPage ?? 1)
  const pageSize = Number(rawPageSize ?? 50)
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 500) : 50,
  }
}

const periodProjection = `SELECT pp.id,pp.uid,pp.site_id siteId,
  pp.period_code periodCode,pp.period_name periodName,
  DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
  DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,
  DATE_FORMAT(pp.payment_date,'%Y-%m-%d') paymentDate,
  pp.payroll_basis payrollBasis,pp.status,pp.notes,
  CONCAT(DATE_FORMAT(pp.created_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') createdAt,
  IF(pp.cancelled_at IS NULL,NULL,CONCAT(DATE_FORMAT(pp.cancelled_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00')) cancelledAt,
  pp.cancellation_reason cancellationReason,
  s.uid siteUid,s.code siteCode,s.name siteName
 FROM payroll_periods pp JOIN sites s ON s.id=pp.site_id`

function rowDto(row: PeriodRow, readiness: PayrollReadiness) {
  return {
    uid: row.uid,
    periodCode: row.periodCode,
    periodName: row.periodName,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    paymentDate: row.paymentDate,
    payrollBasis: row.payrollBasis,
    status: row.status,
    notes: row.notes,
    site: { uid: row.siteUid, code: row.siteCode, name: row.siteName },
    createdAt: row.createdAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    readiness,
  }
}

type Executor = Pick<Pool | PoolConnection, 'query'>

async function readinessFor(row: PeriodRow, executor: Executor = pool) {
  const readiness = await evaluatePayrollReadiness(executor, {
    id: Number(row.id),
    siteId: Number(row.siteId),
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
  })
  if (row.status === 'CANCELLED') {
    readiness.blockers.unshift({ code: 'PERIOD_CANCELLED', message: 'Periode Payroll telah dibatalkan.', count: 1, severity: 'BLOCKER', group: 'PERIOD', actionUrl: null })
    readiness.blockerCount = readiness.blockers.length
    readiness.status = 'BLOCKED'
  }
  return readiness
}

function buildWhere(auth: AuthContext, query: Record<string, unknown>, includeStatus = true) {
  const where = ["pp.payroll_basis='PIECE_RATE'"]
  const values: unknown[] = []
  if (!isGlobalViewer(auth)) {
    where.push(`s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`)
    values.push(...auth.siteAccess)
  }
  const sites = csv(query.site, siteCode)
  if (sites.length) {
    sites.forEach((site) => enforceSite(auth, site))
    where.push(`s.code IN (${sites.map(() => '?').join(',')})`)
    values.push(...sites)
  }
  if (includeStatus) {
    const statuses = csv(query.status, periodStatus)
    if (statuses.length) {
      where.push(`pp.status IN (${statuses.map(() => '?').join(',')})`)
      values.push(...statuses)
    }
  }
  const search = String(query.query ?? '').trim()
  if (search) {
    if (search.length > 150) throw new ApiError(422, 'Pencarian terlalu panjang.')
    where.push('(pp.period_code LIKE ? OR pp.period_name LIKE ? OR s.name LIKE ?)')
    values.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  const dateFrom = query.dateFrom ? z.string().date().parse(query.dateFrom) : null
  const dateTo = query.dateTo ? z.string().date().parse(query.dateTo) : null
  if (dateFrom && dateTo && dateTo < dateFrom) throw new ApiError(422, 'Tanggal akhir filter tidak boleh sebelum tanggal awal.')
  if (dateFrom) { where.push('pp.period_end>=?'); values.push(dateFrom) }
  if (dateTo) { where.push('pp.period_start<=?'); values.push(dateTo) }
  return { sql: where.join(' AND '), values }
}

async function loadPeriod(auth: AuthContext, periodUid: string, lock = false, executor: Executor = pool) {
  const [rows] = await executor.query<PeriodRow[]>(
    `${periodProjection} WHERE pp.uid=? ${lock ? 'FOR UPDATE' : ''}`,
    [periodUid]
  )
  const row = rows[0]
  if (!row) throw new ApiError(404, 'Periode Payroll tidak ditemukan.')
  enforceSite(auth, row.siteCode)
  return row
}

export const payrollPeriodsRouter = Router()
payrollPeriodsRouter.use(authenticate)

payrollPeriodsRouter.get('/periods/meta', requirePermission('payroll.view'), async (_req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const where = ['s.is_active=1']
    const values: unknown[] = []
    if (!isGlobalViewer(auth)) {
      where.push(`s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`)
      values.push(...auth.siteAccess)
    }
    const [sites] = await pool.query<RowDataPacket[]>(
      `SELECT uid,code,name FROM sites s WHERE ${where.join(' AND ')} ORDER BY name`,
      values
    )
    res.json({ data: { sites, statuses: payrollPeriodStatuses, maxPeriodDays: 31, payrollBasis: 'PIECE_RATE' } })
  } catch (error) { next(error) }
})

payrollPeriodsRouter.get('/periods', requirePermission('payroll.view'), async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
    const filtered = buildWhere(auth, req.query as Record<string, unknown>, true)
    const summaryScope = buildWhere(auth, req.query as Record<string, unknown>, false)
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) total ${periodProjection.slice(periodProjection.indexOf(' FROM '))} WHERE ${filtered.sql}`,
      filtered.values
    )
    const [rows] = await pool.query<PeriodRow[]>(
      `${periodProjection} WHERE ${filtered.sql} ORDER BY pp.period_start DESC,pp.id DESC LIMIT ? OFFSET ?`,
      [...filtered.values, pageSize, (page - 1) * pageSize]
    )
    const data = await Promise.all(rows.map(async (row) => rowDto(row, await readinessFor(row))))

    const [summaryRows] = await pool.query<PeriodRow[]>(
      `${periodProjection} WHERE ${summaryScope.sql}`,
      summaryScope.values
    )
    const readinessCache = new Map(data.map((item) => [item.uid, item.readiness]))
    const actionableRows = summaryRows.filter((row) => row.status === 'DRAFT')
    const actionableReadiness = await Promise.all(actionableRows.map(async (row) => readinessCache.get(row.uid) ?? readinessFor(row)))
    const total = Number(countRows[0]?.total ?? 0)
    res.json({
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        summary: {
          total: summaryRows.length,
          draft: summaryRows.filter((row) => row.status === 'DRAFT').length,
          needsAttention: actionableRows.filter((_row, index) => actionableReadiness[index]?.status !== 'READY').length,
          closed: summaryRows.filter((row) => row.status === 'CLOSED').length,
        },
      },
    })
  } catch (error) { next(error) }
})

payrollPeriodsRouter.get('/periods/:periodUid', requirePermission('payroll.view'), async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const row = await loadPeriod(auth, uuid.parse(req.params.periodUid))
    res.json({ data: rowDto(row, await readinessFor(row)) })
  } catch (error) { next(error) }
})

payrollPeriodsRouter.get('/periods/:periodUid/readiness', requirePermission('payroll.view'), async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const row = await loadPeriod(auth, uuid.parse(req.params.periodUid))
    res.json({ data: await readinessFor(row) })
  } catch (error) { next(error) }
})

payrollPeriodsRouter.post('/periods', requirePermission('payroll.calculate'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext
    const input = createPeriodInput.parse(req.body)
    assertPayrollPeriodRange(input)
    if (input.paymentDate && input.paymentDate < input.periodEnd) {
      throw new ApiError(422, 'Tanggal pembayaran tidak boleh sebelum tanggal akhir periode.')
    }
    await conn.beginTransaction()
    const [sites] = await conn.query<RowDataPacket[]>(
      `SELECT id,uid,code,name FROM sites WHERE uid=? AND is_active=1 FOR UPDATE`,
      [input.siteUid]
    )
    const site = sites[0]
    if (!site) throw new ApiError(404, 'Site aktif tidak ditemukan.')
    enforceSite(auth, String(site.code))
    await assertNoOverlappingPayrollPeriod(conn, {
      siteId: Number(site.id),
      payrollBasis: 'PIECE_RATE',
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
    const uidValue = randomUUID()
    const periodCode = `PAY-${String(site.code)}-${input.periodStart.replaceAll('-', '')}-${input.periodEnd.replaceAll('-', '')}-${uidValue.slice(0, 8).toUpperCase()}`
    const periodName = input.periodName ?? `Payroll ${String(site.name)} ${input.periodStart} s.d. ${input.periodEnd}`
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO payroll_periods(
         uid,site_id,period_code,period_name,period_start,period_end,payment_date,
         payroll_basis,status,notes,created_by,updated_by
       ) VALUES(?,?,?,?,?,?,?,'PIECE_RATE','DRAFT',?,?,?)`,
      [uidValue, site.id, periodCode, periodName, input.periodStart, input.periodEnd, input.paymentDate ?? null, input.notes ?? null, auth.id, auth.id]
    )
    await writeAudit({
      auth,
      request: req,
      module: 'PAYROLL',
      siteId: Number(site.id),
      action: 'CREATE',
      table: 'payroll_periods',
      recordId: result.insertId,
      recordUid: uidValue,
      description: `Membuat periode Payroll ${periodCode}.`,
      afterData: { periodCode, periodName, periodStart: input.periodStart, periodEnd: input.periodEnd, paymentDate: input.paymentDate ?? null, payrollBasis: 'PIECE_RATE', status: 'DRAFT' },
    }, conn)
    const row = await loadPeriod(auth, uidValue, false, conn)
    const responseData = rowDto(row, await readinessFor(row, conn))
    await conn.commit()
    res.status(201).json({ data: responseData })
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally { conn.release() }
})

payrollPeriodsRouter.post('/periods/:periodUid/cancel', requirePermission('payroll.calculate'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext
    const periodUid = uuid.parse(req.params.periodUid)
    const input = cancelInput.parse(req.body)
    await conn.beginTransaction()
    const [rows] = await conn.query<PeriodRow[]>(
      `${periodProjection} WHERE pp.uid=? FOR UPDATE`,
      [periodUid]
    )
    const current = rows[0]
    if (!current) throw new ApiError(404, 'Periode Payroll tidak ditemukan.')
    enforceSite(auth, current.siteCode)
    if (current.status !== 'DRAFT') throw new ApiError(409, 'Hanya periode Payroll berstatus DRAFT yang dapat dibatalkan.')
    await conn.execute(
      `UPDATE payroll_periods
          SET status='CANCELLED',cancelled_at=NOW(3),cancelled_by=?,cancellation_reason=?,updated_by=?
        WHERE id=? AND status='DRAFT'`,
      [auth.id, input.reason, auth.id, current.id]
    )
    await writeAudit({
      auth,
      request: req,
      module: 'PAYROLL',
      siteId: Number(current.siteId),
      action: 'UPDATE',
      table: 'payroll_periods',
      recordId: Number(current.id),
      recordUid: current.uid,
      description: `Membatalkan periode Payroll ${current.periodCode}.`,
      reason: input.reason,
      beforeData: { status: current.status },
      afterData: { status: 'CANCELLED', cancellationReason: input.reason },
    }, conn)
    const row = await loadPeriod(auth, current.uid, false, conn)
    const responseData = rowDto(row, await readinessFor(row, conn))
    await conn.commit()
    res.json({ data: responseData })
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally { conn.release() }
})
