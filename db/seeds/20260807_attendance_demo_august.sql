-- Dataset demo Attendance 1-6 Agustus 2026.
--
-- PERINGATAN:
--   1. Script ini menghapus SELURUH data operasional Attendance dan seluruh
--      penugasan shift yang ada, lalu membangun ulang dataset demo.
--   2. Jalankan hanya pada environment development/uji.
--   3. Script berhenti sebelum menghapus data jika Attendance sudah dipakai
--      produksi, payroll 1-6 Agustus sudah CLOSED, master shift/HR tidak siap,
--      atau histori employment karyawan aktif tidak tunggal dan konsisten.
--   4. Pola data memakai CRC32, sehingga skenario karyawan-tanggal stabil
--      setiap kali script diulang. UID boleh berubah karena data lama dihapus.
--   5. Assignment dibuat untuk seluruh karyawan ACTIVE saat eksekusi. Record dan
--      scan per tanggal tetap mengikuti employee_employment_histories yang
--      allows_attendance=1, sama seperti engine Monitoring/Rekap.

SET @seed_from = '2026-08-01';
SET @seed_to = '2026-08-06';
SET @seed_version = 'attendance-demo-202608-v1';

DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_dates;
CREATE TEMPORARY TABLE tmp_attendance_seed_dates (
  business_date DATE NOT NULL PRIMARY KEY,
  iso_weekday TINYINT UNSIGNED NOT NULL,
  is_workday TINYINT(1) NOT NULL
) ENGINE=InnoDB;

INSERT INTO tmp_attendance_seed_dates (business_date,iso_weekday,is_workday)
VALUES
  ('2026-08-01',6,0),
  ('2026-08-02',7,0),
  ('2026-08-03',1,1),
  ('2026-08-04',2,1),
  ('2026-08-05',3,1),
  ('2026-08-06',4,1);

DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_sites;
CREATE TEMPORARY TABLE tmp_attendance_seed_sites AS
SELECT
  s.id site_id,
  s.code site_code,
  (
    SELECT sh.id
    FROM shifts sh
    WHERE sh.site_id=s.id
      AND sh.code='BORONGAN_DEFAULT'
      AND sh.is_active=1
    ORDER BY sh.id
    LIMIT 1
  ) shift_id,
  (
    SELECT MIN(u.id)
    FROM users u
    JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id AND r.code='HR_OFFICER'
    JOIN user_site_access usa ON usa.user_id=u.id AND usa.site_id=s.id
    WHERE u.status='ACTIVE'
  ) hr_user_id,
  CAST(NULL AS UNSIGNED) device_id
FROM sites s
WHERE s.is_active=1
  AND s.code IN ('JEPARA','KLATEN','SEMARANG');

ALTER TABLE tmp_attendance_seed_sites
  ADD PRIMARY KEY (site_id),
  ADD UNIQUE KEY uq_tmp_attendance_seed_site_code (site_code);

DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_employees;
CREATE TEMPORARY TABLE tmp_attendance_seed_employees AS
SELECT
  e.id employee_id,
  e.uid employee_uid,
  e.employee_number,
  e.full_name employee_name,
  e.current_site_id site_id,
  e.employee_type_id,
  tss.shift_id,
  tss.hr_user_id
FROM employees e
JOIN employee_statuses current_status
  ON current_status.id=e.employee_status_id
 AND current_status.code='ACTIVE'
 AND current_status.allows_attendance=1
JOIN tmp_attendance_seed_sites tss ON tss.site_id=e.current_site_id;

ALTER TABLE tmp_attendance_seed_employees
  ADD PRIMARY KEY (employee_id),
  ADD KEY idx_tmp_attendance_seed_employee_site (site_id);

-- Eligibility harian tetap mengikuti histori employment, bukan status current
-- semata. Karyawan yang baru aktif di tengah periode hanya mendapat record
-- sejak tanggal efektifnya; histori INACTIVE tidak dipalsukan oleh seed.
DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_eligible_dates;
CREATE TEMPORARY TABLE tmp_attendance_seed_eligible_dates AS
SELECT
  tse.employee_id,
  d.business_date,
  MAX(eh.site_id) site_id
FROM tmp_attendance_seed_employees tse
CROSS JOIN tmp_attendance_seed_dates d
JOIN employee_employment_histories eh
  ON eh.employee_id=tse.employee_id
 AND eh.effective_from<=d.business_date
 AND (eh.effective_to IS NULL OR eh.effective_to>=d.business_date)
JOIN employee_statuses history_status
  ON history_status.id=eh.employee_status_id
GROUP BY tse.employee_id,d.business_date,tse.site_id
HAVING COUNT(eh.id)=1
   AND MAX(history_status.allows_attendance)=1
   AND MAX(eh.site_id)=tse.site_id;

ALTER TABLE tmp_attendance_seed_eligible_dates
  ADD PRIMARY KEY (employee_id,business_date),
  ADD KEY idx_tmp_attendance_seed_eligible_site_date (site_id,business_date);

