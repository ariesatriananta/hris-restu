-- Pemeriksaan read-only Payroll M5E untuk development/staging/UAT.
-- Tidak mengubah data bisnis. Temporary table hanya hidup pada koneksi ini.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @uat_site_code = 'KLATEN';
SET @weekly_start = DATE('2026-08-17'); -- Senin
SET @weekly_end = DATE_ADD(@weekly_start,INTERVAL 6 DAY);
SET @monthly_start = DATE('2026-08-01'); -- tanggal 1
SET @monthly_end = LAST_DAY(@monthly_start);
SET @stale_processing_minutes = 30;

SET @uat_site_id = (
  SELECT MIN(id) FROM sites WHERE code=@uat_site_code AND is_active=1
);

DROP TEMPORARY TABLE IF EXISTS tmp_payroll_uat_dates;
CREATE TEMPORARY TABLE tmp_payroll_uat_dates(
  business_date DATE NOT NULL PRIMARY KEY,
  in_weekly TINYINT(1) NOT NULL,
  in_monthly TINYINT(1) NOT NULL
) ENGINE=InnoDB;

INSERT INTO tmp_payroll_uat_dates(business_date,in_weekly,in_monthly)
WITH RECURSIVE dates AS (
  SELECT LEAST(@weekly_start,@monthly_start) business_date
  UNION ALL
  SELECT DATE_ADD(business_date,INTERVAL 1 DAY)
  FROM dates
  WHERE business_date<GREATEST(@weekly_end,@monthly_end)
)
SELECT
  business_date,
  business_date BETWEEN @weekly_start AND @weekly_end,
  business_date BETWEEN @monthly_start AND @monthly_end
FROM dates;

DROP TEMPORARY TABLE IF EXISTS tmp_payroll_uat_population;
CREATE TEMPORARY TABLE tmp_payroll_uat_population AS
SELECT
  d.business_date,
  eh.employee_id,
  eh.site_id,
  et.code employee_type_code,
  es.allows_attendance,
  d.in_weekly,
  d.in_monthly
FROM tmp_payroll_uat_dates d
JOIN employee_employment_histories eh
  ON eh.site_id=@uat_site_id
 AND eh.effective_from<=d.business_date
 AND (eh.effective_to IS NULL OR eh.effective_to>=d.business_date)
JOIN employee_types et
  ON et.id=eh.employee_type_id
 AND et.code IN ('BORONGAN','HARIAN','TRAINING','BULANAN')
JOIN employee_statuses es ON es.id=eh.employee_status_id
WHERE (
  et.code IN ('BORONGAN','HARIAN','TRAINING') AND d.in_weekly=1
) OR (
  et.code='BULANAN' AND d.in_monthly=1
);

ALTER TABLE tmp_payroll_uat_population
  ADD KEY idx_tmp_payroll_uat_population_type_date(employee_type_code,business_date),
  ADD KEY idx_tmp_payroll_uat_population_employee(employee_id,business_date);

SELECT
  'PARAMETER' check_group,
  CASE
    WHEN @uat_site_id IS NULL THEN 'BLOCKER'
    WHEN DAYOFWEEK(@weekly_start)<>2 OR DATEDIFF(@weekly_end,@weekly_start)<>6 THEN 'BLOCKER'
    WHEN DAY(@monthly_start)<>1 OR @monthly_end<>LAST_DAY(@monthly_start) THEN 'BLOCKER'
    ELSE 'OK'
  END status,
  @uat_site_code site,
  CONCAT(@weekly_start,' s.d. ',@weekly_end) weekly_period,
  CONCAT(@monthly_start,' s.d. ',@monthly_end) monthly_period;

SELECT
  'SCHEMA' check_group,
  required.object_name,
  IF(t.table_name IS NULL,'BLOCKER','OK') status,
  IF(t.table_name IS NULL,'Jalankan migration Payroll sampai M5C.','Tersedia') message
