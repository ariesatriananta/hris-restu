import { randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import {
  attendanceAbnormalReasons,
  attendanceCorrectionRequestInput,
  attendanceCorrectionReviewInput,
  attendanceCorrectionTypes,
  attendanceStatusValues,
  deriveAttendanceQuality,
  resolveCorrectionAttendanceStatus,
  validateClockOrder,
} from '../lib/attendance-correction-policy.js'
import { nextDate } from '../lib/attendance-device-policy.js'
import { jakartaBusinessDate } from '../lib/attendance-shift-policy.js'
import { writeAudit } from '../lib/audit.js'
import {
  attendanceBulkApprovalInput,
  safeBulkReviewMessage,
} from '../lib/attendance-bulk-review.js'
import {
  appendAttendanceEmployeeFilters,
  parseAttendanceEmployeeFilters,
} from '../lib/attendance-employee-filter.js'
import { ApiError } from '../lib/errors.js'
import { attendanceFinalizationLockName } from '../lib/attendance-finalization.js'
import { assertAttendancePayrollUnlocked } from '../lib/attendance-payroll-lock.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCodes = ['JEPARA', 'SEMARANG', 'KLATEN'] as const
const approvalStatuses = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const
const routeParam = (value: string | string[]) =>
  Array.isArray(value) ? value[0] : value
const missingClockInSql =
  "(ar.attendance_status='PRESENT' AND ar.clock_in_at IS NULL AND ar.clock_out_at IS NOT NULL)"
const missingClockOutSql = `(ar.attendance_status='PRESENT'
  AND ar.clock_in_at IS NOT NULL AND ar.clock_out_at IS NULL AND sh.id IS NOT NULL
  AND NOW(3) > CASE WHEN sh.crosses_midnight=1
    THEN DATE_ADD(TIMESTAMP(ar.business_date,sh.end_time),INTERVAL 1 DAY)
    ELSE TIMESTAMP(ar.business_date,sh.end_time) END)`
const abnormalAttendanceSql = `(${missingClockInSql} OR ${missingClockOutSql})`

function pageParams(page: unknown, pageSize: unknown) {
  const parsedPage = Number(page ?? 1)
  const parsedPageSize = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize:
      Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(500, parsedPageSize)
        : 50,
  }
}

function listFilter<T extends string>(raw: unknown, allowed: readonly T[]) {
  return String(raw ?? '')
    .split(',')
    .filter((value): value is T => allowed.includes(value as T))
}

function scopeWhere(auth: AuthContext, column = 's.code') {
  return auth.roles.includes('SUPER_ADMIN')
    ? { sql: '1=1', params: [] as string[] }
    : {
        sql: `${column} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`,
        params: auth.siteAccess,
      }
}

function enforceSite(auth: AuthContext, site: string) {
  if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

function requireCorrectionListAccess(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  const auth = res.locals.auth as AuthContext
  if (
    !auth.roles.includes('SUPER_ADMIN') &&
    !auth.permissions.includes('attendance.correct') &&
    !auth.permissions.includes('attendance.approve')
  ) {
    return next(new ApiError(403, 'Anda tidak memiliki izin untuk aksi ini.'))
  }
  next()
}

function parseBusinessDate(value: unknown) {
  return z.string().date().parse(value ?? jakartaBusinessDate())
}

function validCorrectionDateTime(value: unknown, businessDate: string) {
  if (!value) return true
  const date = String(value).slice(0, 10)
  return date === businessDate || date === nextDate(businessDate)
}

type FinalizationLockState = { name?: string }

async function acquireFinalizationLock(
  conn: PoolConnection,
  siteId: number,
  businessDate: string,
  state: FinalizationLockState
) {
  const name = attendanceFinalizationLockName(siteId, businessDate)
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT GET_LOCK(?,0) acquired',
    [name]
  )
  if (Number(rows[0]?.acquired) !== 1) {
    throw new ApiError(
      409,
      'Finalisasi site dan tanggal ini sedang berjalan. Coba lagi setelah proses selesai.'
    )
  }
  state.name = name
}

async function releaseFinalizationLock(
  conn: PoolConnection | undefined,
  state: FinalizationLockState
) {
  if (!conn || !state.name) return
  await conn.query('SELECT RELEASE_LOCK(?)', [state.name]).catch(() => undefined)
  state.name = undefined
}

