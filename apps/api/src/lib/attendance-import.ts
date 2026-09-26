import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { env } from '../config.js'
import {
  isScheduledWorkday,
} from './attendance-classification-policy.js'
import { resolveCalendarDay } from './attendance-calendar-policy.js'
import { assertAttendanceOperationalDate } from './attendance-operational-policy.js'
import { jakartaBusinessDate } from './attendance-shift-policy.js'
import { ApiError } from './errors.js'

export type AttendanceImportInputRow = {
  rowNumber: number
  businessDate: string
  employeeNumber: string
  employeeName?: string
  status: string
  clockIn?: string
  clockOut?: string
  notes?: string
}

export type AttendanceImportProposal = {
  employeeId: number
  employeeUid: string
  employeeNumber: string
  employeeName: string
  siteId: number
  site: string
  siteName: string
  shiftId: number
  shiftAssignmentId: number
  shiftName: string
  attendanceStatus: 'PRESENT' | 'ABSENT' | 'LEAVE' | 'SICK' | 'PERMISSION'
  clockInAt: string | null
  clockOutAt: string | null
  lateMinutes: number
  earlyLeaveMinutes: number
  workedMinutes: number | null
  calendar: {
    dayType: 'WORKDAY' | 'HOLIDAY' | 'NON_WORKDAY'
    reasonType: string
    eventId: number | null
    siteRuleId: number | null
    name: string | null
  }
  classificationOutcome:
    | 'APPLIED'
    | 'SKIPPED_NON_WORKDAY'
    | 'SKIPPED_HOLIDAY'
    | null
}

export type AttendanceImportValidationRow = {
  input: AttendanceImportInputRow
  valid: boolean
  message: string
  warning: string | null
  proposal?: AttendanceImportProposal
}

const attendanceStatus = {
  HADIR: 'PRESENT',
  ALPHA: 'ABSENT',
  CUTI: 'LEAVE',
  SAKIT: 'SICK',
  IZIN: 'PERMISSION',
} as const

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function dateTime(date: string, time: string) {
  return `${date} ${time}:00`
}

function minuteDifference(from: string, to: string) {
  const parse = (value: string) => Date.parse(`${value.replace(' ', 'T')}Z`)
  return Math.floor((parse(to) - parse(from)) / 60_000)
}

export function attendanceImportRowDto(row: AttendanceImportValidationRow) {
  return {
    ...row.input,
    valid: row.valid,
    message: row.message,
    warning: row.warning,
    employeeName: row.proposal?.employeeName ?? row.input.employeeName ?? '',
    site: row.proposal?.site ?? null,
    siteName: row.proposal?.siteName ?? null,
    shiftName: row.proposal?.shiftName ?? null,
    attendanceStatus: row.proposal?.attendanceStatus ?? null,
    calendarDayType: row.proposal?.calendar.dayType ?? null,
  }
}

export async function dropAttendanceImportTable(conn: PoolConnection) {
  await conn.query('DROP TEMPORARY TABLE IF EXISTS tmp_attendance_import_rows')
}

