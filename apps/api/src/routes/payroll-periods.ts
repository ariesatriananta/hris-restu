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
  insertPayrollPolicySnapshot,
  payrollPolicySnapshot,
  previewTimeBasedPopulation,
  resolvePayrollPeriodPolicy,
} from '../lib/payroll-period-resolver.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const uuid = z.string().uuid()
const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const periodStatus = z.enum(payrollPeriodStatuses)
const employeeType = z.enum(['BORONGAN', 'HARIAN', 'TRAINING', 'BULANAN'])
const payrollBasis = z.enum(['PIECE_RATE', 'TIME_BASED'])
const payFrequency = z.enum(['WEEKLY', 'MONTHLY'])
const createPeriodInput = z.object({
  siteUid: uuid,
  employeeType: employeeType.default('BORONGAN'),
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
  payrollBasis: 'PIECE_RATE' | 'TIME_BASED'
  payFrequency: 'WEEKLY' | 'MONTHLY'
  employeeType: 'BORONGAN' | 'HARIAN' | 'TRAINING' | 'BULANAN' | null
  policySnapshot: unknown | null
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
  return [
    ...new Set(
      String(raw ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => schema.parse(value))
    ),
  ]
}

function pagination(rawPage: unknown, rawPageSize: unknown) {
  const page = Number(rawPage ?? 1)
  const pageSize = Number(rawPageSize ?? 50)
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize:
      Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 500) : 50,
  }
}

const periodProjection = `SELECT pp.id,pp.uid,pp.site_id siteId,
  pp.period_code periodCode,pp.period_name periodName,
  DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
  DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,
  DATE_FORMAT(pp.payment_date,'%Y-%m-%d') paymentDate,
  pp.payroll_basis payrollBasis,pp.pay_frequency payFrequency,
  pp.employee_type_code employeeType,pp.status,pp.notes,
  ppps.policy_snapshot policySnapshot,
  CONCAT(DATE_FORMAT(pp.created_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') createdAt,
  IF(pp.cancelled_at IS NULL,NULL,CONCAT(DATE_FORMAT(pp.cancelled_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00')) cancelledAt,
  pp.cancellation_reason cancellationReason,
  s.uid siteUid,s.code siteCode,s.name siteName
 FROM payroll_periods pp JOIN sites s ON s.id=pp.site_id
 LEFT JOIN payroll_period_policy_snapshots ppps ON ppps.payroll_period_id=pp.id`

function json(value: unknown) {
  if (value == null || typeof value === 'object') return value ?? null
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

function rowDto(row: PeriodRow, readiness: PayrollReadiness) {
  return {
    uid: row.uid,
    periodCode: row.periodCode,
    periodName: row.periodName,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    paymentDate: row.paymentDate,
    payrollBasis: row.payrollBasis,
    payFrequency: row.payFrequency,
    employeeType: row.employeeType,
    policySnapshot: json(row.policySnapshot),
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
    payrollBasis: row.payrollBasis,
    payFrequency: row.payFrequency,
    employeeType: row.employeeType,
    policySnapshot: json(row.policySnapshot),
  })
  if (row.status === 'CANCELLED') {
    readiness.blockers.unshift({
      code: 'PERIOD_CANCELLED',
      message: 'Periode Payroll telah dibatalkan.',
      count: 1,
      severity: 'BLOCKER',
      group: 'PERIOD',
      actionUrl: null,
    })
    readiness.blockerCount = readiness.blockers.length
    readiness.status = 'BLOCKED'
  }
  return readiness
}