DROP PROCEDURE IF EXISTS assert_attendance_demo_seed_ready;
DELIMITER $$
CREATE PROCEDURE assert_attendance_demo_seed_ready()
BEGIN
  DECLARE active_total BIGINT DEFAULT 0;
  DECLARE eligible_total BIGINT DEFAULT 0;

  IF EXISTS (
    SELECT 1
    FROM production_transactions
    WHERE attendance_record_id IS NOT NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: Attendance sudah direferensikan transaksi produksi.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM payroll_periods
    WHERE status NOT IN ('DRAFT','CANCELLED')
  ) OR EXISTS (
    SELECT 1
    FROM payroll_attendance_summaries
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: payroll sudah dihitung/disetujui/ditutup atau memiliki snapshot Attendance.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_attendance_seed_sites
    WHERE shift_id IS NULL OR hr_user_id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: setiap site aktif wajib punya BORONGAN_DEFAULT aktif dan HR Officer aktif.';
  END IF;

  IF (SELECT COUNT(*) FROM tmp_attendance_seed_sites)<>3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: site aktif Jepara, Klaten, dan Semarang wajib tersedia.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_attendance_seed_sites tss
    JOIN shifts sh ON sh.id=tss.shift_id
    WHERE sh.start_time<>'06:00:00'
       OR sh.end_time<>'15:00:00'
       OR sh.crosses_midnight<>0
       OR sh.late_tolerance_minutes<>15
       OR sh.early_leave_tolerance_minutes<>15
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: BORONGAN_DEFAULT wajib 06:00-15:00 dengan toleransi masuk/pulang 15 menit.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_attendance_seed_sites tss
    WHERE tss.site_code NOT IN ('JEPARA','KLATEN')
      AND NOT EXISTS (
        SELECT 1
        FROM scan_devices d
        WHERE d.site_id=tss.site_id
          AND d.is_active=1
          AND d.activated_at IS NOT NULL
      )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: site selain Jepara/Klaten belum punya perangkat scan teraktivasi.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM attendance_calendar_events
    WHERE cancelled_at IS NULL
      AND event_date BETWEEN @seed_from AND @seed_to
  ) OR EXISTS (
    SELECT 1
    FROM attendance_calendar_site_rules
    WHERE cancelled_at IS NULL
      AND business_date BETWEEN @seed_from AND @seed_to
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: ada aturan kalender aktif 1-6 Agustus; dataset ini mengasumsikan Senin-Jumat biasa.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_attendance_seed_employees tse
    CROSS JOIN tmp_attendance_seed_dates d
    JOIN employee_employment_histories eh
      ON eh.employee_id=tse.employee_id
     AND eh.effective_from<=d.business_date
     AND (eh.effective_to IS NULL OR eh.effective_to>=d.business_date)
    GROUP BY tse.employee_id,d.business_date
    HAVING COUNT(eh.id)>1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: ada histori employment aktif yang tumpang tindih pada tanggal seed.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_attendance_seed_employees tse
    JOIN employee_employment_histories eh
      ON eh.employee_id=tse.employee_id
     AND eh.effective_from<=@seed_to
     AND (eh.effective_to IS NULL OR eh.effective_to>=@seed_from)
    JOIN employee_statuses history_status
      ON history_status.id=eh.employee_status_id
     AND history_status.allows_attendance=1
    WHERE eh.site_id<>tse.site_id
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: histori site yang mengizinkan Attendance berbeda dari current site.';
  END IF;

  SELECT COUNT(*) INTO active_total
  FROM employees e
  JOIN employee_statuses es
    ON es.id=e.employee_status_id
   AND es.code='ACTIVE'
   AND es.allows_attendance=1;

  SELECT COUNT(*) INTO eligible_total
  FROM tmp_attendance_seed_employees;

  IF active_total<>eligible_total THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tidak semua karyawan aktif berada pada tiga site target.';
  END IF;
END$$
DELIMITER ;

CALL assert_attendance_demo_seed_ready();

DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_scenarios;
CREATE TEMPORARY TABLE tmp_attendance_seed_scenarios AS
SELECT
  tse.employee_id,
  tse.employee_uid,
  tse.employee_number,
  tse.site_id,
  tse.shift_id,
  tse.hr_user_id,
  tss.device_id,
  d.business_date,
  d.iso_weekday,
  d.is_workday,
  MOD(CRC32(CONCAT(@seed_version,'|scenario|',tse.employee_uid,'|',d.business_date)),1000) scenario_bucket,
  MOD(CRC32(CONCAT(@seed_version,'|clock-in|',tse.employee_uid,'|',d.business_date)),1000) clock_in_bucket,
  MOD(CRC32(CONCAT(@seed_version,'|clock-out|',tse.employee_uid,'|',d.business_date)),1000) clock_out_bucket,
  MOD(CRC32(CONCAT(@seed_version,'|workflow|',tse.employee_uid,'|',d.business_date)),100) workflow_bucket,
  MOD(CRC32(CONCAT(@seed_version,'|kind|',tse.employee_uid,'|',d.business_date)),100) kind_bucket,
  CAST(NULL AS CHAR(30)) scenario
FROM tmp_attendance_seed_employees tse
JOIN tmp_attendance_seed_sites tss ON tss.site_id=tse.site_id
JOIN tmp_attendance_seed_eligible_dates eligible
  ON eligible.employee_id=tse.employee_id
 AND eligible.site_id=tse.site_id
JOIN tmp_attendance_seed_dates d
  ON d.business_date=eligible.business_date;

ALTER TABLE tmp_attendance_seed_scenarios
  ADD PRIMARY KEY (employee_id,business_date),
  ADD KEY idx_tmp_attendance_seed_scenario (site_id,business_date,scenario);

UPDATE tmp_attendance_seed_scenarios
SET scenario=CASE
  WHEN is_workday=0 AND scenario_bucket<25 THEN 'OFFDAY_PRESENT'
  WHEN is_workday=0 THEN 'WEEKLY_OFF'
  WHEN scenario_bucket<800 THEN 'NORMAL'
  WHEN scenario_bucket<870 THEN 'LATE'
  WHEN scenario_bucket<900 THEN 'EARLY_LEAVE'
  WHEN scenario_bucket<910 THEN 'LATE_EARLY'
  WHEN scenario_bucket<950 THEN 'ABNORMAL'
  WHEN scenario_bucket<985 THEN 'CLASSIFICATION'
  ELSE 'ALPHA'
END;

-- Pastikan setiap karyawan memiliki minimal satu scan sukses pada periode.
DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_without_scan;
CREATE TEMPORARY TABLE tmp_attendance_seed_without_scan AS
SELECT employee_id
FROM tmp_attendance_seed_scenarios
GROUP BY employee_id
HAVING SUM(
  scenario IN (
    'NORMAL','LATE','EARLY_LEAVE','LATE_EARLY','ABNORMAL','OFFDAY_PRESENT'
  )
)=0;

ALTER TABLE tmp_attendance_seed_without_scan
  ADD PRIMARY KEY (employee_id);

UPDATE tmp_attendance_seed_scenarios target
JOIN tmp_attendance_seed_without_scan missing
  ON missing.employee_id=target.employee_id
SET target.scenario='NORMAL'
WHERE target.business_date='2026-08-03';

DROP TEMPORARY TABLE tmp_attendance_seed_without_scan;

DROP PROCEDURE IF EXISTS seed_attendance_demo_august;
DELIMITER $$
CREATE PROCEDURE seed_attendance_demo_august()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  -- Guard diulang di dalam prosedur destruktif. Jadi runner yang dikonfigurasi
  -- melanjutkan batch setelah error tetap tidak dapat mencapai DELETE.
  CALL assert_attendance_demo_seed_ready();

  START TRANSACTION;

-- Jepara dan Klaten belum memiliki terminal operasional. Perangkat demo ini
-- hanya menjadi referensi histori seed; token sengaja NULL agar tidak dapat
-- dipakai mengakses endpoint scan.
INSERT INTO scan_devices (
  uid,site_id,code,name,device_type,activated_at,activated_by,
  location_description,is_active,created_by,updated_by
)
SELECT
  UUID(),tss.site_id,'ATT-DEMO-202608','Terminal Demo Attendance Agustus 2026',
  'TERMINAL','2026-07-31 08:00:00.000',tss.hr_user_id,
  'Perangkat referensi khusus dataset demo; tidak memiliki token login.',1,
  tss.hr_user_id,tss.hr_user_id
FROM tmp_attendance_seed_sites tss
WHERE tss.site_code IN ('JEPARA','KLATEN')
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  device_type=VALUES(device_type),
  device_token_hash=NULL,
  activation_code_hash=NULL,
  activation_code_expires_at=NULL,
  activated_at=VALUES(activated_at),
  activated_by=VALUES(activated_by),
  location_description=VALUES(location_description),
  is_active=1,
  updated_by=VALUES(updated_by);

UPDATE tmp_attendance_seed_sites tss
SET tss.device_id=(
  SELECT d.id
  FROM scan_devices d
  WHERE d.site_id=tss.site_id
    AND d.is_active=1
    AND d.activated_at IS NOT NULL
  ORDER BY
    CASE WHEN d.code='ATT-DEMO-202608' THEN 0 ELSE 1 END,
    d.id
  LIMIT 1
);

IF EXISTS (SELECT 1 FROM tmp_attendance_seed_sites WHERE device_id IS NULL) THEN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT='Seed dibatalkan: ada site target tanpa perangkat scan teraktivasi.';
END IF;

UPDATE tmp_attendance_seed_scenarios sc
JOIN tmp_attendance_seed_sites tss ON tss.site_id=sc.site_id
SET sc.device_id=tss.device_id;

-- Bersihkan child terlebih dahulu; jangan menonaktifkan foreign key.
DELETE FROM attendance_classification_details;
DELETE FROM attendance_classification_requests;
DELETE FROM attendance_corrections;
DELETE FROM attendance_scan_events;
DELETE FROM attendance_records;
DELETE FROM attendance_daily_finalization_runs;
DELETE FROM employee_shift_assignments;

-- Tepat satu assignment per karyawan, efektif 1 Agustus dan Senin-Jumat.
INSERT INTO employee_shift_assignments (
  uid,employee_id,shift_id,effective_from,effective_to,work_days_json,
  created_by,updated_by
)
SELECT
  UUID(),tse.employee_id,tse.shift_id,@seed_from,NULL,JSON_ARRAY(1,2,3,4,5),
  tse.hr_user_id,tse.hr_user_id
FROM tmp_attendance_seed_employees tse;

-- Workday selalu memiliki record setelah finalisasi. Weekend hanya disimpan
-- jika benar-benar ada aktivitas scan; sisanya tampil sebagai WEEKLY_OFF virtual.
INSERT INTO attendance_records (
  uid,employee_id,site_id,shift_id,business_date,attendance_status,
  calendar_day_type,calendar_reason_type,
  clock_in_at,clock_out_at,clock_in_device_id,clock_out_device_id,
  clock_in_source,clock_out_source,notes,created_by,updated_by
)
SELECT
  UUID(),s.employee_id,s.site_id,s.shift_id,s.business_date,
  CASE
    WHEN s.scenario IN ('CLASSIFICATION','ALPHA') THEN 'ABSENT'
    ELSE 'PRESENT'
  END,
  CASE WHEN s.is_workday=1 THEN 'WORKDAY' ELSE 'NON_WORKDAY' END,
  CASE WHEN s.is_workday=1 THEN 'SHIFT_WEEKDAY' ELSE 'WEEKLY_OFF' END,
  CASE
    WHEN s.scenario IN ('CLASSIFICATION','ALPHA','WEEKLY_OFF') THEN NULL
    WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=1 THEN NULL
    WHEN s.scenario='LATE' OR s.scenario='LATE_EARLY' THEN
      DATE_ADD(TIMESTAMP(s.business_date,sh.start_time),INTERVAL (16+MOD(s.clock_in_bucket,45)) MINUTE)
    WHEN s.scenario='OFFDAY_PRESENT' THEN
      DATE_ADD(TIMESTAMP(s.business_date,sh.start_time),INTERVAL MOD(s.clock_in_bucket,61) MINUTE)
    ELSE
      DATE_ADD(
        TIMESTAMP(s.business_date,sh.start_time),
        INTERVAL (CAST(MOD(s.clock_in_bucket,31) AS SIGNED)-20) MINUTE
      )
  END,
  CASE
    WHEN s.scenario IN ('CLASSIFICATION','ALPHA','WEEKLY_OFF') THEN NULL
    WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=0 THEN NULL
    WHEN s.scenario='EARLY_LEAVE' OR s.scenario='LATE_EARLY' THEN
      DATE_SUB(TIMESTAMP(s.business_date,sh.end_time),INTERVAL (16+MOD(s.clock_out_bucket,75)) MINUTE)
    WHEN s.scenario='OFFDAY_PRESENT' THEN
      DATE_ADD(
        TIMESTAMP(s.business_date,sh.end_time),
        INTERVAL (CAST(MOD(s.clock_out_bucket,181) AS SIGNED)-120) MINUTE
      )
    ELSE
      DATE_ADD(
        TIMESTAMP(s.business_date,sh.end_time),
        INTERVAL (CAST(MOD(s.clock_out_bucket,41) AS SIGNED)-10) MINUTE
      )
  END,
  CASE
    WHEN s.scenario IN ('CLASSIFICATION','ALPHA','WEEKLY_OFF') THEN NULL
    WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=1 THEN NULL
    ELSE s.device_id
  END,
  CASE
    WHEN s.scenario IN ('CLASSIFICATION','ALPHA','WEEKLY_OFF') THEN NULL
    WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=0 THEN NULL
    ELSE s.device_id
  END,
  CASE
    WHEN s.scenario IN ('CLASSIFICATION','ALPHA','WEEKLY_OFF') THEN NULL
    WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=1 THEN NULL
    ELSE 'TERMINAL'
  END,
  CASE
    WHEN s.scenario IN ('CLASSIFICATION','ALPHA','WEEKLY_OFF') THEN NULL
    WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=0 THEN NULL
    ELSE 'TERMINAL'
  END,
  CASE
    WHEN s.scenario='ALPHA' THEN 'Alpha hasil finalisasi dataset demo.'
    WHEN s.scenario='OFFDAY_PRESENT' THEN 'Kehadiran aktual pada hari nonkerja.'
    ELSE NULL
  END,
  s.hr_user_id,s.hr_user_id
FROM tmp_attendance_seed_scenarios s
JOIN shifts sh ON sh.id=s.shift_id
WHERE s.scenario<>'WEEKLY_OFF';

-- Hitung metrik dari timestamp final dan toleransi master shift.
UPDATE attendance_records ar
JOIN shifts sh ON sh.id=ar.shift_id
SET
  ar.late_minutes=CASE
    WHEN ar.calendar_day_type<>'WORKDAY' OR ar.clock_in_at IS NULL THEN 0
    WHEN TIMESTAMPDIFF(MINUTE,TIMESTAMP(ar.business_date,sh.start_time),ar.clock_in_at)>sh.late_tolerance_minutes
      THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,TIMESTAMP(ar.business_date,sh.start_time),ar.clock_in_at))
    ELSE 0
  END,
  ar.early_leave_minutes=CASE
    WHEN ar.calendar_day_type<>'WORKDAY' OR ar.clock_out_at IS NULL THEN 0
    WHEN TIMESTAMPDIFF(MINUTE,ar.clock_out_at,TIMESTAMP(ar.business_date,sh.end_time))>sh.early_leave_tolerance_minutes
      THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,ar.clock_out_at,TIMESTAMP(ar.business_date,sh.end_time)))
    ELSE 0
  END,
  ar.worked_minutes=CASE
    WHEN ar.clock_in_at IS NULL OR ar.clock_out_at IS NULL THEN NULL
    ELSE GREATEST(0,TIMESTAMPDIFF(MINUTE,ar.clock_in_at,ar.clock_out_at))
  END
