import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import type { QueryError, ResultSetHeader, RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import { getAttendanceCalendarRules } from './attendance-calendar.js'
import { resolveCalendarDay } from './attendance-calendar-policy.js'
import {
  attendanceFinalizationGraceMinutes,
  isShiftFinalizationDue,
  isAttendanceFinalizationRequired,
  jakartaDateTime,
  finalizationRecordDecision,
} from './attendance-finalization-policy.js'
import { isoWeekday, parseWorkDays } from './attendance-classification-policy.js'
import { writeAudit, writeSystemAudit } from './audit.js'
import { ApiError } from './errors.js'
import type { AuthContext } from '../middleware/authenticate.js'

export type AttendanceFinalizationCounts = {
  eligible: number
  absent: number
  holiday: number
  preserved: number
  weeklyOff: number
  missingAssignment: number
  ambiguousAssignment: number
  ambiguousEmployment: number
  pendingDue: number
}

export type AttendanceFinalizationResult = {
  uid: string
  site: string
  businessDate: string
  rawStatus: 'SUCCEEDED'
  source: 'MANUAL' | 'CRON'
  counts: AttendanceFinalizationCounts
  warnings: string[]
  startedAt: string
  finishedAt: string
}

export type AttendanceFinalizationRequirement = {
  required: boolean
  effectiveTargets: number
  resolvedNonWorkdayTargets: number
  unresolvedTargets: number
}

export async function getAttendanceFinalizationRequirement(input: {
  siteId: number
  businessDate: string
  executor?: Pool | PoolConnection
}): Promise<AttendanceFinalizationRequirement> {
  const executor = input.executor ?? pool
  const [rows] = await executor.query<RowDataPacket[]>(
    `SELECT e.id employeeId,es.allows_attendance allowsAttendance,
            esa.id assignmentId,esa.work_days_json workDays,
            sh.site_id shiftSiteId,
            (SELECT COUNT(*) FROM employee_employment_histories allh
              WHERE allh.employee_id=e.id AND allh.effective_from<=?
                AND (allh.effective_to IS NULL OR allh.effective_to>=?)) employmentCount,
            (SELECT COUNT(*) FROM employee_shift_assignments alla
              WHERE alla.employee_id=e.id AND alla.effective_from<=?
                AND (alla.effective_to IS NULL OR alla.effective_to>=?)) assignmentCount
       FROM employee_employment_histories h
       JOIN employees e ON e.id=h.employee_id
       JOIN employee_statuses es ON es.id=h.employee_status_id
       LEFT JOIN employee_shift_assignments esa ON esa.employee_id=e.id
        AND esa.effective_from<=? AND (esa.effective_to IS NULL OR esa.effective_to>=?)
       LEFT JOIN shifts sh ON sh.id=esa.shift_id
      WHERE h.site_id=? AND h.effective_from<=?
        AND (h.effective_to IS NULL OR h.effective_to>=?)
      ORDER BY e.id,h.id,esa.id`,
    [
      input.businessDate,
      input.businessDate,
      input.businessDate,
      input.businessDate,
      input.businessDate,
      input.businessDate,
      input.siteId,
      input.businessDate,
      input.businessDate,
    ]
  )
  const employeeRows = new Map<number, RowDataPacket>()
  for (const row of rows) {
    if (!employeeRows.has(Number(row.employeeId))) {
      employeeRows.set(Number(row.employeeId), row)
    }
  }
  const calendarRules = await getAttendanceCalendarRules({
    siteId: input.siteId,
    businessDate: input.businessDate,
    executor,
  })
  let effectiveTargets = 0
  let resolvedNonWorkdayTargets = 0
  let unresolvedTargets = 0
  for (const row of employeeRows.values()) {
    if (Number(row.employmentCount) !== 1) {
      unresolvedTargets += 1
      continue
    }
    if (Number(row.allowsAttendance) !== 1) continue
    effectiveTargets += 1
    const workDays = parseWorkDays(row.workDays)
    if (
      Number(row.assignmentCount) !== 1 ||
      !row.assignmentId ||
      Number(row.shiftSiteId) !== input.siteId ||
      workDays.length === 0
    ) {
      unresolvedTargets += 1
      continue
    }
    const calendar = resolveCalendarDay({
      scheduledByShift: workDays.includes(isoWeekday(input.businessDate)),
      rules: calendarRules,
    })
    if (
      calendar.dayType === 'NON_WORKDAY' &&
      calendar.reasonType === 'WEEKLY_OFF'
    ) {
      resolvedNonWorkdayTargets += 1
    }
  }
  return {
    required: isAttendanceFinalizationRequired({
      effectiveTargets,
      resolvedNonWorkdayTargets,
      unresolvedTargets,
    }),
    effectiveTargets,
    resolvedNonWorkdayTargets,
    unresolvedTargets,
  }
}

export async function hasDueAttendanceShift(input: {
  siteId: number
  businessDate: string
  now?: Date
}) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT sh.end_time endTime,sh.crosses_midnight crossesMidnight
       FROM employee_employment_histories h
       JOIN employee_statuses es ON es.id=h.employee_status_id AND es.allows_attendance=1
       JOIN employee_shift_assignments esa ON esa.employee_id=h.employee_id
        AND esa.effective_from<=? AND (esa.effective_to IS NULL OR esa.effective_to>=?)
       JOIN shifts sh ON sh.id=esa.shift_id AND sh.site_id=h.site_id
      WHERE h.site_id=? AND h.effective_from<=?
        AND (h.effective_to IS NULL OR h.effective_to>=?)`,
    [input.businessDate, input.businessDate, input.siteId, input.businessDate, input.businessDate]
  )
  const asOfJakarta = jakartaDateTime(input.now)
  return rows.some((row) =>
    isShiftFinalizationDue({
      businessDate: input.businessDate,
      endTime: String(row.endTime),
      crossesMidnight: Number(row.crossesMidnight) === 1,
      asOfJakarta,
    })
  )
}

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

function safeFailureMessage() {
  return 'Finalisasi Attendance gagal. Periksa log aplikasi dan audit trail.'
}

export async function finalizeAttendanceDay(input: {
  siteCode: string
  businessDate: string
  goLiveDate: string
  source: 'MANUAL' | 'CRON'
  reason: string
  actor?: AuthContext
  request?: Request
  now?: Date
}): Promise<AttendanceFinalizationResult> {
  const conn = await pool.getConnection()
  const asOfJakarta = jakartaDateTime(input.now)
  const today = asOfJakarta.slice(0, 10)
  let lockHeld = false
  let runId: number | undefined
  let runUid: string | undefined
  let lockName: string | undefined
  try {
    if (input.businessDate < input.goLiveDate) {
      throw new ApiError(
        422,
        `Finalisasi hanya berlaku mulai ${input.goLiveDate}.`
      )
    }
    if (input.businessDate > today) {
      throw new ApiError(422, 'Tanggal masa depan belum dapat difinalisasi.')
    }
    const [sites] = await conn.query<RowDataPacket[]>(
      'SELECT id,code FROM sites WHERE code=? AND is_active=1',
      [input.siteCode]
    )
    const site = sites[0]
    if (!site) throw new ApiError(404, 'Site tidak ditemukan atau tidak aktif.')
    const requirement = await getAttendanceFinalizationRequirement({
      siteId: Number(site.id),
      businessDate: input.businessDate,
      executor: conn,
    })
    if (!requirement.required) {
      throw new ApiError(
        422,
        'Tanggal ini tidak memerlukan finalisasi Attendance.'
      )
    }
    lockName = `hris:attendance:finalize:${site.id}:${input.businessDate}`
    const [locks] = await conn.query<RowDataPacket[]>('SELECT GET_LOCK(?,0) acquired', [lockName])
    lockHeld = Number(locks[0]?.acquired) === 1
    if (!lockHeld) throw new ApiError(409, 'Finalisasi site dan tanggal ini sedang berjalan.')

    runUid = randomUUID()
    const [createdRun] = await conn.execute<ResultSetHeader>(
      `INSERT INTO attendance_daily_finalization_runs
        (uid,site_id,business_date,trigger_type,status,grace_minutes,reason,
         requested_by,started_at,created_by,updated_by)
       VALUES(?,?,?,?,'RUNNING',?,?,?,CURRENT_TIMESTAMP(3),?,?)`,
      [runUid, site.id, input.businessDate, input.source, attendanceFinalizationGraceMinutes, input.reason, input.actor?.id ?? null, input.actor?.id ?? null, input.actor?.id ?? null]
    )
    runId = createdRun.insertId
    await conn.beginTransaction()

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT e.id employeeId,e.uid employeeUid,e.full_name employeeName,
              h.id historyId,es.allows_attendance allowsAttendance,
              esa.id assignmentId,esa.work_days_json workDays,
              sh.id shiftId,sh.site_id shiftSiteId,sh.end_time endTime,
              sh.crosses_midnight crossesMidnight,
              (SELECT COUNT(*) FROM employee_employment_histories allh
                WHERE allh.employee_id=e.id AND allh.effective_from<=?
                  AND (allh.effective_to IS NULL OR allh.effective_to>=?)) employmentCount,
              (SELECT COUNT(*) FROM employee_shift_assignments alla
                WHERE alla.employee_id=e.id AND alla.effective_from<=?
                  AND (alla.effective_to IS NULL OR alla.effective_to>=?)) assignmentCount
         FROM employee_employment_histories h
         JOIN employees e ON e.id=h.employee_id
         JOIN employee_statuses es ON es.id=h.employee_status_id
         LEFT JOIN employee_shift_assignments esa ON esa.employee_id=e.id
          AND esa.effective_from<=? AND (esa.effective_to IS NULL OR esa.effective_to>=?)
         LEFT JOIN shifts sh ON sh.id=esa.shift_id
        WHERE h.site_id=? AND h.effective_from<=?
          AND (h.effective_to IS NULL OR h.effective_to>=?)
        ORDER BY e.id,h.id,esa.id FOR UPDATE`,
      [input.businessDate, input.businessDate, input.businessDate, input.businessDate, input.businessDate, input.businessDate, site.id, input.businessDate, input.businessDate]
    )
    const employeeRows = new Map<number, RowDataPacket>()
    for (const row of rows) {
      if (!employeeRows.has(Number(row.employeeId))) employeeRows.set(Number(row.employeeId), row)
    }
    const employeeIds = [...employeeRows.keys()]
    const existing = new Set<number>()
    if (employeeIds.length) {
      const placeholders = employeeIds.map(() => '?').join(',')
      const [attendanceRows] = await conn.query<RowDataPacket[]>(
        `SELECT employee_id employeeId FROM attendance_records
          WHERE site_id=? AND business_date=? AND employee_id IN (${placeholders})
          FOR UPDATE`,
        [site.id, input.businessDate, ...employeeIds]
      )
      attendanceRows.forEach((row) => existing.add(Number(row.employeeId)))
    }

    const calendarRules = await getAttendanceCalendarRules({
      siteId: Number(site.id),
      businessDate: input.businessDate,
      executor: conn,
    })
    const counts = emptyCounts()
    const warnings = new Set<string>()
    for (const [employeeId, row] of employeeRows) {
      if (Number(row.employmentCount) !== 1) {
        counts.ambiguousEmployment += 1
        warnings.add('Ada histori employment yang tumpang tindih.')
        continue
      }
      if (Number(row.allowsAttendance) !== 1) continue
      counts.eligible += 1
      if (Number(row.assignmentCount) === 0 || !row.assignmentId) {
        counts.missingAssignment += 1
        warnings.add('Ada karyawan eligible tanpa assignment Shift efektif.')
        continue
      }
      if (Number(row.assignmentCount) !== 1) {
        counts.ambiguousAssignment += 1
        warnings.add('Ada assignment Shift yang tumpang tindih.')
        continue
      }
      if (Number(row.shiftSiteId) !== Number(site.id)) {
        counts.missingAssignment += 1
        warnings.add('Ada assignment Shift yang tidak sesuai site histori.')
        continue
      }
      if (!parseWorkDays(row.workDays).length) {
        counts.missingAssignment += 1
        warnings.add('Ada assignment Shift tanpa konfigurasi hari kerja.')
        continue
      }
      if (!isShiftFinalizationDue({
        businessDate: input.businessDate,
        endTime: String(row.endTime),
        crossesMidnight: Number(row.crossesMidnight) === 1,
        asOfJakarta,
      })) {
        counts.pendingDue += 1
        continue
      }
      const scheduledByShift = parseWorkDays(row.workDays).includes(isoWeekday(input.businessDate))
      const calendar = resolveCalendarDay({ scheduledByShift, rules: calendarRules })
      const decision = finalizationRecordDecision({
        dayType: calendar.dayType,
        hasExistingAttendance: existing.has(employeeId),
      })
      if (decision === 'WEEKLY_OFF') {
        counts.weeklyOff += 1
        continue
      }
      if (decision === 'PRESERVE') {
        counts.preserved += 1
        continue
      }
      const status = decision === 'CREATE_HOLIDAY' ? 'HOLIDAY' : 'ABSENT'
      try {
        await conn.execute<ResultSetHeader>(
        `INSERT INTO attendance_records
          (uid,employee_id,site_id,shift_id,business_date,attendance_status,
           calendar_day_type,calendar_reason_type,calendar_event_id,
           calendar_site_rule_id,notes,created_by,updated_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [randomUUID(), employeeId, site.id, row.shiftId, input.businessDate, status, calendar.dayType, calendar.reasonType, calendar.eventId, calendar.siteRuleId, status === 'HOLIDAY' ? calendar.name : 'Dibuat otomatis oleh finalisasi harian.', input.actor?.id ?? null, input.actor?.id ?? null]
        )
        if (status === 'HOLIDAY') counts.holiday += 1
        else counts.absent += 1
      } catch (error) {
        if ((error as QueryError).code !== 'ER_DUP_ENTRY') throw error
        counts.preserved += 1
      }
    }
    const finishedAt = jakartaDateTime()
    await conn.execute(
      `UPDATE attendance_daily_finalization_runs
          SET status='SUCCEEDED',summary=?,warnings=?,finished_at=CURRENT_TIMESTAMP(3),updated_by=?
        WHERE id=?`,
      [JSON.stringify(counts), JSON.stringify([...warnings]), input.actor?.id ?? null, runId]
    )
    const audit = {
      siteId: Number(site.id),
      action: 'OTHER' as const,
      table: 'attendance_daily_finalization_runs',
      recordId: runId,
      recordUid: runUid,
      module: 'ATTENDANCE',
      description: `Finalisasi Attendance ${site.code} tanggal ${input.businessDate}.`,
      reason: input.reason,
      afterData: { counts, warnings: [...warnings], source: input.source },
    }
    if (input.actor) {
      await writeAudit({ ...audit, auth: input.actor, request: input.request }, conn)
    } else {
      await writeSystemAudit(audit, conn)
    }
    await conn.commit()
    return { uid: runUid, site: String(site.code), businessDate: input.businessDate, rawStatus: 'SUCCEEDED', source: input.source, counts, warnings: [...warnings], startedAt: asOfJakarta, finishedAt }
  } catch (error) {
    try {
      await conn.rollback()
      if (runId) {
        await conn.execute(
          `UPDATE attendance_daily_finalization_runs
              SET status='FAILED',error_message=?,finished_at=CURRENT_TIMESTAMP(3)
            WHERE id=?`,
          [safeFailureMessage(), runId]
        )
      }
    } catch {
      // Error asli tetap menjadi sumber respons; detail database tidak diekspos.
    }
    throw error
  } finally {
    if (lockHeld && lockName) {
      await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined)
    }
    conn.release()
  }
}
