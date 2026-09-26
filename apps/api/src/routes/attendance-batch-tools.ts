import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { env } from '../config.js'
import { pool } from '../db.js'
import {
  attendanceBatchDeleteInput,
  attendanceBatchDeleteSummaryInput,
  attendanceBatchInputPreviewInput,
  attendanceBatchInputRunInput,
  attendanceImportPreviewInput,
  attendanceImportRunInput,
  type AttendanceBatchMode,
  type AttendanceBatchSite,
} from '../lib/attendance-batch-policy.js'
import { assertAttendanceOperationalDate } from '../lib/attendance-operational-policy.js'
import { jakartaBusinessDate } from '../lib/attendance-shift-policy.js'
import { writeAudit } from '../lib/audit.js'
import {
  attendanceImportRowDto,
  dropAttendanceImportTable,
  validateAttendanceImportRows,
  type AttendanceImportValidationRow,
} from '../lib/attendance-import.js'
import { ApiError } from '../lib/errors.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

type Executor = Pool | PoolConnection

type InputCandidateRow = RowDataPacket & {
  employeeId: number
  siteId: number
  site: string
  siteName: string
  siteActive: number
  employmentCount: number
  assignmentCount: number
  validAssignmentCount: number
  deviceId: number | null
}

type InputPreview = {
  businessDate: string
  site: AttendanceBatchSite
  mode: AttendanceBatchMode
  eligibleEmployeeCount: number
  siteCount: number
  canCreate: boolean
  blockers: string[]
  sites: Array<{
    site: string
    siteName: string
    eligibleEmployeeCount: number
    hasReadyDevice: boolean
  }>
}

type DeleteSummaryRow = {
  businessDate: string
  siteCount: number
  employeeCount: number
  recordCount: number
  scanEventCount: number
  correctionCount: number
  classificationCount: number
  finalizationCount: number
  canDelete: boolean
  blockers: string[]
}

function assertBatchAccess(auth: AuthContext) {
  if (!env.ATTENDANCE_BATCH_TOOLS_ENABLED) {
    throw new ApiError(
      404,
      'Fitur batch Attendance tidak diaktifkan pada environment ini.'
    )
  }
  if (!auth.roles.includes('SUPER_ADMIN')) {
    throw new ApiError(
      403,
      'Aksi batch Attendance hanya dapat dilakukan Super Admin.'
    )
  }
}

function siteSql(alias: string, site: AttendanceBatchSite) {
  return site === 'ALL' ? '' : ` AND ${alias}.code='${site}'`
}

function parseAuditJson(value: unknown) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function assertAllowedDate(businessDate: string) {
  assertAttendanceOperationalDate(businessDate, env.ATTENDANCE_GO_LIVE_DATE)
  if (businessDate > jakartaBusinessDate()) {
    throw new ApiError(422, 'Tanggal Attendance tidak boleh berada di masa depan.')
  }
}

function rangeDates(dateFrom: string, dateTo: string) {
  const start = Date.parse(`${dateFrom}T00:00:00Z`)
  const end = Date.parse(`${dateTo}T00:00:00Z`)
  const days = Math.floor((end - start) / 86_400_000) + 1
  if (days < 1) {
    throw new ApiError(422, 'Tanggal akhir tidak boleh sebelum tanggal awal.')
  }
  if (days > 31) {
    throw new ApiError(422, 'Ringkasan hapus maksimal untuk 31 hari.')
  }
  return Array.from({ length: days }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10)
  )
}