WHERE ar.business_date BETWEEN @seed_from AND @seed_to;

-- Event sukses mempertahankan fakta scan mentah, termasuk record yang nanti
-- diperbaiki melalui koreksi HR.
INSERT INTO attendance_scan_events (
  uid,attendance_record_id,employee_id,site_id,device_id,barcode_value,
  event_type,scanned_at,result_status,result_message,idempotency_key,
  ip_address,user_agent,created_by,updated_by
)
SELECT
  UUID(),ar.id,ar.employee_id,ar.site_id,ar.clock_in_device_id,e.employee_number,
  'CLOCK_IN',ar.clock_in_at,'SUCCESS','Clock in berhasil dicatat.',
  CONCAT('SEED-ATT-',DATE_FORMAT(ar.business_date,'%Y%m%d'),'-',ar.employee_id,'-IN'),
  '127.0.0.1','HRIS Attendance Demo Seed',s.hr_user_id,s.hr_user_id
FROM attendance_records ar
JOIN employees e ON e.id=ar.employee_id
JOIN tmp_attendance_seed_sites s ON s.site_id=ar.site_id
WHERE ar.business_date BETWEEN @seed_from AND @seed_to
  AND ar.clock_in_at IS NOT NULL
  AND ar.clock_in_source='TERMINAL';