FROM (
  SELECT 'payroll_policy_versions' object_name UNION ALL
  SELECT 'employee_daily_rate_histories' UNION ALL
  SELECT 'employee_salary_histories' UNION ALL
  SELECT 'payroll_time_details' UNION ALL
  SELECT 'payroll_monthly_summaries' UNION ALL
  SELECT 'payroll_monthly_daily_details' UNION ALL
  SELECT 'payroll_approvals' UNION ALL
  SELECT 'payroll_workflow_actions' UNION ALL
  SELECT 'payroll_output_audits'
) required
LEFT JOIN information_schema.tables t
  ON t.table_schema=DATABASE() AND t.table_name=required.object_name
ORDER BY required.object_name;

SELECT
  'POLICY' check_group,
  required.employee_type_code,
  COUNT(policy.id) matching_policies,
  IF(COUNT(policy.id)=1,'OK','BLOCKER') status,
  IF(COUNT(policy.id)=1,'Policy tunggal tersedia.','Pastikan tepat satu policy aktif mencakup awal periode.') message
FROM (
  SELECT 'BORONGAN' employee_type_code,@weekly_start effective_date UNION ALL
  SELECT 'HARIAN',@weekly_start UNION ALL
  SELECT 'TRAINING',@weekly_start UNION ALL
  SELECT 'BULANAN',@monthly_start
) required
LEFT JOIN payroll_policy_versions policy
  ON policy.site_id=@uat_site_id
 AND policy.employee_type_code=required.employee_type_code
 AND policy.status='ACTIVE'
 AND policy.effective_from<=required.effective_date
 AND (policy.effective_to IS NULL OR policy.effective_to>=required.effective_date)
GROUP BY required.employee_type_code
ORDER BY FIELD(required.employee_type_code,'BORONGAN','HARIAN','TRAINING','BULANAN');

SELECT
  'POPULASI' check_group,
  employee_type_code,
  COUNT(DISTINCT employee_id) employees,
  COUNT(*) employee_dates,
  IF(COUNT(DISTINCT employee_id)>0,'OK','BLOCKER') status,
  IF(COUNT(DISTINCT employee_id)>0,'Populasi tersedia.','Tidak ada karyawan eligible pada periode ini.') message
FROM tmp_payroll_uat_population
WHERE allows_attendance=1
GROUP BY employee_type_code
ORDER BY FIELD(employee_type_code,'BORONGAN','HARIAN','TRAINING','BULANAN');

SELECT
  'HISTORI_EMPLOYMENT' check_group,
  COUNT(*) ambiguous_employee_dates,
  IF(COUNT(*)=0,'OK','BLOCKER') status,
  IF(COUNT(*)=0,'Tidak ada histori bertumpang-tindih.','Koreksi histori employment yang aktif bersamaan pada tanggal sama.') message
FROM (
  SELECT employee_id,business_date
  FROM tmp_payroll_uat_population
  GROUP BY employee_id,business_date
  HAVING COUNT(*)<>1
) ambiguous;