export async function attendanceInputPreview(
  executor: Executor,
  businessDate: string,
  site: AttendanceBatchSite,
  mode: AttendanceBatchMode
): Promise<InputPreview> {
  assertAllowedDate(businessDate)
  const siteFilter = siteSql('site', site)
  const [candidateRows] = await executor.query<InputCandidateRow[]>(
    `SELECT eh.employee_id employeeId,site.id siteId,site.code site,
            site.name siteName,site.is_active siteActive,
            (SELECT COUNT(*) FROM employee_employment_histories current_history
              WHERE current_history.employee_id=eh.employee_id
                AND current_history.effective_from<=?
                AND (current_history.effective_to IS NULL OR current_history.effective_to>=?)) employmentCount,
            (SELECT COUNT(*) FROM employee_shift_assignments assignment
              WHERE assignment.employee_id=eh.employee_id
                AND assignment.effective_from<=?
                AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)) assignmentCount,
            (SELECT COUNT(*) FROM employee_shift_assignments assignment
               JOIN shifts shift ON shift.id=assignment.shift_id
              WHERE assignment.employee_id=eh.employee_id
                AND assignment.effective_from<=?
                AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
                AND shift.is_active=1 AND shift.site_id=eh.site_id
                AND JSON_LENGTH(COALESCE(assignment.work_days_json,JSON_ARRAY()))>0) validAssignmentCount,
            (SELECT MIN(device.id) FROM scan_devices device
              WHERE device.site_id=eh.site_id AND device.is_active=1
                AND device.activated_at IS NOT NULL) deviceId
       FROM employee_employment_histories eh
       JOIN employee_statuses status
         ON status.id=eh.employee_status_id AND status.allows_attendance=1
       JOIN sites site ON site.id=eh.site_id
      WHERE eh.effective_from<=?
        AND (eh.effective_to IS NULL OR eh.effective_to>=?)${siteFilter}`,
    Array(8).fill(businessDate)
  )

  const uniqueEmployees = new Set<number>()
  const siteMap = new Map<
    number,
    {
      site: string
      siteName: string
      employeeIds: Set<number>
      hasReadyDevice: boolean
    }
  >()
  for (const row of candidateRows) {
    uniqueEmployees.add(Number(row.employeeId))
    const siteItem = siteMap.get(Number(row.siteId)) ?? {
      site: String(row.site),
      siteName: String(row.siteName),
      employeeIds: new Set<number>(),
      hasReadyDevice: row.deviceId != null,
    }
    siteItem.employeeIds.add(Number(row.employeeId))
    siteItem.hasReadyDevice = siteItem.hasReadyDevice && row.deviceId != null
    siteMap.set(Number(row.siteId), siteItem)
  }

  const blockers: string[] = []
  if (!candidateRows.length) {
    blockers.push('Tidak ada karyawan eligible pada tanggal dan site terpilih.')
  }
  if (candidateRows.some((row) => Number(row.siteActive) !== 1)) {
    blockers.push('Ada karyawan eligible pada site yang sedang nonaktif.')
  }
  if (candidateRows.some((row) => Number(row.employmentCount) !== 1)) {
    blockers.push('Ada histori employment efektif yang tumpang tindih.')
  }
  if (
    candidateRows.some(
      (row) =>
        Number(row.assignmentCount) !== 1 ||
        Number(row.validAssignmentCount) !== 1
    )
  ) {
    blockers.push(
      'Ada penugasan shift yang hilang, ambigu, nonaktif, berbeda site, atau tanpa hari kerja.'
    )
  }
  if (candidateRows.some((row) => row.deviceId == null)) {
    blockers.push('Setiap site terpilih wajib memiliki perangkat Attendance aktif dan teraktivasi.')
  }

  const [facts] = await executor.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM attendance_records record
         JOIN sites site ON site.id=record.site_id
        WHERE record.business_date=?${siteFilter}) recordCount,
       (SELECT COUNT(*) FROM attendance_daily_finalization_runs run
         JOIN sites site ON site.id=run.site_id
        WHERE run.business_date=?${siteFilter}) finalizationCount,
       (SELECT COUNT(*) FROM attendance_classification_requests request
         JOIN sites site ON site.id=request.site_id
        WHERE request.start_date<=? AND request.end_date>=?${siteFilter}) classificationCount,
       (SELECT COUNT(*) FROM attendance_scan_events scan
         JOIN sites site ON site.id=scan.site_id
        WHERE scan.attendance_record_id IS NULL AND DATE(scan.scanned_at)=?${siteFilter}) orphanScanCount,
       (SELECT COUNT(*) FROM production_transactions transaction
         JOIN sites site ON site.id=transaction.site_id
        WHERE transaction.business_date=?${siteFilter}) productionCount,
       (SELECT COUNT(*) FROM payroll_periods period
         JOIN sites site ON site.id=period.site_id
        WHERE ? BETWEEN period.period_start AND period.period_end
          AND period.status NOT IN ('DRAFT','CANCELLED')${siteFilter}) processedPayrollCount,
       (SELECT COUNT(*) FROM payroll_attendance_summaries summary
         JOIN payroll_employee_results result ON result.id=summary.payroll_employee_result_id
         JOIN payroll_periods period ON period.id=result.payroll_period_id
         JOIN sites site ON site.id=period.site_id
        WHERE ? BETWEEN period.period_start AND period.period_end${siteFilter}) payrollSnapshotCount`,
    [
      businessDate,
      businessDate,
      businessDate,
      businessDate,
      businessDate,
      businessDate,
      businessDate,
      businessDate,
    ]
  )
  const fact = facts[0]
  if (
    Number(fact.recordCount) > 0 ||
    Number(fact.finalizationCount) > 0 ||
    Number(fact.classificationCount) > 0 ||
    Number(fact.orphanScanCount) > 0
  ) {
    blockers.push('Tanggal belum bersih. Hapus data Attendance tanggal tersebut terlebih dahulu.')
  }
  if (Number(fact.productionCount) > 0) {
    blockers.push('Tanggal sudah dipakai transaksi Produksi.')
  }
  if (
    Number(fact.processedPayrollCount) > 0 ||
    Number(fact.payrollSnapshotCount) > 0
  ) {
    blockers.push('Tanggal sudah masuk proses atau snapshot Payroll.')
  }

  return {
    businessDate,
    site,
    mode,
    eligibleEmployeeCount: uniqueEmployees.size,
    siteCount: siteMap.size,
    canCreate: blockers.length === 0,
    blockers,
    sites: [...siteMap.values()]
      .map((item) => ({
        site: item.site,
        siteName: item.siteName,
        eligibleEmployeeCount: item.employeeIds.size,
        hasReadyDevice: item.hasReadyDevice,
      }))
      .sort((left, right) => left.site.localeCompare(right.site)),
  }
}

async function dropInputTemporaryTables(conn: PoolConnection) {
  await conn.query('DROP TEMPORARY TABLE IF EXISTS tmp_attendance_batch_scenarios')
  await conn.query('DROP TEMPORARY TABLE IF EXISTS tmp_attendance_batch_sites')
  await conn.query('DROP TEMPORARY TABLE IF EXISTS tmp_attendance_batch_employees')
}

async function createInputTemporaryTables(
  conn: PoolConnection,
  businessDate: string,
  site: AttendanceBatchSite,
  mode: AttendanceBatchMode
) {
  const siteFilter = siteSql('site', site)
  await dropInputTemporaryTables(conn)
  await conn.query(
    `CREATE TEMPORARY TABLE tmp_attendance_batch_employees AS
     SELECT employee.id employee_id,employee.uid employee_uid,
            employee.employee_number,history.site_id,
            assignment.id shift_assignment_id,assignment.work_days_json,
            shift.id shift_id,shift.start_time,shift.end_time,
            shift.crosses_midnight,shift.late_tolerance_minutes,
            shift.early_leave_tolerance_minutes
       FROM employees employee
       JOIN employee_employment_histories history
         ON history.employee_id=employee.id
        AND history.effective_from<=?
        AND (history.effective_to IS NULL OR history.effective_to>=?)
       JOIN employee_statuses status
         ON status.id=history.employee_status_id AND status.allows_attendance=1
       JOIN sites site ON site.id=history.site_id AND site.is_active=1
       JOIN employee_shift_assignments assignment
         ON assignment.employee_id=employee.id
        AND assignment.effective_from<=?
        AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
       JOIN shifts shift
         ON shift.id=assignment.shift_id AND shift.site_id=history.site_id
        AND shift.is_active=1
      WHERE JSON_LENGTH(COALESCE(assignment.work_days_json,JSON_ARRAY()))>0${siteFilter}`,
    [businessDate, businessDate, businessDate, businessDate]
  )
  await conn.query(
    `ALTER TABLE tmp_attendance_batch_employees
       ADD PRIMARY KEY (employee_id),ADD KEY idx_tmp_attendance_batch_employee_site (site_id)`
  )
  await conn.query(
    `CREATE TEMPORARY TABLE tmp_attendance_batch_sites AS
     SELECT DISTINCT site.id site_id,site.code site_code,
            (SELECT MIN(device.id) FROM scan_devices device
              WHERE device.site_id=site.id AND device.is_active=1
                AND device.activated_at IS NOT NULL) device_id,
            CAST(NULL AS CHAR(20)) forced_day_type,
            CAST(NULL AS CHAR(30)) forced_reason_type,
            CAST(NULL AS UNSIGNED) calendar_event_id,
            CAST(NULL AS UNSIGNED) calendar_site_rule_id
       FROM sites site
       JOIN tmp_attendance_batch_employees employee ON employee.site_id=site.id`
  )
  await conn.query('ALTER TABLE tmp_attendance_batch_sites ADD PRIMARY KEY (site_id)')

  await conn.execute(
    `UPDATE tmp_attendance_batch_sites target
       JOIN attendance_calendar_events event
         ON event.event_date=? AND event.event_type='NATIONAL_HOLIDAY'
        AND event.cancelled_at IS NULL
        SET target.forced_day_type='HOLIDAY',
            target.forced_reason_type='NATIONAL_HOLIDAY',
            target.calendar_event_id=event.id,target.calendar_site_rule_id=NULL`,
    [businessDate]
  )
  for (const [ruleType, dayType] of [
    ['COLLECTIVE_LEAVE', 'HOLIDAY'],
    ['SITE_HOLIDAY', 'HOLIDAY'],
    ['WORKDAY_OVERRIDE', 'WORKDAY'],
  ] as const) {
    await conn.execute(
      `UPDATE tmp_attendance_batch_sites target
         JOIN attendance_calendar_site_rules rule
           ON rule.site_id=target.site_id AND rule.business_date=?
          AND rule.rule_type=? AND rule.cancelled_at IS NULL
          SET target.forced_day_type=?,target.forced_reason_type=?,
              target.calendar_event_id=rule.calendar_event_id,
              target.calendar_site_rule_id=rule.id`,
      [businessDate, ruleType, dayType, ruleType]
    )
  }

  await conn.query(
    `CREATE TEMPORARY TABLE tmp_attendance_batch_scenarios AS
     SELECT employee.*,site.site_code,site.device_id,
            COALESCE(site.forced_day_type,CASE
              WHEN JSON_CONTAINS(COALESCE(employee.work_days_json,JSON_ARRAY()),
                   CONCAT(WEEKDAY(?)+1),'$')=1 THEN 'WORKDAY'
              ELSE 'NON_WORKDAY' END) calendar_day_type,
            COALESCE(site.forced_reason_type,CASE
              WHEN JSON_CONTAINS(COALESCE(employee.work_days_json,JSON_ARRAY()),
                   CONCAT(WEEKDAY(?)+1),'$')=1 THEN 'SHIFT_WEEKDAY'
              ELSE 'WEEKLY_OFF' END) calendar_reason_type,
            site.calendar_event_id,site.calendar_site_rule_id,
            TIMESTAMP(?,employee.start_time) scheduled_start,
            CASE WHEN employee.crosses_midnight=1
              THEN DATE_ADD(TIMESTAMP(?,employee.end_time),INTERVAL 1 DAY)
              ELSE TIMESTAMP(?,employee.end_time) END scheduled_end,
            MOD(CRC32(CONCAT('attendance-ui-batch-v1|scenario|',employee.employee_uid,'|',?)),1000) scenario_bucket,
            MOD(CRC32(CONCAT('attendance-ui-batch-v1|clock-in|',employee.employee_uid,'|',?)),1000) clock_in_bucket,
            MOD(CRC32(CONCAT('attendance-ui-batch-v1|clock-out|',employee.employee_uid,'|',?)),1000) clock_out_bucket,
            MOD(CRC32(CONCAT('attendance-ui-batch-v1|workflow|',employee.employee_uid,'|',?)),100) workflow_bucket,
            MOD(CRC32(CONCAT('attendance-ui-batch-v1|kind|',employee.employee_uid,'|',?)),100) kind_bucket,
            CAST(NULL AS CHAR(30)) scenario
       FROM tmp_attendance_batch_employees employee
       JOIN tmp_attendance_batch_sites site ON site.site_id=employee.site_id`,
    Array(10).fill(businessDate)
  )
  await conn.query(
    `ALTER TABLE tmp_attendance_batch_scenarios
       ADD PRIMARY KEY (employee_id),ADD KEY idx_tmp_attendance_batch_scenario (site_id,scenario)`
  )
  if (mode === 'FULL_PRESENT') {
    await conn.query("UPDATE tmp_attendance_batch_scenarios SET scenario='FULL_PRESENT'")
    return
  }
  await conn.query(
    `UPDATE tmp_attendance_batch_scenarios SET scenario=CASE
       WHEN calendar_day_type<>'WORKDAY' AND scenario_bucket<50 THEN 'OFFDAY_PRESENT'
       WHEN calendar_day_type<>'WORKDAY' THEN 'OFFDAY_EMPTY'
       WHEN scenario_bucket<700 THEN 'NORMAL'
       WHEN scenario_bucket<780 THEN 'LATE'
       WHEN scenario_bucket<830 THEN 'EARLY_LEAVE'
       WHEN scenario_bucket<850 THEN 'LATE_EARLY'
       WHEN scenario_bucket<920 THEN 'ABNORMAL'
       WHEN scenario_bucket<980 THEN 'CLASSIFICATION'
       ELSE 'ALPHA' END`
  )
  for (const scenario of ['CLASSIFICATION', 'ABNORMAL', 'ALPHA']) {
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT 1 FROM tmp_attendance_batch_scenarios WHERE scenario=? LIMIT 1',
      [scenario]
    )
    if (!rows.length) {
      await conn.query(
        `UPDATE tmp_attendance_batch_scenarios SET scenario=?
          WHERE calendar_day_type='WORKDAY' AND scenario='NORMAL'
          ORDER BY scenario_bucket LIMIT 1`,
        [scenario]
      )
    }
  }
}

async function insertAttendanceBatch(
  conn: PoolConnection,
  businessDate: string,
  mode: AttendanceBatchMode,
  actorId: number
) {
  const full = mode === 'FULL_PRESENT'
  const [records] = await conn.execute<ResultSetHeader>(
    full
      ? `INSERT INTO attendance_records (
           uid,employee_id,site_id,shift_id,business_date,attendance_status,
           calendar_day_type,calendar_reason_type,calendar_event_id,calendar_site_rule_id,
           clock_in_at,clock_out_at,clock_in_device_id,clock_out_device_id,
           clock_in_source,clock_out_source,late_minutes,early_leave_minutes,
           worked_minutes,notes,created_by,updated_by)
         SELECT UUID(),scenario.employee_id,scenario.site_id,scenario.shift_id,?,'PRESENT',
                scenario.calendar_day_type,scenario.calendar_reason_type,
                scenario.calendar_event_id,scenario.calendar_site_rule_id,
                DATE_ADD(scenario.scheduled_start,
                  INTERVAL (CAST(MOD(scenario.clock_in_bucket,16) AS SIGNED)-10) MINUTE),
                DATE_ADD(scenario.scheduled_end,
                  INTERVAL (CAST(MOD(scenario.clock_out_bucket,16) AS SIGNED)-5) MINUTE),
                scenario.device_id,scenario.device_id,'TERMINAL','TERMINAL',
                CASE WHEN CAST(MOD(scenario.clock_in_bucket,16) AS SIGNED)-10>
                           scenario.late_tolerance_minutes
                  THEN CAST(MOD(scenario.clock_in_bucket,16) AS UNSIGNED)-10 ELSE 0 END,
                CASE WHEN 5-CAST(MOD(scenario.clock_out_bucket,16) AS SIGNED)>
                           scenario.early_leave_tolerance_minutes
                  THEN 5-CAST(MOD(scenario.clock_out_bucket,16) AS SIGNED) ELSE 0 END,
                GREATEST(0,TIMESTAMPDIFF(MINUTE,
                  DATE_ADD(scenario.scheduled_start,
                    INTERVAL (CAST(MOD(scenario.clock_in_bucket,16) AS SIGNED)-10) MINUTE),
                  DATE_ADD(scenario.scheduled_end,
                    INTERVAL (CAST(MOD(scenario.clock_out_bucket,16) AS SIGNED)-5) MINUTE))),
                CASE WHEN scenario.calendar_day_type<>'WORKDAY'
                  THEN 'Kehadiran batch pada hari nonkerja/libur.' ELSE NULL END,?,?
           FROM tmp_attendance_batch_scenarios scenario`
      : `INSERT INTO attendance_records (
           uid,employee_id,site_id,shift_id,business_date,attendance_status,
           calendar_day_type,calendar_reason_type,calendar_event_id,calendar_site_rule_id,
           clock_in_at,clock_out_at,clock_in_device_id,clock_out_device_id,
           clock_in_source,clock_out_source,notes,created_by,updated_by)
         SELECT UUID(),scenario.employee_id,scenario.site_id,scenario.shift_id,?,'PRESENT',
                scenario.calendar_day_type,scenario.calendar_reason_type,
                scenario.calendar_event_id,scenario.calendar_site_rule_id,
                CASE
                  WHEN scenario.scenario='ABNORMAL' AND MOD(scenario.kind_bucket,2)=1 THEN NULL
                  WHEN scenario.scenario IN ('LATE','LATE_EARLY')
                    THEN DATE_ADD(scenario.scheduled_start,INTERVAL (16+MOD(scenario.clock_in_bucket,45)) MINUTE)
                  WHEN scenario.scenario='OFFDAY_PRESENT'
                    THEN DATE_ADD(scenario.scheduled_start,INTERVAL MOD(scenario.clock_in_bucket,61) MINUTE)
                  ELSE DATE_ADD(scenario.scheduled_start,
                    INTERVAL (CAST(MOD(scenario.clock_in_bucket,31) AS SIGNED)-20) MINUTE) END,
                CASE
                  WHEN scenario.scenario='ABNORMAL' AND MOD(scenario.kind_bucket,2)=0 THEN NULL
                  WHEN scenario.scenario IN ('EARLY_LEAVE','LATE_EARLY')
                    THEN DATE_SUB(scenario.scheduled_end,INTERVAL (16+MOD(scenario.clock_out_bucket,75)) MINUTE)
                  WHEN scenario.scenario='OFFDAY_PRESENT'
                    THEN DATE_ADD(scenario.scheduled_end,
                      INTERVAL (CAST(MOD(scenario.clock_out_bucket,181) AS SIGNED)-120) MINUTE)
                  ELSE DATE_ADD(scenario.scheduled_end,
                    INTERVAL (CAST(MOD(scenario.clock_out_bucket,41) AS SIGNED)-10) MINUTE) END,
                CASE WHEN scenario.scenario='ABNORMAL' AND MOD(scenario.kind_bucket,2)=1
                  THEN NULL ELSE scenario.device_id END,
                CASE WHEN scenario.scenario='ABNORMAL' AND MOD(scenario.kind_bucket,2)=0
                  THEN NULL ELSE scenario.device_id END,
                CASE WHEN scenario.scenario='ABNORMAL' AND MOD(scenario.kind_bucket,2)=1
                  THEN NULL ELSE 'TERMINAL' END,
                CASE WHEN scenario.scenario='ABNORMAL' AND MOD(scenario.kind_bucket,2)=0
                  THEN NULL ELSE 'TERMINAL' END,
                CASE WHEN scenario.scenario='OFFDAY_PRESENT'
                  THEN 'Kehadiran aktual pada hari nonkerja/libur.' ELSE NULL END,?,?
           FROM tmp_attendance_batch_scenarios scenario
          WHERE scenario.scenario IN ('NORMAL','LATE','EARLY_LEAVE','LATE_EARLY','ABNORMAL','OFFDAY_PRESENT')`,
    [businessDate, actorId, actorId]
  )
  let attendanceRecords = records.affectedRows

  if (!full) {
    await conn.execute(
      `UPDATE attendance_records record
         JOIN tmp_attendance_batch_scenarios scenario
           ON scenario.employee_id=record.employee_id
          SET record.late_minutes=CASE
                WHEN record.calendar_day_type<>'WORKDAY' OR record.clock_in_at IS NULL THEN 0
                WHEN TIMESTAMPDIFF(MINUTE,scenario.scheduled_start,record.clock_in_at)>
                     scenario.late_tolerance_minutes
                  THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,scenario.scheduled_start,record.clock_in_at))
                ELSE 0 END,
              record.early_leave_minutes=CASE
                WHEN record.calendar_day_type<>'WORKDAY' OR record.clock_out_at IS NULL THEN 0
                WHEN TIMESTAMPDIFF(MINUTE,record.clock_out_at,scenario.scheduled_end)>
                     scenario.early_leave_tolerance_minutes
                  THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,record.clock_out_at,scenario.scheduled_end))
                ELSE 0 END,
              record.worked_minutes=CASE
                WHEN record.clock_in_at IS NULL OR record.clock_out_at IS NULL THEN NULL
                ELSE GREATEST(0,TIMESTAMPDIFF(MINUTE,record.clock_in_at,record.clock_out_at)) END
        WHERE record.business_date=?`,
      [businessDate]
    )
  }

  let scanEvents = 0
  for (const [eventType, column, deviceColumn, suffix, message] of [
    ['CLOCK_IN', 'clock_in_at', 'clock_in_device_id', 'IN', 'Clock in berhasil dicatat.'],
    ['CLOCK_OUT', 'clock_out_at', 'clock_out_device_id', 'OUT', 'Clock out berhasil dicatat.'],
  ] as const) {
    const [inserted] = await conn.execute<ResultSetHeader>(
      `INSERT INTO attendance_scan_events (
         uid,attendance_record_id,employee_id,site_id,device_id,barcode_value,
         event_type,scanned_at,result_status,result_message,idempotency_key,
         ip_address,user_agent,created_by,updated_by)
       SELECT UUID(),record.id,record.employee_id,record.site_id,record.${deviceColumn},
              employee.employee_number,?,record.${column},'SUCCESS',?,
              CONCAT('BATCH-ATT-',DATE_FORMAT(?,'%Y%m%d'),'-',record.employee_id,'-${suffix}'),
              '127.0.0.1','HRIS Attendance Batch UI',?,?
         FROM attendance_records record
         JOIN employees employee ON employee.id=record.employee_id
         JOIN tmp_attendance_batch_scenarios scenario
           ON scenario.employee_id=record.employee_id
        WHERE record.business_date=? AND record.${column} IS NOT NULL`,
      [eventType, message, businessDate, actorId, actorId, businessDate]
    )
    scanEvents += inserted.affectedRows
  }

  let classificationRequests = 0
  let corrections = 0
  if (!full) {
    const [failedScans] = await conn.execute<ResultSetHeader>(
      `INSERT INTO attendance_scan_events (
         uid,attendance_record_id,employee_id,site_id,device_id,barcode_value,
         event_type,scanned_at,result_status,result_message,idempotency_key,
         ip_address,user_agent,created_by,updated_by)
       SELECT UUID(),record.id,record.employee_id,record.site_id,scenario.device_id,
              employee.employee_number,
              CASE WHEN MOD(scenario.kind_bucket,2)=0 THEN 'CLOCK_IN' ELSE 'CLOCK_OUT' END,
              DATE_ADD(TIMESTAMP(?,'12:00:00'),INTERVAL MOD(scenario.clock_in_bucket,180) MINUTE),
              CASE WHEN MOD(scenario.workflow_bucket,3)=0 THEN 'ERROR' ELSE 'REJECTED' END,
              CASE WHEN MOD(scenario.workflow_bucket,3)=0
                THEN 'Gangguan simulasi pada layanan scan.'
                ELSE 'Percobaan scan duplikat ditolak.' END,
              CONCAT('BATCH-ATT-',DATE_FORMAT(?,'%Y%m%d'),'-',record.employee_id,'-FAIL'),
              '127.0.0.1','HRIS Attendance Batch UI',?,?
         FROM attendance_records record
         JOIN employees employee ON employee.id=record.employee_id
         JOIN tmp_attendance_batch_scenarios scenario
           ON scenario.employee_id=record.employee_id
        WHERE record.business_date=? AND MOD(scenario.scenario_bucket,100)<5`,
      [businessDate, businessDate, actorId, actorId, businessDate]
    )
    scanEvents += failedScans.affectedRows

    const [classificationInsert] = await conn.execute<ResultSetHeader>(
      `INSERT INTO attendance_classification_requests (
         uid,employee_id,site_id,classification_type,start_date,end_date,reason,
         approval_status,requested_by,requested_at,reviewed_by,reviewed_at,
         review_notes,cancelled_by,cancelled_at,created_by,updated_by)
       SELECT UUID(),scenario.employee_id,scenario.site_id,
              CASE WHEN scenario.kind_bucket<55 THEN 'SICK'
                   WHEN scenario.kind_bucket<85 THEN 'PERMISSION' ELSE 'LEAVE' END,
              ?,?,CASE WHEN scenario.kind_bucket<55
                   THEN 'Kondisi kesehatan tidak memungkinkan bekerja.'
                   WHEN scenario.kind_bucket<85
                   THEN 'Keperluan keluarga yang tidak dapat ditinggalkan.'
                   ELSE 'Cuti pribadi terencana.' END,
              CASE WHEN scenario.workflow_bucket<55 THEN 'APPROVED'
                   WHEN scenario.workflow_bucket<80 THEN 'PENDING'
                   WHEN scenario.workflow_bucket<95 THEN 'REJECTED' ELSE 'CANCELLED' END,
              ?,NOW(3),
              CASE WHEN scenario.workflow_bucket<55 OR scenario.workflow_bucket BETWEEN 80 AND 94
                THEN ? ELSE NULL END,
              CASE WHEN scenario.workflow_bucket<55 OR scenario.workflow_bucket BETWEEN 80 AND 94
                THEN NOW(3) ELSE NULL END,
              CASE WHEN scenario.workflow_bucket<55
                THEN 'Dokumen dan alasan telah diverifikasi.'
                WHEN scenario.workflow_bucket BETWEEN 80 AND 94
                THEN 'Bukti atau alasan belum memenuhi ketentuan.' ELSE NULL END,
              CASE WHEN scenario.workflow_bucket>=95 THEN ? ELSE NULL END,
              CASE WHEN scenario.workflow_bucket>=95 THEN NOW(3) ELSE NULL END,?,?
         FROM tmp_attendance_batch_scenarios scenario
        WHERE scenario.scenario='CLASSIFICATION'`,
      [businessDate, businessDate, actorId, actorId, actorId, actorId, actorId]
    )
    classificationRequests = classificationInsert.affectedRows

    const [approvedRecords] = await conn.execute<ResultSetHeader>(
      `INSERT INTO attendance_records (
         uid,employee_id,site_id,shift_id,business_date,attendance_status,
         calendar_day_type,calendar_reason_type,calendar_event_id,calendar_site_rule_id,
         notes,created_by,updated_by)
       SELECT UUID(),scenario.employee_id,scenario.site_id,scenario.shift_id,?,
              request.classification_type,scenario.calendar_day_type,
              scenario.calendar_reason_type,scenario.calendar_event_id,
              scenario.calendar_site_rule_id,request.reason,?,?
         FROM attendance_classification_requests request
         JOIN tmp_attendance_batch_scenarios scenario
           ON scenario.employee_id=request.employee_id
          AND scenario.site_id=request.site_id
        WHERE request.start_date=? AND request.end_date=?
          AND request.approval_status='APPROVED'`,
      [businessDate, actorId, actorId, businessDate, businessDate]
    )
    attendanceRecords += approvedRecords.affectedRows

    await conn.execute(
      `INSERT INTO attendance_classification_details (
         uid,request_id,employee_id,business_date,shift_assignment_id,
         attendance_record_id,outcome,notes,created_by,updated_by)
       SELECT UUID(),request.id,request.employee_id,?,scenario.shift_assignment_id,
              record.id,CASE WHEN request.approval_status='APPROVED'
                THEN 'APPLIED' ELSE 'PENDING' END,
              CASE WHEN request.approval_status='APPROVED' THEN NULL
                ELSE 'Belum diterapkan karena hasil review belum approved.' END,?,?
         FROM attendance_classification_requests request
         JOIN tmp_attendance_batch_scenarios scenario
           ON scenario.employee_id=request.employee_id
          AND scenario.site_id=request.site_id
         LEFT JOIN attendance_records record
           ON record.employee_id=request.employee_id AND record.business_date=?
        WHERE request.start_date=? AND request.end_date=?`,
      [businessDate, actorId, actorId, businessDate, businessDate, businessDate]
    )

    const [correctionInsert] = await conn.execute<ResultSetHeader>(
      `INSERT INTO attendance_corrections (
         uid,attendance_record_id,correction_type,
         old_clock_in_at,new_clock_in_at,old_clock_out_at,new_clock_out_at,
         old_status,new_status,reason,approval_status,requested_by,requested_at,
         reviewed_by,reviewed_at,review_notes,applied_at,created_by,updated_by)
       SELECT UUID(),record.id,
              CASE WHEN record.clock_in_at IS NULL THEN 'CLOCK_IN' ELSE 'CLOCK_OUT' END,
              record.clock_in_at,
              CASE WHEN record.clock_in_at IS NULL
                THEN DATE_SUB(scenario.scheduled_start,INTERVAL MOD(scenario.clock_in_bucket,16) MINUTE)
                ELSE NULL END,
              record.clock_out_at,
              CASE WHEN record.clock_out_at IS NULL
                THEN DATE_ADD(scenario.scheduled_end,INTERVAL MOD(scenario.clock_out_bucket,21) MINUTE)
                ELSE NULL END,
              record.attendance_status,NULL,
              CASE WHEN record.clock_in_at IS NULL
                THEN 'Jam masuk terlewat saat scan awal.'
                ELSE 'Jam pulang terlewat saat scan akhir.' END,
              CASE WHEN scenario.workflow_bucket<45 THEN 'APPROVED'
                   WHEN scenario.workflow_bucket<75 THEN 'PENDING'
                   WHEN scenario.workflow_bucket<90 THEN 'REJECTED' ELSE 'CANCELLED' END,
              ?,NOW(3),
              CASE WHEN scenario.workflow_bucket<45 OR scenario.workflow_bucket BETWEEN 75 AND 89
                THEN ? ELSE NULL END,
              CASE WHEN scenario.workflow_bucket<45 OR scenario.workflow_bucket BETWEEN 75 AND 89
                THEN NOW(3) ELSE NULL END,
              CASE WHEN scenario.workflow_bucket<45
                THEN 'Koreksi diverifikasi dari catatan operasional.'
                WHEN scenario.workflow_bucket BETWEEN 75 AND 89
                THEN 'Bukti koreksi belum memadai.' ELSE NULL END,
              CASE WHEN scenario.workflow_bucket<45 THEN NOW(3) ELSE NULL END,?,?
         FROM attendance_records record
         JOIN tmp_attendance_batch_scenarios scenario
           ON scenario.employee_id=record.employee_id
        WHERE record.business_date=? AND scenario.scenario='ABNORMAL'`,
      [actorId, actorId, actorId, actorId, businessDate]
    )
    corrections = correctionInsert.affectedRows

    await conn.execute(
      `UPDATE attendance_records record
         JOIN attendance_corrections correction
           ON correction.attendance_record_id=record.id
          AND correction.approval_status='APPROVED'
         JOIN tmp_attendance_batch_scenarios scenario
           ON scenario.employee_id=record.employee_id
          SET record.clock_in_at=CASE WHEN correction.correction_type='CLOCK_IN'
                THEN correction.new_clock_in_at ELSE record.clock_in_at END,
              record.clock_out_at=CASE WHEN correction.correction_type='CLOCK_OUT'
                THEN correction.new_clock_out_at ELSE record.clock_out_at END,
              record.clock_in_device_id=CASE WHEN correction.correction_type='CLOCK_IN'
                THEN NULL ELSE record.clock_in_device_id END,
              record.clock_out_device_id=CASE WHEN correction.correction_type='CLOCK_OUT'
                THEN NULL ELSE record.clock_out_device_id END,
              record.clock_in_source=CASE WHEN correction.correction_type='CLOCK_IN'
                THEN 'CORRECTION' ELSE record.clock_in_source END,
              record.clock_out_source=CASE WHEN correction.correction_type='CLOCK_OUT'
                THEN 'CORRECTION' ELSE record.clock_out_source END,
              record.late_minutes=CASE
                WHEN correction.correction_type='CLOCK_IN'
                 AND TIMESTAMPDIFF(MINUTE,scenario.scheduled_start,correction.new_clock_in_at)>
                     scenario.late_tolerance_minutes
                  THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,scenario.scheduled_start,correction.new_clock_in_at))
                WHEN correction.correction_type='CLOCK_IN' THEN 0 ELSE record.late_minutes END,
              record.early_leave_minutes=CASE
                WHEN correction.correction_type='CLOCK_OUT'
                 AND TIMESTAMPDIFF(MINUTE,correction.new_clock_out_at,scenario.scheduled_end)>
                     scenario.early_leave_tolerance_minutes
                  THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,correction.new_clock_out_at,scenario.scheduled_end))
                WHEN correction.correction_type='CLOCK_OUT' THEN 0 ELSE record.early_leave_minutes END,
              record.worked_minutes=GREATEST(0,TIMESTAMPDIFF(MINUTE,
                CASE WHEN correction.correction_type='CLOCK_IN'
                  THEN correction.new_clock_in_at ELSE record.clock_in_at END,
                CASE WHEN correction.correction_type='CLOCK_OUT'
                  THEN correction.new_clock_out_at ELSE record.clock_out_at END)),
              record.is_corrected=1,record.updated_by=correction.reviewed_by
        WHERE record.business_date=?`,
      [businessDate]
    )
  }

  return {
    attendanceRecords,
    scanEvents,
    classificationRequests,
    corrections,
  }
}

export async function attendanceDeleteSummary(
  executor: Executor,
  businessDates: string[],
  site: AttendanceBatchSite
): Promise<DeleteSummaryRow[]> {
  if (!businessDates.length) return []
  const dateTable = businessDates
    .map((_, index) => `${index === 0 ? 'SELECT' : 'UNION ALL SELECT'} ? businessDate`)
    .join(' ')
  const recordSite = siteSql('record_site', site)
  const scanSite = siteSql('scan_site', site)
  const requestSite = siteSql('request_site', site)
  const runSite = siteSql('run_site', site)
  const transactionSite = siteSql('transaction_site', site)
  const periodSite = siteSql('period_site', site)
  const [rows] = await executor.query<RowDataPacket[]>(
    `SELECT day.businessDate,
       (SELECT COUNT(DISTINCT scoped.site_id) FROM (
          SELECT record.site_id,record.business_date scoped_date
            FROM attendance_records record
          UNION ALL SELECT scan.site_id,DATE(scan.scanned_at)
            FROM attendance_scan_events scan WHERE scan.attendance_record_id IS NULL
          UNION ALL SELECT request.site_id,request.start_date
            FROM attendance_classification_requests request WHERE request.start_date=request.end_date
          UNION ALL SELECT run.site_id,run.business_date
            FROM attendance_daily_finalization_runs run
        ) scoped JOIN sites scoped_site ON scoped_site.id=scoped.site_id
         WHERE scoped.scoped_date=day.businessDate${siteSql('scoped_site', site)}) siteCount,
       (SELECT COUNT(DISTINCT record.employee_id) FROM attendance_records record
          JOIN sites record_site ON record_site.id=record.site_id
         WHERE record.business_date=day.businessDate${recordSite}) employeeCount,
       (SELECT COUNT(*) FROM attendance_records record
          JOIN sites record_site ON record_site.id=record.site_id
         WHERE record.business_date=day.businessDate${recordSite}) recordCount,
       (SELECT COUNT(*) FROM attendance_scan_events scan
          JOIN sites scan_site ON scan_site.id=scan.site_id
          LEFT JOIN attendance_records linked_record ON linked_record.id=scan.attendance_record_id
         WHERE ((linked_record.business_date=day.businessDate)
             OR (scan.attendance_record_id IS NULL AND DATE(scan.scanned_at)=day.businessDate))${scanSite}) scanEventCount,
       (SELECT COUNT(*) FROM attendance_corrections correction
          JOIN attendance_records record ON record.id=correction.attendance_record_id
          JOIN sites record_site ON record_site.id=record.site_id
         WHERE record.business_date=day.businessDate${recordSite}) correctionCount,
       (SELECT COUNT(*) FROM attendance_classification_requests request
          JOIN sites request_site ON request_site.id=request.site_id
         WHERE request.start_date<=day.businessDate AND request.end_date>=day.businessDate${requestSite}) classificationCount,
       (SELECT COUNT(*) FROM attendance_daily_finalization_runs run
          JOIN sites run_site ON run_site.id=run.site_id
         WHERE run.business_date=day.businessDate${runSite}) finalizationCount,
       EXISTS(SELECT 1 FROM attendance_classification_requests request
          JOIN sites request_site ON request_site.id=request.site_id
         WHERE request.start_date<=day.businessDate AND request.end_date>=day.businessDate
           AND (request.start_date<>day.businessDate OR request.end_date<>day.businessDate)${requestSite}) hasMultiDayClassification,
       EXISTS(SELECT 1 FROM production_transactions transaction
          JOIN sites transaction_site ON transaction_site.id=transaction.site_id
         WHERE transaction.business_date=day.businessDate${transactionSite}) hasProduction,
       EXISTS(SELECT 1 FROM payroll_periods period
          JOIN sites period_site ON period_site.id=period.site_id
         WHERE day.businessDate BETWEEN period.period_start AND period.period_end
           AND period.status NOT IN ('DRAFT','CANCELLED')${periodSite}) hasProcessedPayroll,
       EXISTS(SELECT 1 FROM payroll_attendance_summaries summary
          JOIN payroll_employee_results result ON result.id=summary.payroll_employee_result_id
          JOIN payroll_periods period ON period.id=result.payroll_period_id
          JOIN sites period_site ON period_site.id=period.site_id
         WHERE day.businessDate BETWEEN period.period_start AND period.period_end${periodSite}) hasPayrollSnapshot,
       EXISTS(SELECT 1 FROM payroll_time_details detail
          JOIN attendance_records record ON record.id=detail.attendance_record_id
          JOIN sites record_site ON record_site.id=record.site_id
         WHERE record.business_date=day.businessDate${recordSite}) hasTimeDetail,
       EXISTS(SELECT 1 FROM payroll_monthly_daily_details detail
          JOIN attendance_records record ON record.id=detail.attendance_record_id
          JOIN sites record_site ON record_site.id=record.site_id
         WHERE record.business_date=day.businessDate${recordSite}) hasMonthlyDetail,
       EXISTS(SELECT 1 FROM attendance_daily_finalization_runs run
          JOIN sites run_site ON run_site.id=run.site_id
         WHERE run.business_date=day.businessDate AND run.status='RUNNING'${runSite}) hasRunningFinalization
     FROM (${dateTable}) day
     HAVING recordCount>0 OR scanEventCount>0 OR classificationCount>0 OR finalizationCount>0
     ORDER BY day.businessDate DESC`,
    businessDates
  )

  return rows.map((row) => {
    const blockers: string[] = []
    if (Number(row.hasMultiDayClassification) > 0) {
      blockers.push('Ada klasifikasi multi-hari yang melintasi tanggal ini.')
    }
    if (Number(row.hasProduction) > 0) {
      blockers.push('Attendance sudah digunakan transaksi Produksi.')
    }
    if (
      Number(row.hasProcessedPayroll) > 0 ||
      Number(row.hasPayrollSnapshot) > 0 ||
      Number(row.hasTimeDetail) > 0 ||
      Number(row.hasMonthlyDetail) > 0
    ) {
      blockers.push('Attendance sudah digunakan proses atau snapshot Payroll.')
    }
    if (Number(row.hasRunningFinalization) > 0) {
      blockers.push('Finalisasi Attendance masih berjalan.')
    }
    return {
      businessDate: String(row.businessDate),
      siteCount: Number(row.siteCount ?? 0),
      employeeCount: Number(row.employeeCount ?? 0),
      recordCount: Number(row.recordCount ?? 0),
      scanEventCount: Number(row.scanEventCount ?? 0),
      correctionCount: Number(row.correctionCount ?? 0),
      classificationCount: Number(row.classificationCount ?? 0),
      finalizationCount: Number(row.finalizationCount ?? 0),
      canDelete: blockers.length === 0,
      blockers,
    }
  })
}

export const attendanceBatchToolsRouter = Router()
attendanceBatchToolsRouter.use(authenticate)

attendanceBatchToolsRouter.get(
  '/import/template-employees',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      assertBatchAccess(auth)
      const referenceDate = z
        .string()
        .date()
        .parse(req.query.businessDate ?? jakartaBusinessDate())
      assertAllowedDate(referenceDate)
      const [counts] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT employee.id) total
           FROM employees employee
           JOIN employee_employment_histories history
             ON history.employee_id=employee.id
            AND history.effective_from<=?
            AND (history.effective_to IS NULL OR history.effective_to>=?)
           JOIN employee_statuses status
             ON status.id=history.employee_status_id
            AND status.allows_attendance=1
           JOIN sites site ON site.id=history.site_id AND site.is_active=1`,
        [referenceDate, referenceDate]
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT DISTINCT employee.employee_number employeeNumber,
                         employee.full_name employeeName
           FROM employees employee
           JOIN employee_employment_histories history
             ON history.employee_id=employee.id
            AND history.effective_from<=?
            AND (history.effective_to IS NULL OR history.effective_to>=?)
           JOIN employee_statuses status
             ON status.id=history.employee_status_id
            AND status.allows_attendance=1
           JOIN sites site ON site.id=history.site_id AND site.is_active=1
          ORDER BY employee.full_name,employee.employee_number
          LIMIT 2000`,
        [referenceDate, referenceDate]
      )
      res.json({
        data: rows.map((row) => ({
          employeeNumber: String(row.employeeNumber),
          employeeName: String(row.employeeName),
        })),
        meta: {
          total: Number(counts[0]?.total ?? 0),
          limit: 2000,
          referenceDate,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceBatchToolsRouter.post(
  '/import/preview',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      assertBatchAccess(auth)
      const input = attendanceImportPreviewInput.parse(req.body)
      const validation = await validateAttendanceImportRows(conn, input.rows)
      res.json({
        data: {
          total: validation.length,
          valid: validation.filter((row) => row.valid).length,
          invalid: validation.filter((row) => !row.valid).length,
          warnings: validation.filter((row) => row.warning).length,
          rows: validation.map(attendanceImportRowDto),
        },
      })
    } catch (error) {
      next(error)
    } finally {
      await dropAttendanceImportTable(conn)
      conn.release()
    }
  }
)

attendanceBatchToolsRouter.post(
  '/import',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      assertBatchAccess(auth)
      const input = attendanceImportRunInput.parse(req.body)
      const requestId = `ATTENDANCE-IMPORT-${input.idempotencyKey}`
      const payloadHash = createHash('sha256')
        .update(JSON.stringify({ rows: input.rows, reason: input.reason }))
        .digest('hex')

      await conn.beginTransaction()
      const [previousAudits] = await conn.query<RowDataPacket[]>(
        `SELECT after_data afterData FROM audit_logs
          WHERE request_id=? AND module='ATTENDANCE' AND action='CREATE'
          ORDER BY id LIMIT 1 FOR UPDATE`,
        [requestId]
      )
      if (previousAudits[0]) {
        const previous = parseAuditJson(previousAudits[0].afterData)
        if (previous.payloadHash !== payloadHash) {
          throw new ApiError(
            409,
            'Kunci import sudah digunakan untuk file atau alasan yang berbeda.'
          )
        }
        await conn.commit()
        return res.json({
          data: {
            total: Number(previous.total ?? input.rows.length),
            imported: 0,
            replayed: Number(previous.total ?? input.rows.length),
            attendanceRecords: Number(previous.attendanceRecords ?? 0),
            corrections: Number(previous.corrections ?? 0),
            classificationRequests: Number(
              previous.classificationRequests ?? 0
            ),
          },
        })
      }

      const validation = await validateAttendanceImportRows(
        conn,
        input.rows,
        true
      )
      const invalid = validation.filter((row) => !row.valid)
      if (invalid.length) {
        throw new ApiError(
          422,
          `Import dibatalkan: ${invalid.length} baris tidak lagi valid. Muat ulang preview.`
        )
      }
      const validRows = validation.filter(
        (
          row
        ): row is AttendanceImportValidationRow & {
          proposal: NonNullable<AttendanceImportValidationRow['proposal']>
        } => row.valid && Boolean(row.proposal)
      )
      const recordsToInsert = validRows
        .filter(
          (row) =>
            row.proposal.classificationOutcome !== 'SKIPPED_HOLIDAY' &&
            row.proposal.classificationOutcome !== 'SKIPPED_NON_WORKDAY'
        )
        .map((row) => ({ ...row, recordUid: randomUUID() }))

      for (let offset = 0; offset < recordsToInsert.length; offset += 250) {
        const chunk = recordsToInsert.slice(offset, offset + 250)
        await conn.query(
          `INSERT INTO attendance_records(
             uid,employee_id,site_id,shift_id,business_date,attendance_status,
             calendar_day_type,calendar_reason_type,calendar_event_id,
             calendar_site_rule_id,clock_in_at,clock_out_at,
             clock_in_device_id,clock_out_device_id,clock_in_source,
             clock_out_source,late_minutes,early_leave_minutes,worked_minutes,
             is_corrected,notes,created_by,updated_by)
           VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')}`,
          chunk.flatMap((row) => {
            const proposal = row.proposal
            const importedNote = row.input.notes?.trim()
              ? `Import Excel: ${row.input.notes.trim()}`
              : `Import Excel: ${input.reason}`
            return [
              row.recordUid,
              proposal.employeeId,
              proposal.siteId,
              proposal.shiftId,
              row.input.businessDate,
              proposal.attendanceStatus,
              proposal.calendar.dayType,
              proposal.calendar.reasonType,
              proposal.calendar.eventId,
              proposal.calendar.siteRuleId,
              proposal.clockInAt,
              proposal.clockOutAt,
              null,
              null,
              proposal.clockInAt ? 'CORRECTION' : null,
              proposal.clockOutAt ? 'CORRECTION' : null,
              proposal.lateMinutes,
              proposal.earlyLeaveMinutes,
              proposal.workedMinutes,
              row.input.status === 'HADIR' ? 1 : 0,
              importedNote,
              auth.id,
              auth.id,
            ]
          })
        )
      }
      const recordByUid = new Map<string, number>()
      for (let offset = 0; offset < recordsToInsert.length; offset += 500) {
        const chunk = recordsToInsert.slice(offset, offset + 500)
        if (!chunk.length) continue
        const [stored] = await conn.query<RowDataPacket[]>(
          `SELECT id,uid FROM attendance_records
            WHERE uid IN (${chunk.map(() => '?').join(',')}) FOR UPDATE`,
          chunk.map((row) => row.recordUid)
        )
        for (const row of stored) recordByUid.set(String(row.uid), Number(row.id))
      }
      if (recordByUid.size !== recordsToInsert.length) {
        throw new ApiError(
          500,
          'Record Attendance hasil import tidak dapat diverifikasi.'
        )
      }

      const correctionRows = recordsToInsert.filter(
        (row) => row.input.status === 'HADIR'
      )
      for (let offset = 0; offset < correctionRows.length; offset += 250) {
        const chunk = correctionRows.slice(offset, offset + 250)
        await conn.query(
          `INSERT INTO attendance_corrections(
             uid,attendance_record_id,correction_type,
             old_clock_in_at,new_clock_in_at,old_clock_out_at,new_clock_out_at,
             old_status,new_status,reason,approval_status,requested_by,
             requested_at,reviewed_by,reviewed_at,review_notes,applied_at,
             created_by,updated_by)
           VALUES ${chunk.map(() => `(?,?,?,NULL,?,NULL,?,NULL,'PRESENT',?,'APPROVED',?,CURRENT_TIMESTAMP(3),?,CURRENT_TIMESTAMP(3),?,CURRENT_TIMESTAMP(3),?,?)`).join(',')}`,
          chunk.flatMap((row) => [
            randomUUID(),
            recordByUid.get(row.recordUid),
            row.proposal.clockInAt && row.proposal.clockOutAt
              ? 'BOTH'
              : row.proposal.clockInAt
                ? 'CLOCK_IN'
                : 'CLOCK_OUT',
            row.proposal.clockInAt,
            row.proposal.clockOutAt,
            `Import Excel: ${input.reason}`,
            auth.id,
            auth.id,
            'Disetujui otomatis melalui import Excel Attendance.',
            auth.id,
            auth.id,
          ])
        )
      }

      const classificationRows = validRows
        .filter((row) => ['CUTI', 'SAKIT', 'IZIN'].includes(row.input.status))
        .map((row) => ({ ...row, requestUid: randomUUID() }))
      for (let offset = 0; offset < classificationRows.length; offset += 250) {
        const chunk = classificationRows.slice(offset, offset + 250)
        await conn.query(
          `INSERT INTO attendance_classification_requests(
             uid,employee_id,site_id,classification_type,start_date,end_date,
             reason,attachment_file_id,approval_status,requested_by,requested_at,
             reviewed_by,reviewed_at,review_notes,created_by,updated_by)
           VALUES ${chunk.map(() => `(?,?,?,?,?,?,?,NULL,'APPROVED',?,CURRENT_TIMESTAMP(3),?,CURRENT_TIMESTAMP(3),?,?,?)`).join(',')}`,
          chunk.flatMap((row) => [
            row.requestUid,
            row.proposal.employeeId,
            row.proposal.siteId,
            row.proposal.attendanceStatus,
            row.input.businessDate,
            row.input.businessDate,
            row.input.notes?.trim() || input.reason,
            auth.id,
            auth.id,
            'Disetujui otomatis melalui import Excel Attendance.',
            auth.id,
            auth.id,
          ])
        )
      }
      const requestByUid = new Map<string, number>()
      for (let offset = 0; offset < classificationRows.length; offset += 500) {
        const chunk = classificationRows.slice(offset, offset + 500)
        if (!chunk.length) continue
        const [stored] = await conn.query<RowDataPacket[]>(
          `SELECT id,uid FROM attendance_classification_requests
            WHERE uid IN (${chunk.map(() => '?').join(',')}) FOR UPDATE`,
          chunk.map((row) => row.requestUid)
        )
        for (const row of stored) requestByUid.set(String(row.uid), Number(row.id))
      }
      if (requestByUid.size !== classificationRows.length) {
        throw new ApiError(
          500,
          'Klasifikasi hasil import tidak dapat diverifikasi.'
        )
      }
      for (let offset = 0; offset < classificationRows.length; offset += 250) {
        const chunk = classificationRows.slice(offset, offset + 250)
        await conn.query(
          `INSERT INTO attendance_classification_details(
             uid,request_id,employee_id,business_date,shift_assignment_id,
             attendance_record_id,outcome,notes,created_by,updated_by)
           VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',')}`,
          chunk.flatMap((row) => {
            const record = recordsToInsert.find(
              (item) => item.input.rowNumber === row.input.rowNumber
            )
            const outcome = row.proposal.classificationOutcome ?? 'APPLIED'
            return [
              randomUUID(),
              requestByUid.get(row.requestUid),
              row.proposal.employeeId,
              row.input.businessDate,
              row.proposal.shiftAssignmentId,
              record ? recordByUid.get(record.recordUid) : null,
              outcome,
              outcome === 'APPLIED'
                ? null
                : `${row.proposal.calendar.name ?? 'Hari nonkerja'} dilewati otomatis.`,
              auth.id,
              auth.id,
            ]
          })
        )
      }

      const totals = {
        total: validRows.length,
        attendanceRecords: recordsToInsert.length,
        corrections: correctionRows.length,
        classificationRequests: classificationRows.length,
        abnormal: correctionRows.filter(
          (row) => !row.proposal.clockInAt || !row.proposal.clockOutAt
        ).length,
      }
      const sites = new Map<number, { code: string; rows: number }>()
      for (const row of validRows) {
        const current = sites.get(row.proposal.siteId) ?? {
          code: row.proposal.site,
          rows: 0,
        }
        current.rows += 1
        sites.set(row.proposal.siteId, current)
      }
      for (const [siteId, site] of sites) {
        await writeAudit(
          {
            auth,
            request: req,
            module: 'ATTENDANCE',
            siteId,
            action: 'CREATE',
            table: 'attendance_records',
            description: `Mengimpor ${site.rows} baris Attendance untuk ${site.code}.`,
            reason: input.reason,
            requestId,
            afterData: {
              ...totals,
              site: site.code,
              siteRows: site.rows,
              payloadHash,
              autoApproved: true,
            },
          },
          conn
        )
      }
      await conn.commit()
      res.status(201).json({
        data: {
          total: validRows.length,
          imported: validRows.length,
          replayed: 0,
          attendanceRecords: recordsToInsert.length,
          corrections: correctionRows.length,
          classificationRequests: classificationRows.length,
        },
      })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      await dropAttendanceImportTable(conn)
      conn.release()
    }
  }
)