function buildWhere(
  auth: AuthContext,
  query: Record<string, unknown>,
  includeStatus = true
) {
  const where = ['1=1']
  const values: unknown[] = []
  if (!isGlobalViewer(auth)) {
    where.push(
      `s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`
    )
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
  const bases = csv(query.payrollBasis, payrollBasis)
  if (bases.length) {
    where.push(`pp.payroll_basis IN (${bases.map(() => '?').join(',')})`)
    values.push(...bases)
  }
  const frequencies = csv(query.payFrequency, payFrequency)
  if (frequencies.length) {
    where.push(`pp.pay_frequency IN (${frequencies.map(() => '?').join(',')})`)
    values.push(...frequencies)
  }
  const employeeTypes = csv(query.employeeType, employeeType)
  if (employeeTypes.length) {
    where.push(
      `pp.employee_type_code IN (${employeeTypes.map(() => '?').join(',')})`
    )
    values.push(...employeeTypes)
  }
  const search = String(query.query ?? '').trim()
  if (search) {
    if (search.length > 150)
      throw new ApiError(422, 'Pencarian terlalu panjang.')
    where.push(
      '(pp.period_code LIKE ? OR pp.period_name LIKE ? OR s.name LIKE ?)'
    )
    values.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  const dateFrom = query.dateFrom
    ? z.string().date().parse(query.dateFrom)
    : null
  const dateTo = query.dateTo ? z.string().date().parse(query.dateTo) : null
  if (dateFrom && dateTo && dateTo < dateFrom)
    throw new ApiError(
      422,
      'Tanggal akhir filter tidak boleh sebelum tanggal awal.'
    )
  if (dateFrom) {
    where.push('pp.period_end>=?')
    values.push(dateFrom)
  }
  if (dateTo) {
    where.push('pp.period_start<=?')
    values.push(dateTo)
  }
  return { sql: where.join(' AND '), values }
}

async function loadPeriod(
  auth: AuthContext,
  periodUid: string,
  lock = false,
  executor: Executor = pool
) {
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

payrollPeriodsRouter.get(
  '/periods/meta',
  requirePermission('payroll.view'),
  async (_req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const where = ['s.is_active=1']
      const values: unknown[] = []
      if (!isGlobalViewer(auth)) {
        where.push(
          `s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`
        )
        values.push(...auth.siteAccess)
      }
      const [sites] = await pool.query<RowDataPacket[]>(
        `SELECT uid,code,name FROM sites s WHERE ${where.join(' AND ')} ORDER BY name`,
        values
      )
      res.json({
        data: {
          sites,
          statuses: payrollPeriodStatuses,
          maxPeriodDays: 31,
          payrollBasis: 'PIECE_RATE',
          payrollBases: payrollBasis.options,
          payFrequencies: payFrequency.options,
          employeeTypes: employeeType.options,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

function timePreviewDto(
  rows: Awaited<ReturnType<typeof previewTimeBasedPopulation>>
) {
  const employees = rows.map((row) => ({
    ...row,
    issues: [
      ...(row.missingBaseDays
        ? [
            {
              code: 'BASE_RATE_MISSING',
              severity: 'BLOCKER' as const,
              count: row.missingBaseDays,
              message: 'Tarif dasar belum mencakup seluruh tanggal eligible.',
              actionUrl: '/payroll/skema-upah',
            },
          ]
        : []),
      ...(row.ambiguousBaseDays
        ? [
            {
              code: 'BASE_RATE_AMBIGUOUS',
              severity: 'BLOCKER' as const,
              count: row.ambiguousBaseDays,
              message:
                'Lebih dari satu tarif dasar berlaku pada tanggal yang sama.',
              actionUrl: '/payroll/skema-upah',
            },
          ]
        : []),
      ...(row.invalidContractDays
        ? [
            {
              code: 'CONTRACT_MATRIX_INVALID',
              severity: 'BLOCKER' as const,
              count: row.invalidContractDays,
              message: 'Kontrak efektif tidak sesuai matriks jenis karyawan.',
              actionUrl: '/karyawan/kontrak',
            },
          ]
        : []),
      ...(row.duplicateAttendanceDays
        ? [
            {
              code: 'ATTENDANCE_DUPLICATE',
              severity: 'BLOCKER' as const,
              count: row.duplicateAttendanceDays,
              message:
                'Terdapat lebih dari satu fakta Attendance pada tanggal yang sama.',
              actionUrl: '/attendance/rekap',
            },
          ]
        : []),
      ...(row.missingAttendanceDays
        ? [
            {
              code: 'ATTENDANCE_MISSING',
              severity: 'BLOCKER' as const,
              count: row.missingAttendanceDays,
              message: 'Fakta Attendance hari kerja belum tersedia.',
              actionUrl: '/attendance/monitoring-harian',
            },
          ]
        : []),
      ...(row.unsupportedCurrencyDays
        ? [
            {
              code: 'CURRENCY_UNSUPPORTED',
              severity: 'BLOCKER' as const,
              count: row.unsupportedCurrencyDays,
              message: 'Tarif atau gaji memakai mata uang yang belum didukung.',
              actionUrl: '/payroll/skema-upah',
            },
          ]
        : []),
      ...(row.employeeType === 'BULANAN' && row.rateSegmentCount > 1
        ? [
            {
              code: 'SALARY_SEGMENT_INVALID',
              severity: 'BLOCKER' as const,
              count: row.rateSegmentCount,
              message:
                'Perubahan gaji pokok ditemukan di tengah periode Payroll.',
              actionUrl: '/payroll/skema-upah',
            },
          ]
        : []),
      ...(row.offdayPresentDays
        ? [
            {
              code: 'OFFDAY_PRESENT_PAYABLE',
              severity: 'WARNING' as const,
              count: row.offdayPresentDays,
              message:
                'PRESENT pada hari nonkerja tetap dihitung sebagai hari dibayar.',
              actionUrl: '/attendance/rekap',
            },
          ]
        : []),
    ],
  }))
  return {
    employees,
    summary: {
      populationCount: rows.length,
      payablePresentDays: rows.reduce(
        (total, row) => total + row.payablePresentDays,
        0
      ),
      offdayPresentDays: rows.reduce(
        (total, row) => total + row.offdayPresentDays,
        0
      ),
      missingBaseAmountEmployees: rows.filter((row) => row.missingBaseDays > 0)
        .length,
      ambiguousBaseAmountEmployees: rows.filter(
        (row) => row.ambiguousBaseDays > 0
      ).length,
      invalidContractEmployees: rows.filter(
        (row) => row.invalidContractDays > 0
      ).length,
      duplicateAttendanceEmployees: rows.filter(
        (row) => row.duplicateAttendanceDays > 0
      ).length,
      missingAttendanceEmployees: rows.filter(
        (row) => row.missingAttendanceDays > 0
      ).length,
      unsupportedCurrencyEmployees: rows.filter(
        (row) => row.unsupportedCurrencyDays > 0
      ).length,
      invalidSalarySegmentEmployees: rows.filter(
        (row) => row.employeeType === 'BULANAN' && row.rateSegmentCount > 1
      ).length,
      estimatedGrossAmount: String(
        rows.reduce((total, row) => total + Number(row.estimatedGrossAmount), 0)
      ),
      estimatedDeductionAmount: String(
        rows.reduce(
          (total, row) => total + Number(row.estimatedDeductionAmount),
          0
        )
      ),
      estimatedNetAmount: String(
        rows.reduce((total, row) => total + Number(row.estimatedNetAmount), 0)
      ),
    },
  }
}

payrollPeriodsRouter.post(
  '/periods/preview',
  requirePermission('payroll.calculate'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const input = createPeriodInput
        .pick({
          siteUid: true,
          employeeType: true,
          periodStart: true,
          periodEnd: true,
        })
        .parse(req.body)
      assertPayrollPeriodRange(input)
      const [sites] = await pool.query<RowDataPacket[]>(
        `SELECT id,uid,code,name FROM sites WHERE uid=? AND is_active=1`,
        [input.siteUid]
      )
      const site = sites[0]
      if (!site) throw new ApiError(404, 'Site aktif tidak ditemukan.')
      enforceSite(auth, String(site.code))
      const policy = await resolvePayrollPeriodPolicy(pool, {
        siteId: Number(site.id),
        employeeType: input.employeeType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      })
      const timeRows =
        policy.wageBasis === 'TIME_BASED'
          ? await previewTimeBasedPopulation(pool, {
              siteId: Number(site.id),
              employeeType: input.employeeType as
                | 'HARIAN'
                | 'TRAINING'
                | 'BULANAN',
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
            })
          : undefined
      const preview = timeRows
        ? timePreviewDto(timeRows)
        : {
            employees: [],
            summary: {
              populationCount: 0,
              payablePresentDays: 0,
              offdayPresentDays: 0,
              missingBaseAmountEmployees: 0,
              ambiguousBaseAmountEmployees: 0,
              invalidContractEmployees: 0,
              duplicateAttendanceEmployees: 0,
              missingAttendanceEmployees: 0,
              unsupportedCurrencyEmployees: 0,
              invalidSalarySegmentEmployees: 0,
              estimatedGrossAmount: '0',
              estimatedDeductionAmount: '0',
              estimatedNetAmount: '0',
            },
          }
      const readiness = await evaluatePayrollReadiness(pool, {
        id: 0,
        siteId: Number(site.id),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        payrollBasis: policy.wageBasis,
        payFrequency: policy.payFrequency,
        employeeType: policy.employeeType,
        policySnapshot: payrollPolicySnapshot(policy),
        timePreviewRows: timeRows,
      })
      res.json({
        data: {
          site: { uid: site.uid, code: site.code, name: site.name },
          period: {
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
          },
          policy: payrollPolicySnapshot(policy),
          readiness,
          ...preview,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

payrollPeriodsRouter.get(
  '/periods',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const filtered = buildWhere(
        auth,
        req.query as Record<string, unknown>,
        true
      )
      const summaryScope = buildWhere(
        auth,
        req.query as Record<string, unknown>,
        false
      )
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${periodProjection.slice(periodProjection.indexOf(' FROM '))} WHERE ${filtered.sql}`,
        filtered.values
      )
      const [rows] = await pool.query<PeriodRow[]>(
        `${periodProjection} WHERE ${filtered.sql} ORDER BY pp.period_start DESC,pp.id DESC LIMIT ? OFFSET ?`,
        [...filtered.values, pageSize, (page - 1) * pageSize]
      )
      const data = await Promise.all(
        rows.map(async (row) => rowDto(row, await readinessFor(row)))
      )

      const [summaryRows] = await pool.query<PeriodRow[]>(
        `${periodProjection} WHERE ${summaryScope.sql}`,
        summaryScope.values
      )
      const readinessCache = new Map(
        data.map((item) => [item.uid, item.readiness])
      )
      const actionableRows = summaryRows.filter((row) => row.status === 'DRAFT')
      const actionableReadiness = await Promise.all(
        actionableRows.map(
          async (row) => readinessCache.get(row.uid) ?? readinessFor(row)
        )
      )
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
            needsAttention: actionableRows.filter(
              (_row, index) => actionableReadiness[index]?.status !== 'READY'
            ).length,
            closed: summaryRows.filter((row) => row.status === 'CLOSED').length,
          },
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

payrollPeriodsRouter.get(
  '/periods/:periodUid',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const row = await loadPeriod(auth, uuid.parse(req.params.periodUid))
      res.json({ data: rowDto(row, await readinessFor(row)) })
    } catch (error) {
      next(error)
    }
  }
)

payrollPeriodsRouter.get(
  '/periods/:periodUid/readiness',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const row = await loadPeriod(auth, uuid.parse(req.params.periodUid))
      res.json({ data: await readinessFor(row) })
    } catch (error) {
      next(error)
    }
  }
)

payrollPeriodsRouter.get(
  '/periods/:periodUid/employees',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const row = await loadPeriod(auth, uuid.parse(req.params.periodUid))
      if (
        row.payrollBasis !== 'TIME_BASED' ||
        !row.employeeType ||
        row.employeeType === 'BORONGAN'
      ) {
        return res.json({
          data: [],
          meta: { summary: timePreviewDto([]).summary },
        })
      }
      const preview = timePreviewDto(
        await previewTimeBasedPopulation(pool, {
          periodId: Number(row.id),
          siteId: Number(row.siteId),
          employeeType: row.employeeType,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
        })
      )
      res.json({ data: preview.employees, meta: { summary: preview.summary } })
    } catch (error) {
      next(error)
    }
  }
)

payrollPeriodsRouter.post(
  '/periods',
  requirePermission('payroll.calculate'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const input = createPeriodInput.parse(req.body)
      assertPayrollPeriodRange(input)
      if (input.paymentDate && input.paymentDate < input.periodEnd) {
        throw new ApiError(
          422,
          'Tanggal pembayaran tidak boleh sebelum tanggal akhir periode.'
        )
      }
      await conn.beginTransaction()
      const [sites] = await conn.query<RowDataPacket[]>(
        `SELECT id,uid,code,name FROM sites WHERE uid=? AND is_active=1 FOR UPDATE`,
        [input.siteUid]
      )
      const site = sites[0]
      if (!site) throw new ApiError(404, 'Site aktif tidak ditemukan.')
      enforceSite(auth, String(site.code))
      const policy = await resolvePayrollPeriodPolicy(conn, {
        siteId: Number(site.id),
        employeeType: input.employeeType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        lock: true,
      })
      await assertNoOverlappingPayrollPeriod(conn, {
        siteId: Number(site.id),
        payrollBasis: policy.wageBasis,
        payFrequency: policy.payFrequency,
        employeeType: policy.employeeType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      })
      const uidValue = randomUUID()
      const periodCode = `PAY-${String(site.code)}-${input.employeeType}-${input.periodStart.replaceAll('-', '')}-${input.periodEnd.replaceAll('-', '')}-${uidValue.slice(0, 8).toUpperCase()}`
      const periodName =
        input.periodName ??
        `Payroll ${input.employeeType} ${String(site.name)} ${input.periodStart} s.d. ${input.periodEnd}`
      const [result] = await conn.execute<ResultSetHeader>(
        `INSERT INTO payroll_periods(
         uid,site_id,period_code,period_name,period_start,period_end,payment_date,
         payroll_basis,pay_frequency,employee_type_code,status,notes,created_by,updated_by
       ) VALUES(?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?)`,
        [
          uidValue,
          site.id,
          periodCode,
          periodName,
          input.periodStart,
          input.periodEnd,
          input.paymentDate ?? null,
          policy.wageBasis,
          policy.payFrequency,
          policy.employeeType,
          input.notes ?? null,
          auth.id,
          auth.id,
        ]
      )
      await insertPayrollPolicySnapshot(conn, {
        payrollPeriodId: result.insertId,
        policy,
        userId: auth.id,
      })
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PAYROLL',
          siteId: Number(site.id),
          action: 'CREATE',
          table: 'payroll_periods',
          recordId: result.insertId,
          recordUid: uidValue,
          description: `Membuat periode Payroll ${periodCode}.`,
          afterData: {
            periodCode,
            periodName,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            paymentDate: input.paymentDate ?? null,
            payrollBasis: policy.wageBasis,
            payFrequency: policy.payFrequency,
            employeeType: policy.employeeType,
            policyVersionUid: policy.uid,
            status: 'DRAFT',
          },
        },
        conn
      )
      const row = await loadPeriod(auth, uidValue, false, conn)
      const responseData = rowDto(row, await readinessFor(row, conn))
      await conn.commit()
      res.status(201).json({ data: responseData })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

payrollPeriodsRouter.post(
  '/periods/:periodUid/cancel',
  requirePermission('payroll.calculate'),
  async (req, res, next) => {
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
      if (current.status !== 'DRAFT')
        throw new ApiError(
          409,
          'Hanya periode Payroll berstatus DRAFT yang dapat dibatalkan.'
        )
      await conn.execute(
        `UPDATE payroll_periods
          SET status='CANCELLED',cancelled_at=NOW(3),cancelled_by=?,cancellation_reason=?,updated_by=?
        WHERE id=? AND status='DRAFT'`,
        [auth.id, input.reason, auth.id, current.id]
      )
      await writeAudit(
        {
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
        },
        conn
      )
      const row = await loadPeriod(auth, current.uid, false, conn)
      const responseData = rowDto(row, await readinessFor(row, conn))
      await conn.commit()
      res.json({ data: responseData })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)