SELECT
  'MASTER_NOMINAL' check_group,
  population.employee_type_code,
  SUM(
    population.employee_type_code IN ('HARIAN','TRAINING')
    AND NOT EXISTS (
      SELECT 1 FROM employee_daily_rate_histories rate
      WHERE rate.employee_id=population.employee_id
        AND rate.site_id=population.site_id
        AND rate.employee_type_code=population.employee_type_code
        AND rate.status='ACTIVE'
        AND rate.effective_from<=population.business_date
        AND (rate.effective_to IS NULL OR rate.effective_to>=population.business_date)
    )
  ) missing_daily_rate_dates,
  SUM(
    population.employee_type_code='BULANAN'
    AND NOT EXISTS (
      SELECT 1 FROM employee_salary_histories salary
      WHERE salary.employee_id=population.employee_id
        AND COALESCE(salary.status,'ACTIVE')='ACTIVE'
        AND salary.basic_salary>0
        AND salary.effective_from<=population.business_date
        AND (salary.effective_to IS NULL OR salary.effective_to>=population.business_date)
    )
  ) missing_salary_dates,
  IF(
    SUM(
      (population.employee_type_code IN ('HARIAN','TRAINING') AND NOT EXISTS (
        SELECT 1 FROM employee_daily_rate_histories rate
        WHERE rate.employee_id=population.employee_id
          AND rate.site_id=population.site_id
          AND rate.employee_type_code=population.employee_type_code
          AND rate.status='ACTIVE'
          AND rate.effective_from<=population.business_date
          AND (rate.effective_to IS NULL OR rate.effective_to>=population.business_date)
      ))
      OR (population.employee_type_code='BULANAN' AND NOT EXISTS (
        SELECT 1 FROM employee_salary_histories salary
        WHERE salary.employee_id=population.employee_id
          AND COALESCE(salary.status,'ACTIVE')='ACTIVE'
          AND salary.basic_salary>0
          AND salary.effective_from<=population.business_date
          AND (salary.effective_to IS NULL OR salary.effective_to>=population.business_date)
      ))
    )=0,'OK','BLOCKER'
  ) status
FROM tmp_payroll_uat_population population
WHERE population.employee_type_code IN ('HARIAN','TRAINING','BULANAN')
  AND population.allows_attendance=1
GROUP BY population.employee_type_code
ORDER BY FIELD(population.employee_type_code,'HARIAN','TRAINING','BULANAN');

SELECT
  'ATTENDANCE' check_group,
  population.employee_type_code,
  COUNT(DISTINCT population.employee_id) employees,
  COUNT(DISTINCT attendance.id) records,
  COALESCE(SUM(attendance.attendance_status='PRESENT'),0) present_records,
  COALESCE(SUM(attendance.attendance_status='ABSENT'),0) alpha_records,
  COALESCE(SUM(attendance.attendance_status='PERMISSION'),0) permission_records,
  IF(COUNT(DISTINCT attendance.id)>0,'OK','ATTENTION') status
FROM tmp_payroll_uat_population population
LEFT JOIN attendance_records attendance
  ON attendance.employee_id=population.employee_id
 AND attendance.site_id=population.site_id
 AND attendance.business_date=population.business_date
WHERE population.allows_attendance=1
GROUP BY population.employee_type_code
ORDER BY FIELD(population.employee_type_code,'BORONGAN','HARIAN','TRAINING','BULANAN');

SELECT
  'FINALISASI_ATTENDANCE' check_group,
  COUNT(*) expected_work_dates,
  COALESCE(SUM(latest.status='SUCCEEDED'),0) finalized_dates,
  COALESCE(SUM(latest.status='RUNNING'),0) running_dates,
  COALESCE(SUM(latest.status IS NULL OR latest.status IN ('FAILED','SKIPPED')),0) invalid_dates,
  IF(
    COUNT(*)=COALESCE(SUM(latest.status='SUCCEEDED'),0),
    'OK','BLOCKER'
  ) status,
  IF(
    COUNT(*)=COALESCE(SUM(latest.status='SUCCEEDED'),0),
    'Seluruh tanggal kerja telah difinalisasi.',
    'Finalisasi Attendance yang belum SUCCEEDED harus diselesaikan.'
  ) message
FROM (
  SELECT DISTINCT population.business_date
  FROM tmp_payroll_uat_population population
  JOIN employee_shift_assignments assignment
    ON assignment.employee_id=population.employee_id
   AND assignment.effective_from<=population.business_date
   AND (assignment.effective_to IS NULL OR assignment.effective_to>=population.business_date)
  WHERE population.allows_attendance=1
    AND JSON_CONTAINS(
      assignment.work_days_json,
      CAST((((DAYOFWEEK(population.business_date)+5)%7)+1) AS CHAR),
      '$'
    )
) expected
LEFT JOIN attendance_daily_finalization_runs latest
  ON latest.id=(
    SELECT MAX(candidate.id)
    FROM attendance_daily_finalization_runs candidate
    WHERE candidate.site_id=@uat_site_id
      AND candidate.business_date=expected.business_date
  );