INSERT INTO attendance_scan_events (
  uid,attendance_record_id,employee_id,site_id,device_id,barcode_value,
  event_type,scanned_at,result_status,result_message,idempotency_key,
  ip_address,user_agent,created_by,updated_by
)
SELECT
  UUID(),ar.id,ar.employee_id,ar.site_id,ar.clock_out_device_id,e.employee_number,
  'CLOCK_OUT',ar.clock_out_at,'SUCCESS','Clock out berhasil dicatat.',
  CONCAT('SEED-ATT-',DATE_FORMAT(ar.business_date,'%Y%m%d'),'-',ar.employee_id,'-OUT'),
  '127.0.0.1','HRIS Attendance Demo Seed',s.hr_user_id,s.hr_user_id
FROM attendance_records ar
JOIN employees e ON e.id=ar.employee_id
JOIN tmp_attendance_seed_sites s ON s.site_id=ar.site_id
WHERE ar.business_date BETWEEN @seed_from AND @seed_to
  AND ar.clock_out_at IS NOT NULL
  AND ar.clock_out_source='TERMINAL';

-- Sejumlah kecil percobaan scan gagal untuk menguji histori terminal.
INSERT INTO attendance_scan_events (
  uid,attendance_record_id,employee_id,site_id,device_id,barcode_value,
  event_type,scanned_at,result_status,result_message,idempotency_key,
  ip_address,user_agent,created_by,updated_by
)
SELECT
  UUID(),ar.id,ar.employee_id,ar.site_id,s.device_id,e.employee_number,
  CASE WHEN MOD(sc.kind_bucket,2)=0 THEN 'CLOCK_IN' ELSE 'CLOCK_OUT' END,
  DATE_ADD(TIMESTAMP(ar.business_date,'12:00:00'),INTERVAL MOD(sc.clock_in_bucket,180) MINUTE),
  CASE WHEN MOD(sc.workflow_bucket,3)=0 THEN 'ERROR' ELSE 'REJECTED' END,
  CASE WHEN MOD(sc.workflow_bucket,3)=0
       THEN 'Gangguan simulasi pada layanan scan.'
       ELSE 'Percobaan scan duplikat ditolak.' END,
  CONCAT('SEED-ATT-',DATE_FORMAT(ar.business_date,'%Y%m%d'),'-',ar.employee_id,'-FAIL'),
  '127.0.0.1','HRIS Attendance Demo Seed',s.hr_user_id,s.hr_user_id