export async function validateAttendanceImportRows(
  conn: PoolConnection,
  rows: AttendanceImportInputRow[],
  lock = false
): Promise<AttendanceImportValidationRow[]> {
  const preliminary = new Map<number, string>()
  const seenRows = new Set<number>()
  const duplicateKeys = new Map<string, number[]>()
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

  for (const row of rows) {
    if (seenRows.has(row.rowNumber)) {
      preliminary.set(row.rowNumber, 'Nomor baris dalam file tidak unik.')
    }
    seenRows.add(row.rowNumber)
    if (!['HADIR', 'ALPHA', 'CUTI', 'SAKIT', 'IZIN'].includes(row.status)) {
      preliminary.set(
        row.rowNumber,
        'Status wajib diisi HADIR, ALPHA, CUTI, SAKIT, atau IZIN.'
      )
    }
    try {
      assertAttendanceOperationalDate(
        row.businessDate,
        env.ATTENDANCE_GO_LIVE_DATE
      )
      if (row.businessDate > jakartaBusinessDate()) {
        throw new ApiError(
          422,
          'Tanggal Attendance tidak boleh berada di masa depan.'
        )
      }
    } catch (error) {
      preliminary.set(
        row.rowNumber,
        error instanceof ApiError
          ? error.message
          : 'Tanggal Attendance tidak valid.'
      )
    }
    if (row.clockIn && !timePattern.test(row.clockIn)) {
      preliminary.set(row.rowNumber, 'Jam masuk wajib berformat HH:mm.')
    }
    if (row.clockOut && !timePattern.test(row.clockOut)) {
      preliminary.set(row.rowNumber, 'Jam pulang wajib berformat HH:mm.')
    }
    if (row.status === 'HADIR' && !row.clockIn && !row.clockOut) {
      preliminary.set(
        row.rowNumber,
        'Status HADIR wajib memiliki minimal jam masuk atau jam pulang.'
      )
    }
    if (row.status !== 'HADIR' && (row.clockIn || row.clockOut)) {
      preliminary.set(
        row.rowNumber,
        `Jam masuk dan pulang harus kosong untuk status ${row.status}.`
      )
    }
    if (
      ['CUTI', 'SAKIT', 'IZIN'].includes(row.status) &&
      (row.notes?.trim().length ?? 0) < 3
    ) {
      preliminary.set(
        row.rowNumber,
        `Keterangan minimal 3 karakter wajib diisi untuk status ${row.status}.`
      )
    }
    const key = `${row.employeeNumber}|${row.businessDate}`
    const duplicates = duplicateKeys.get(key) ?? []
    duplicates.push(row.rowNumber)
    duplicateKeys.set(key, duplicates)
  }
  for (const duplicate of duplicateKeys.values()) {
    if (duplicate.length < 2) continue
    for (const rowNumber of duplicate) {
      preliminary.set(
        rowNumber,
        'Karyawan dan tanggal yang sama hanya boleh muncul satu kali dalam file.'
      )
    }
  }

  const candidates = rows.filter((row) => !preliminary.has(row.rowNumber))
  if (!candidates.length) {
    return rows.map((input) => ({
      input,
      valid: false,
      message: preliminary.get(input.rowNumber) ?? 'Baris tidak valid.',
      warning: null,
    }))
  }

  await dropAttendanceImportTable(conn)
  await conn.query(
    `CREATE TEMPORARY TABLE tmp_attendance_import_rows(
       import_row_number INT NOT NULL PRIMARY KEY,
       business_date DATE NOT NULL,
       employee_number VARCHAR(50) NOT NULL,
       KEY idx_tmp_attendance_import_employee_date(employee_number,business_date)
     ) ENGINE=InnoDB`
  )
  for (let offset = 0; offset < candidates.length; offset += 250) {
    const chunk = candidates.slice(offset, offset + 250)
    await conn.query(
      `INSERT INTO tmp_attendance_import_rows
         (import_row_number,business_date,employee_number)
       VALUES ${chunk.map(() => '(?,?,?)').join(',')}`,
      chunk.flatMap((row) => [
        row.rowNumber,
        row.businessDate,
        row.employeeNumber,
      ])
    )
  }

  const lockClause = lock ? ' FOR UPDATE' : ''
  const [contextRows] = await conn.query<RowDataPacket[]>(
    `SELECT input.import_row_number rowNumber,
            employee.id employeeId,employee.uid employeeUid,
            employee.employee_number employeeNumber,employee.full_name employeeName,
            history.id historyId,history.site_id siteId,
            status.allows_attendance allowsAttendance,
            site.code site,site.name siteName,site.is_active siteActive,
            assignment.id assignmentId,assignment.work_days_json workDays,
            shift.id shiftId,shift.name shiftName,shift.site_id shiftSiteId,
            TIME_FORMAT(shift.start_time,'%H:%i') startTime,
            TIME_FORMAT(shift.end_time,'%H:%i') endTime,
            shift.crosses_midnight crossesMidnight,
            shift.late_tolerance_minutes lateToleranceMinutes,
            shift.early_leave_tolerance_minutes earlyLeaveToleranceMinutes,
            shift.is_active shiftActive,
            (SELECT COUNT(*) FROM attendance_records record
              WHERE record.employee_id=employee.id
                AND record.business_date=input.business_date) recordCount,
            (SELECT COUNT(*) FROM attendance_classification_requests request
              WHERE request.employee_id=employee.id
                AND request.start_date<=input.business_date
                AND request.end_date>=input.business_date
                AND request.approval_status IN ('PENDING','APPROVED')) classificationCount,
            (SELECT COUNT(*) FROM attendance_daily_finalization_runs run
              WHERE run.site_id=history.site_id
                AND run.business_date=input.business_date) finalizationCount,
            (SELECT COUNT(*) FROM production_transactions transaction
              WHERE transaction.employee_id=employee.id
                AND transaction.site_id=history.site_id
                AND transaction.business_date=input.business_date) productionCount,
            (SELECT COUNT(*) FROM payroll_periods period
              WHERE period.site_id=history.site_id
                AND input.business_date BETWEEN period.period_start AND period.period_end
                AND period.status NOT IN ('DRAFT','CANCELLED')) processedPayrollCount,
            (SELECT COUNT(*) FROM payroll_attendance_summaries summary
              JOIN payroll_employee_results result
                ON result.id=summary.payroll_employee_result_id
              JOIN payroll_periods period ON period.id=result.payroll_period_id
              WHERE period.site_id=history.site_id
                AND result.employee_id=employee.id
                AND input.business_date BETWEEN period.period_start AND period.period_end) payrollSnapshotCount
       FROM tmp_attendance_import_rows input
       LEFT JOIN employees employee
         ON employee.employee_number=input.employee_number
       LEFT JOIN employee_employment_histories history
         ON history.employee_id=employee.id
        AND history.effective_from<=input.business_date
        AND (history.effective_to IS NULL OR history.effective_to>=input.business_date)
       LEFT JOIN employee_statuses status ON status.id=history.employee_status_id
       LEFT JOIN sites site ON site.id=history.site_id
       LEFT JOIN employee_shift_assignments assignment
         ON assignment.employee_id=employee.id
        AND assignment.effective_from<=input.business_date
        AND (assignment.effective_to IS NULL OR assignment.effective_to>=input.business_date)
       LEFT JOIN shifts shift ON shift.id=assignment.shift_id
      ORDER BY input.import_row_number,history.id,assignment.id${lockClause}`
  )
  const [calendarRows] = await conn.query<RowDataPacket[]>(
    `SELECT DISTINCT input.import_row_number rowNumber,
            event.event_type calendarType,event.name,
            event.id eventId,event.uid eventUid,
            NULL siteRuleId,NULL siteRuleUid
       FROM tmp_attendance_import_rows input
       JOIN attendance_calendar_events event
         ON event.event_date=input.business_date
        AND event.event_type='NATIONAL_HOLIDAY'
        AND event.cancelled_at IS NULL
      UNION ALL
     SELECT DISTINCT input.import_row_number rowNumber,
            rule.rule_type calendarType,rule.name,
            rule.calendar_event_id eventId,event.uid eventUid,
            rule.id siteRuleId,rule.uid siteRuleUid
       FROM tmp_attendance_import_rows input
       JOIN employees employee ON employee.employee_number=input.employee_number
       JOIN employee_employment_histories history
         ON history.employee_id=employee.id
        AND history.effective_from<=input.business_date
        AND (history.effective_to IS NULL OR history.effective_to>=input.business_date)
       JOIN attendance_calendar_site_rules rule
         ON rule.site_id=history.site_id
        AND rule.business_date=input.business_date
        AND rule.cancelled_at IS NULL
       LEFT JOIN attendance_calendar_events event
         ON event.id=rule.calendar_event_id`
  )

  const contexts = new Map<number, RowDataPacket[]>()
  for (const row of contextRows) {
    const rowNumber = Number(row.rowNumber)
    const values = contexts.get(rowNumber) ?? []
    values.push(row)
    contexts.set(rowNumber, values)
  }
  const rules = new Map<number, RowDataPacket[]>()
  for (const row of calendarRows) {
    const rowNumber = Number(row.rowNumber)
    const values = rules.get(rowNumber) ?? []
    if (
      !values.some(
        (item) =>
          item.calendarType === row.calendarType &&
          item.eventId === row.eventId &&
          item.siteRuleId === row.siteRuleId
      )
    ) {
      values.push(row)
    }
    rules.set(rowNumber, values)
  }

  return rows.map((input): AttendanceImportValidationRow => {
    try {
      const preliminaryMessage = preliminary.get(input.rowNumber)
      if (preliminaryMessage) throw new ApiError(422, preliminaryMessage)
      const rowContexts = contexts.get(input.rowNumber) ?? []
      const employeeContexts = rowContexts.filter((row) => row.employeeId)
      if (!employeeContexts.length) {
        throw new ApiError(422, 'Nomor karyawan tidak ditemukan.')
      }
      const historyIds = new Set(
        employeeContexts
          .filter((row) => row.historyId)
          .map((row) => Number(row.historyId))
      )
      if (historyIds.size !== 1) {
        throw new ApiError(
          422,
          historyIds.size === 0
            ? 'Histori penempatan karyawan pada tanggal tersebut tidak ditemukan.'
            : 'Histori penempatan karyawan bertumpang-tindih pada tanggal tersebut.'
        )
      }
      const assignmentIds = new Set(
        employeeContexts
          .filter((row) => row.assignmentId)
          .map((row) => Number(row.assignmentId))
      )
      if (assignmentIds.size !== 1) {
        throw new ApiError(
          422,
          assignmentIds.size === 0
            ? 'Penugasan Shift pada tanggal tersebut belum tersedia.'
            : 'Penugasan Shift pada tanggal tersebut bertumpang-tindih.'
        )
      }
      const historyId = [...historyIds][0]
      const assignmentId = [...assignmentIds][0]
      const context = employeeContexts.find(
        (row) =>
          Number(row.historyId) === historyId &&
          Number(row.assignmentId) === assignmentId
      )!
      if (Number(context.allowsAttendance) !== 1) {
        throw new ApiError(
          422,
          'Karyawan tidak eligible untuk Attendance pada tanggal tersebut.'
        )
      }
      if (Number(context.siteActive) !== 1) {
        throw new ApiError(422, 'Site karyawan sedang nonaktif.')
      }
      if (
        !context.shiftId ||
        Number(context.shiftActive) !== 1 ||
        Number(context.shiftSiteId) !== Number(context.siteId)
      ) {
        throw new ApiError(
          422,
          'Shift tidak aktif atau tidak sesuai site karyawan.'
        )
      }
      if (Number(context.recordCount) > 0) {
        throw new ApiError(
          409,
          'Attendance karyawan pada tanggal tersebut sudah tersedia.'
        )
      }
      if (Number(context.classificationCount) > 0) {
        throw new ApiError(
          409,
          'Karyawan sudah memiliki klasifikasi Attendance pada tanggal tersebut.'
        )
      }
      if (Number(context.finalizationCount) > 0) {
        throw new ApiError(
          409,
          'Attendance site pada tanggal tersebut sudah pernah difinalisasi.'
        )
      }
      if (Number(context.productionCount) > 0) {
        throw new ApiError(409, 'Attendance sudah digunakan transaksi Produksi.')
      }
      if (
        Number(context.processedPayrollCount) > 0 ||
        Number(context.payrollSnapshotCount) > 0
      ) {
        throw new ApiError(
          409,
          'Tanggal sudah masuk proses atau snapshot Payroll.'
        )
      }

      const calendar = resolveCalendarDay({
        scheduledByShift: isScheduledWorkday(
          input.businessDate,
          context.workDays
        ),
        rules: (rules.get(input.rowNumber) ?? []).map((rule) => ({
          calendarType: String(rule.calendarType) as
            | 'NATIONAL_HOLIDAY'
            | 'COLLECTIVE_LEAVE'
            | 'SITE_HOLIDAY'
            | 'WORKDAY_OVERRIDE',
          name: String(rule.name),
          eventId: rule.eventId == null ? null : Number(rule.eventId),
          eventUid: rule.eventUid == null ? null : String(rule.eventUid),
          siteRuleId:
            rule.siteRuleId == null ? null : Number(rule.siteRuleId),
          siteRuleUid:
            rule.siteRuleUid == null ? null : String(rule.siteRuleUid),
        })),
      })
      const scheduledStart = dateTime(
        input.businessDate,
        String(context.startTime).slice(0, 5)
      )
      const scheduledEnd = dateTime(
        Number(context.crossesMidnight) === 1
          ? addDays(input.businessDate, 1)
          : input.businessDate,
        String(context.endTime).slice(0, 5)
      )
      const clockInAt = input.clockIn
        ? dateTime(input.businessDate, input.clockIn)
        : null
      const clockOutAt = input.clockOut
        ? dateTime(
            Number(context.crossesMidnight) === 1
              ? addDays(input.businessDate, 1)
              : input.businessDate,
            input.clockOut
          )
        : null
      if (
        clockInAt &&
        clockOutAt &&
        minuteDifference(clockInAt, clockOutAt) < 0
      ) {
        throw new ApiError(
          422,
          'Jam pulang tidak boleh lebih awal dari jam masuk.'
        )
      }
      const lateDifference = clockInAt
        ? Math.max(0, minuteDifference(scheduledStart, clockInAt))
        : 0
      const earlyDifference = clockOutAt
        ? Math.max(0, minuteDifference(clockOutAt, scheduledEnd))
        : 0
      const classification = ['CUTI', 'SAKIT', 'IZIN'].includes(input.status)
      const classificationOutcome = classification
        ? calendar.dayType === 'WORKDAY'
          ? 'APPLIED'
          : calendar.dayType === 'HOLIDAY'
            ? 'SKIPPED_HOLIDAY'
            : 'SKIPPED_NON_WORKDAY'
        : null
      const warning =
        classification && calendar.dayType !== 'WORKDAY'
          ? `Tanggal merupakan ${calendar.dayType === 'HOLIDAY' ? 'hari libur' : 'hari nonkerja'}; klasifikasi disetujui tetapi tidak mengubah status Attendance.`
          : input.status === 'HADIR' && (!clockInAt || !clockOutAt)
            ? 'Jam masuk atau pulang belum lengkap; data akan tersimpan sebagai Attendance abnormal tanpa antrean persetujuan.'
            : calendar.dayType !== 'WORKDAY' && input.status === 'HADIR'
              ? 'Kehadiran akan dicatat pada hari nonkerja/libur.'
              : null
      return {
        input,
        valid: true,
        message: 'Siap diimpor.',
        warning,
        proposal: {
          employeeId: Number(context.employeeId),
          employeeUid: String(context.employeeUid),
          employeeNumber: String(context.employeeNumber),
          employeeName: String(context.employeeName),
          siteId: Number(context.siteId),
          site: String(context.site),
          siteName: String(context.siteName),
          shiftId: Number(context.shiftId),
          shiftAssignmentId: Number(context.assignmentId),
          shiftName: String(context.shiftName),
          attendanceStatus:
            attendanceStatus[input.status as keyof typeof attendanceStatus],
          clockInAt,
          clockOutAt,
          lateMinutes:
            lateDifference > Number(context.lateToleranceMinutes)
              ? lateDifference
              : 0,
          earlyLeaveMinutes:
            earlyDifference > Number(context.earlyLeaveToleranceMinutes)
              ? earlyDifference
              : 0,
          workedMinutes:
            clockInAt && clockOutAt
              ? Math.max(0, minuteDifference(clockInAt, clockOutAt))
              : null,
          calendar: {
            dayType: calendar.dayType,
            reasonType: calendar.reasonType,
            eventId: calendar.eventId,
            siteRuleId: calendar.siteRuleId,
            name: calendar.name,
          },
          classificationOutcome,
        },
      }
    } catch (error) {
      return {
        input,
        valid: false,
        message:
          error instanceof ApiError
            ? error.message
            : 'Baris gagal divalidasi karena gangguan layanan.',
        warning: null,
      }
    }
  })
}