SELECT
  'WORKFLOW_ATTENDANCE' check_group,
  (SELECT COUNT(*)
   FROM attendance_corrections correction
   JOIN attendance_records attendance ON attendance.id=correction.attendance_record_id
   WHERE attendance.site_id=@uat_site_id
     AND attendance.business_date BETWEEN LEAST(@weekly_start,@monthly_start)
                                      AND GREATEST(@weekly_end,@monthly_end)
     AND correction.approval_status='PENDING') pending_corrections,
  (SELECT COUNT(*)
   FROM attendance_classification_requests request
   WHERE request.site_id=@uat_site_id
     AND request.approval_status='PENDING'
     AND request.start_date<=GREATEST(@weekly_end,@monthly_end)
     AND request.end_date>=LEAST(@weekly_start,@monthly_start)) pending_classifications,
  IF(
    (SELECT COUNT(*)
     FROM attendance_corrections correction
     JOIN attendance_records attendance ON attendance.id=correction.attendance_record_id
     WHERE attendance.site_id=@uat_site_id
       AND attendance.business_date BETWEEN LEAST(@weekly_start,@monthly_start)
                                        AND GREATEST(@weekly_end,@monthly_end)
       AND correction.approval_status='PENDING')=0
    AND
    (SELECT COUNT(*) FROM attendance_classification_requests request
     WHERE request.site_id=@uat_site_id AND request.approval_status='PENDING'
       AND request.start_date<=GREATEST(@weekly_end,@monthly_end)
       AND request.end_date>=LEAST(@weekly_start,@monthly_start))=0,
    'OK','BLOCKER'
  ) status;

SELECT
  'REKENING' check_group,
  population.employee_type_code,
  COUNT(DISTINCT CASE
    WHEN employee.bank_name IS NULL OR TRIM(employee.bank_name)=''
      OR employee.bank_account_number IS NULL OR TRIM(employee.bank_account_number)=''
      OR employee.bank_account_name IS NULL OR TRIM(employee.bank_account_name)=''
    THEN employee.id END
  ) employees_missing_bank,
  IF(COUNT(DISTINCT CASE
    WHEN employee.bank_name IS NULL OR TRIM(employee.bank_name)=''
      OR employee.bank_account_number IS NULL OR TRIM(employee.bank_account_number)=''
      OR employee.bank_account_name IS NULL OR TRIM(employee.bank_account_name)=''
    THEN employee.id END)=0,'OK','BLOCKER') status,
  'Lengkapi rekening melalui Master Karyawan; check ini tidak mengubah data rekening.' message
FROM tmp_payroll_uat_population population
JOIN employees employee ON employee.id=population.employee_id
WHERE population.allows_attendance=1
GROUP BY population.employee_type_code
ORDER BY FIELD(population.employee_type_code,'BORONGAN','HARIAN','TRAINING','BULANAN');

SELECT
  'PRODUKSI_BORONGAN' check_group,
  COUNT(DISTINCT transaction_row.id) posted_transactions,
  COUNT(DISTINCT transaction_row.employee_id) employees_with_production,
  IF(COUNT(DISTINCT transaction_row.id)>0,'OK','BLOCKER') status,
  IF(COUNT(DISTINCT transaction_row.id)>0,'Transaksi POSTED tersedia.','Jalankan seed Produksi atau catat setoran valid.') message
FROM production_transactions transaction_row
JOIN tmp_payroll_uat_population population
  ON population.employee_id=transaction_row.employee_id
 AND population.site_id=transaction_row.site_id
 AND population.business_date=transaction_row.business_date
 AND population.employee_type_code='BORONGAN'