FROM attendance_records ar
JOIN employees e ON e.id=ar.employee_id
JOIN tmp_attendance_seed_scenarios sc
  ON sc.employee_id=ar.employee_id AND sc.business_date=ar.business_date
JOIN tmp_attendance_seed_sites s ON s.site_id=ar.site_id
WHERE MOD(CRC32(CONCAT(@seed_version,'|failed-scan|',sc.employee_uid,'|',ar.business_date)),1000)<7;

-- Klasifikasi hanya LEAVE/SICK/PERMISSION. Alpha tetap ABSENT tanpa request.
INSERT INTO attendance_classification_requests (
  uid,employee_id,site_id,classification_type,start_date,end_date,reason,
  approval_status,requested_by,requested_at,reviewed_by,reviewed_at,
  review_notes,cancelled_by,cancelled_at,created_by,updated_by
)
SELECT
  UUID(),sc.employee_id,sc.site_id,
  CASE
    WHEN sc.kind_bucket<55 THEN 'SICK'
    WHEN sc.kind_bucket<85 THEN 'PERMISSION'
    ELSE 'LEAVE'
  END,
  sc.business_date,sc.business_date,
  CASE
    WHEN sc.kind_bucket<55 THEN 'Kondisi kesehatan tidak memungkinkan bekerja.'
    WHEN sc.kind_bucket<85 THEN 'Keperluan keluarga yang tidak dapat ditinggalkan.'
    ELSE 'Cuti pribadi terencana.'
  END,
  CASE
    WHEN tss.site_code='JEPARA' AND sc.workflow_bucket<80 THEN 'APPROVED'
    WHEN tss.site_code='JEPARA' AND sc.workflow_bucket<95 THEN 'REJECTED'
    WHEN tss.site_code='JEPARA' THEN 'CANCELLED'
    WHEN sc.workflow_bucket<65 THEN 'APPROVED'
    WHEN sc.workflow_bucket<85 THEN 'PENDING'
    WHEN sc.workflow_bucket<95 THEN 'REJECTED'
    ELSE 'CANCELLED'
  END,
  sc.hr_user_id,
  DATE_ADD(TIMESTAMP(DATE_SUB(sc.business_date,INTERVAL 1 DAY),'09:00:00'),INTERVAL MOD(sc.clock_in_bucket,180) MINUTE),
  CASE
    WHEN (tss.site_code='JEPARA' AND sc.workflow_bucket<95)
      OR (tss.site_code<>'JEPARA' AND (sc.workflow_bucket<65 OR sc.workflow_bucket BETWEEN 85 AND 94))
      THEN sc.hr_user_id
    ELSE NULL
  END,
  CASE
    WHEN (tss.site_code='JEPARA' AND sc.workflow_bucket<95)
      OR (tss.site_code<>'JEPARA' AND (sc.workflow_bucket<65 OR sc.workflow_bucket BETWEEN 85 AND 94))
      THEN DATE_ADD(TIMESTAMP(DATE_SUB(sc.business_date,INTERVAL 1 DAY),'13:00:00'),INTERVAL MOD(sc.clock_out_bucket,120) MINUTE)
    ELSE NULL
  END,
  CASE
    WHEN (tss.site_code='JEPARA' AND sc.workflow_bucket<80)
      OR (tss.site_code<>'JEPARA' AND sc.workflow_bucket<65)
      THEN 'Dokumen dan alasan telah diverifikasi.'
    WHEN (tss.site_code='JEPARA' AND sc.workflow_bucket BETWEEN 80 AND 94)
      OR (tss.site_code<>'JEPARA' AND sc.workflow_bucket BETWEEN 85 AND 94)
      THEN 'Bukti atau alasan belum memenuhi ketentuan.'
    ELSE NULL
  END,
  CASE
    WHEN (tss.site_code='JEPARA' AND sc.workflow_bucket>=95)
      OR (tss.site_code<>'JEPARA' AND sc.workflow_bucket>=95)
      THEN sc.hr_user_id
    ELSE NULL
  END,
  CASE
    WHEN (tss.site_code='JEPARA' AND sc.workflow_bucket>=95)
      OR (tss.site_code<>'JEPARA' AND sc.workflow_bucket>=95)
      THEN DATE_ADD(TIMESTAMP(DATE_SUB(sc.business_date,INTERVAL 1 DAY),'11:00:00'),INTERVAL MOD(sc.clock_out_bucket,60) MINUTE)
    ELSE NULL
  END,
  sc.hr_user_id,sc.hr_user_id