async function assertAttendanceHasNoAppliedClassification(
  conn: PoolConnection,
  attendanceRecordId: number
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id
       FROM attendance_classification_details
      WHERE attendance_record_id=? AND outcome='APPLIED'
      LIMIT 1 FOR UPDATE`,
    [attendanceRecordId]
  )
  if (rows[0]) {
    throw new ApiError(
      409,
      'Attendance dengan klasifikasi Cuti, Sakit, atau Izin yang sudah diterapkan tidak dapat dikoreksi.'
    )
  }
}

async function approveCorrection(
  conn: PoolConnection,
  input: {
    auth: AuthContext
    request: Request
    uid: string
    reviewNotes?: string
    batchId?: string
    expectedSite?: string
    finalizationLock: FinalizationLockState
  }
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT ac.id,ac.uid,ac.attendance_record_id attendanceRecordId,
            ac.correction_type correctionType,ac.new_clock_in_at newClockInAt,
            ac.new_clock_out_at newClockOutAt,ac.new_status newStatus,
            ac.reason,ac.approval_status approvalStatus,
            ar.uid attendanceUid,ar.employee_id employeeId,ar.site_id siteId,
            DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
            ar.attendance_status attendanceStatus,ar.clock_in_at clockInAt,
            ar.clock_out_at clockOutAt,ar.shift_id shiftId,s.code site,
            sh.start_time startTime,sh.end_time endTime,
            sh.crosses_midnight crossesMidnight,
            sh.late_tolerance_minutes lateToleranceMinutes,
            sh.early_leave_tolerance_minutes earlyLeaveToleranceMinutes
       FROM attendance_corrections ac
       JOIN attendance_records ar ON ar.id=ac.attendance_record_id
       JOIN sites s ON s.id=ar.site_id
       LEFT JOIN shifts sh ON sh.id=ar.shift_id
      WHERE ac.uid=?
      FOR UPDATE`,
    [input.uid]
  )
  const correction = rows[0]
  if (!correction) throw new ApiError(404, 'Koreksi Attendance tidak ditemukan.')
  enforceSite(input.auth, correction.site)
  if (input.expectedSite && correction.site !== input.expectedSite) {
    throw new ApiError(409, 'Koreksi Attendance tidak sesuai site yang dipilih.')
  }
  if (correction.approvalStatus !== 'PENDING') {
    throw new ApiError(409, 'Koreksi Attendance ini sudah ditinjau.')
  }

  await assertAttendanceHasNoAppliedClassification(
    conn,
    Number(correction.attendanceRecordId)
  )

  await acquireFinalizationLock(
    conn,
    Number(correction.siteId),
    String(correction.businessDate),
    input.finalizationLock
  )

  await assertAttendancePayrollUnlocked(conn, {
    siteId: Number(correction.siteId),
    employeeId: Number(correction.employeeId),
    dateFrom: String(correction.businessDate),
    dateTo: String(correction.businessDate),
  })
  const proposedClockIn =
    correction.correctionType === 'CLOCK_IN' || correction.correctionType === 'BOTH'
      ? correction.newClockInAt
      : correction.clockInAt
  const proposedClockOut =
    correction.correctionType === 'CLOCK_OUT' || correction.correctionType === 'BOTH'
      ? correction.newClockOutAt
      : correction.clockOutAt
  const proposedStatus = resolveCorrectionAttendanceStatus({
    correctionType: correction.correctionType,
    currentStatus: correction.attendanceStatus,
    newStatus: correction.newStatus,
    clockInAt: proposedClockIn,
    clockOutAt: proposedClockOut,
  })
  if (!validateClockOrder(proposedClockIn, proposedClockOut)) {
    throw new ApiError(422, 'Jam pulang tidak boleh sebelum jam masuk.')
  }
  if (proposedStatus !== 'PRESENT') {
    const [production] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM production_transactions
        WHERE attendance_record_id=? AND status='POSTED'
        LIMIT 1 FOR UPDATE`,
      [correction.attendanceRecordId]
    )
    if (production[0]) {
      throw new ApiError(409, 'Status hadir tidak dapat diubah karena Attendance sudah dipakai setoran produksi.')
    }
  }

  let lateMinutes = 0
  let earlyLeaveMinutes = 0
  let workedMinutes: number | null = null
  if (correction.shiftId) {
    const [metricRows] = await conn.query<RowDataPacket[]>(
      `SELECT
         CASE WHEN ? IS NULL THEN 0 ELSE GREATEST(0,TIMESTAMPDIFF(MINUTE,TIMESTAMP(?,?),?)) END rawLate,
         CASE WHEN ? IS NULL THEN 0 ELSE GREATEST(0,TIMESTAMPDIFF(MINUTE,?,${Number(correction.crossesMidnight) === 1 ? 'DATE_ADD(TIMESTAMP(?,?),INTERVAL 1 DAY)' : 'TIMESTAMP(?,?)'})) END rawEarly,
         CASE WHEN ? IS NULL OR ? IS NULL THEN NULL ELSE GREATEST(0,TIMESTAMPDIFF(MINUTE,?,?)) END workedMinutes`,
      [
        proposedClockIn, correction.businessDate, correction.startTime, proposedClockIn,
        proposedClockOut, proposedClockOut, correction.businessDate, correction.endTime,
        proposedClockIn, proposedClockOut, proposedClockIn, proposedClockOut,
      ]
    )
    const rawLate = Number(metricRows[0].rawLate ?? 0)
    const rawEarly = Number(metricRows[0].rawEarly ?? 0)
    lateMinutes = rawLate > Number(correction.lateToleranceMinutes) ? rawLate : 0
    earlyLeaveMinutes = rawEarly > Number(correction.earlyLeaveToleranceMinutes) ? rawEarly : 0
    workedMinutes = metricRows[0].workedMinutes === null ? null : Number(metricRows[0].workedMinutes)
  } else if (proposedClockIn && proposedClockOut) {
    const [metricRows] = await conn.query<RowDataPacket[]>(
      'SELECT GREATEST(0,TIMESTAMPDIFF(MINUTE,?,?)) workedMinutes',
      [proposedClockIn, proposedClockOut]
    )
    workedMinutes = Number(metricRows[0].workedMinutes ?? 0)
  }
  await conn.execute(
    `UPDATE attendance_records
        SET attendance_status=?,clock_in_at=?,clock_out_at=?,late_minutes=?,
            early_leave_minutes=?,worked_minutes=?,
            clock_in_device_id=CASE WHEN ? IN ('CLOCK_IN','BOTH') THEN NULL ELSE clock_in_device_id END,
            clock_in_source=CASE WHEN ? IN ('CLOCK_IN','BOTH') THEN 'CORRECTION' ELSE clock_in_source END,
            clock_out_device_id=CASE WHEN ? IN ('CLOCK_OUT','BOTH') THEN NULL ELSE clock_out_device_id END,
            clock_out_source=CASE WHEN ? IN ('CLOCK_OUT','BOTH') THEN 'CORRECTION' ELSE clock_out_source END,
            is_corrected=1,updated_by=?
      WHERE id=?`,
    [
      proposedStatus, proposedClockIn, proposedClockOut, lateMinutes,
      earlyLeaveMinutes, workedMinutes, correction.correctionType,
      correction.correctionType, correction.correctionType,
      correction.correctionType, input.auth.id, correction.attendanceRecordId,
    ]
  )
  await conn.execute(
    `UPDATE attendance_corrections
        SET approval_status='APPROVED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP(3),
            review_notes=?,applied_at=CURRENT_TIMESTAMP(3),updated_by=?
      WHERE id=?`,
    [input.auth.id, input.reviewNotes ?? null, input.auth.id, correction.id]
  )
  const [invalidatedFinalization] = await conn.execute<ResultSetHeader>(
    `INSERT INTO attendance_daily_finalization_runs
      (uid,site_id,business_date,trigger_type,status,grace_minutes,reason,
       summary,warnings,requested_by,started_at,finished_at,created_by,updated_by)
     SELECT UUID(),latest.site_id,latest.business_date,'MANUAL','SKIPPED',60,?,
            JSON_OBJECT('invalidatedByAttendanceCorrection',TRUE),JSON_ARRAY(?),?,
            CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),?,?
       FROM attendance_daily_finalization_runs latest
      WHERE latest.site_id=? AND latest.business_date=?
        AND latest.id=(SELECT MAX(previous.id)
          FROM attendance_daily_finalization_runs previous
         WHERE previous.site_id=latest.site_id
           AND previous.business_date=latest.business_date)
        AND latest.status='SUCCEEDED'`,
    [
      'Koreksi Attendance disetujui dan diterapkan.',
      'Finalisasi perlu dijalankan ulang setelah koreksi Attendance diterapkan.',
      input.auth.id,
      input.auth.id,
      input.auth.id,
      correction.siteId,
      correction.businessDate,
    ]
  )
  await writeAudit(
    {
      auth: input.auth,
      request: input.request,
      module: 'ATTENDANCE',
      siteId: correction.siteId,
      action: 'APPROVE',
      table: 'attendance_corrections',
      recordId: correction.id,
      recordUid: input.uid,
      description: 'Menyetujui dan menerapkan koreksi Attendance.',
      reason: correction.reason,
      requestId: input.batchId,
      beforeData: {
        attendanceStatus: correction.attendanceStatus,
        clockInAt: correction.clockInAt,
        clockOutAt: correction.clockOutAt,
      },
      afterData: {
        attendanceStatus: proposedStatus,
        clockInAt: proposedClockIn,
        clockOutAt: proposedClockOut,
        finalizationInvalidated: invalidatedFinalization.affectedRows > 0,
      },
    },
    conn
  )
  return { uid: input.uid, approvalStatus: 'APPROVED' as const, applied: true }
}

export const attendanceCorrectionsRouter = Router()

attendanceCorrectionsRouter.get(
  '/monitoring',
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const businessDate = parseBusinessDate(req.query.businessDate)
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const baseWhere = ['ar.business_date=?']
      const baseValues: unknown[] = [businessDate]
      const query = String(req.query.query ?? '').trim()
      if (query) {
        baseWhere.push('(e.full_name LIKE ? OR e.employee_number LIKE ?)')
        baseValues.push(`%${query}%`, `%${query}%`)
      }
      const sites = listFilter(req.query.site, siteCodes)
      if (sites.length) {
        baseWhere.push(`s.code IN (${sites.map(() => '?').join(',')})`)
        baseValues.push(...sites)
      }
      appendAttendanceEmployeeFilters(
        baseWhere,
        baseValues,
        parseAttendanceEmployeeFilters(req.query)
      )
      const statuses = listFilter(req.query.attendanceStatus, attendanceStatusValues)
      if (statuses.length) {
        baseWhere.push(
          `ar.attendance_status IN (${statuses.map(() => '?').join(',')})`
        )
        baseValues.push(...statuses)
      }
      const scope = scopeWhere(auth)
      baseWhere.push(scope.sql)
      baseValues.push(...scope.params)

      const where = [...baseWhere]
      const values = [...baseValues]
      const qualityStatuses = listFilter(req.query.qualityStatus, [
        'NORMAL',
        'ABNORMAL',
      ] as const)
      if (qualityStatuses.length === 1) {
        where.push(
          qualityStatuses[0] === 'ABNORMAL'
            ? abnormalAttendanceSql
            : `NOT ${abnormalAttendanceSql}`
        )
      }
      const abnormalReasons = listFilter(
        req.query.abnormalReason,
        attendanceAbnormalReasons
      )
      if (abnormalReasons.includes('MISSING_CLOCK_IN')) {
        where.push(missingClockInSql)
      }
      if (abnormalReasons.includes('MISSING_CLOCK_OUT')) {
        where.push(missingClockOutSql)
      }

      const from = `FROM attendance_records ar
        JOIN employees e ON e.id=ar.employee_id
        JOIN sites s ON s.id=ar.site_id
        JOIN employee_employment_histories eh
          ON eh.employee_id=ar.employee_id AND eh.site_id=ar.site_id
         AND eh.effective_from<=ar.business_date
         AND (eh.effective_to IS NULL OR eh.effective_to>=ar.business_date)
        JOIN employee_types et ON et.id=eh.employee_type_id
        LEFT JOIN positions p ON p.id=eh.position_id
        LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
        LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
        LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
        LEFT JOIN shifts sh ON sh.id=ar.shift_id
        LEFT JOIN attendance_corrections pending_correction
          ON pending_correction.id=(
            SELECT MAX(candidate.id)
              FROM attendance_corrections candidate
             WHERE candidate.attendance_record_id=ar.id
               AND candidate.approval_status='PENDING'
          )`
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${from} WHERE ${where.join(' AND ')}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT ar.uid,DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
                ar.attendance_status attendanceStatus,
                DATE_FORMAT(ar.clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00') clockInAt,
                DATE_FORMAT(ar.clock_out_at,'%Y-%m-%dT%H:%i:%s+07:00') clockOutAt,
                ar.late_minutes lateMinutes,ar.early_leave_minutes earlyLeaveMinutes,
                ar.worked_minutes workedMinutes,ar.notes,e.uid employeeUid,
                e.employee_number employeeNumber,e.full_name employeeName,
                et.code employeeType,p.name position,
                pm.name productionModule,ps.uid productionSectionUid,
                ps.name productionSection,
                EXISTS(
                  SELECT 1
                    FROM attendance_classification_details applied_classification
                   WHERE applied_classification.attendance_record_id=ar.id
                     AND applied_classification.outcome='APPLIED'
                ) hasAppliedClassification,
                pending_correction.uid pendingCorrectionUid,
                pending_correction.correction_type pendingCorrectionType,
                s.code site,sh.uid shiftUid,sh.name shiftName,
                DATE_FORMAT(NOW(3),'%Y-%m-%d %H:%i:%s') asOf,
                DATE_FORMAT(
                  CASE WHEN sh.crosses_midnight=1
                       THEN DATE_ADD(TIMESTAMP(ar.business_date,sh.end_time),INTERVAL 1 DAY)
                       ELSE TIMESTAMP(ar.business_date,sh.end_time) END,
                  '%Y-%m-%d %H:%i:%s') scheduledEndAt
           ${from}
          WHERE ${where.join(' AND ')}
          ORDER BY ar.business_date DESC,ar.created_at DESC,ar.id DESC
          LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const [summaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total,
                SUM(ar.attendance_status='PRESENT') present,
                SUM(ar.attendance_status='ABSENT') absent,
                SUM(ar.attendance_status='LEAVE') leaveCount,
                SUM(ar.attendance_status='SICK') sick,
                SUM(ar.attendance_status='PERMISSION') permission,
                SUM(ar.attendance_status='HOLIDAY') holiday,
                SUM(${abnormalAttendanceSql}) abnormal,
                SUM(${missingClockInSql}) missingClockIn,
                SUM(${missingClockOutSql}) missingClockOut
           ${from}
          WHERE ${baseWhere.join(' AND ')}`,
        baseValues
      )
      res.json({
        items: rows.map((row) => ({
          ...row,
          lateMinutes: Number(row.lateMinutes ?? 0),
          earlyLeaveMinutes: Number(row.earlyLeaveMinutes ?? 0),
          workedMinutes:
            row.workedMinutes === null ? null : Number(row.workedMinutes),
          hasAppliedClassification: Boolean(row.hasAppliedClassification),
          ...deriveAttendanceQuality({
            attendanceStatus: String(row.attendanceStatus),
            clockInAt: row.clockInAt,
            clockOutAt: row.clockOutAt,
            scheduledEndAt: row.scheduledEndAt,
            asOf: row.asOf,
          }),
        })),
        total: Number(countRows[0].total),
        page,
        pageSize,
        summary: {
          total: Number(summaryRows[0].total ?? 0),
          present: Number(summaryRows[0].present ?? 0),
          absent: Number(summaryRows[0].absent ?? 0),
          leave: Number(summaryRows[0].leaveCount ?? 0),
          sick: Number(summaryRows[0].sick ?? 0),
          permission: Number(summaryRows[0].permission ?? 0),
          holiday: Number(summaryRows[0].holiday ?? 0),
          abnormal: Number(summaryRows[0].abnormal ?? 0),
          missingClockIn: Number(summaryRows[0].missingClockIn ?? 0),
          missingClockOut: Number(summaryRows[0].missingClockOut ?? 0),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceCorrectionsRouter.get(
  '/corrections',
  requireCorrectionListAccess,
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const where = ['1=1']
      const values: unknown[] = []
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push('(e.full_name LIKE ? OR e.employee_number LIKE ?)')
        values.push(`%${query}%`, `%${query}%`)
      }
      if (req.query.businessDate) {
        where.push('ar.business_date=?')
        values.push(parseBusinessDate(req.query.businessDate))
      }
      appendAttendanceEmployeeFilters(
        where,
        values,
        parseAttendanceEmployeeFilters(req.query)
      )
      for (const [raw, allowed, column] of [
        [req.query.site, siteCodes, 's.code'],
        [req.query.approvalStatus, approvalStatuses, 'ac.approval_status'],
        [req.query.correctionType, attendanceCorrectionTypes, 'ac.correction_type'],
      ] as const) {
        const selected = listFilter(raw, allowed)
        if (selected.length) {
          where.push(`${column} IN (${selected.map(() => '?').join(',')})`)
          values.push(...selected)
        }
      }
      const scope = scopeWhere(auth)
      where.push(scope.sql)
      values.push(...scope.params)
      const from = `FROM attendance_corrections ac
        JOIN attendance_records ar ON ar.id=ac.attendance_record_id
        JOIN employees e ON e.id=ar.employee_id
        JOIN sites s ON s.id=ar.site_id
        JOIN employee_employment_histories eh
          ON eh.employee_id=ar.employee_id AND eh.site_id=ar.site_id
         AND eh.effective_from<=ar.business_date
         AND (eh.effective_to IS NULL OR eh.effective_to>=ar.business_date)
        JOIN employee_types et ON et.id=eh.employee_type_id
        LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
        LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
        JOIN users requester ON requester.id=ac.requested_by
        LEFT JOIN users reviewer ON reviewer.id=ac.reviewed_by`
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${from} WHERE ${where.join(' AND ')}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT ac.uid,ar.uid attendanceUid,
                DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
                e.uid employeeUid,e.employee_number employeeNumber,
                e.full_name employeeName,et.code employeeType,s.code site,
                ps.uid productionSectionUid,ps.name productionSection,
                ac.correction_type correctionType,
                DATE_FORMAT(ac.old_clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00') oldClockInAt,
                DATE_FORMAT(ac.new_clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00') newClockInAt,
                DATE_FORMAT(ac.old_clock_out_at,'%Y-%m-%dT%H:%i:%s+07:00') oldClockOutAt,
                DATE_FORMAT(ac.new_clock_out_at,'%Y-%m-%dT%H:%i:%s+07:00') newClockOutAt,
                ac.old_status oldStatus,ac.new_status newStatus,ac.reason,
                ac.approval_status approvalStatus,requester.full_name requestedByName,
                DATE_FORMAT(ac.requested_at,'%Y-%m-%dT%H:%i:%s+07:00') requestedAt,
                reviewer.full_name reviewedByName,
                DATE_FORMAT(ac.reviewed_at,'%Y-%m-%dT%H:%i:%s+07:00') reviewedAt,
                ac.review_notes reviewNotes,
                DATE_FORMAT(ac.applied_at,'%Y-%m-%dT%H:%i:%s+07:00') appliedAt
           ${from}
          WHERE ${where.join(' AND ')}
          ORDER BY ac.requested_at DESC,ac.id DESC
          LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      res.json({
        items: rows,
        total: Number(countRows[0].total),
        page,
        pageSize,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceCorrectionsRouter.get(
  '/corrections/:uid',
  requireCorrectionListAccess,
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      const scope = scopeWhere(auth)
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT ac.uid,ar.uid attendanceUid,
                DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
                e.uid employeeUid,e.employee_number employeeNumber,
                e.full_name employeeName,et.code employeeType,s.code site,
                ps.uid productionSectionUid,ps.name productionSection,
                ac.correction_type correctionType,
                DATE_FORMAT(ac.old_clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00') oldClockInAt,
                DATE_FORMAT(ac.new_clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00') newClockInAt,
                DATE_FORMAT(ac.old_clock_out_at,'%Y-%m-%dT%H:%i:%s+07:00') oldClockOutAt,
                DATE_FORMAT(ac.new_clock_out_at,'%Y-%m-%dT%H:%i:%s+07:00') newClockOutAt,
                ac.old_status oldStatus,ac.new_status newStatus,ac.reason,
                ac.approval_status approvalStatus,requester.full_name requestedByName,
                DATE_FORMAT(ac.requested_at,'%Y-%m-%dT%H:%i:%s+07:00') requestedAt,
                reviewer.full_name reviewedByName,
                DATE_FORMAT(ac.reviewed_at,'%Y-%m-%dT%H:%i:%s+07:00') reviewedAt,
                ac.review_notes reviewNotes,
                DATE_FORMAT(ac.applied_at,'%Y-%m-%dT%H:%i:%s+07:00') appliedAt
           FROM attendance_corrections ac
           JOIN attendance_records ar ON ar.id=ac.attendance_record_id
           JOIN employees e ON e.id=ar.employee_id
           JOIN sites s ON s.id=ar.site_id
           JOIN employee_employment_histories eh
             ON eh.employee_id=ar.employee_id AND eh.site_id=ar.site_id
            AND eh.effective_from<=ar.business_date
            AND (eh.effective_to IS NULL OR eh.effective_to>=ar.business_date)
           JOIN employee_types et ON et.id=eh.employee_type_id
           LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
           LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
           JOIN users requester ON requester.id=ac.requested_by
           LEFT JOIN users reviewer ON reviewer.id=ac.reviewed_by
          WHERE ac.uid=? AND ${scope.sql}
          LIMIT 1`,
        [uid, ...scope.params]
      )
      if (!rows[0]) {
        throw new ApiError(404, 'Koreksi Attendance tidak ditemukan.')
      }
      res.json(rows[0])
    } catch (error) {
      next(error)
    }
  }
)

attendanceCorrectionsRouter.post(
  '/corrections',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const input = attendanceCorrectionRequestInput.parse(req.body)
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT ar.id,ar.uid,ar.site_id siteId,
                DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
                ar.attendance_status attendanceStatus,
                DATE_FORMAT(ar.clock_in_at,'%Y-%m-%d %H:%i:%s') clockInAt,
                DATE_FORMAT(ar.clock_out_at,'%Y-%m-%d %H:%i:%s') clockOutAt,
                s.code site
           FROM attendance_records ar
           JOIN sites s ON s.id=ar.site_id
          WHERE ar.uid=?
          FOR UPDATE`,
        [input.attendanceUid]
      )
      const attendance = rows[0]
      if (!attendance) throw new ApiError(404, 'Attendance tidak ditemukan.')
      enforceSite(auth, attendance.site)
      await assertAttendanceHasNoAppliedClassification(
        conn,
        Number(attendance.id)
      )
      const [pending] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM attendance_corrections
          WHERE attendance_record_id=? AND approval_status='PENDING'
          LIMIT 1 FOR UPDATE`,
        [attendance.id]
      )
      if (pending[0]) {
        throw new ApiError(409, 'Attendance masih memiliki koreksi yang menunggu persetujuan.')
      }

      const proposedClockIn =
        input.correctionType === 'CLOCK_IN' || input.correctionType === 'BOTH'
          ? input.newClockInAt ?? null
          : attendance.clockInAt
      const proposedClockOut =
        input.correctionType === 'CLOCK_OUT' || input.correctionType === 'BOTH'
          ? input.newClockOutAt ?? null
          : attendance.clockOutAt
      const proposedStatus = resolveCorrectionAttendanceStatus({
        correctionType: input.correctionType,
        currentStatus: attendance.attendanceStatus,
        newStatus: input.newStatus,
        clockInAt: proposedClockIn,
        clockOutAt: proposedClockOut,
      })
      if (!validateClockOrder(proposedClockIn, proposedClockOut)) {
        throw new ApiError(422, 'Jam pulang tidak boleh sebelum jam masuk.')
      }
      if (
        !validCorrectionDateTime(proposedClockIn, attendance.businessDate) ||
        !validCorrectionDateTime(proposedClockOut, attendance.businessDate)
      ) {
        throw new ApiError(
          422,
          'Waktu koreksi harus berada pada business date atau hari berikutnya.'
        )
      }
      if (
        String(proposedClockIn ?? '') === String(attendance.clockInAt ?? '') &&
        String(proposedClockOut ?? '') === String(attendance.clockOutAt ?? '') &&
        proposedStatus === attendance.attendanceStatus
      ) {
        throw new ApiError(422, 'Koreksi tidak mengubah data Attendance.')
      }
      const uid = randomUUID()
      await conn.execute(
        `INSERT INTO attendance_corrections
          (uid,attendance_record_id,correction_type,old_clock_in_at,new_clock_in_at,
           old_clock_out_at,new_clock_out_at,old_status,new_status,reason,
           approval_status,requested_by,requested_at,created_by,updated_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,'PENDING',?,CURRENT_TIMESTAMP(3),?,?)`,
        [
          uid,
          attendance.id,
          input.correctionType,
          input.correctionType === 'CLOCK_IN' || input.correctionType === 'BOTH'
            ? attendance.clockInAt
            : null,
          input.correctionType === 'CLOCK_IN' || input.correctionType === 'BOTH'
            ? input.newClockInAt ?? null
            : null,
          input.correctionType === 'CLOCK_OUT' || input.correctionType === 'BOTH'
            ? attendance.clockOutAt
            : null,
          input.correctionType === 'CLOCK_OUT' || input.correctionType === 'BOTH'
            ? input.newClockOutAt ?? null
            : null,
          proposedStatus !== attendance.attendanceStatus
            ? attendance.attendanceStatus
            : null,
          proposedStatus !== attendance.attendanceStatus
            ? proposedStatus
            : null,
          input.reason,
          auth.id,
          auth.id,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: attendance.siteId,
          action: 'CREATE',
          table: 'attendance_corrections',
          recordUid: uid,
          description: `Mengajukan koreksi ${input.correctionType} Attendance.`,
          reason: input.reason,
          afterData: {
            attendanceUid: input.attendanceUid,
            correctionType: input.correctionType,
            newClockInAt: input.newClockInAt ?? null,
            newClockOutAt: input.newClockOutAt ?? null,
            newStatus: input.newStatus ?? null,
          },
        },
        conn
      )
      await conn.commit()
      res.status(201).json({ uid, approvalStatus: 'PENDING' })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceCorrectionsRouter.post(
  '/corrections/batch-review',
  requirePermission('attendance.approve'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const input = attendanceBulkApprovalInput.parse(req.body)
      enforceSite(auth, input.site)
      const batchId = randomUUID()
      const failures: { uid: string; message: string }[] = []
      let approved = 0

      for (const uid of input.uids) {
        let conn: PoolConnection | undefined
        const finalizationLock: FinalizationLockState = {}
        try {
          conn = await pool.getConnection()
          await conn.beginTransaction()
          await approveCorrection(conn, {
            auth,
            request: req,
            uid,
            reviewNotes: input.reviewNotes,
            batchId,
            expectedSite: input.site,
            finalizationLock,
          })
          await conn.commit()
          approved += 1
        } catch (error) {
          await conn?.rollback().catch(() => undefined)
          failures.push({ uid, message: safeBulkReviewMessage(error) })
        } finally {
          await releaseFinalizationLock(conn, finalizationLock)
          conn?.release()
        }
      }

      res.json({
        requested: input.uids.length,
        approved,
        failed: failures.length,
        failures,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceCorrectionsRouter.post(
  '/corrections/:uid/review',
  requirePermission('attendance.approve'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    const finalizationLock: FinalizationLockState = {}
    try {
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      const input = attendanceCorrectionReviewInput.parse(req.body)
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT ac.id,ac.uid,ac.attendance_record_id attendanceRecordId,
                ac.correction_type correctionType,ac.new_clock_in_at newClockInAt,
                ac.new_clock_out_at newClockOutAt,ac.new_status newStatus,
                ac.reason,ac.approval_status approvalStatus,
                ar.uid attendanceUid,ar.site_id siteId,
                DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
                ar.attendance_status attendanceStatus,ar.clock_in_at clockInAt,
                ar.clock_out_at clockOutAt,ar.shift_id shiftId,s.code site,
                sh.start_time startTime,sh.end_time endTime,
                sh.crosses_midnight crossesMidnight,
                sh.late_tolerance_minutes lateToleranceMinutes,
                sh.early_leave_tolerance_minutes earlyLeaveToleranceMinutes
           FROM attendance_corrections ac
           JOIN attendance_records ar ON ar.id=ac.attendance_record_id
           JOIN sites s ON s.id=ar.site_id
           LEFT JOIN shifts sh ON sh.id=ar.shift_id
          WHERE ac.uid=?
          FOR UPDATE`,
        [uid]
      )
      const correction = rows[0]
      if (!correction) throw new ApiError(404, 'Koreksi Attendance tidak ditemukan.')
      enforceSite(auth, correction.site)
      if (correction.approvalStatus !== 'PENDING') {
        throw new ApiError(409, 'Koreksi Attendance ini sudah ditinjau.')
      }

      if (input.decision === 'REJECTED') {
        await conn.execute(
          `UPDATE attendance_corrections
              SET approval_status='REJECTED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP(3),
                  review_notes=?,updated_by=?
            WHERE id=?`,
          [auth.id, input.reviewNotes, auth.id, correction.id]
        )
        await writeAudit(
          {
            auth,
            request: req,
            module: 'ATTENDANCE',
            siteId: correction.siteId,
            action: 'REJECT',
            table: 'attendance_corrections',
            recordId: correction.id,
            recordUid: uid,
            description: 'Menolak koreksi Attendance.',
            reason: input.reviewNotes,
          },
          conn
        )
        await conn.commit()
        return res.json({ uid, approvalStatus: 'REJECTED', applied: false })
      }

      const result = await approveCorrection(conn, {
        auth,
        request: req,
        uid,
        reviewNotes: input.reviewNotes,
        finalizationLock,
      })
      await conn.commit()
      res.json(result)
      return
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      await releaseFinalizationLock(conn, finalizationLock)
      conn.release()
    }
  }
)