WHERE transaction_row.status='POSTED';

SELECT
  'RUN' check_group,
  SUM(run.status='PROCESSING') processing_runs,
  SUM(run.status='PROCESSING'
      AND run.calculation_started_at<DATE_SUB(NOW(3),INTERVAL @stale_processing_minutes MINUTE)) stale_processing_runs,
  SUM(run.status='FAILED') failed_runs,
  IF(COALESCE(SUM(run.status='PROCESSING'
      AND run.calculation_started_at<DATE_SUB(NOW(3),INTERVAL @stale_processing_minutes MINUTE)),0)=0,'OK','BLOCKER') status
FROM payroll_runs run
JOIN payroll_periods period ON period.id=run.payroll_period_id
WHERE period.site_id=@uat_site_id
  AND (
    (period.employee_type_code IN ('BORONGAN','HARIAN','TRAINING')
      AND period.period_start<=@weekly_end AND period.period_end>=@weekly_start)
    OR
    (period.employee_type_code='BULANAN'
      AND period.period_start<=@monthly_end AND period.period_end>=@monthly_start)
  );

SELECT
  'SNAPSHOT_AGGREGATE' check_group,
  run.uid run_uid,
  period.period_code,
  run.status run_status,
  run.employee_count snapshot_employees,
  COUNT(result.id) detail_employees,
  run.total_net_pay snapshot_net,
  COALESCE(SUM(result.net_pay),0) detail_net,
  IF(
    run.employee_count=COUNT(result.id)
    AND run.total_net_pay=COALESCE(SUM(result.net_pay),0),
    'OK','BLOCKER'
  ) status
FROM payroll_runs run
JOIN payroll_periods period ON period.id=run.payroll_period_id
LEFT JOIN payroll_employee_results result ON result.payroll_run_id=run.id
WHERE period.site_id=@uat_site_id
  AND run.status='COMPLETED'
  AND (
    (period.employee_type_code IN ('BORONGAN','HARIAN','TRAINING')
      AND period.period_start<=@weekly_end AND period.period_end>=@weekly_start)
    OR
    (period.employee_type_code='BULANAN'
      AND period.period_start<=@monthly_end AND period.period_end>=@monthly_start)
  )
GROUP BY run.id,period.id
ORDER BY run.id;

SELECT
  'INDEX' check_group,
  required.table_name,
  required.index_name,
  IF(stat.index_name IS NULL,'ATTENTION','OK') status,
  IF(stat.index_name IS NULL,'Evaluasi index sebelum UAT volume besar.','Index tersedia.') message
FROM (
  SELECT 'employee_employment_histories' table_name,'idx_employment_history_site_dates_employee' index_name UNION ALL
  SELECT 'employee_daily_rate_histories','idx_employee_daily_rate_employee_dates' UNION ALL
  SELECT 'employee_salary_histories','idx_employee_salary_status' UNION ALL
  SELECT 'payroll_periods','idx_payroll_periods_scheme_dates' UNION ALL
  SELECT 'payroll_runs','uq_payroll_runs_processing_period' UNION ALL
  SELECT 'payroll_employee_results','idx_payroll_employee_period' UNION ALL
  SELECT 'payroll_time_details','uq_payroll_time_result_date' UNION ALL
  SELECT 'payroll_monthly_daily_details','uq_payroll_monthly_daily_result_date'
) required
LEFT JOIN information_schema.statistics stat
  ON stat.table_schema=DATABASE()
 AND stat.table_name=required.table_name
 AND stat.index_name=required.index_name
GROUP BY required.table_name,required.index_name,stat.index_name
ORDER BY required.table_name,required.index_name;

DROP TEMPORARY TABLE IF EXISTS tmp_payroll_uat_population;
DROP TEMPORARY TABLE IF EXISTS tmp_payroll_uat_dates;