attendanceBatchToolsRouter.post(
  '/batch-input/preview',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      assertBatchAccess(auth)
      const input = attendanceBatchInputPreviewInput.parse(req.body)
      res.json({
        data: await attendanceInputPreview(
          pool,
          input.businessDate,
          input.site,
          input.mode
        ),
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceBatchToolsRouter.post(
  '/batch-input',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      assertBatchAccess(auth)
      const input = attendanceBatchInputRunInput.parse(req.body)
      await conn.beginTransaction()
      await conn.query(
        `SELECT site.id FROM sites site
          WHERE site.is_active=1${siteSql('site', input.site)} FOR UPDATE`
      )
      const preview = await attendanceInputPreview(
        conn,
        input.businessDate,
        input.site,
        input.mode
      )
      if (!preview.canCreate) {
        throw new ApiError(409, `Input dibatalkan: ${preview.blockers[0]}`)
      }
      await createInputTemporaryTables(
        conn,
        input.businessDate,
        input.site,
        input.mode
      )
      const result = await insertAttendanceBatch(
        conn,
        input.businessDate,
        input.mode,
        auth.id
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          action: 'CREATE',
          table: 'attendance_records',
          description: `Input Attendance batch tanggal ${input.businessDate}.`,
          reason: input.reason,
          afterData: {
            businessDate: input.businessDate,
            site: input.site,
            mode: input.mode,
            eligibleEmployees: preview.eligibleEmployeeCount,
            ...result,
          },
        },
        conn
      )
      await conn.commit()
      res.status(201).json({ data: { ...result, preview } })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      await dropInputTemporaryTables(conn)
      conn.release()
    }
  }
)

