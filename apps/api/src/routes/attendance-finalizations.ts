import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { env } from '../config.js'
import { pool } from '../db.js'
import {
  finalizeAttendanceDay,
  getAttendanceFinalizationRequirement,
  getAttendanceShiftDueState,
  hasDueAttendanceShift,
  type AttendanceFinalizationCounts,
} from '../lib/attendance-finalization.js'
import {
  attendanceFinalizationInput,
  canRunFinalization,
  finalizationStatus,
  jakartaDateTime,
} from '../lib/attendance-finalization-policy.js'
import {
  attendanceBulkFinalizationMaxReadyDates,
  attendanceBulkFinalizationReason,
  attendanceBulkFinalizationRunInput,
  attendanceBulkFinalizationScopeInput,
  enumerateDates,
  isCleanFinalization,
  type AttendanceBulkDateCode,
  type AttendanceBulkDateStatus,
  type AttendanceBulkFinalizationScope,
} from '../lib/attendance-bulk-finalization-policy.js'
import { ApiError } from '../lib/errors.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const emptyCounts = (): AttendanceFinalizationCounts => ({
  eligible: 0,
  absent: 0,
  holiday: 0,
  preserved: 0,
  weeklyOff: 0,
  missingAssignment: 0,
  ambiguousAssignment: 0,
  ambiguousEmployment: 0,
  pendingDue: 0,
})
const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])

function parseObject<T>(value: unknown, fallback: T): T {
  if (!value) return fallback
  if (typeof value === 'object') return value as T
  try {
    return JSON.parse(String(value)) as T
  } catch {
    return fallback
  }
}

function enforceSite(auth: AuthContext, site: string) {
  if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

type BulkDateItem = {
  businessDate: string
  status: AttendanceBulkDateStatus
  code: AttendanceBulkDateCode
  message: string
}

type DateInterval = { dateFrom: string; dateTo: string }

function dateInIntervals(date: string, intervals: DateInterval[]) {
  return intervals.some(
    (interval) => date >= interval.dateFrom && date <= interval.dateTo
  )
}

function resultMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : 'Finalisasi gagal. Silakan periksa kembali tanggal ini.'
}

async function resolveSite(siteCodeValue: string) {
  const [sites] = await pool.query<RowDataPacket[]>(
    'SELECT id,code FROM sites WHERE code=? AND is_active=1',
    [siteCodeValue]
  )
  if (!sites[0]) {
    throw new ApiError(404, 'Site tidak ditemukan atau tidak aktif.')
  }
  return { id: Number(sites[0].id), code: String(sites[0].code) }
}