FROM tmp_attendance_seed_scenarios sc
JOIN tmp_attendance_seed_sites tss ON tss.site_id=sc.site_id
WHERE sc.scenario='CLASSIFICATION';

INSERT INTO attendance_classification_details (
  uid,request_id,employee_id,business_date,shift_assignment_id,
  attendance_record_id,outcome,notes,created_by,updated_by
)
SELECT
  UUID(),acr.id,acr.employee_id,acr.start_date,esa.id,
  CASE WHEN acr.approval_status='APPROVED' THEN ar.id ELSE NULL END,
  CASE WHEN acr.approval_status='APPROVED' THEN 'APPLIED' ELSE 'PENDING' END,
  CASE WHEN acr.approval_status='APPROVED' THEN NULL ELSE 'Menunggu atau tidak diterapkan karena hasil review.' END,
  acr.requested_by,acr.requested_by
FROM attendance_classification_requests acr
JOIN employee_shift_assignments esa
  ON esa.employee_id=acr.employee_id
 AND esa.effective_from<=acr.start_date
 AND (esa.effective_to IS NULL OR esa.effective_to>=acr.start_date)
JOIN attendance_records ar
  ON ar.employee_id=acr.employee_id AND ar.business_date=acr.start_date;

UPDATE attendance_records ar
JOIN attendance_classification_requests acr
  ON acr.employee_id=ar.employee_id
 AND acr.start_date=ar.business_date
 AND acr.approval_status='APPROVED'
SET
  ar.attendance_status=acr.classification_type,
  ar.notes=acr.reason,
  ar.updated_by=acr.reviewed_by;

-- Koreksi hanya dibuat untuk sebagian record abnormal. Approved diterapkan ke
-- attendance_records; pending/rejected mempertahankan fakta abnormal.
INSERT INTO attendance_corrections (
  uid,attendance_record_id,correction_type,
  old_clock_in_at,new_clock_in_at,old_clock_out_at,new_clock_out_at,
  old_status,new_status,reason,approval_status,requested_by,requested_at,
  reviewed_by,reviewed_at,review_notes,applied_at,created_by,updated_by
)
SELECT
  UUID(),ar.id,
  CASE WHEN ar.clock_in_at IS NULL THEN 'CLOCK_IN' ELSE 'CLOCK_OUT' END,
  NULL,
  CASE WHEN ar.clock_in_at IS NULL
       THEN DATE_SUB(TIMESTAMP(ar.business_date,sh.start_time),INTERVAL MOD(sc.clock_in_bucket,16) MINUTE)
       ELSE NULL END,
  NULL,
  CASE WHEN ar.clock_out_at IS NULL
       THEN DATE_ADD(TIMESTAMP(ar.business_date,sh.end_time),INTERVAL MOD(sc.clock_out_bucket,21) MINUTE)
       ELSE NULL END,
  NULL,NULL,
  CASE WHEN ar.clock_in_at IS NULL
       THEN 'Jam masuk terlewat saat scan awal.'
       ELSE 'Jam pulang terlewat saat scan akhir.' END,
  CASE
    WHEN tss.site_code='JEPARA' AND sc.workflow_bucket<70 THEN 'APPROVED'
    WHEN tss.site_code='JEPARA' THEN 'REJECTED'
    WHEN sc.workflow_bucket<35 THEN 'APPROVED'
    WHEN sc.workflow_bucket<65 THEN 'PENDING'
    WHEN sc.workflow_bucket<75 THEN 'REJECTED'
    ELSE 'CANCELLED'
  END,
  sc.hr_user_id,
  DATE_ADD(TIMESTAMP(DATE_ADD(ar.business_date,INTERVAL 1 DAY),'08:00:00'),INTERVAL MOD(sc.clock_in_bucket,180) MINUTE),
  CASE
    WHEN tss.site_code='JEPARA' OR sc.workflow_bucket<35 OR sc.workflow_bucket BETWEEN 65 AND 74
      THEN sc.hr_user_id
    ELSE NULL
  END,
  CASE
    WHEN tss.site_code='JEPARA' OR sc.workflow_bucket<35 OR sc.workflow_bucket BETWEEN 65 AND 74
      THEN DATE_ADD(TIMESTAMP(DATE_ADD(ar.business_date,INTERVAL 1 DAY),'11:00:00'),INTERVAL MOD(sc.clock_out_bucket,120) MINUTE)
    ELSE NULL
  END,
  CASE
    WHEN (tss.site_code='JEPARA' AND sc.workflow_bucket<70) OR (tss.site_code<>'JEPARA' AND sc.workflow_bucket<35)
      THEN 'Koreksi diverifikasi dari catatan operasional.'
    WHEN tss.site_code='JEPARA' OR sc.workflow_bucket BETWEEN 65 AND 74
      THEN 'Bukti koreksi belum memadai.'
    ELSE NULL
  END,
  CASE
    WHEN (tss.site_code='JEPARA' AND sc.workflow_bucket<70) OR (tss.site_code<>'JEPARA' AND sc.workflow_bucket<35)
      THEN DATE_ADD(TIMESTAMP(DATE_ADD(ar.business_date,INTERVAL 1 DAY),'11:00:00'),INTERVAL MOD(sc.clock_out_bucket,120) MINUTE)
    ELSE NULL
  END,
  sc.hr_user_id,sc.hr_user_id