attendanceBatchToolsRouter.post(
  '/batch-delete/summary',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      assertBatchAccess(auth)
      const input = attendanceBatchDeleteSummaryInput.parse(req.body)
      assertAllowedDate(input.dateFrom)
      assertAllowedDate(input.dateTo)
      const dates = rangeDates(input.dateFrom, input.dateTo)
      res.json({
        data: {
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          site: input.site,
          rows: await attendanceDeleteSummary(pool, dates, input.site),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceBatchToolsRouter.post(
  '/batch-delete',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      assertBatchAccess(auth)
      const input = attendanceBatchDeleteInput.parse(req.body)
      const dates = [...new Set(input.businessDates)].sort()
      if (dates.length !== input.businessDates.length) {
        throw new ApiError(422, 'Tanggal hapus tidak boleh duplikat.')
      }
      dates.forEach(assertAllowedDate)
      const placeholders = dates.map(() => '?').join(',')
      const recordSite = siteSql('record_site', input.site)
      const scanSite = siteSql('scan_site', input.site)
      const requestSite = siteSql('request_site', input.site)
      const runSite = siteSql('run_site', input.site)

      await conn.beginTransaction()
      await conn.query(
        `SELECT site.id FROM sites site
          WHERE site.is_active=1${siteSql('site', input.site)} FOR UPDATE`
      )
      await conn.query(
        `SELECT record.id FROM attendance_records record
          JOIN sites record_site ON record_site.id=record.site_id
         WHERE record.business_date IN (${placeholders})${recordSite} FOR UPDATE`,
        dates
      )
      const summary = await attendanceDeleteSummary(conn, dates, input.site)
      const found = new Set(summary.map((row) => row.businessDate))
      const missing = dates.filter((date) => !found.has(date))
      if (missing.length) {
        throw new ApiError(
          409,
          `Hapus dibatalkan: data Attendance tanggal ${missing.join(', ')} tidak tersedia.`
        )
      }
      const blocked = summary.filter((row) => !row.canDelete)
      if (blocked.length) {
        throw new ApiError(
          409,
          `Hapus dibatalkan untuk ${blocked[0].businessDate}: ${blocked[0].blockers[0]}`
        )
      }

      await conn.execute(
        `DELETE detail FROM attendance_classification_details detail
          JOIN attendance_classification_requests request ON request.id=detail.request_id
          JOIN sites request_site ON request_site.id=request.site_id
         WHERE request.start_date=request.end_date
           AND request.start_date IN (${placeholders})${requestSite}`,
        dates
      )
      const [classifications] = await conn.execute<ResultSetHeader>(
        `DELETE request FROM attendance_classification_requests request
          JOIN sites request_site ON request_site.id=request.site_id
         WHERE request.start_date=request.end_date
           AND request.start_date IN (${placeholders})${requestSite}`,
        dates
      )
      const [corrections] = await conn.execute<ResultSetHeader>(
        `DELETE correction FROM attendance_corrections correction
          JOIN attendance_records record ON record.id=correction.attendance_record_id
          JOIN sites record_site ON record_site.id=record.site_id
         WHERE record.business_date IN (${placeholders})${recordSite}`,
        dates
      )
      const [scans] = await conn.execute<ResultSetHeader>(
        `DELETE scan FROM attendance_scan_events scan
          JOIN sites scan_site ON scan_site.id=scan.site_id
          LEFT JOIN attendance_records record ON record.id=scan.attendance_record_id
         WHERE (record.business_date IN (${placeholders})
             OR (scan.attendance_record_id IS NULL AND DATE(scan.scanned_at) IN (${placeholders})))${scanSite}`,
        [...dates, ...dates]
      )
      const [records] = await conn.execute<ResultSetHeader>(
        `DELETE record FROM attendance_records record
          JOIN sites record_site ON record_site.id=record.site_id
         WHERE record.business_date IN (${placeholders})${recordSite}`,
        dates
      )
      const [finalizations] = await conn.execute<ResultSetHeader>(
        `DELETE run FROM attendance_daily_finalization_runs run
          JOIN sites run_site ON run_site.id=run.site_id
         WHERE run.business_date IN (${placeholders})${runSite}`,
        dates
      )
      const expectedRecords = summary.reduce(
        (total, row) => total + row.recordCount,
        0
      )
      if (records.affectedRows !== expectedRecords) {
        throw new ApiError(
          409,
          'Hapus dibatalkan karena jumlah record Attendance berubah saat diproses.'
        )
      }

      for (const row of summary) {
        await writeAudit(
          {
            auth,
            request: req,
            module: 'ATTENDANCE',
            action: 'DELETE',
            table: 'attendance_records',
            description: `Menghapus data Attendance tanggal ${row.businessDate} melalui reset batch.`,
            reason: input.reason,
            beforeData: { ...row, site: input.site },
            afterData: { deleted: true },
          },
          conn
        )
      }
      await conn.commit()
      res.json({
        data: {
          deletedDates: summary.length,
          deletedRecords: records.affectedRows,
          deletedScanEvents: scans.affectedRows,
          deletedCorrections: corrections.affectedRows,
          deletedClassifications: classifications.affectedRows,
          deletedFinalizations: finalizations.affectedRows,
        },
      })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)
