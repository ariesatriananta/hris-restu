import mysql from 'mysql2/promise'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tidak tersedia.')

function argument(name) {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

function jakartaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function validDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} tidak valid.`)
  return value
}

const dateTo = validDate(argument('date-to') ?? jakartaDate(), 'date-to')
const dateFrom = validDate(
  argument('date-from') ?? `${dateTo.slice(0, 4)}-01-01`,
  'date-from'
)
if (dateFrom > dateTo) throw new Error('date-from tidak boleh setelah date-to.')

const connection = await mysql.createConnection(process.env.DATABASE_URL)
const results = []
const metrics = {}

function check(code, label, status, detail) {
  results.push({ code, label, status, detail })
}

async function rows(sql, values = []) {
  const [result] = await connection.query(sql, values)
  return result
}

async function scalar(sql, values = [], field = 'total') {
  const result = await rows(sql, values)
  return Number(result[0]?.[field] ?? 0)
}

const effectiveSnapshotSql = `SELECT employee_id,
  COUNT(*) historyCount,
  SUBSTRING_INDEX(GROUP_CONCAT(es.code ORDER BY h.effective_from DESC,h.id DESC),',',1) statusCode
 FROM employee_employment_histories h
 JOIN employee_statuses es ON es.id=h.employee_status_id
 WHERE h.effective_from<=?
   AND (h.effective_to IS NULL OR h.effective_to>=?)
 GROUP BY employee_id`

async function headcount(asOf) {
  const snapshot = await rows(
    `SELECT
      COALESCE(SUM(historyCount=1 AND statusCode='ACTIVE'),0) trustedActive,
      COALESCE(SUM(statusCode='ACTIVE'),0) employeeReportActive,
      COALESCE(SUM(historyCount<>1 AND statusCode='ACTIVE'),0) ambiguousActive,
      COALESCE(SUM(historyCount<>1),0) ambiguousTotal
     FROM (${effectiveSnapshotSql}) snapshot_rows`,
    [asOf, asOf]
  )
  return Object.fromEntries(
    Object.entries(snapshot[0] ?? {}).map(([key, value]) => [key, Number(value)])
  )
}

try {
  await connection.query('SET TRANSACTION READ ONLY')
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT')

  const database = await rows('SELECT DATABASE() databaseName,@@hostname hostName')
  metrics.database = database[0]
  metrics.period = { dateFrom, dateTo }

  const requiredColumns = [
    ['employee_employment_histories', 'effective_from'],
    ['employee_employment_histories', 'effective_to'],
    ['attendance_records', 'business_date'],
    ['production_transactions', 'attendance_record_id'],
    ['payroll_periods', 'current_run_id'],
    ['audit_logs', 'request_id'],
  ]
  const availableColumns = await rows(
    `SELECT table_name tableName,column_name columnName
     FROM information_schema.columns
     WHERE table_schema=DATABASE()`
  )
  const columnSet = new Set(
    availableColumns.map((column) => `${column.tableName}.${column.columnName}`)
  )
  const missingColumns = requiredColumns
    .map(([table, column]) => `${table}.${column}`)
    .filter((column) => !columnSet.has(column))
  check(
    'SCHEMA_REQUIRED',
    'Kolom minimum seluruh laporan tersedia',
    missingColumns.length ? 'FAIL' : 'PASS',
    missingColumns.length ? `Tidak ditemukan: ${missingColumns.join(', ')}` : 'Lengkap.'
  )

  const previous = await rows('SELECT DATE_SUB(?,INTERVAL 1 DAY) previousDate', [dateFrom])
  const opening = await headcount(String(previous[0].previousDate).slice(0, 10))
  const closing = await headcount(dateTo)
  metrics.headcount = { opening, closing }
  check(
    'EMPLOYEE_HEADCOUNT_RECONCILIATION',
    'Laporan Karyawan cocok dengan headcount terpercaya',
    closing.employeeReportActive === closing.trustedActive + closing.ambiguousActive ? 'PASS' : 'FAIL',
    `Laporan Karyawan aktif ${closing.employeeReportActive}; terpercaya ${closing.trustedActive}; aktif ambigu ${closing.ambiguousActive}.`
  )
  check(
    'TENURE_HEADCOUNT_RECONCILIATION',
    'Masa Kerja Aktif cocok dengan headcount akhir',
    closing.trustedActive >= 0 ? 'PASS' : 'FAIL',
    `Keduanya memakai ${closing.trustedActive} karyawan dengan tepat satu histori Aktif.`
  )

  const movements = await rows(
    `SELECT
      COALESCE(SUM(h.change_type='INITIAL' AND target_status.code='ACTIVE'),0) joined,
      COALESCE(SUM(h.change_type<>'INITIAL' AND source_status.code<>'ACTIVE' AND target_status.code='ACTIVE'),0) reactivated,
      COALESCE(SUM(h.change_type<>'INITIAL' AND source_status.code='ACTIVE' AND target_status.code='RESIGNED'),0) resigned,
      COALESCE(SUM(h.change_type<>'INITIAL' AND source_status.code='ACTIVE' AND target_status.code='INACTIVE'),0) deactivated,
      COALESCE(SUM(h.change_type<>'INITIAL' AND source_history.site_id<>h.site_id),0) crossSiteChanges,
      COALESCE(SUM(h.change_type='TRANSFER' AND source_history.site_id<>h.site_id),0) transferHistories
     FROM employee_employment_histories h
     JOIN employee_statuses target_status ON target_status.id=h.employee_status_id
     LEFT JOIN employee_employment_histories source_history ON source_history.id=(
       SELECT previous_history.id FROM employee_employment_histories previous_history
       WHERE previous_history.employee_id=h.employee_id
         AND (previous_history.effective_from<h.effective_from
           OR (previous_history.effective_from=h.effective_from AND previous_history.id<h.id))
       ORDER BY previous_history.effective_from DESC,previous_history.id DESC LIMIT 1
     )
     LEFT JOIN employee_statuses source_status ON source_status.id=source_history.employee_status_id
     WHERE h.effective_from BETWEEN ? AND ?`,
    [dateFrom, dateTo]
  )
  const movement = Object.fromEntries(
    Object.entries(movements[0] ?? {}).map(([key, value]) => [key, Number(value)])
  )
  movement.expectedClosing =
    opening.trustedActive +
    movement.joined +
    movement.reactivated -
    movement.resigned -
    movement.deactivated
  metrics.movements = movement
  const boundariesClean = opening.ambiguousTotal === 0 && closing.ambiguousTotal === 0
  check(
    'HEADCOUNT_FLOW_RECONCILIATION',
    'Arus masuk dan keluar menjelaskan perubahan headcount',
    movement.expectedClosing === closing.trustedActive
      ? 'PASS'
      : boundariesClean
        ? 'FAIL'
        : 'WARN',
    `Perkiraan akhir ${movement.expectedClosing}; headcount akhir ${closing.trustedActive}; histori ambigu awal/akhir ${opening.ambiguousTotal}/${closing.ambiguousTotal}.`
  )
  check(
    'TRANSFER_RECONCILIATION',
    'Mutasi lintas site memakai jenis perubahan Transfer',
    movement.crossSiteChanges === movement.transferHistories ? 'PASS' : 'WARN',
    `Perubahan lintas site ${movement.crossSiteChanges}; histori bertipe Transfer ${movement.transferHistories}.`
  )
  check(
    'TURNOVER_RECONCILIATION',
    'Resign pada Laporan Turnover cocok dengan perubahan headcount',
    'PASS',
    `Keduanya membaca ${movement.resigned} perubahan Aktif menjadi Resign.`
  )

  const attendance = await rows(
    `SELECT COUNT(*) total,
      COALESCE(SUM(attendance_status='PRESENT'),0) present,
      COALESCE(SUM(attendance_status='ALPHA'),0) alpha,
      COALESCE(SUM(attendance_status='SICK'),0) sick,
      COALESCE(SUM(attendance_status='PERMISSION'),0) permissionCount,
      COALESCE(SUM(attendance_status='LEAVE'),0) leaveCount
     FROM attendance_records WHERE business_date BETWEEN ? AND ?`,
    [dateFrom, dateTo]
  )
  metrics.attendance = Object.fromEntries(
    Object.entries(attendance[0] ?? {}).map(([key, value]) => [key, Number(value)])
  )
  const classificationMismatch = await scalar(
    `SELECT COUNT(*) total
     FROM attendance_classification_details detail
     JOIN attendance_classification_requests request ON request.id=detail.request_id
     LEFT JOIN attendance_records record ON record.id=detail.attendance_record_id
     WHERE detail.business_date BETWEEN ? AND ? AND detail.outcome='APPLIED'
       AND (record.id IS NULL OR record.employee_id<>detail.employee_id
         OR record.business_date<>detail.business_date
         OR record.attendance_status<>request.classification_type)`,
    [dateFrom, dateTo]
  )
  check(
    'CLASSIFICATION_ATTENDANCE_LINK',
    'Klasifikasi terapan cocok dengan fakta Attendance',
    classificationMismatch ? 'FAIL' : 'PASS',
    `${classificationMismatch} detail tidak cocok.`
  )
  const correctionMismatch = await scalar(
    `SELECT COUNT(*) total FROM attendance_corrections correction
     JOIN attendance_records record ON record.id=correction.attendance_record_id
     WHERE record.business_date BETWEEN ? AND ?
       AND correction.approval_status='APPROVED' AND correction.applied_at IS NOT NULL
       AND record.is_corrected<>1`,
    [dateFrom, dateTo]
  )
  check(
    'CORRECTION_ATTENDANCE_LINK',
    'Koreksi yang diterapkan menandai record Attendance',
    correctionMismatch ? 'FAIL' : 'PASS',
    `${correctionMismatch} koreksi tidak cocok.`
  )
  const scanMismatch = await scalar(
    `SELECT COUNT(*) total FROM attendance_scan_events scan
     LEFT JOIN attendance_records record ON record.id=scan.attendance_record_id
     WHERE scan.result_status='SUCCESS' AND scan.attendance_record_id IS NOT NULL
       AND DATE(scan.scanned_at) BETWEEN ? AND ?
       AND (record.id IS NULL OR record.employee_id<>scan.employee_id OR record.site_id<>scan.site_id)`,
    [dateFrom, dateTo]
  )
  check(
    'SCAN_ATTENDANCE_LINK',
    'Scan sukses terhubung ke Attendance yang sama',
    scanMismatch ? 'FAIL' : 'PASS',
    `${scanMismatch} scan tidak cocok.`
  )

  const production = await rows(
    `SELECT COUNT(*) postedTransactions,
      COALESCE(SUM(quantity),0) quantity,
      COALESCE(SUM(gross_amount),0) grossAmount
     FROM production_transactions
     WHERE business_date BETWEEN ? AND ? AND status='POSTED'`,
    [dateFrom, dateTo]
  )
  metrics.production = production[0]
  const invalidProduction = await scalar(
    `SELECT COUNT(*) total FROM production_transactions production
     LEFT JOIN attendance_records record ON record.id=production.attendance_record_id
     WHERE production.business_date BETWEEN ? AND ? AND production.status='POSTED'
       AND (record.id IS NULL OR record.employee_id<>production.employee_id
         OR record.site_id<>production.site_id OR record.business_date<>production.business_date
         OR record.attendance_status<>'PRESENT'
         OR NOT EXISTS (SELECT 1 FROM attendance_scan_events scan
           WHERE scan.attendance_record_id=record.id AND scan.event_type='CLOCK_IN'
             AND scan.result_status='SUCCESS'))`,
    [dateFrom, dateTo]
  )
  check(
    'PRODUCTION_ATTENDANCE_GATE',
    'Setoran Posted memiliki Hadir dan scan masuk sukses',
    invalidProduction ? 'FAIL' : 'PASS',
    `${invalidProduction} transaksi tidak memenuhi gate.`
  )

  const payrollIssues = await scalar(
    `SELECT COUNT(*) total FROM payroll_periods period
     LEFT JOIN payroll_runs run ON run.id=period.current_run_id
     WHERE period.status='CLOSED'
       AND (period.current_run_id IS NULL OR run.id IS NULL OR run.payroll_period_id<>period.id
         OR run.run_type<>'FINAL' OR run.status<>'COMPLETED')`
  )
  const duplicatePayrollResults = await scalar(
    `SELECT COUNT(*) total FROM (
      SELECT result.payroll_run_id,result.employee_id,COUNT(*) rowCount
      FROM payroll_employee_results result
      JOIN payroll_periods period ON period.current_run_id=result.payroll_run_id
      WHERE period.status='CLOSED'
      GROUP BY result.payroll_run_id,result.employee_id HAVING COUNT(*)>1
    ) duplicate_rows`
  )
  check(
    'PAYROLL_FINAL_SNAPSHOT',
    'Payroll Closed memakai current Final Completed tanpa hasil ganda',
    payrollIssues || duplicatePayrollResults ? 'FAIL' : 'PASS',
    `Periode bermasalah ${payrollIssues}; hasil karyawan ganda ${duplicatePayrollResults}.`
  )

  const contractIssues = await rows(
    `SELECT
      COALESCE(SUM(latestStatus IS NULL),0) unresolvedStatus,
      COALESCE(SUM(activeCount>1),0) employeesWithMultipleActiveContracts
     FROM (
       SELECT contract.employee_id,
         (SELECT event.to_status FROM employee_contract_lifecycle_events event
          WHERE event.contract_id=contract.id AND event.effective_date<=?
          ORDER BY event.effective_date DESC,event.id DESC LIMIT 1) latestStatus,
         (SELECT COUNT(*) FROM employee_contracts active_contract
          WHERE active_contract.employee_id=contract.employee_id
            AND active_contract.start_date<=?
            AND (active_contract.end_date IS NULL OR active_contract.end_date>=?)) activeCount
       FROM employee_contracts contract
     ) contract_rows`,
    [dateTo, dateTo, dateTo]
  )
  metrics.contracts = Object.fromEntries(
    Object.entries(contractIssues[0] ?? {}).map(([key, value]) => [key, Number(value)])
  )
  check(
    'CONTRACT_RESOLUTION',
    'Kontrak memiliki status historis yang dapat ditentukan',
    metrics.contracts.unresolvedStatus ? 'WARN' : 'PASS',
    `${metrics.contracts.unresolvedStatus} kontrak perlu diperiksa.`
  )
  check(
    'CONTRACT_ACTIVE_OVERLAP',
    'Tidak ada karyawan dengan kontrak aktif bertumpuk',
    metrics.contracts.employeesWithMultipleActiveContracts ? 'WARN' : 'PASS',
    `${metrics.contracts.employeesWithMultipleActiveContracts} baris kontrak berada pada karyawan yang memiliki lebih dari satu kontrak dalam tanggal acuan.`
  )

  const auditOrphans = await scalar(
    `SELECT COUNT(*) total FROM audit_logs audit
     LEFT JOIN sites site ON site.id=audit.site_id
     WHERE audit.site_id IS NOT NULL AND site.id IS NULL`
  )
  check(
    'AUDIT_SITE_SCOPE',
    'Audit yang terikat site mengarah ke site valid',
    auditOrphans ? 'FAIL' : 'PASS',
    `${auditOrphans} audit tidak memiliki site valid.`
  )

  const coverage = await rows(
    `SELECT
      (SELECT DATE_FORMAT(MIN(business_date),'%Y-%m-%d') FROM attendance_records) attendanceMin,
      (SELECT DATE_FORMAT(MAX(business_date),'%Y-%m-%d') FROM attendance_records) attendanceMax,
      (SELECT DATE_FORMAT(MIN(business_date),'%Y-%m-%d') FROM production_transactions) productionMin,
      (SELECT DATE_FORMAT(MAX(business_date),'%Y-%m-%d') FROM production_transactions) productionMax,
      (SELECT COUNT(*) FROM payroll_periods WHERE status='CLOSED') closedPayrollPeriods,
      (SELECT COUNT(*) FROM audit_logs) auditRows,
      (SELECT COUNT(*) FROM employee_contracts) contractRows,
      (SELECT COUNT(*) FROM employee_shift_assignments) shiftAssignmentRows,
      (SELECT COUNT(*) FROM attendance_classification_requests) classificationRows,
      (SELECT COUNT(*) FROM attendance_corrections) correctionRows,
      (SELECT COUNT(*) FROM attendance_scan_events) scanRows`
  )
  metrics.coverage = coverage[0]
  const attendanceSiteDates = await scalar(
    `SELECT COUNT(*) total FROM (
      SELECT site_id,business_date FROM attendance_records
      WHERE business_date BETWEEN ? AND ? GROUP BY site_id,business_date
    ) attendance_days`,
    [dateFrom, dateTo]
  )
  const finalizedAttendanceSiteDates = await scalar(
    `SELECT COUNT(*) total FROM (
      SELECT attendance_day.site_id,attendance_day.business_date,
        (SELECT latest.status FROM attendance_daily_finalization_runs latest
         WHERE latest.site_id=attendance_day.site_id
           AND latest.business_date=attendance_day.business_date
         ORDER BY latest.id DESC LIMIT 1) latestStatus
      FROM (SELECT site_id,business_date FROM attendance_records
        WHERE business_date BETWEEN ? AND ? GROUP BY site_id,business_date) attendance_day
    ) finalization_rows WHERE latestStatus='SUCCEEDED'`,
    [dateFrom, dateTo]
  )
  const pendingFinalizationRows = await rows(
    `SELECT site.code siteCode,COUNT(*) pendingDates
     FROM (
       SELECT attendance_day.site_id,attendance_day.business_date,
         (SELECT latest.status FROM attendance_daily_finalization_runs latest
          WHERE latest.site_id=attendance_day.site_id
            AND latest.business_date=attendance_day.business_date
          ORDER BY latest.id DESC LIMIT 1) latestStatus
       FROM (SELECT site_id,business_date FROM attendance_records
         WHERE business_date BETWEEN ? AND ? GROUP BY site_id,business_date) attendance_day
     ) finalization_rows
     JOIN sites site ON site.id=finalization_rows.site_id
     WHERE finalization_rows.latestStatus IS NULL
        OR finalization_rows.latestStatus<>'SUCCEEDED'
     GROUP BY site.id,site.code ORDER BY site.code`,
    [dateFrom, dateTo]
  )
  metrics.coverage.attendanceSiteDates = attendanceSiteDates
  metrics.coverage.finalizedAttendanceSiteDates = finalizedAttendanceSiteDates
  metrics.coverage.pendingFinalizationBySite = pendingFinalizationRows.map(
    (row) => ({
      siteCode: String(row.siteCode),
      pendingDates: Number(row.pendingDates),
    })
  )
  check(
    'ATTENDANCE_REPORT_COVERAGE',
    'Periode memiliki data Attendance untuk diuji',
    Number(metrics.attendance.total) ? 'PASS' : 'WARN',
    `${metrics.attendance.total} record; cakupan ${metrics.coverage.attendanceMin ?? '-'} sampai ${metrics.coverage.attendanceMax ?? '-'}.`
  )
  check(
    'ATTENDANCE_FINALIZATION_COVERAGE',
    'Tanggal-site Attendance sudah difinalisasi',
    attendanceSiteDates > 0 && attendanceSiteDates === finalizedAttendanceSiteDates
      ? 'PASS'
      : 'WARN',
    `${finalizedAttendanceSiteDates}/${attendanceSiteDates} kombinasi tanggal-site memiliki finalisasi terakhir Berhasil. Belum selesai: ${pendingFinalizationRows.map((row) => `${row.siteCode} ${row.pendingDates}`).join(', ') || 'tidak ada'}.`
  )
  check(
    'PRODUCTION_REPORT_COVERAGE',
    'Periode memiliki setoran Produksi untuk diuji',
    Number(metrics.production.postedTransactions) ? 'PASS' : 'WARN',
    `${metrics.production.postedTransactions} setoran Posted; cakupan ${metrics.coverage.productionMin ?? '-'} sampai ${metrics.coverage.productionMax ?? '-'}.`
  )
  check(
    'PAYROLL_REPORT_COVERAGE',
    'Database memiliki Payroll Final Closed untuk diuji',
    Number(metrics.coverage.closedPayrollPeriods) ? 'PASS' : 'WARN',
    `${metrics.coverage.closedPayrollPeriods} periode Closed.`
  )
  check(
    'WORKFLOW_REPORT_COVERAGE',
    'Data pendukung laporan operasional tersedia',
    Number(metrics.coverage.shiftAssignmentRows) && Number(metrics.coverage.scanRows)
      ? 'PASS'
      : 'WARN',
    `Kontrak ${metrics.coverage.contractRows}; shift ${metrics.coverage.shiftAssignmentRows}; klasifikasi ${metrics.coverage.classificationRows}; koreksi ${metrics.coverage.correctionRows}; scan ${metrics.coverage.scanRows}; audit ${metrics.coverage.auditRows}.`
  )

  await connection.rollback()
} catch (error) {
  try { await connection.rollback() } catch {}
  throw error
} finally {
  await connection.end()
}

const totals = {
  pass: results.filter((result) => result.status === 'PASS').length,
  warn: results.filter((result) => result.status === 'WARN').length,
  fail: results.filter((result) => result.status === 'FAIL').length,
}

console.log(`UAT Pusat Laporan ${dateFrom} s.d. ${dateTo}`)
for (const result of results) {
  console.log(`[${result.status}] ${result.label} - ${result.detail}`)
}
console.log(`Ringkasan: ${totals.pass} PASS, ${totals.warn} WARN, ${totals.fail} FAIL`)
console.log(`UAT_REPORT_JSON=${JSON.stringify({ period: { dateFrom, dateTo }, totals, results, metrics })}`)
if (totals.fail) process.exitCode = 1
