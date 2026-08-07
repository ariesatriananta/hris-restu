import ExcelJS from 'exceljs'
import type { RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import {
  resolveCalendarDay,
  type CalendarRuleCandidate,
} from './attendance-calendar-policy.js'
import { deriveAttendanceQuality } from './attendance-correction-policy.js'
import { isoWeekday, parseWorkDays } from './attendance-classification-policy.js'
import { jakartaDateTime } from './attendance-finalization-policy.js'
import {
  enumerateRecapDates,
  isOfficialRecapPeriod,
  recapDayName,
  type RecapAttendanceStatus,
} from './attendance-recap-policy.js'

export type AttendanceRecapSite = {
  id: number
  uid: string
  code: string
  name: string
}

export type AttendanceRecapDetail = {
  employeeUid: string
  employeeNumber: string
  employeeName: string
  businessDate: string
  dayName: string
  site: string
  siteName: string
  employeeType: string
  department: string | null
  productionModule: string | null
  productionSection: string | null
  workGroup: string | null
  shiftUid: string | null
  shiftCode: string | null
  shiftName: string | null
  shiftStartTime: string | null
  shiftEndTime: string | null
  status: RecapAttendanceStatus
  virtual: boolean
  calendarDayType: 'WORKDAY' | 'HOLIDAY' | 'NON_WORKDAY'
  calendarReasonType: string
  calendarName: string | null
  clockInAt: string | null
  clockOutAt: string | null
  lateMinutes: number
  earlyLeaveMinutes: number
  workedMinutes: number | null
  clockInSource: string | null
  clockOutSource: string | null
  isCorrected: boolean
  notes: string | null
  qualityStatus: 'NORMAL' | 'ABNORMAL'
  abnormalReasons: string[]
}

export type AttendanceRecapGroup = {
  employeeUid: string
  employeeNumber: string
  employeeName: string
  site: string
  siteName: string
  employeeType: string
  shiftNames: string[]
  scheduledDays: number
  present: number
  presentWorkday: number
  presentHoliday: number
  absent: number
  leave: number
  sick: number
  permission: number
  holiday: number
  weeklyOff: number
  lateDays: number
  lateMinutes: number
  earlyLeaveDays: number
  earlyLeaveMinutes: number
  workedMinutes: number
  abnormal: number
}

export type AttendanceRecapCompletenessSite = {
  site: string
  date: string
  status:
    | 'PRE_GO_LIVE'
    | 'NOT_REQUIRED'
    | 'NOT_STARTED'
    | 'PARTIAL'
    | 'FINALIZED'
    | 'FAILED'
  reasons: string[]
}

export type AttendanceRecapCompleteness = {
  exportAllowed: boolean
  official: boolean
  blockedReasons: string[]
  sites: AttendanceRecapCompletenessSite[]
}

type ProjectionStats = {
  eligible: Set<number>
  resolvedNonWorkday: Set<number>
  unresolved: number
  missingExpected: number
  reasons: Set<string>
}

type Projection = {
  details: AttendanceRecapDetail[]
  completeness: AttendanceRecapCompleteness
}

type RecapFilters = {
  dateFrom: string
  dateTo: string
  goLiveDate: string
  sites: AttendanceRecapSite[]
}

const siteDateKey = (siteId: number, date: string) => `${siteId}:${date}`

function emptyStats(): ProjectionStats {
  return {
    eligible: new Set(),
    resolvedNonWorkday: new Set(),
    unresolved: 0,
    missingExpected: 0,
    reasons: new Set(),
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback
  if (typeof value === 'object') return value as T
  try {
    return JSON.parse(String(value)) as T
  } catch {
    return fallback
  }
}

function toIsoDateTime(value: unknown) {
  return value ? String(value) : null
}

export async function loadAttendanceRecapProjection(
  input: RecapFilters,
  executor: Pool | PoolConnection = pool
): Promise<Projection> {
  const dates = enumerateRecapDates(input.dateFrom, input.dateTo)
  const stats = new Map<string, ProjectionStats>()
  for (const site of input.sites) {
    for (const date of dates) stats.set(siteDateKey(site.id, date), emptyStats())
  }
  if (!input.sites.length) {
    return {
      details: [],
      completeness: {
        exportAllowed: false,
        official: isOfficialRecapPeriod(input.dateFrom, input.goLiveDate),
        blockedReasons: ['Tidak ada site dalam cakupan ekspor.'],
        sites: [],
      },
    }
  }

  const sitePlaceholders = input.sites.map(() => '?').join(',')
  const siteIds = input.sites.map((site) => site.id)
  const dateTableSql = dates
    .map((_, index) =>
      index === 0
        ? 'SELECT CAST(? AS DATE) business_date'
        : 'UNION ALL SELECT CAST(? AS DATE)'
    )
    .join(' ')
  const [rows] = await executor.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(d.business_date,'%Y-%m-%d') businessDate,
            e.id employeeId,e.uid employeeUid,e.employee_number employeeNumber,
            e.full_name employeeName,h.id historyId,h.site_id historySiteId,
            s.code site,s.name siteName,et.code employeeType,
            dep.name department,wg.name workGroup,pm.name productionModule,
            ps.name productionSection,es.allows_attendance allowsAttendance,
            esa.id assignmentId,esa.work_days_json workDays,
            sh.id shiftId,sh.uid shiftUid,sh.code shiftCode,sh.name shiftName,
            TIME_FORMAT(sh.start_time,'%H:%i') shiftStartTime,
            TIME_FORMAT(sh.end_time,'%H:%i') shiftEndTime,
            sh.site_id shiftSiteId,sh.crosses_midnight crossesMidnight,
            (SELECT COUNT(*) FROM employee_employment_histories allh
              WHERE allh.employee_id=e.id AND allh.effective_from<=d.business_date
                AND (allh.effective_to IS NULL OR allh.effective_to>=d.business_date)) employmentCount,
            (SELECT COUNT(*) FROM employee_shift_assignments alla
              WHERE alla.employee_id=e.id AND alla.effective_from<=d.business_date
                AND (alla.effective_to IS NULL OR alla.effective_to>=d.business_date)) assignmentCount,
            ar.uid attendanceUid,ar.site_id attendanceSiteId,
            ar.attendance_status attendanceStatus,ar.calendar_day_type storedDayType,
            ar.calendar_reason_type storedReasonType,
            COALESCE(storedRule.name,ace.name) storedCalendarName,
            DATE_FORMAT(ar.clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00') clockInAt,
            DATE_FORMAT(ar.clock_out_at,'%Y-%m-%dT%H:%i:%s+07:00') clockOutAt,
            ar.late_minutes lateMinutes,ar.early_leave_minutes earlyLeaveMinutes,
            ar.worked_minutes workedMinutes,ar.clock_in_source clockInSource,
            ar.clock_out_source clockOutSource,ar.is_corrected isCorrected,ar.notes,
            DATE_FORMAT(NOW(3),'%Y-%m-%d %H:%i:%s') asOf,
            DATE_FORMAT(CASE WHEN sh.crosses_midnight=1
              THEN DATE_ADD(TIMESTAMP(d.business_date,sh.end_time),INTERVAL 1 DAY)
              ELSE TIMESTAMP(d.business_date,sh.end_time) END,'%Y-%m-%d %H:%i:%s') scheduledEndAt
       FROM (${dateTableSql}) d
       JOIN employee_employment_histories h
         ON h.effective_from<=d.business_date
        AND (h.effective_to IS NULL OR h.effective_to>=d.business_date)
        AND h.site_id IN (${sitePlaceholders})
       JOIN employees e ON e.id=h.employee_id
       JOIN sites s ON s.id=h.site_id
       JOIN employee_types et ON et.id=h.employee_type_id
       JOIN employee_statuses es ON es.id=h.employee_status_id
       LEFT JOIN departments dep ON dep.id=h.department_id
       LEFT JOIN work_groups wg ON wg.id=h.work_group_id
       LEFT JOIN production_module_sections pms ON pms.id=h.production_module_section_id
       LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
       LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
       LEFT JOIN employee_shift_assignments esa
         ON esa.employee_id=e.id AND esa.effective_from<=d.business_date
        AND (esa.effective_to IS NULL OR esa.effective_to>=d.business_date)
       LEFT JOIN shifts sh ON sh.id=esa.shift_id
       LEFT JOIN attendance_records ar
         ON ar.employee_id=e.id AND ar.business_date=d.business_date
       LEFT JOIN attendance_calendar_events ace ON ace.id=ar.calendar_event_id
       LEFT JOIN attendance_calendar_site_rules storedRule
         ON storedRule.id=ar.calendar_site_rule_id
      ORDER BY d.business_date,e.id,h.id,esa.id`,
    [...dates, ...siteIds]
  )

  const rules = new Map<string, CalendarRuleCandidate[]>()
  const [calendarRows] = await executor.query<RowDataPacket[]>(
    `SELECT NULL siteId,DATE_FORMAT(ace.event_date,'%Y-%m-%d') businessDate,
            ace.id eventId,ace.uid eventUid,NULL siteRuleId,NULL siteRuleUid,
            ace.event_type calendarType,ace.name
       FROM attendance_calendar_events ace
      WHERE ace.cancelled_at IS NULL AND ace.event_type='NATIONAL_HOLIDAY'
        AND ace.event_date BETWEEN ? AND ?
     UNION ALL
     SELECT acsr.site_id siteId,DATE_FORMAT(acsr.business_date,'%Y-%m-%d') businessDate,
            ace.id eventId,ace.uid eventUid,acsr.id siteRuleId,acsr.uid siteRuleUid,
            acsr.rule_type calendarType,acsr.name
       FROM attendance_calendar_site_rules acsr
       LEFT JOIN attendance_calendar_events ace ON ace.id=acsr.calendar_event_id
      WHERE acsr.cancelled_at IS NULL
        AND (ace.id IS NULL OR ace.cancelled_at IS NULL)
        AND acsr.site_id IN (${sitePlaceholders})
        AND acsr.business_date BETWEEN ? AND ?`,
    [input.dateFrom, input.dateTo, ...siteIds, input.dateFrom, input.dateTo]
  )
  for (const calendarRow of calendarRows) {
    const targetSites = calendarRow.siteId
      ? [Number(calendarRow.siteId)]
      : siteIds
    for (const targetSite of targetSites) {
      const key = siteDateKey(targetSite, String(calendarRow.businessDate))
      const current = rules.get(key) ?? []
      current.push({
        calendarType: String(calendarRow.calendarType) as CalendarRuleCandidate['calendarType'],
        name: String(calendarRow.name),
        eventId: calendarRow.eventId === null ? null : Number(calendarRow.eventId),
        eventUid: calendarRow.eventUid ? String(calendarRow.eventUid) : null,
        siteRuleId:
          calendarRow.siteRuleId === null ? null : Number(calendarRow.siteRuleId),
        siteRuleUid: calendarRow.siteRuleUid
          ? String(calendarRow.siteRuleUid)
          : null,
      })
      rules.set(key, current)
    }
  }

  const grouped = new Map<string, RowDataPacket[]>()
  for (const row of rows) {
    const key = `${row.employeeId}:${row.businessDate}`
    const current = grouped.get(key) ?? []
    current.push(row)
    grouped.set(key, current)
  }

  const details: AttendanceRecapDetail[] = []
  for (const employeeRows of grouped.values()) {
    const row = employeeRows[0]
    const date = String(row.businessDate)
    if (Number(row.employmentCount) !== 1) {
      for (const historySiteId of [
        ...new Set(employeeRows.map((item) => Number(item.historySiteId))),
      ]) {
        const overlapStat = stats.get(siteDateKey(historySiteId, date))
        if (!overlapStat) continue
        overlapStat.unresolved += 1
        overlapStat.reasons.add('Histori employment tumpang tindih.')
      }
      continue
    }
    const stat = stats.get(siteDateKey(Number(row.historySiteId), date))
    if (!stat) continue
    if (Number(row.allowsAttendance) !== 1) continue
    const employeeId = Number(row.employeeId)
    stat.eligible.add(employeeId)
    if (
      Number(row.assignmentCount) !== 1 ||
      !row.assignmentId ||
      Number(row.shiftSiteId) !== Number(row.historySiteId) ||
      parseWorkDays(row.workDays).length === 0
    ) {
      stat.unresolved += 1
      stat.reasons.add(
        Number(row.assignmentCount) > 1
          ? 'Assignment Shift tumpang tindih.'
          : 'Assignment Shift efektif tidak lengkap atau tidak sesuai site.'
      )
      continue
    }
    const calendar = resolveCalendarDay({
      scheduledByShift: parseWorkDays(row.workDays).includes(isoWeekday(date)),
      rules: rules.get(siteDateKey(Number(row.historySiteId), date)) ?? [],
    })
    if (
      calendar.dayType === 'NON_WORKDAY' &&
      calendar.reasonType === 'WEEKLY_OFF'
    ) {
      stat.resolvedNonWorkday.add(employeeId)
    }
    if (
      row.attendanceSiteId !== null &&
      Number(row.attendanceSiteId) !== Number(row.historySiteId)
    ) {
      stat.unresolved += 1
      stat.reasons.add('Site Attendance berbeda dari histori employment.')
      continue
    }
    if (!row.attendanceUid) {
      if (
        calendar.dayType === 'NON_WORKDAY' &&
        calendar.reasonType === 'WEEKLY_OFF'
      ) {
        details.push(
          mapDetail(row, {
            status: 'WEEKLY_OFF',
            virtual: true,
            dayType: calendar.dayType,
            reasonType: calendar.reasonType,
            calendarName: calendar.name,
          })
        )
      } else {
        stat.missingExpected += 1
        stat.reasons.add('Record Attendance yang diwajibkan belum tersedia.')
      }
      continue
    }
    details.push(
      mapDetail(row, {
        status: String(row.attendanceStatus) as RecapAttendanceStatus,
        virtual: false,
        dayType: (row.storedDayType ?? calendar.dayType) as
          | 'WORKDAY'
          | 'HOLIDAY'
          | 'NON_WORKDAY',
        reasonType: String(row.storedReasonType ?? calendar.reasonType),
        calendarName: row.storedCalendarName ?? calendar.name,
      })
    )
  }

  const pending = await loadPendingWorkflows(
    { ...input, dates, siteIds, sitePlaceholders },
    executor
  )
  for (const item of pending) {
    const stat = stats.get(siteDateKey(item.siteId, item.date))
    stat?.reasons.add(item.reason)
  }

  const [runRows] = await executor.query<RowDataPacket[]>(
    `SELECT r.site_id siteId,DATE_FORMAT(r.business_date,'%Y-%m-%d') businessDate,
            r.status,r.summary
       FROM attendance_daily_finalization_runs r
      WHERE r.site_id IN (${sitePlaceholders}) AND r.business_date BETWEEN ? AND ?
        AND r.id=(SELECT MAX(latest.id) FROM attendance_daily_finalization_runs latest
                   WHERE latest.site_id=r.site_id AND latest.business_date=r.business_date)`,
    [...siteIds, input.dateFrom, input.dateTo]
  )
  const runs = new Map(
    runRows.map((run) => [siteDateKey(Number(run.siteId), String(run.businessDate)), run])
  )
  const completenessSites: AttendanceRecapCompletenessSite[] = []
  const today = jakartaDateTime().slice(0, 10)
  for (const site of input.sites) {
    for (const date of dates) {
      const key = siteDateKey(site.id, date)
      const current = stats.get(key) ?? emptyStats()
      const reasons = [...current.reasons]
      let status: AttendanceRecapCompletenessSite['status']
      const required = !(
        current.reasons.size === 0 &&
        current.unresolved === 0 &&
        current.resolvedNonWorkday.size === current.eligible.size
      )
      if (date > today) {
        status = 'NOT_STARTED'
        reasons.push('Tanggal masa depan belum dapat menjadi rekap resmi.')
      } else if (date < input.goLiveDate) {
        status = 'PRE_GO_LIVE'
        reasons.push('Tanggal sebelum go-live finalisasi Attendance.')
      } else if (!required) {
        status = 'NOT_REQUIRED'
      } else {
        const run = runs.get(key)
        const counts = parseJson<Record<string, number>>(run?.summary, {})
        const savedBlockers =
          Number(counts.pendingDue ?? 0) +
          Number(counts.missingAssignment ?? 0) +
          Number(counts.ambiguousAssignment ?? 0) +
          Number(counts.ambiguousEmployment ?? 0)
        if (run?.status === 'FAILED') status = 'FAILED'
        else if (
          run?.status === 'SUCCEEDED' &&
          savedBlockers === 0 &&
          current.unresolved === 0 &&
          current.missingExpected === 0 &&
          reasons.length === 0
        ) {
          status = 'FINALIZED'
        } else if (run) status = 'PARTIAL'
        else status = 'NOT_STARTED'
      }
      completenessSites.push({ site: site.code, date, status, reasons: [...new Set(reasons)] })
    }
  }
  const blockedReasons = [
    ...new Set(
      completenessSites.flatMap((item) =>
        item.status === 'FINALIZED' || item.status === 'NOT_REQUIRED'
          ? []
          : item.reasons.length
            ? item.reasons
            : [`${item.site} ${item.date} belum final.`]
      )
    ),
  ]
  const official = isOfficialRecapPeriod(input.dateFrom, input.goLiveDate)
  return {
    details: details.sort(
      (a, b) =>
        a.employeeName.localeCompare(b.employeeName, 'id') ||
        a.businessDate.localeCompare(b.businessDate)
    ),
    completeness: {
      official,
      exportAllowed: official && blockedReasons.length === 0,
      blockedReasons,
      sites: completenessSites,
    },
  }
}

function mapDetail(
  row: RowDataPacket,
  resolved: {
    status: RecapAttendanceStatus
    virtual: boolean
    dayType: 'WORKDAY' | 'HOLIDAY' | 'NON_WORKDAY'
    reasonType: string
    calendarName: string | null
  }
): AttendanceRecapDetail {
  const quality = resolved.virtual
    ? { qualityStatus: 'NORMAL' as const, abnormalReasons: [] as string[] }
    : deriveAttendanceQuality({
        attendanceStatus: resolved.status,
        clockInAt: row.clockInAt,
        clockOutAt: row.clockOutAt,
        scheduledEndAt: row.scheduledEndAt,
        asOf: row.asOf,
      })
  return {
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    businessDate: String(row.businessDate),
    dayName: recapDayName(String(row.businessDate)),
    site: String(row.site),
    siteName: String(row.siteName),
    employeeType: String(row.employeeType),
    department: row.department ? String(row.department) : null,
    productionModule: row.productionModule ? String(row.productionModule) : null,
    productionSection: row.productionSection ? String(row.productionSection) : null,
    workGroup: row.workGroup ? String(row.workGroup) : null,
    shiftUid: row.shiftUid ? String(row.shiftUid) : null,
    shiftCode: row.shiftCode ? String(row.shiftCode) : null,
    shiftName: row.shiftName ? String(row.shiftName) : null,
    shiftStartTime: row.shiftStartTime ? String(row.shiftStartTime) : null,
    shiftEndTime: row.shiftEndTime ? String(row.shiftEndTime) : null,
    status: resolved.status,
    virtual: resolved.virtual,
    calendarDayType: resolved.dayType,
    calendarReasonType: resolved.reasonType,
    calendarName: resolved.calendarName,
    clockInAt: toIsoDateTime(row.clockInAt),
    clockOutAt: toIsoDateTime(row.clockOutAt),
    lateMinutes: Number(row.lateMinutes ?? 0),
    earlyLeaveMinutes: Number(row.earlyLeaveMinutes ?? 0),
    workedMinutes: row.workedMinutes === null ? null : Number(row.workedMinutes),
    clockInSource: row.clockInSource ? String(row.clockInSource) : null,
    clockOutSource: row.clockOutSource ? String(row.clockOutSource) : null,
    isCorrected: Number(row.isCorrected ?? 0) === 1,
    notes: row.notes ? String(row.notes) : null,
    qualityStatus: quality.qualityStatus,
    abnormalReasons: quality.abnormalReasons,
  }
}

async function loadPendingWorkflows(
  input: RecapFilters & {
    dates: string[]
    siteIds: number[]
    sitePlaceholders: string
  },
  executor: Pool | PoolConnection
) {
  const [corrections] = await executor.query<RowDataPacket[]>(
    `SELECT ar.site_id siteId,DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate
       FROM attendance_corrections ac
       JOIN attendance_records ar ON ar.id=ac.attendance_record_id
      WHERE ac.approval_status='PENDING' AND ar.site_id IN (${input.sitePlaceholders})
        AND ar.business_date BETWEEN ? AND ?`,
    [...input.siteIds, input.dateFrom, input.dateTo]
  )
  const [classifications] = await executor.query<RowDataPacket[]>(
    `SELECT site_id siteId,DATE_FORMAT(start_date,'%Y-%m-%d') startDate,
            DATE_FORMAT(end_date,'%Y-%m-%d') endDate
       FROM attendance_classification_requests
      WHERE approval_status='PENDING' AND site_id IN (${input.sitePlaceholders})
        AND start_date<=? AND end_date>=?`,
    [...input.siteIds, input.dateTo, input.dateFrom]
  )
  return [
    ...corrections.map((row) => ({
      siteId: Number(row.siteId),
      date: String(row.businessDate),
      reason: 'Masih ada koreksi Attendance yang menunggu keputusan.',
    })),
    ...classifications.flatMap((row) =>
      input.dates
        .filter((date) => date >= row.startDate && date <= row.endDate)
        .map((date) => ({
          siteId: Number(row.siteId),
          date,
          reason: 'Masih ada klasifikasi Attendance yang menunggu keputusan.',
        }))
    ),
  ]
}

export function summarizeAttendanceRecap(details: AttendanceRecapDetail[]) {
  const groups = new Map<string, AttendanceRecapGroup>()
  for (const detail of details) {
    const key = `${detail.employeeUid}:${detail.site}:${detail.employeeType}`
    let group = groups.get(key)
    if (!group) {
      group = {
        employeeUid: detail.employeeUid,
        employeeNumber: detail.employeeNumber,
        employeeName: detail.employeeName,
        site: detail.site,
        siteName: detail.siteName,
        employeeType: detail.employeeType,
        shiftNames: [],
        scheduledDays: 0,
        present: 0,
        presentWorkday: 0,
        presentHoliday: 0,
        absent: 0,
        leave: 0,
        sick: 0,
        permission: 0,
        holiday: 0,
        weeklyOff: 0,
        lateDays: 0,
        lateMinutes: 0,
        earlyLeaveDays: 0,
        earlyLeaveMinutes: 0,
        workedMinutes: 0,
        abnormal: 0,
      }
      groups.set(key, group)
    }
    if (detail.shiftName && !group.shiftNames.includes(detail.shiftName)) {
      group.shiftNames.push(detail.shiftName)
    }
    if (detail.calendarDayType === 'WORKDAY') group.scheduledDays += 1
    if (detail.status === 'PRESENT') {
      group.present += 1
      if (detail.calendarDayType === 'WORKDAY') group.presentWorkday += 1
      else group.presentHoliday += 1
    }
    if (detail.status === 'ABSENT') group.absent += 1
    if (detail.status === 'LEAVE') group.leave += 1
    if (detail.status === 'SICK') group.sick += 1
    if (detail.status === 'PERMISSION') group.permission += 1
    if (detail.status === 'HOLIDAY') group.holiday += 1
    if (detail.status === 'WEEKLY_OFF') group.weeklyOff += 1
    if (detail.lateMinutes > 0) group.lateDays += 1
    if (detail.earlyLeaveMinutes > 0) group.earlyLeaveDays += 1
    group.lateMinutes += detail.lateMinutes
    group.earlyLeaveMinutes += detail.earlyLeaveMinutes
    group.workedMinutes += detail.workedMinutes ?? 0
    if (detail.qualityStatus === 'ABNORMAL') group.abnormal += 1
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.employeeName.localeCompare(b.employeeName, 'id') ||
      a.site.localeCompare(b.site) ||
      a.employeeType.localeCompare(b.employeeType)
  )
}

export function aggregateAttendanceRecap(groups: AttendanceRecapGroup[]) {
  const numericKeys = [
    'scheduledDays',
    'present',
    'presentWorkday',
    'presentHoliday',
    'absent',
    'leave',
    'sick',
    'permission',
    'holiday',
    'weeklyOff',
    'lateDays',
    'lateMinutes',
    'earlyLeaveDays',
    'earlyLeaveMinutes',
    'workedMinutes',
    'abnormal',
  ] as const
  const summary = Object.fromEntries(numericKeys.map((key) => [key, 0])) as Record<
    (typeof numericKeys)[number],
    number
  >
  for (const group of groups) {
    for (const key of numericKeys) summary[key] += group[key]
  }
  return { groups: groups.length, ...summary }
}

const statusLabels: Record<RecapAttendanceStatus, string> = {
  PRESENT: 'Hadir',
  ABSENT: 'Alpha',
  LEAVE: 'Cuti',
  SICK: 'Sakit',
  PERMISSION: 'Izin',
  HOLIDAY: 'Libur Resmi',
  WEEKLY_OFF: 'Libur Mingguan',
}

export async function buildAttendanceRecapWorkbook(input: {
  groups: AttendanceRecapGroup[]
  details: AttendanceRecapDetail[]
  completeness: AttendanceRecapCompleteness
  dateFrom: string
  dateTo: string
  generatedAt: string
  generatedBy: string
  filters: Record<string, unknown>
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'HRIS RSIA'
  workbook.created = new Date(input.generatedAt)
  const summary = workbook.addWorksheet('Ringkasan')
  const summaryHeaders = [
    'No', 'NIK', 'Nama', 'Site', 'Jenis Karyawan', 'Shift', 'Hari Terjadwal',
    'Hadir', 'Hadir Hari Kerja', 'Hadir Hari Libur', 'Alpha', 'Cuti', 'Sakit',
    'Izin', 'Libur Resmi', 'Libur Mingguan',
    'Hari Terlambat', 'Menit Terlambat', 'Hari Pulang Cepat',
    'Menit Pulang Cepat', 'Menit Kerja', 'Anomali',
  ]
  summary.addRow(summaryHeaders)
  input.groups.forEach((group, index) =>
    summary.addRow([
      index + 1, group.employeeNumber, group.employeeName, group.siteName,
      group.employeeType, group.shiftNames.join(', '), group.scheduledDays,
      group.present, group.presentWorkday, group.presentHoliday, group.absent,
      group.leave, group.sick, group.permission,
      group.holiday, group.weeklyOff, group.lateDays, group.lateMinutes,
      group.earlyLeaveDays, group.earlyLeaveMinutes, group.workedMinutes,
      group.abnormal,
    ])
  )

  const detail = workbook.addWorksheet('Detail Harian')
  const detailHeaders = [
    'Tanggal', 'Hari', 'NIK', 'Nama', 'Site Historis',
    'Jenis Karyawan Historis', 'Departemen', 'Modul', 'Bagian', 'Grup Kerja',
    'Kode Shift', 'Nama Shift', 'Jam Shift Masuk', 'Jam Shift Pulang',
    'Status', 'Jenis Hari', 'Alasan Kalender', 'Nama Kalender', 'Jam Masuk',
    'Jam Pulang', 'Menit Terlambat', 'Menit Pulang Cepat', 'Menit Kerja',
    'Sumber Masuk', 'Sumber Pulang', 'Dikoreksi', 'Virtual', 'Catatan',
  ]
  detail.addRow(detailHeaders)
  input.details.forEach((row) =>
    detail.addRow([
      row.businessDate, row.dayName, row.employeeNumber, row.employeeName,
      row.siteName, row.employeeType, row.department ?? '',
      row.productionModule ?? '', row.productionSection ?? '', row.workGroup ?? '',
      row.shiftCode ?? '', row.shiftName ?? '', row.shiftStartTime ?? '',
      row.shiftEndTime ?? '', statusLabels[row.status], row.calendarDayType,
      row.calendarReasonType, row.calendarName ?? '', row.clockInAt ?? '',
      row.clockOutAt ?? '', row.lateMinutes, row.earlyLeaveMinutes,
      row.workedMinutes ?? '', row.clockInSource ?? '', row.clockOutSource ?? '',
      row.isCorrected ? 'Ya' : 'Tidak', row.virtual ? 'Ya' : 'Tidak', row.notes ?? '',
    ])
  )

  const metadata = workbook.addWorksheet('Metadata Export')
  metadata.addRows([
    ['Field', 'Nilai'],
    ['Periode Mulai', input.dateFrom],
    ['Periode Selesai', input.dateTo],
    ['Timezone', 'Asia/Jakarta'],
    ['Waktu Ekspor', input.generatedAt],
    ['Diekspor Oleh', input.generatedBy],
    ['Status Resmi', input.completeness.official ? 'Ya' : 'Tidak'],
    ['Ekspor Diizinkan', input.completeness.exportAllowed ? 'Ya' : 'Tidak'],
    ['Jumlah Ringkasan', input.groups.length],
    ['Jumlah Detail', input.details.length],
    ['Jumlah Libur Mingguan Virtual', input.details.filter((row) => row.virtual).length],
    ['Filter', JSON.stringify(input.filters)],
    ['Alasan Blokir', input.completeness.blockedReasons.join(' | ')],
    [],
    ['Site', 'Tanggal', 'Status', 'Alasan'],
    ...input.completeness.sites.map((item) => [
      item.site,
      item.date,
      item.status,
      item.reasons.join(' | '),
    ]),
  ])
  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.getRow(1).font = { bold: true }
    sheet.columns.forEach((column) => {
      const values = column.values ?? []
      column.width = Math.min(
        40,
        Math.max(
          12,
          ...values.slice(1).map((value) => String(value ?? '').length + 2)
        )
      )
    })
    sheet.autoFilter = {
      from: 'A1',
      to: sheet.getCell(1, sheet.columnCount).address,
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