async function findLastFullyDueDate(input: {
  siteId: number
  today: string
  now: Date
}) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(
              MAX(LEAST(?,COALESCE(h.effective_to,?),COALESCE(esa.effective_to,?))),
              '%Y-%m-%d'
            ) latestDate
       FROM employee_employment_histories h
       JOIN employee_statuses es
         ON es.id=h.employee_status_id AND es.allows_attendance=1
       JOIN employee_shift_assignments esa
         ON esa.employee_id=h.employee_id
        AND esa.effective_from<=COALESCE(h.effective_to,?)
        AND (esa.effective_to IS NULL OR esa.effective_to>=h.effective_from)
       JOIN shifts sh
         ON sh.id=esa.shift_id AND sh.site_id=h.site_id AND sh.is_active=1
      WHERE h.site_id=?
        AND h.effective_from<=?
        AND (h.effective_to IS NULL OR h.effective_to>=?)
        AND esa.effective_from<=?
        AND (esa.effective_to IS NULL OR esa.effective_to>=?)`,
    [
      input.today,
      input.today,
      input.today,
      input.today,
      input.siteId,
      input.today,
      env.ATTENDANCE_GO_LIVE_DATE,
      input.today,
      env.ATTENDANCE_GO_LIVE_DATE,
    ]
  )
  const latestDate = rows[0]?.latestDate
    ? String(rows[0].latestDate)
    : undefined
  if (!latestDate) return null
  const dates = enumerateDates(
    env.ATTENDANCE_GO_LIVE_DATE,
    latestDate
  ).reverse()
  for (const businessDate of dates) {
    const due = await getAttendanceShiftDueState({
      siteId: input.siteId,
      businessDate,
      now: input.now,
    })
    if (due.allDue) return businessDate
  }
  return null
}

async function buildBulkPreview(
  input: AttendanceBulkFinalizationScope,
  now = new Date()
) {
  const site = await resolveSite(input.siteCode)
  const today = jakartaDateTime(now).slice(0, 10)
  let dateFrom = input.dateFrom ?? env.ATTENDANCE_GO_LIVE_DATE
  let dateTo = input.dateTo ?? today

  if (input.mode === 'ALL_PENDING') {
    dateFrom = env.ATTENDANCE_GO_LIVE_DATE
    dateTo =
      (await findLastFullyDueDate({ siteId: site.id, today, now })) ??
      env.ATTENDANCE_GO_LIVE_DATE
  }
  if (dateFrom < env.ATTENDANCE_GO_LIVE_DATE || dateTo > today) {
    throw new ApiError(
      422,
      `Rentang finalisasi harus berada antara ${env.ATTENDANCE_GO_LIVE_DATE} dan ${today}.`
    )
  }

  const [latestRuns, classificationRows, correctionRows, lockedPeriodRows] =
    await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(r.business_date,'%Y-%m-%d') businessDate,
                r.status rawStatus,r.summary
           FROM attendance_daily_finalization_runs r
          WHERE r.site_id=? AND r.business_date BETWEEN ? AND ?
            AND r.id=(SELECT MAX(latest.id)
                        FROM attendance_daily_finalization_runs latest
                       WHERE latest.site_id=r.site_id
                         AND latest.business_date=r.business_date)`,
        [site.id, dateFrom, dateTo]
      ),
      pool.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(start_date,'%Y-%m-%d') dateFrom,
                DATE_FORMAT(end_date,'%Y-%m-%d') dateTo
           FROM attendance_classification_requests
          WHERE site_id=? AND approval_status='PENDING'
            AND start_date<=? AND end_date>=?`,
        [site.id, dateTo, dateFrom]
      ),
      pool.query<RowDataPacket[]>(
        `SELECT DISTINCT DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate
           FROM attendance_corrections ac
           JOIN attendance_records ar ON ar.id=ac.attendance_record_id
          WHERE ar.site_id=? AND ac.approval_status='PENDING'
            AND ar.business_date BETWEEN ? AND ?`,
        [site.id, dateFrom, dateTo]
      ),
      pool.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(pp.period_start,'%Y-%m-%d') dateFrom,
                DATE_FORMAT(pp.period_end,'%Y-%m-%d') dateTo
           FROM payroll_periods pp
          WHERE pp.site_id=? AND pp.period_start<=? AND pp.period_end>=?
            AND (
              pp.status IN ('CALCULATED','APPROVED','CLOSED')
              OR EXISTS(SELECT 1 FROM payroll_runs pr
                         WHERE pr.payroll_period_id=pp.id
                           AND pr.status='PROCESSING')
              OR EXISTS(SELECT 1
                          FROM payroll_employee_results per
                          JOIN payroll_attendance_summaries pas
                            ON pas.payroll_employee_result_id=per.id
                         WHERE per.payroll_period_id=pp.id)
            )`,
        [site.id, dateTo, dateFrom]
      ),
    ])

  const latestByDate = new Map(
    latestRuns[0].map((row) => [String(row.businessDate), row])
  )
  const classificationIntervals = classificationRows[0].map((row) => ({
    dateFrom: String(row.dateFrom),
    dateTo: String(row.dateTo),
  }))
  const correctionDates = new Set(
    correctionRows[0].map((row) => String(row.businessDate))
  )
  const lockedIntervals = lockedPeriodRows[0].map((row) => ({
    dateFrom: String(row.dateFrom),
    dateTo: String(row.dateTo),
  }))

  const items: BulkDateItem[] = []
  let readySeen = 0
  for (const businessDate of enumerateDates(dateFrom, dateTo)) {
    const latest = latestByDate.get(businessDate)
    const summary = {
      ...emptyCounts(),
      ...parseObject<Partial<AttendanceFinalizationCounts>>(
        latest?.summary,
        {}
      ),
    }
    if (latest?.rawStatus === 'RUNNING') {
      items.push({
        businessDate,
        status: 'BLOCKED',
        code: 'RUNNING',
        message: 'Finalisasi tanggal ini sedang berjalan.',
      })
      continue
    }
    if (isCleanFinalization({ rawStatus: latest?.rawStatus, ...summary })) {
      if (input.mode === 'RANGE') {
        items.push({
          businessDate,
          status: 'SKIPPED',
          code: 'ALREADY_FINALIZED',
          message: 'Tanggal ini sudah selesai difinalisasi.',
        })
      }
      continue
    }
    const requirement = await getAttendanceFinalizationRequirement({
      siteId: site.id,
      businessDate,
    })
    const due = await getAttendanceShiftDueState({
      siteId: site.id,
      businessDate,
      now,
    })
    let item: BulkDateItem
    if (requirement.unresolvedTargets > 0) {
      item = {
        businessDate,
        status: 'BLOCKED',
        code: 'STRUCTURAL_ISSUE',
        message:
          'Histori kerja atau penugasan shift pada tanggal ini perlu diperbaiki.',
      }
    } else if (
      correctionDates.has(businessDate) ||
      dateInIntervals(businessDate, classificationIntervals)
    ) {
      item = {
        businessDate,
        status: 'BLOCKED',
        code: 'PENDING_FOLLOW_UP',
        message: 'Masih ada koreksi atau klasifikasi yang menunggu keputusan.',
      }
    } else if (dateInIntervals(businessDate, lockedIntervals)) {
      item = {
        businessDate,
        status: 'BLOCKED',
        code: 'PAYROLL_LOCKED',
        message: 'Tanggal ini sudah digunakan atau sedang diproses oleh Payroll.',
      }
    } else if (!requirement.required) {
      item = {
        businessDate,
        status: 'SKIPPED',
        code: 'NOT_REQUIRED',
        message: 'Tanggal ini tidak memerlukan finalisasi.',
      }
    } else if (!due.allDue) {
      item = {
        businessDate,
        status: 'BLOCKED',
        code: 'NOT_DUE',
        message: 'Belum seluruh shift melewati batas waktu finalisasi.',
      }
    } else {
      item = {
        businessDate,
        status: 'READY',
        code: 'READY',
        message: 'Siap difinalisasi.',
      }
      readySeen += 1
    }
    if (!(input.mode === 'ALL_PENDING' && item.code === 'NOT_REQUIRED')) {
      items.push(item)
    }
    if (
      input.mode === 'ALL_PENDING' &&
      readySeen > attendanceBulkFinalizationMaxReadyDates
    ) {
      break
    }
  }

  const readyDates = items
    .filter((item) => item.status === 'READY')
    .map((item) => item.businessDate)
  const executableDates = readyDates.slice(
    0,
    attendanceBulkFinalizationMaxReadyDates
  )
  return {
    site: site.code,
    mode: input.mode,
    dateFrom,
    dateTo,
    maxReadyDates: attendanceBulkFinalizationMaxReadyDates,
    defaultReason: attendanceBulkFinalizationReason,
    truncated: readyDates.length > executableDates.length,
    summary: {
      ready: readyDates.length,
      blocked: items.filter((item) => item.status === 'BLOCKED').length,
      skipped: items.filter((item) => item.status === 'SKIPPED').length,
    },
    items,
    executableDates,
  }
}