FROM attendance_records ar
JOIN tmp_attendance_seed_scenarios sc
  ON sc.employee_id=ar.employee_id AND sc.business_date=ar.business_date
JOIN tmp_attendance_seed_sites tss ON tss.site_id=ar.site_id
JOIN shifts sh ON sh.id=ar.shift_id
WHERE sc.scenario='ABNORMAL'
  AND (
    (tss.site_code='JEPARA')
    OR sc.workflow_bucket<75
  );

UPDATE attendance_records ar
JOIN attendance_corrections ac
  ON ac.attendance_record_id=ar.id AND ac.approval_status='APPROVED'
JOIN shifts sh ON sh.id=ar.shift_id
SET
  ar.clock_in_at=CASE WHEN ac.correction_type='CLOCK_IN' THEN ac.new_clock_in_at ELSE ar.clock_in_at END,
  ar.clock_out_at=CASE WHEN ac.correction_type='CLOCK_OUT' THEN ac.new_clock_out_at ELSE ar.clock_out_at END,
  ar.clock_in_device_id=CASE WHEN ac.correction_type='CLOCK_IN' THEN NULL ELSE ar.clock_in_device_id END,
  ar.clock_out_device_id=CASE WHEN ac.correction_type='CLOCK_OUT' THEN NULL ELSE ar.clock_out_device_id END,
  ar.clock_in_source=CASE WHEN ac.correction_type='CLOCK_IN' THEN 'CORRECTION' ELSE ar.clock_in_source END,
  ar.clock_out_source=CASE WHEN ac.correction_type='CLOCK_OUT' THEN 'CORRECTION' ELSE ar.clock_out_source END,
  ar.late_minutes=CASE
    WHEN ac.correction_type='CLOCK_IN'
      AND TIMESTAMPDIFF(MINUTE,TIMESTAMP(ar.business_date,sh.start_time),ac.new_clock_in_at)>sh.late_tolerance_minutes
      THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,TIMESTAMP(ar.business_date,sh.start_time),ac.new_clock_in_at))
    WHEN ac.correction_type='CLOCK_IN' THEN 0
    ELSE ar.late_minutes
  END,
  ar.early_leave_minutes=CASE
    WHEN ac.correction_type='CLOCK_OUT'
      AND TIMESTAMPDIFF(MINUTE,ac.new_clock_out_at,TIMESTAMP(ar.business_date,sh.end_time))>sh.early_leave_tolerance_minutes
      THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,ac.new_clock_out_at,TIMESTAMP(ar.business_date,sh.end_time)))
    WHEN ac.correction_type='CLOCK_OUT' THEN 0
    ELSE ar.early_leave_minutes
  END,
  ar.worked_minutes=GREATEST(
    0,
    TIMESTAMPDIFF(
      MINUTE,
      CASE WHEN ac.correction_type='CLOCK_IN' THEN ac.new_clock_in_at ELSE ar.clock_in_at END,
      CASE WHEN ac.correction_type='CLOCK_OUT' THEN ac.new_clock_out_at ELSE ar.clock_out_at END
    )
  ),
  ar.is_corrected=1,
  ar.updated_by=ac.reviewed_by;

