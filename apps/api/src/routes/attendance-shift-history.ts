import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { ZodError } from 'zod'
import { env } from '../config.js'
import { pool } from '../db.js'
import { resolveAttendanceCalendarDay } from '../lib/attendance-calendar.js'
import { isoWeekday, parseWorkDays } from '../lib/attendance-classification-policy.js'
import {
  historicalShiftAssignmentApplyInput,
  historicalShiftAssignmentPreviewInput,
  jakartaBusinessDate,
  planHistoricalShiftTimeline,
  type ShiftAssignmentTimelineItem,
  type ShiftAssignmentTimelineSegment,
} from '../lib/attendance-shift-policy.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

type Executor = Pool | PoolConnection
type HistoryInput = {
  employeeUid: string
  shiftUid: string
  effectiveFrom: string
  effectiveTo: string | null
  workDays: number[]
}

type HistoryContext = {
  employee: RowDataPacket
  shift: RowDataPacket
  existing: ShiftAssignmentTimelineItem[]
  timeline: ShiftAssignmentTimelineSegment[]
  affectedIds: number[]
  impact: Record<string, number>
  affectedSiteIds: number[]
  reconciliationTo: string
  blockers: string[]
  warnings: string[]
}

type ApplyStage =
  | 'memeriksa data terbaru'
  | 'menyusun ulang periode penugasan'
  | 'menyesuaikan data Attendance'
  | 'menandai finalisasi untuk diulang'
  | 'mencatat histori perubahan'
  | 'menyimpan perubahan'

function historicalCorrectionError(error: unknown, stage: ApplyStage) {
  if (error instanceof ApiError || error instanceof ZodError) return error

  const databaseError = error as {
    code?: string
    errno?: number
    sqlState?: string
  }
  process.stderr.write(`${JSON.stringify({
    scope: 'attendance-shift-history',
    message: 'Koreksi gagal.',
    stage,
    code: databaseError.code ?? 'UNKNOWN',
    errno: databaseError.errno ?? null,
    sqlState: databaseError.sqlState ?? null,
  })}\n`)

  if (
    databaseError.code === 'ER_LOCK_DEADLOCK' ||
    databaseError.code === 'ER_LOCK_WAIT_TIMEOUT'
  ) {
    return new ApiError(
      409,
      'Data Attendance sedang diproses oleh layanan lain. Tidak ada perubahan yang disimpan; tunggu sebentar lalu coba lagi.'
    )
  }
  if (databaseError.code?.startsWith('ER_ROW_IS_REFERENCED')) {
    return new ApiError(
      409,
      'Penugasan lama masih digunakan data Attendance terkait sehingga belum dapat diganti. Tidak ada perubahan yang disimpan.'
    )
  }

  return new ApiError(
    500,
    `Koreksi shift gagal saat ${stage}. Tidak ada perubahan yang disimpan. Silakan coba lagi atau hubungi Administrator jika berulang.`
  )
}