export const attendanceFinalizationsRouter = Router()

attendanceFinalizationsRouter.post(
  '/finalizations/bulk/preview',
  requirePermission('attendance.finalize'),
  async (req, res, next) => {
    try {
      const input = attendanceBulkFinalizationScopeInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.siteCode)
      res.json(await buildBulkPreview(input))
    } catch (error) {
      next(error)
    }
  }
)

attendanceFinalizationsRouter.post(
  '/finalizations/bulk/run',
  requirePermission('attendance.finalize'),
  async (req, res, next) => {
    try {
      const input = attendanceBulkFinalizationRunInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.siteCode)
      const scope: AttendanceBulkFinalizationScope = {
        siteCode: input.siteCode,
        mode: input.mode,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      }
      const preview = await buildBulkPreview(scope)
      const byDate = new Map(
        preview.items.map((item) => [item.businessDate, item])
      )
      const executable = new Set(preview.executableDates)
      const confirmedDates = [...input.confirmedDates].sort()
      if (confirmedDates.some((date) => !byDate.has(date))) {
        throw new ApiError(
          422,
          'Daftar tanggal konfirmasi berada di luar cakupan finalisasi.'
        )
      }

      const results: Array<{
        businessDate: string
        status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED'
        message: string
        finalization?: Record<string, unknown>
      }> = []
      for (const businessDate of confirmedDates) {
        const current = byDate.get(businessDate)!
        if (current.status !== 'READY' || !executable.has(businessDate)) {
          results.push({
            businessDate,
            status: 'SKIPPED',
            message:
              current.status === 'READY'
                ? 'Batas batch berubah. Tanggal ini belum dijalankan.'
                : current.message,
          })
          continue
        }
        try {
          const result = await finalizeAttendanceDay({
            siteCode: input.siteCode,
            businessDate,
            goLiveDate: env.ATTENDANCE_GO_LIVE_DATE,
            source: 'MANUAL',
            reason: attendanceBulkFinalizationReason,
            actor: auth,
            request: req,
            blockPendingFollowUps: true,
            requireCompleteStructureAndDue: true,
          })
          results.push({
            businessDate,
            status: 'SUCCEEDED',
            message: 'Finalisasi berhasil.',
            finalization: {
              uid: result.uid,
              site: result.site,
              businessDate: result.businessDate,
              status: finalizationStatus({
                rawStatus: result.rawStatus,
                pendingDue: result.counts.pendingDue,
                blockingIssues:
                  result.counts.missingAssignment +
                  result.counts.ambiguousAssignment +
                  result.counts.ambiguousEmployment,
              }),
              lastRunAt: result.finishedAt,
              source: result.source,
              counts: result.counts,
              warnings: result.warnings,
              errorMessage: null,
              canRun: true,
            },
          })
        } catch (error) {
          results.push({
            businessDate,
            status: 'FAILED',
            message: resultMessage(error),
          })
        }
      }
      const succeeded = results.filter(
        (result) => result.status === 'SUCCEEDED'
      ).length
      const failed = results.filter(
        (result) => result.status === 'FAILED'
      ).length
      const skipped = results.filter(
        (result) => result.status === 'SKIPPED'
      ).length
      res.json({
        site: preview.site,
        mode: input.mode,
        requested: confirmedDates.length,
        processed: succeeded + failed,
        succeeded,
        failed,
        skipped,
        results,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceFinalizationsRouter.get(
  '/finalizations',
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const businessDate = z.string().date().parse(req.query.businessDate)
      const requestedSites = [
        ...new Set(
          z.array(siteCode).parse(
            String(req.query.site ?? '').split(',').filter(Boolean)
          )
        ),
      ]
      requestedSites.forEach((site) => enforceSite(auth, site))
      const scopeSites = auth.roles.includes('SUPER_ADMIN')
        ? requestedSites
        : requestedSites.length
          ? requestedSites
          : auth.siteAccess
      const where = ['s.is_active=1']
      const values: unknown[] = [businessDate]
      if (scopeSites.length) {
        where.push(`s.code IN (${scopeSites.map(() => '?').join(',')})`)
        values.push(...scopeSites)
      } else if (!auth.roles.includes('SUPER_ADMIN')) {
        where.push('1=0')
      }
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT s.id siteId,s.code site,r.uid,r.status rawStatus,r.trigger_type source,
                r.summary,r.warnings,r.error_message errorMessage,
                DATE_FORMAT(COALESCE(r.finished_at,r.started_at),'%Y-%m-%dT%H:%i:%s+07:00') lastRunAt
           FROM sites s
           LEFT JOIN attendance_daily_finalization_runs r ON r.id=(
             SELECT latest.id FROM attendance_daily_finalization_runs latest
              WHERE latest.site_id=s.id AND latest.business_date=?
              ORDER BY latest.id DESC LIMIT 1)
          WHERE ${where.join(' AND ')} ORDER BY s.code`,
        values
      )
      const today = jakartaDateTime().slice(0, 10)
      const items = await Promise.all(rows.map(async (row) => {
        const counts = {
          ...emptyCounts(),
          ...parseObject<Partial<AttendanceFinalizationCounts>>(row.summary, {}),
        }
        const warnings = parseObject<string[]>(row.warnings, [])
        const [hasDueShift, requirement] = await Promise.all([
          hasDueAttendanceShift({ siteId: Number(row.siteId), businessDate }),
          getAttendanceFinalizationRequirement({ siteId: Number(row.siteId), businessDate }),
        ])
        const running = row.rawStatus === 'RUNNING'
        return {
          uid: row.uid ?? null,
          site: row.site,
          businessDate,
          status: finalizationStatus({ rawStatus: row.rawStatus, pendingDue: counts.pendingDue, blockingIssues: counts.missingAssignment + counts.ambiguousAssignment + counts.ambiguousEmployment, finalizationRequired: requirement.required }),
          lastRunAt: row.lastRunAt ?? null,
          source: row.source ?? null,
          counts,
          warnings,
          errorMessage: row.errorMessage ?? null,
          canRun: canRunFinalization({ businessDate, today, goLiveDate: env.ATTENDANCE_GO_LIVE_DATE, hasDueShift, running, finalizationRequired: requirement.required }),
        }
      }))
      res.json({ items })
    } catch (error) {
      next(error)
    }
  }
)

attendanceFinalizationsRouter.post(
  '/finalizations/run',
  requirePermission('attendance.finalize'),
  async (req, res, next) => {
    try {
      const input = attendanceFinalizationInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.siteCode)
      const [sites] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM sites WHERE code=? AND is_active=1',
        [input.siteCode]
      )
      if (!sites[0]) throw new ApiError(404, 'Site tidak ditemukan atau tidak aktif.')
      const now = new Date()
      const today = jakartaDateTime(now).slice(0, 10)
      if (
        input.businessDate < env.ATTENDANCE_GO_LIVE_DATE ||
        input.businessDate > today
      ) {
        throw new ApiError(422, 'Tanggal belum dapat difinalisasi atau belum melewati grace Shift.')
      }
      const requirement = await getAttendanceFinalizationRequirement({
        siteId: Number(sites[0].id),
        businessDate: input.businessDate,
      })
      if (!requirement.required) {
        throw new ApiError(422, 'Tanggal ini tidak memerlukan finalisasi Attendance.')
      }
      const hasDueShift = await hasDueAttendanceShift({ siteId: Number(sites[0].id), businessDate: input.businessDate, now })
      if (!canRunFinalization({ businessDate: input.businessDate, today, goLiveDate: env.ATTENDANCE_GO_LIVE_DATE, hasDueShift, finalizationRequired: requirement.required })) {
        throw new ApiError(422, 'Tanggal belum dapat difinalisasi atau belum melewati grace Shift.')
      }
      const result = await finalizeAttendanceDay({
        ...input,
        goLiveDate: env.ATTENDANCE_GO_LIVE_DATE,
        source: 'MANUAL',
        actor: auth,
        request: req,
        now,
      })
      res.json({
        uid: result.uid,
        site: result.site,
        businessDate: result.businessDate,
        status: finalizationStatus({ rawStatus: result.rawStatus, pendingDue: result.counts.pendingDue, blockingIssues: result.counts.missingAssignment + result.counts.ambiguousAssignment + result.counts.ambiguousEmployment }),
        lastRunAt: result.finishedAt,
        source: result.source,
        counts: result.counts,
        warnings: result.warnings,
        errorMessage: null,
        canRun: true,
      })
    } catch (error) {
      next(error)
    }
  }
)