-- Sabtu dan Minggu tidak memerlukan run finalisasi karena assignment
-- Senin-Jumat. Senin-Kamis diberi run SUCCEEDED; workflow pending tetap akan
-- membuat status rekap PARTIAL pada site terkait, sesuai perilaku aplikasi.
INSERT INTO attendance_daily_finalization_runs (
  uid,site_id,business_date,trigger_type,status,grace_minutes,reason,
  summary,warnings,requested_by,started_at,finished_at,created_by,updated_by
)
SELECT
  UUID(),tss.site_id,d.business_date,'MANUAL','SUCCEEDED',60,
  'Finalisasi dataset demo Attendance Agustus 2026.',
  JSON_OBJECT(
    'eligible',(
      SELECT COUNT(*)
      FROM tmp_attendance_seed_eligible_dates eligible
      WHERE eligible.site_id=tss.site_id
        AND eligible.business_date=d.business_date
    ),
    'preserved',(
      SELECT COUNT(*) FROM attendance_records ar
      WHERE ar.site_id=tss.site_id
        AND ar.business_date=d.business_date
        AND ar.attendance_status<>'ABSENT'
    ),
    'absent',(
      SELECT COUNT(*) FROM attendance_records ar
      WHERE ar.site_id=tss.site_id AND ar.business_date=d.business_date AND ar.attendance_status='ABSENT'
    ),
    'holiday',0,
    'weeklyOff',0,
    'pendingDue',0,
    'missingAssignment',0,
    'ambiguousAssignment',0,
    'ambiguousEmployment',0
  ),
  JSON_ARRAY(),tss.hr_user_id,
  DATE_ADD(TIMESTAMP(DATE_ADD(d.business_date,INTERVAL 1 DAY),'08:00:00'),INTERVAL 0 MINUTE),
  DATE_ADD(TIMESTAMP(DATE_ADD(d.business_date,INTERVAL 1 DAY),'08:00:00'),INTERVAL 2 MINUTE),
  tss.hr_user_id,tss.hr_user_id
FROM tmp_attendance_seed_sites tss
JOIN tmp_attendance_seed_dates d ON d.is_workday=1;

  COMMIT;
END$$
DELIMITER ;

CALL seed_attendance_demo_august();
DROP PROCEDURE seed_attendance_demo_august;
DROP PROCEDURE assert_attendance_demo_seed_ready;

-- Ringkasan verifikasi. Hasil yang diharapkan mengikuti jumlah karyawan aktif
-- saat script dijalankan; tidak ada angka headcount yang di-hard-code.
SELECT 'active_seed_employees' metric,COUNT(*) total
FROM tmp_attendance_seed_employees
UNION ALL
SELECT 'eligible_employee_dates',COUNT(*) FROM tmp_attendance_seed_eligible_dates
UNION ALL
SELECT 'shift_assignments',COUNT(*) FROM employee_shift_assignments
UNION ALL
SELECT 'attendance_records',COUNT(*) FROM attendance_records
UNION ALL
SELECT 'scan_events',COUNT(*) FROM attendance_scan_events
UNION ALL
SELECT 'classification_requests',COUNT(*) FROM attendance_classification_requests
UNION ALL
SELECT 'corrections',COUNT(*) FROM attendance_corrections
UNION ALL
SELECT 'finalization_runs',COUNT(*) FROM attendance_daily_finalization_runs;

SELECT
  s.code site,
  ar.business_date,
  ar.attendance_status,
  COUNT(*) total
FROM attendance_records ar
JOIN sites s ON s.id=ar.site_id
WHERE ar.business_date BETWEEN @seed_from AND @seed_to
GROUP BY s.code,ar.business_date,ar.attendance_status
ORDER BY s.code,ar.business_date,ar.attendance_status;

SELECT
  s.code site,
  ac.approval_status,
  COUNT(*) total
FROM attendance_corrections ac
JOIN attendance_records ar ON ar.id=ac.attendance_record_id
JOIN sites s ON s.id=ar.site_id
GROUP BY s.code,ac.approval_status
ORDER BY s.code,ac.approval_status;

SELECT
  s.code site,
  acr.classification_type,
  acr.approval_status,
  COUNT(*) total
FROM attendance_classification_requests acr
JOIN sites s ON s.id=acr.site_id
GROUP BY s.code,acr.classification_type,acr.approval_status
ORDER BY s.code,acr.classification_type,acr.approval_status;

SELECT
  COUNT(*) active_employees_without_successful_scan
FROM tmp_attendance_seed_employees tse
WHERE NOT EXISTS (
  SELECT 1
  FROM attendance_scan_events ase
  WHERE ase.employee_id=tse.employee_id
    AND ase.result_status='SUCCESS'
    AND ase.scanned_at>=CONCAT(@seed_from,' 00:00:00')
    AND ase.scanned_at<DATE_ADD(@seed_to,INTERVAL 1 DAY)
);

SELECT
  COUNT(*) active_employees_without_eligible_attendance_date
FROM tmp_attendance_seed_employees tse
WHERE NOT EXISTS (
  SELECT 1
  FROM tmp_attendance_seed_eligible_dates eligible
  WHERE eligible.employee_id=tse.employee_id
);

SELECT
  s.code site,
  SUM(ar.attendance_status='PRESENT' AND ar.clock_in_at IS NULL) missing_clock_in,
  SUM(ar.attendance_status='PRESENT' AND ar.clock_out_at IS NULL) missing_clock_out,
  SUM(ar.is_corrected=1) corrected_records,
  SUM(ar.attendance_status='ABSENT') alpha_or_unapproved_classification
FROM attendance_records ar
JOIN sites s ON s.id=ar.site_id
WHERE ar.business_date BETWEEN @seed_from AND @seed_to
GROUP BY s.code
ORDER BY s.code;

DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_scenarios;
DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_eligible_dates;
DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_employees;
DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_sites;
DROP TEMPORARY TABLE IF EXISTS tmp_attendance_seed_dates;