function enforceSite(auth: AuthContext, site: string) {
  if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

function enumerateDates(from: string, to: string) {
  const result: string[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return result
}

function overlaps(a: ShiftAssignmentTimelineSegment, b: ShiftAssignmentTimelineSegment) {
  return (a.effectiveTo ?? '9999-12-31') >= b.effectiveFrom
}

async function loadHistoryContext(
  executor: Executor,
  input: HistoryInput,
  auth: AuthContext,
  lock: boolean
): Promise<HistoryContext> {
  const lockSql = lock ? ' FOR UPDATE' : ''
  const [employeeRows] = await executor.query<RowDataPacket[]>(
    `SELECT e.id,e.uid,e.employee_number employeeNumber,e.full_name fullName
       FROM employees e WHERE e.uid=?${lockSql}`,
    [input.employeeUid]
  )
  const employee = employeeRows[0]
  if (!employee) throw new ApiError(404, 'Karyawan tidak ditemukan.')

  const [shiftRows] = await executor.query<RowDataPacket[]>(
    `SELECT sh.id,sh.uid,sh.name,sh.site_id siteId,sh.start_time startTime,
            sh.end_time endTime,sh.crosses_midnight crossesMidnight,
            sh.late_tolerance_minutes lateToleranceMinutes,
            sh.early_leave_tolerance_minutes earlyLeaveToleranceMinutes,
            sh.is_active isActive,s.code site,s.name siteName
       FROM shifts sh JOIN sites s ON s.id=sh.site_id
      WHERE sh.uid=?${lockSql}`,
    [input.shiftUid]
  )
  const shift = shiftRows[0]
  if (!shift) throw new ApiError(404, 'Shift tidak ditemukan.')
  enforceSite(auth, String(shift.site))

  const blockers: string[] = []
  const warnings: string[] = []
  const today = jakartaBusinessDate()
  const reconciliationTo = input.effectiveTo ?? today
  if (input.effectiveFrom < env.ATTENDANCE_GO_LIVE_DATE) {
    blockers.push(`Tanggal mulai paling awal ${env.ATTENDANCE_GO_LIVE_DATE}.`)
  }
  if (input.effectiveFrom > today || (input.effectiveTo && input.effectiveTo > today)) {
    blockers.push('Koreksi historis tidak boleh melewati hari ini.')
  }
  if (Number(shift.isActive) !== 1) blockers.push('Shift tujuan sudah nonaktif.')

  const [employmentRows] = await executor.query<RowDataPacket[]>(
    `SELECT eh.id,eh.site_id siteId,es.code status,
            es.allows_attendance allowsAttendance,
            DATE_FORMAT(eh.effective_from,'%Y-%m-%d') effectiveFrom,
            DATE_FORMAT(eh.effective_to,'%Y-%m-%d') effectiveTo
       FROM employee_employment_histories eh
       JOIN employee_statuses es ON es.id=eh.employee_status_id
      WHERE eh.employee_id=? AND eh.effective_from<=?
        AND (eh.effective_to IS NULL OR eh.effective_to>=?)
      ORDER BY eh.effective_from,eh.id${lockSql}`,
    [employee.id, reconciliationTo, input.effectiveFrom]
  )
  for (const date of enumerateDates(input.effectiveFrom, reconciliationTo)) {
    const matches = employmentRows.filter(
      (row) =>
        String(row.effectiveFrom) <= date &&
        (!row.effectiveTo || String(row.effectiveTo) >= date)
    )
    if (
      matches.length !== 1 ||
      matches[0].status !== 'ACTIVE' ||
      Number(matches[0].allowsAttendance) !== 1 ||
      Number(matches[0].siteId) !== Number(shift.siteId)
    ) {
      blockers.push(
        'Pada sebagian tanggal yang dipilih, karyawan tidak tercatat aktif di site shift ini. Sesuaikan rentang tanggal atau pilih shift dari site yang sesuai.'
      )
      break
    }
  }
  if (
    input.effectiveTo === null &&
    !employmentRows.some(
      (row) =>
        !row.effectiveTo &&
        String(row.effectiveFrom) <= today &&
        row.status === 'ACTIVE' &&
        Number(row.allowsAttendance) === 1 &&
        Number(row.siteId) === Number(shift.siteId)
    )
  ) {
    blockers.push(
      'Penugasan tidak bisa berlaku seterusnya karena masa kerja karyawan di site shift ini memiliki tanggal akhir. Batasi tanggal penugasan atau pilih shift dari site karyawan saat ini.'
    )
  }

  const [assignmentRows] = await executor.query<RowDataPacket[]>(
    `SELECT esa.id,esa.uid,esa.shift_id shiftId,sh.uid shiftUid,sh.name shiftName,
            DATE_FORMAT(esa.effective_from,'%Y-%m-%d') effectiveFrom,
            DATE_FORMAT(esa.effective_to,'%Y-%m-%d') effectiveTo,
            esa.work_days_json workDays
       FROM employee_shift_assignments esa
       JOIN shifts sh ON sh.id=esa.shift_id
      WHERE esa.employee_id=?
      ORDER BY esa.effective_from,esa.id${lockSql}`,
    [employee.id]
  )
  const existing: ShiftAssignmentTimelineItem[] = assignmentRows.map((row) => ({
    id: Number(row.id),
    uid: String(row.uid),
    shiftId: Number(row.shiftId),
    shiftUid: String(row.shiftUid),
    shiftName: String(row.shiftName),
    effectiveFrom: String(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? String(row.effectiveTo) : null,
    workDays: parseWorkDays(row.workDays),
  }))
  if (
    input.effectiveTo === null &&
    existing.some((item) => item.effectiveFrom > input.effectiveFrom)
  ) {
    blockers.push(
      'Penugasan hanya dapat dibuat seterusnya pada periode paling akhir. Masih ada penugasan Shift setelah tanggal mulai koreksi.'
    )
  }

  if (input.effectiveTo === null) {
    const [scheduledMutationRows] = await executor.query<RowDataPacket[]>(
      `SELECT id FROM scheduled_employee_mutations
        WHERE employee_id=? AND status IN ('SCHEDULED','FAILED')
        ORDER BY effective_from,id LIMIT 1${lockSql}`,
      [employee.id]
    )
    if (scheduledMutationRows[0]) {
      blockers.push(
        'Penugasan belum dapat dibuat seterusnya karena karyawan masih memiliki mutasi terjadwal yang belum diselesaikan.'
      )
    }
    const [scheduledStatusRows] = await executor.query<RowDataPacket[]>(
      `SELECT id FROM scheduled_employee_status_changes
        WHERE employee_id=? AND status IN ('SCHEDULED','FAILED')
        ORDER BY effective_date,id LIMIT 1${lockSql}`,
      [employee.id]
    )
    if (scheduledStatusRows[0]) {
      blockers.push(
        'Penugasan belum dapat dibuat seterusnya karena karyawan masih memiliki perubahan status kerja terjadwal yang belum diselesaikan.'
      )
    }
  }
  const plan = planHistoricalShiftTimeline({
    existing,
    replacement: {
      shiftId: Number(shift.id),
      shiftUid: String(shift.uid),
      shiftName: String(shift.name),
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      workDays: input.workDays,
    },
  })
  for (let index = 1; index < plan.segments.length; index += 1) {
    if (overlaps(plan.segments[index - 1], plan.segments[index])) {
      blockers.push('Timeline assignment legacy masih bertumpang-tindih di luar rentang koreksi.')
      break
    }
  }

  const [attendanceSiteRows] = await executor.query<RowDataPacket[]>(
    `SELECT ar.id,ar.site_id siteId,s.code site
       FROM attendance_records ar
       JOIN sites s ON s.id=ar.site_id
      WHERE ar.employee_id=? AND ar.business_date BETWEEN ? AND ?${lockSql}`,
    [employee.id, input.effectiveFrom, reconciliationTo]
  )
  for (const row of attendanceSiteRows) enforceSite(auth, String(row.site))
  const affectedSiteIds = [
    ...new Set([
      Number(shift.siteId),
      ...attendanceSiteRows.map((row) => Number(row.siteId)),
    ]),
  ]
  const affectedSitePlaceholders = affectedSiteIds.map(() => '?').join(',')

  const [impactRows] = await executor.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM attendance_records ar
         WHERE ar.employee_id=? AND ar.business_date BETWEEN ? AND ?) attendanceRecords,
       (SELECT COUNT(*) FROM attendance_scan_events ase
         WHERE ase.employee_id=? AND DATE(ase.scanned_at) BETWEEN ? AND ?
           AND ase.result_status='SUCCESS') rawScans,
       (SELECT COUNT(*) FROM attendance_classification_details acd
         JOIN attendance_classification_requests acr ON acr.id=acd.request_id
         WHERE acd.employee_id=? AND acd.business_date BETWEEN ? AND ?
           AND acr.approval_status='APPROVED') approvedClassifications,
       (SELECT COUNT(*) FROM attendance_corrections ac
         JOIN attendance_records ar ON ar.id=ac.attendance_record_id
         WHERE ar.employee_id=? AND ar.business_date BETWEEN ? AND ?
           AND ac.approval_status='APPROVED') approvedCorrections,
       (SELECT COUNT(*) FROM production_transactions pt
         WHERE pt.employee_id=? AND pt.business_date BETWEEN ? AND ?
           AND pt.status='POSTED') postedProduction,
       (SELECT COUNT(*) FROM payroll_periods pp
         WHERE pp.site_id IN (${affectedSitePlaceholders})
           AND pp.period_start<=? AND pp.period_end>=?
           AND pp.status IN ('CALCULATED','APPROVED','CLOSED')) lockedPayrollPeriods,
       (SELECT COUNT(*) FROM payroll_attendance_summaries pas
         JOIN payroll_employee_results per ON per.id=pas.payroll_employee_result_id
         JOIN payroll_periods pp ON pp.id=per.payroll_period_id
        WHERE per.employee_id=?
          AND pp.site_id IN (${affectedSitePlaceholders})
          AND pp.period_start<=? AND pp.period_end>=?) payrollAttendanceSnapshots,
       (SELECT COUNT(*) FROM attendance_daily_finalization_runs afr
         WHERE afr.site_id IN (${affectedSitePlaceholders})
           AND afr.business_date BETWEEN ? AND ?
           AND afr.status='RUNNING') runningFinalizations,
       (SELECT COUNT(DISTINCT afr.site_id,afr.business_date)
          FROM attendance_daily_finalization_runs afr
         WHERE afr.site_id IN (${affectedSitePlaceholders})
           AND afr.business_date BETWEEN ? AND ?) finalizationsToInvalidate`,
    [
      employee.id, input.effectiveFrom, reconciliationTo,
      employee.id, input.effectiveFrom, reconciliationTo,
      employee.id, input.effectiveFrom, reconciliationTo,
      employee.id, input.effectiveFrom, reconciliationTo,
      employee.id, input.effectiveFrom, reconciliationTo,
      ...affectedSiteIds, reconciliationTo, input.effectiveFrom,
      employee.id, ...affectedSiteIds, reconciliationTo, input.effectiveFrom,
      ...affectedSiteIds, input.effectiveFrom, reconciliationTo,
      ...affectedSiteIds, input.effectiveFrom, reconciliationTo,
    ]
  )
  const rawImpact = impactRows[0]
  const impact = Object.fromEntries(
    Object.entries(rawImpact).map(([key, value]) => [key, Number(value ?? 0)])
  )
  if (lock) {
    const [productionLocks] = await executor.query<RowDataPacket[]>(
      `SELECT id FROM production_transactions
        WHERE employee_id=? AND business_date BETWEEN ? AND ?
          AND status='POSTED' FOR UPDATE`,
      [employee.id, input.effectiveFrom, reconciliationTo]
    )
    const [payrollLocks] = await executor.query<RowDataPacket[]>(
      `SELECT id FROM payroll_periods
        WHERE site_id IN (${affectedSitePlaceholders})
          AND period_start<=? AND period_end>=?
          AND status IN ('CALCULATED','APPROVED','CLOSED') FOR UPDATE`,
      [...affectedSiteIds, reconciliationTo, input.effectiveFrom]
    )
    const [payrollSnapshotLocks] = await executor.query<RowDataPacket[]>(
      `SELECT pas.id
         FROM payroll_attendance_summaries pas
         JOIN payroll_employee_results per ON per.id=pas.payroll_employee_result_id
         JOIN payroll_periods pp ON pp.id=per.payroll_period_id
        WHERE per.employee_id=?
          AND pp.site_id IN (${affectedSitePlaceholders})
          AND pp.period_start<=? AND pp.period_end>=?
        FOR UPDATE`,
      [employee.id, ...affectedSiteIds, reconciliationTo, input.effectiveFrom]
    )
    const [finalizationLocks] = await executor.query<RowDataPacket[]>(
      `SELECT id,status FROM attendance_daily_finalization_runs
        WHERE site_id IN (${affectedSitePlaceholders})
          AND business_date BETWEEN ? AND ? FOR UPDATE`,
      [...affectedSiteIds, input.effectiveFrom, reconciliationTo]
    )
    impact.postedProduction = productionLocks.length
    impact.lockedPayrollPeriods = payrollLocks.length
    impact.payrollAttendanceSnapshots = payrollSnapshotLocks.length
    impact.runningFinalizations = finalizationLocks.filter(
      (row) => row.status === 'RUNNING'
    ).length
  }
  if (impact.postedProduction > 0) {
    blockers.push('Rentang sudah dipakai setoran produksi POSTED.')
  }
  if (impact.lockedPayrollPeriods > 0) {
    blockers.push('Rentang menyentuh payroll yang sudah dihitung, disetujui, atau ditutup.')
  }
  if (impact.payrollAttendanceSnapshots > 0) {
    blockers.push('Attendance sudah tersimpan dalam snapshot payroll dan tidak dapat dikoreksi.')
  }
  if (impact.runningFinalizations > 0) {
    blockers.push('Finalisasi Attendance sedang berjalan pada rentang ini.')
  }
  if (impact.rawScans > 0) warnings.push('Jam scan mentah akan dipertahankan.')
  if (impact.approvedClassifications > 0) {
    warnings.push('Klasifikasi yang sudah disetujui akan dipertahankan.')
  }
  if (impact.approvedCorrections > 0) {
    warnings.push('Koreksi Attendance yang sudah disetujui akan dipertahankan.')
  }
  return {
    employee,
    shift,
    existing,
    timeline: plan.segments,
    affectedIds: plan.affectedIds,
    impact,
    affectedSiteIds,
    reconciliationTo,
    blockers: [...new Set(blockers)],
    warnings,
  }
}

function responseForContext(context: HistoryContext, input: HistoryInput) {
  return {
    employee: {
      uid: String(context.employee.uid),
      employeeNumber: String(context.employee.employeeNumber),
      fullName: String(context.employee.fullName),
      site: String(context.shift.site),
    },
    replacement: {
      shiftUid: String(context.shift.uid),
      shiftName: String(context.shift.name),
      site: String(context.shift.site),
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      workDays: input.workDays,
    },
    timeline: context.timeline.map(({ sourceId: _sourceId, shiftId: _shiftId, ...item }) => item),
    impact: {
      affectedAssignmentCount: context.affectedIds.length,
      attendanceRecordCount: context.impact.attendanceRecords,
      rawScanCount: context.impact.rawScans,
      approvedClassificationCount: context.impact.approvedClassifications,
      approvedCorrectionCount: context.impact.approvedCorrections,
      postedProductionCount: context.impact.postedProduction,
      lockedPayrollPeriodCount: context.impact.lockedPayrollPeriods,
      payrollAttendanceSnapshotCount: context.impact.payrollAttendanceSnapshots,
      runningFinalizationCount: context.impact.runningFinalizations,
      finalizationToInvalidateCount: context.impact.finalizationsToInvalidate,
    },
    impactThroughDate: context.reconciliationTo,
    blockers: context.blockers,
    warnings: context.warnings,
    canApply: context.blockers.length === 0,
  }
}

async function reconcileAttendance(
  conn: PoolConnection,
  input: HistoryInput,
  context: HistoryContext,
  replacementAssignmentId: number,
  actorId: number
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT ar.id,ar.attendance_status attendanceStatus,ar.clock_in_at clockInAt,
            ar.clock_out_at clockOutAt,ar.clock_in_source clockInSource,
            ar.clock_out_source clockOutSource,
            DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
            EXISTS(SELECT 1 FROM attendance_scan_events ase
              WHERE ase.attendance_record_id=ar.id AND ase.result_status='SUCCESS') hasRawScan,
            EXISTS(SELECT 1 FROM attendance_corrections ac
              WHERE ac.attendance_record_id=ar.id) hasCorrection,
            EXISTS(SELECT 1 FROM attendance_classification_details acd
              WHERE acd.attendance_record_id=ar.id) hasClassification
       FROM attendance_records ar
      WHERE ar.employee_id=? AND ar.business_date BETWEEN ? AND ?
      FOR UPDATE`,
    [context.employee.id, input.effectiveFrom, context.reconciliationTo]
  )
  let reconciled = 0
  let removedSynthetic = 0
  for (const row of rows) {
    const businessDate = String(row.businessDate)
    const calendar = await resolveAttendanceCalendarDay({
      siteId: Number(context.shift.siteId),
      businessDate,
      scheduledByShift: input.workDays.includes(isoWeekday(businessDate)),
      executor: conn,
    })
    const synthetic =
      ['ABSENT', 'HOLIDAY'].includes(String(row.attendanceStatus)) &&
      !row.clockInAt &&
      !row.clockOutAt &&
      !row.clockInSource &&
      !row.clockOutSource &&
      Number(row.hasRawScan) === 0 &&
      Number(row.hasCorrection) === 0 &&
      Number(row.hasClassification) === 0
    if (synthetic && calendar.dayType === 'NON_WORKDAY') {
      await conn.execute('DELETE FROM attendance_records WHERE id=?', [row.id])
      removedSynthetic += 1
      continue
    }
    const status = synthetic
      ? calendar.dayType === 'HOLIDAY'
        ? 'HOLIDAY'
        : 'ABSENT'
      : String(row.attendanceStatus)
    await conn.execute(
      `UPDATE attendance_records
          SET site_id=?,shift_id=?,attendance_status=?,calendar_day_type=?,
              calendar_reason_type=?,calendar_event_id=?,calendar_site_rule_id=?,
              late_minutes=CASE
                WHEN ?=0 OR clock_in_at IS NULL THEN 0
                WHEN TIMESTAMPDIFF(MINUTE,TIMESTAMP(business_date,?),clock_in_at)>?
                  THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,TIMESTAMP(business_date,?),clock_in_at))
                ELSE 0 END,
              early_leave_minutes=CASE
                WHEN ?=0 OR clock_out_at IS NULL THEN 0
                WHEN TIMESTAMPDIFF(MINUTE,clock_out_at,
                  ${Number(context.shift.crossesMidnight) === 1 ? 'DATE_ADD(TIMESTAMP(business_date,?),INTERVAL 1 DAY)' : 'TIMESTAMP(business_date,?)'})>?
                  THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,clock_out_at,
                    ${Number(context.shift.crossesMidnight) === 1 ? 'DATE_ADD(TIMESTAMP(business_date,?),INTERVAL 1 DAY)' : 'TIMESTAMP(business_date,?)'}))
                ELSE 0 END,
              worked_minutes=CASE WHEN clock_in_at IS NULL OR clock_out_at IS NULL
                THEN NULL ELSE GREATEST(0,TIMESTAMPDIFF(MINUTE,clock_in_at,clock_out_at)) END,
              updated_by=? WHERE id=?`,
      [
        context.shift.siteId,
        context.shift.id,
        status,
        calendar.dayType,
        calendar.reasonType,
        calendar.eventId,
        calendar.siteRuleId,
        calendar.dayType === 'WORKDAY' ? 1 : 0,
        context.shift.startTime,
        context.shift.lateToleranceMinutes,
        context.shift.startTime,
        calendar.dayType === 'WORKDAY' ? 1 : 0,
        context.shift.endTime,
        context.shift.earlyLeaveToleranceMinutes,
        context.shift.endTime,
        actorId,
        row.id,
      ]
    )
    reconciled += 1
  }
  await conn.execute(
    `UPDATE attendance_classification_details acd
        JOIN attendance_classification_requests acr ON acr.id=acd.request_id
        SET acd.shift_assignment_id=?,acd.updated_by=?
      WHERE acd.employee_id=? AND acd.business_date BETWEEN ? AND ?
        AND acr.approval_status='APPROVED'`,
    [replacementAssignmentId, actorId, context.employee.id, input.effectiveFrom, context.reconciliationTo]
  )
  return { reconciled, removedSynthetic }
}

export const attendanceShiftHistoryRouter = Router()

attendanceShiftHistoryRouter.post(
  '/shift-assignments/history/preview',
  requirePermission('attendance.manage_shift'),
  async (req, res, next) => {
    try {
      const input = historicalShiftAssignmentPreviewInput.parse(req.body)
      const context = await loadHistoryContext(
        pool,
        input,
        res.locals.auth as AuthContext,
        false
      )
      res.json(responseForContext(context, input))
    } catch (error) {
      next(error)
    }
  }
)

attendanceShiftHistoryRouter.post(
  '/shift-assignments/history/apply',
  requirePermission('attendance.manage_shift'),
  async (req, res, next) => {
    let conn: PoolConnection | null = null
    let stage: ApplyStage = 'memeriksa data terbaru'
    try {
      conn = await pool.getConnection()
      const input = historicalShiftAssignmentApplyInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const context = await loadHistoryContext(conn, input, auth, true)
      if (context.blockers.length) {
        throw new ApiError(409, context.blockers[0])
      }

      stage = 'menyusun ulang periode penugasan'
      const affected = new Set(context.affectedIds)
      const insertedSegments: Array<{ id: number; uid: string; segment: ShiftAssignmentTimelineSegment }> = []
      for (const segment of context.timeline) {
        if (segment.change === 'UNCHANGED') continue
        const uid = randomUUID()
        const [created] = await conn.execute<ResultSetHeader>(
          `INSERT INTO employee_shift_assignments
            (uid,employee_id,shift_id,effective_from,effective_to,work_days_json,created_by,updated_by)
           VALUES(?,?,?,?,?,?,?,?)`,
          [uid, context.employee.id, segment.shiftId, segment.effectiveFrom,
            segment.effectiveTo, JSON.stringify(segment.workDays), auth.id, auth.id]
        )
        insertedSegments.push({ id: created.insertId, uid, segment })
      }
      for (const created of insertedSegments) {
        await conn.execute(
          `UPDATE attendance_classification_details
              SET shift_assignment_id=?,updated_by=?
            WHERE employee_id=? AND business_date>=?
              AND (business_date<=? OR ? IS NULL)`,
          [created.id, auth.id, context.employee.id, created.segment.effectiveFrom,
            created.segment.effectiveTo, created.segment.effectiveTo]
        )
      }
      if (affected.size) {
        await conn.execute(
          `DELETE FROM employee_shift_assignments WHERE id IN (${[...affected].map(() => '?').join(',')})`,
          [...affected]
        )
      }
      const replacement = insertedSegments.find(
        (item) => item.segment.change === 'REPLACEMENT'
      )
      if (!replacement) throw new Error('Assignment pengganti gagal dibuat.')

      stage = 'menyesuaikan data Attendance'
      const attendance = await reconcileAttendance(
        conn,
        input,
        context,
        replacement.id,
        auth.id
      )
      stage = 'menandai finalisasi untuk diulang'
      const [invalidated] = await conn.execute<ResultSetHeader>(
        `INSERT INTO attendance_daily_finalization_runs
          (uid,site_id,business_date,trigger_type,status,grace_minutes,reason,
           summary,warnings,requested_by,started_at,finished_at,created_by,updated_by)
         SELECT UUID(),latest.site_id,latest.business_date,'MANUAL','SKIPPED',60,?,
                JSON_OBJECT('invalidatedByShiftCorrection',TRUE),JSON_ARRAY(?),?,
                CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),?,?
           FROM attendance_daily_finalization_runs latest
           WHERE latest.site_id IN (${context.affectedSiteIds.map(() => '?').join(',')})
             AND latest.business_date BETWEEN ? AND ?
            AND latest.id=(SELECT MAX(previous.id)
              FROM attendance_daily_finalization_runs previous
             WHERE previous.site_id=latest.site_id
               AND previous.business_date=latest.business_date)
            AND latest.status<>'RUNNING'`,
        [input.reason, 'Finalisasi perlu dijalankan ulang setelah koreksi histori Shift.',
          auth.id, auth.id, auth.id, ...context.affectedSiteIds,
          input.effectiveFrom, context.reconciliationTo]
      )
      const splitAssignmentCount = insertedSegments.filter(
        (item) => item.segment.change === 'SPLIT'
      ).length
      const adjustedAssignmentCount = insertedSegments.filter(
        (item) => item.segment.change !== 'REPLACEMENT'
      ).length
      stage = 'mencatat histori perubahan'
      await writeAudit(
        {
          auth,
          request: req as Request,
          module: 'ATTENDANCE',
          siteId: Number(context.shift.siteId),
          action: 'UPDATE',
          table: 'employee_shift_assignments',
          recordId: replacement.id,
          recordUid: replacement.uid,
          description: `Mengoreksi histori Shift ${context.employee.fullName} untuk ${input.effectiveFrom} s.d. ${input.effectiveTo ?? 'seterusnya'}.`,
          reason: input.reason,
          beforeData: { assignments: context.existing },
          afterData: {
            replacement: responseForContext(context, input).replacement,
            timeline: responseForContext(context, input).timeline,
            attendance,
            invalidatedFinalizationCount: invalidated.affectedRows,
          },
        },
        conn
      )
      stage = 'menyimpan perubahan'
      await conn.commit()
      res.status(201).json({
        assignmentUid: replacement.uid,
        adjustedAssignmentCount,
        deletedAssignmentCount: affected.size,
        splitAssignmentCount,
        reconciledAttendanceCount: attendance.reconciled,
        removedSyntheticAttendanceCount: attendance.removedSynthetic,
        invalidatedFinalizationCount: invalidated.affectedRows,
      })
    } catch (error) {
      if (conn) {
        try {
          await conn.rollback()
        } catch (rollbackError) {
          const databaseError = rollbackError as { code?: string; errno?: number }
          process.stderr.write(`${JSON.stringify({
            scope: 'attendance-shift-history',
            message: 'Rollback koreksi gagal.',
            code: databaseError.code ?? 'UNKNOWN',
            errno: databaseError.errno ?? null,
          })}\n`)
        }
      }
      next(historicalCorrectionError(error, stage))
    } finally {
      conn?.release()
    }
  }
)
