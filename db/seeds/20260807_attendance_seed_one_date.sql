-- Seed demo operasional Attendance untuk SATU tanggal bisnis.
-- Jalankan hanya pada environment development/uji, setelah script reset.
-- Ubah dua variabel ini sebelum eksekusi. Seed stabil untuk kombinasi
-- employee UID + tanggal + seed version yang sama.
-- Kandidat sepenuhnya mengikuti histori employment yang efektif dan
-- allows_attendance=1 pada @target_date, bukan status/site current karyawan.

-- Table yang akan di insert :
-- attendance_classification_details
-- attendance_classification_requests
-- attendance_corrections
-- attendance_scan_events
-- attendance_records

SET @target_date = DATE('2026-08-07');
SET @seed_version = 'attendance-demo-one-date-v1';

DROP PROCEDURE IF EXISTS seed_attendance_one_date;
DELIMITER $$
CREATE PROCEDURE seed_attendance_one_date()
BEGIN
  DECLARE seeded_records BIGINT DEFAULT 0;
  DECLARE seeded_scan_events BIGINT DEFAULT 0;
  DECLARE seeded_classifications BIGINT DEFAULT 0;
  DECLARE seeded_corrections BIGINT DEFAULT 0;
  DECLARE history_eligible_total BIGINT DEFAULT 0;
  DECLARE seed_employee_total BIGINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_attendance_one_day_scenarios;
    DROP TEMPORARY TABLE IF EXISTS tmp_attendance_one_day_sites;
    DROP TEMPORARY TABLE IF EXISTS tmp_attendance_one_day_employees;
    RESIGNAL;
  END;

  IF @target_date IS NULL OR @seed_version IS NULL OR TRIM(@seed_version)='' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: @target_date dan @seed_version wajib diisi.';
  END IF;

  IF @target_date>CURRENT_DATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tanggal target tidak boleh berada di masa depan.';
  END IF;

  -- Seed harus dimulai dari tanggal yang bersih agar tidak menimpa fakta.
  IF EXISTS (SELECT 1 FROM attendance_records WHERE business_date=@target_date)
     OR EXISTS (SELECT 1 FROM attendance_daily_finalization_runs WHERE business_date=@target_date)
     OR EXISTS (
       SELECT 1 FROM attendance_classification_requests
       WHERE start_date<=@target_date AND end_date>=@target_date
     )
     OR EXISTS (
       SELECT 1 FROM attendance_scan_events
       WHERE attendance_record_id IS NULL AND DATE(scanned_at)=@target_date
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tanggal target belum bersih. Jalankan reset satu tanggal dahulu.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM production_transactions WHERE business_date=@target_date
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tanggal target sudah dipakai transaksi produksi.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM payroll_periods
    WHERE @target_date BETWEEN period_start AND period_end
      AND status NOT IN ('DRAFT','CANCELLED')
  ) OR EXISTS (
    SELECT 1
    FROM payroll_attendance_summaries pas
    JOIN payroll_employee_results per ON per.id=pas.payroll_employee_result_id
    JOIN payroll_periods pp ON pp.id=per.payroll_period_id
    WHERE @target_date BETWEEN pp.period_start AND pp.period_end
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tanggal target sudah masuk perhitungan/snapshot payroll.';
  END IF;

  -- Histori efektif adalah sumber eligibility. Status/site current sengaja
  -- tidak dipakai agar seed tanggal historis tetap konsisten dengan finalisasi.
  IF EXISTS (
    SELECT 1
    FROM employee_employment_histories eh
    JOIN employee_statuses history_status
      ON history_status.id=eh.employee_status_id
     AND history_status.allows_attendance=1
    LEFT JOIN sites s ON s.id=eh.site_id AND s.is_active=1
    WHERE eh.effective_from<=@target_date
      AND (eh.effective_to IS NULL OR eh.effective_to>=@target_date)
      AND s.id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: ada histori eligible pada site yang tidak aktif/tidak ditemukan.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM employees e
    JOIN employee_employment_histories eligible_history
      ON eligible_history.employee_id=e.id
     AND eligible_history.effective_from<=@target_date
     AND (eligible_history.effective_to IS NULL OR eligible_history.effective_to>=@target_date)
    JOIN employee_statuses eligible_status
      ON eligible_status.id=eligible_history.employee_status_id
     AND eligible_status.allows_attendance=1
    WHERE (
      SELECT COUNT(*)
      FROM employee_employment_histories effective_history
      WHERE effective_history.employee_id=e.id
        AND effective_history.effective_from<=@target_date
        AND (effective_history.effective_to IS NULL OR effective_history.effective_to>=@target_date)
    )<>1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: ada histori employment efektif yang tumpang tindih pada tanggal target.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM employee_employment_histories eh
    JOIN employee_statuses history_status
      ON history_status.id=eh.employee_status_id
     AND history_status.allows_attendance=1
    WHERE eh.effective_from<=@target_date
      AND (eh.effective_to IS NULL OR eh.effective_to>=@target_date)
      AND (
        (
          SELECT COUNT(*)
          FROM employee_shift_assignments esa
          WHERE esa.employee_id=eh.employee_id
            AND esa.effective_from<=@target_date
            AND (esa.effective_to IS NULL OR esa.effective_to>=@target_date)
        )<>1
        OR
        (
          SELECT COUNT(*)
          FROM employee_shift_assignments esa
          JOIN shifts sh ON sh.id=esa.shift_id
          WHERE esa.employee_id=eh.employee_id
            AND esa.effective_from<=@target_date
            AND (esa.effective_to IS NULL OR esa.effective_to>=@target_date)
            AND sh.is_active=1
            AND sh.site_id=eh.site_id
            AND JSON_LENGTH(COALESCE(esa.work_days_json,JSON_ARRAY()))>0
        )<>1
      )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: penugasan shift efektif hilang, ambigu, nonaktif, berbeda site, atau tanpa hari kerja.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_attendance_one_day_employees;
  CREATE TEMPORARY TABLE tmp_attendance_one_day_employees AS
  SELECT
    e.id employee_id,
    e.uid employee_uid,
    e.employee_number,
    eh.site_id,
    esa.id shift_assignment_id,
    esa.work_days_json,
    sh.id shift_id,
    sh.start_time,
    sh.end_time,
    sh.crosses_midnight,
    sh.late_tolerance_minutes,
    sh.early_leave_tolerance_minutes
  FROM employees e
  JOIN employee_employment_histories eh
    ON eh.employee_id=e.id
   AND eh.effective_from<=@target_date
   AND (eh.effective_to IS NULL OR eh.effective_to>=@target_date)
  JOIN employee_statuses history_status
    ON history_status.id=eh.employee_status_id
   AND history_status.allows_attendance=1
  JOIN employee_shift_assignments esa
    ON esa.employee_id=e.id
   AND esa.effective_from<=@target_date
   AND (esa.effective_to IS NULL OR esa.effective_to>=@target_date)
  JOIN shifts sh
    ON sh.id=esa.shift_id
   AND sh.site_id=eh.site_id
   AND sh.is_active=1
  WHERE JSON_LENGTH(COALESCE(esa.work_days_json,JSON_ARRAY()))>0;

  ALTER TABLE tmp_attendance_one_day_employees
    ADD PRIMARY KEY (employee_id),
    ADD KEY idx_tmp_attendance_one_day_employee_site (site_id);

  IF NOT EXISTS (SELECT 1 FROM tmp_attendance_one_day_employees) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tidak ada karyawan yang eligible pada tanggal target.';
  END IF;

  SELECT COUNT(DISTINCT eh.employee_id) INTO history_eligible_total
  FROM employee_employment_histories eh
  JOIN employee_statuses history_status
    ON history_status.id=eh.employee_status_id
   AND history_status.allows_attendance=1
  JOIN sites s ON s.id=eh.site_id AND s.is_active=1
  WHERE eh.effective_from<=@target_date
    AND (eh.effective_to IS NULL OR eh.effective_to>=@target_date);

  SELECT COUNT(*) INTO seed_employee_total
  FROM tmp_attendance_one_day_employees;

  IF history_eligible_total<>seed_employee_total THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: kandidat seed tidak sama dengan karyawan eligible berdasarkan histori.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_attendance_one_day_sites;
  CREATE TEMPORARY TABLE tmp_attendance_one_day_sites AS
  SELECT DISTINCT
    s.id site_id,
    s.code site_code,
    (
      SELECT MIN(u.id)
      FROM users u
      JOIN user_roles ur ON ur.user_id=u.id
      JOIN roles r ON r.id=ur.role_id AND r.code='HR_OFFICER'
      JOIN user_site_access usa ON usa.user_id=u.id AND usa.site_id=s.id
      WHERE u.status='ACTIVE'
    ) hr_user_id,
    (
      SELECT MIN(d.id)
      FROM scan_devices d
      WHERE d.site_id=s.id AND d.is_active=1 AND d.activated_at IS NOT NULL
    ) device_id,
    CAST(NULL AS CHAR(20)) forced_day_type,
    CAST(NULL AS CHAR(30)) forced_reason_type,
    CAST(NULL AS UNSIGNED) calendar_event_id,
    CAST(NULL AS UNSIGNED) calendar_site_rule_id
  FROM sites s
  JOIN tmp_attendance_one_day_employees e ON e.site_id=s.id
  WHERE s.is_active=1;

  ALTER TABLE tmp_attendance_one_day_sites ADD PRIMARY KEY (site_id);

  IF EXISTS (
    SELECT 1 FROM tmp_attendance_one_day_sites
    WHERE hr_user_id IS NULL OR device_id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: setiap site eligible wajib memiliki HR Officer dan perangkat aktif teraktivasi.';
  END IF;

  -- Precedence kalender sama dengan engine: hari kerja khusus > libur site >
  -- cuti bersama terpilih > libur nasional > kombinasi hari assignment.
  UPDATE tmp_attendance_one_day_sites s
  JOIN attendance_calendar_events e
    ON e.event_date=@target_date
   AND e.event_type='NATIONAL_HOLIDAY'
   AND e.cancelled_at IS NULL
  SET s.forced_day_type='HOLIDAY',
      s.forced_reason_type='NATIONAL_HOLIDAY',
      s.calendar_event_id=e.id,
      s.calendar_site_rule_id=NULL;

  UPDATE tmp_attendance_one_day_sites s
  JOIN attendance_calendar_site_rules r
    ON r.site_id=s.site_id
   AND r.business_date=@target_date
   AND r.rule_type='COLLECTIVE_LEAVE'
   AND r.cancelled_at IS NULL
  SET s.forced_day_type='HOLIDAY',
      s.forced_reason_type='COLLECTIVE_LEAVE',
      s.calendar_event_id=r.calendar_event_id,
      s.calendar_site_rule_id=r.id;

  UPDATE tmp_attendance_one_day_sites s
  JOIN attendance_calendar_site_rules r
    ON r.site_id=s.site_id
   AND r.business_date=@target_date
   AND r.rule_type='SITE_HOLIDAY'
   AND r.cancelled_at IS NULL
  SET s.forced_day_type='HOLIDAY',
      s.forced_reason_type='SITE_HOLIDAY',
      s.calendar_event_id=r.calendar_event_id,
      s.calendar_site_rule_id=r.id;

  UPDATE tmp_attendance_one_day_sites s
  JOIN attendance_calendar_site_rules r
    ON r.site_id=s.site_id
   AND r.business_date=@target_date
   AND r.rule_type='WORKDAY_OVERRIDE'
   AND r.cancelled_at IS NULL
  SET s.forced_day_type='WORKDAY',
      s.forced_reason_type='WORKDAY_OVERRIDE',
      s.calendar_event_id=r.calendar_event_id,
      s.calendar_site_rule_id=r.id;

  DROP TEMPORARY TABLE IF EXISTS tmp_attendance_one_day_scenarios;
  CREATE TEMPORARY TABLE tmp_attendance_one_day_scenarios AS
  SELECT
    e.*,
    s.site_code,
    s.hr_user_id,
    s.device_id,
    COALESCE(
      s.forced_day_type,
      CASE
        WHEN JSON_CONTAINS(COALESCE(e.work_days_json,JSON_ARRAY()),CONCAT(WEEKDAY(@target_date)+1),'$')=1
          THEN 'WORKDAY'
        ELSE 'NON_WORKDAY'
      END
    ) calendar_day_type,
    COALESCE(
      s.forced_reason_type,
      CASE
        WHEN JSON_CONTAINS(COALESCE(e.work_days_json,JSON_ARRAY()),CONCAT(WEEKDAY(@target_date)+1),'$')=1
          THEN 'SHIFT_WEEKDAY'
        ELSE 'WEEKLY_OFF'
      END
    ) calendar_reason_type,
    s.calendar_event_id,
    s.calendar_site_rule_id,
    TIMESTAMP(@target_date,e.start_time) scheduled_start,
    CASE
      WHEN e.crosses_midnight=1 THEN DATE_ADD(TIMESTAMP(@target_date,e.end_time),INTERVAL 1 DAY)
      ELSE TIMESTAMP(@target_date,e.end_time)
    END scheduled_end,
    MOD(CRC32(CONCAT(@seed_version,'|scenario|',e.employee_uid,'|',@target_date)),1000) scenario_bucket,
    MOD(CRC32(CONCAT(@seed_version,'|clock-in|',e.employee_uid,'|',@target_date)),1000) clock_in_bucket,
    MOD(CRC32(CONCAT(@seed_version,'|clock-out|',e.employee_uid,'|',@target_date)),1000) clock_out_bucket,
    MOD(CRC32(CONCAT(@seed_version,'|workflow|',e.employee_uid,'|',@target_date)),100) workflow_bucket,
    MOD(CRC32(CONCAT(@seed_version,'|kind|',e.employee_uid,'|',@target_date)),100) kind_bucket,
    CAST(NULL AS CHAR(30)) scenario
  FROM tmp_attendance_one_day_employees e
  JOIN tmp_attendance_one_day_sites s ON s.site_id=e.site_id;

  ALTER TABLE tmp_attendance_one_day_scenarios
    ADD PRIMARY KEY (employee_id),
    ADD KEY idx_tmp_attendance_one_day_scenario (site_id,scenario);

  UPDATE tmp_attendance_one_day_scenarios
  SET scenario=CASE
    WHEN calendar_day_type<>'WORKDAY' AND scenario_bucket<50 THEN 'OFFDAY_PRESENT'
    WHEN calendar_day_type<>'WORKDAY' THEN 'OFFDAY_EMPTY'
    WHEN scenario_bucket<700 THEN 'NORMAL'
    WHEN scenario_bucket<780 THEN 'LATE'
    WHEN scenario_bucket<830 THEN 'EARLY_LEAVE'
    WHEN scenario_bucket<850 THEN 'LATE_EARLY'
    WHEN scenario_bucket<920 THEN 'ABNORMAL'
    WHEN scenario_bucket<980 THEN 'CLASSIFICATION'
    ELSE 'ALPHA'
  END;

  -- Jika headcount cukup, pastikan tabel workflow tidak kosong pada demo.
  IF NOT EXISTS (SELECT 1 FROM tmp_attendance_one_day_scenarios WHERE scenario='CLASSIFICATION') THEN
    UPDATE tmp_attendance_one_day_scenarios
    SET scenario='CLASSIFICATION'
    WHERE calendar_day_type='WORKDAY' AND scenario='NORMAL'
    ORDER BY scenario_bucket LIMIT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tmp_attendance_one_day_scenarios WHERE scenario='ABNORMAL') THEN
    UPDATE tmp_attendance_one_day_scenarios
    SET scenario='ABNORMAL'
    WHERE calendar_day_type='WORKDAY' AND scenario='NORMAL'
    ORDER BY scenario_bucket LIMIT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tmp_attendance_one_day_scenarios WHERE scenario='ALPHA') THEN
    UPDATE tmp_attendance_one_day_scenarios
    SET scenario='ALPHA'
    WHERE calendar_day_type='WORKDAY' AND scenario='NORMAL'
    ORDER BY scenario_bucket LIMIT 1;
  END IF;

  START TRANSACTION;

  -- Fakta scan aktual. Alpha, klasifikasi, dan hari kosong sengaja belum
  -- memiliki record; finalisasi manual nanti melengkapi Alpha/Holiday.
  INSERT INTO attendance_records (
    uid,employee_id,site_id,shift_id,business_date,attendance_status,
    calendar_day_type,calendar_reason_type,calendar_event_id,calendar_site_rule_id,
    clock_in_at,clock_out_at,clock_in_device_id,clock_out_device_id,
    clock_in_source,clock_out_source,notes,created_by,updated_by
  )
  SELECT
    UUID(),s.employee_id,s.site_id,s.shift_id,@target_date,'PRESENT',
    s.calendar_day_type,s.calendar_reason_type,s.calendar_event_id,s.calendar_site_rule_id,
    CASE
      WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=1 THEN NULL
      WHEN s.scenario IN ('LATE','LATE_EARLY')
        THEN DATE_ADD(s.scheduled_start,INTERVAL (16+MOD(s.clock_in_bucket,45)) MINUTE)
      WHEN s.scenario='OFFDAY_PRESENT'
        THEN DATE_ADD(s.scheduled_start,INTERVAL MOD(s.clock_in_bucket,61) MINUTE)
      ELSE DATE_ADD(s.scheduled_start,INTERVAL (CAST(MOD(s.clock_in_bucket,31) AS SIGNED)-20) MINUTE)
    END,
    CASE
      WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=0 THEN NULL
      WHEN s.scenario IN ('EARLY_LEAVE','LATE_EARLY')
        THEN DATE_SUB(s.scheduled_end,INTERVAL (16+MOD(s.clock_out_bucket,75)) MINUTE)
      WHEN s.scenario='OFFDAY_PRESENT'
        THEN DATE_ADD(s.scheduled_end,INTERVAL (CAST(MOD(s.clock_out_bucket,181) AS SIGNED)-120) MINUTE)
      ELSE DATE_ADD(s.scheduled_end,INTERVAL (CAST(MOD(s.clock_out_bucket,41) AS SIGNED)-10) MINUTE)
    END,
    CASE WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=1 THEN NULL ELSE s.device_id END,
    CASE WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=0 THEN NULL ELSE s.device_id END,
    CASE WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=1 THEN NULL ELSE 'TERMINAL' END,
    CASE WHEN s.scenario='ABNORMAL' AND MOD(s.kind_bucket,2)=0 THEN NULL ELSE 'TERMINAL' END,
    CASE WHEN s.scenario='OFFDAY_PRESENT' THEN 'Kehadiran aktual pada hari nonkerja/libur.' ELSE NULL END,
    s.hr_user_id,s.hr_user_id
  FROM tmp_attendance_one_day_scenarios s
  WHERE s.scenario IN ('NORMAL','LATE','EARLY_LEAVE','LATE_EARLY','ABNORMAL','OFFDAY_PRESENT');
  SET seeded_records=ROW_COUNT();

  UPDATE attendance_records ar
  JOIN tmp_attendance_one_day_scenarios s ON s.employee_id=ar.employee_id
  SET
    ar.late_minutes=CASE
      WHEN ar.calendar_day_type<>'WORKDAY' OR ar.clock_in_at IS NULL THEN 0
      WHEN TIMESTAMPDIFF(MINUTE,s.scheduled_start,ar.clock_in_at)>s.late_tolerance_minutes
        THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,s.scheduled_start,ar.clock_in_at))
      ELSE 0 END,
    ar.early_leave_minutes=CASE
      WHEN ar.calendar_day_type<>'WORKDAY' OR ar.clock_out_at IS NULL THEN 0
      WHEN TIMESTAMPDIFF(MINUTE,ar.clock_out_at,s.scheduled_end)>s.early_leave_tolerance_minutes
        THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,ar.clock_out_at,s.scheduled_end))
      ELSE 0 END,
    ar.worked_minutes=CASE
      WHEN ar.clock_in_at IS NULL OR ar.clock_out_at IS NULL THEN NULL
      ELSE GREATEST(0,TIMESTAMPDIFF(MINUTE,ar.clock_in_at,ar.clock_out_at)) END
  WHERE ar.business_date=@target_date;

  INSERT INTO attendance_scan_events (
    uid,attendance_record_id,employee_id,site_id,device_id,barcode_value,
    event_type,scanned_at,result_status,result_message,idempotency_key,
    ip_address,user_agent,created_by,updated_by
  )
  SELECT
    UUID(),ar.id,ar.employee_id,ar.site_id,ar.clock_in_device_id,e.employee_number,
    'CLOCK_IN',ar.clock_in_at,'SUCCESS','Clock in berhasil dicatat.',
    CONCAT('SEED-ONE-',DATE_FORMAT(@target_date,'%Y%m%d'),'-',ar.employee_id,'-IN'),
    '127.0.0.1','HRIS Attendance One Day Seed',s.hr_user_id,s.hr_user_id
  FROM attendance_records ar
  JOIN employees e ON e.id=ar.employee_id
  JOIN tmp_attendance_one_day_scenarios s ON s.employee_id=ar.employee_id
  WHERE ar.business_date=@target_date AND ar.clock_in_at IS NOT NULL;
  SET seeded_scan_events=ROW_COUNT();

  INSERT INTO attendance_scan_events (
    uid,attendance_record_id,employee_id,site_id,device_id,barcode_value,
    event_type,scanned_at,result_status,result_message,idempotency_key,
    ip_address,user_agent,created_by,updated_by
  )
  SELECT
    UUID(),ar.id,ar.employee_id,ar.site_id,ar.clock_out_device_id,e.employee_number,
    'CLOCK_OUT',ar.clock_out_at,'SUCCESS','Clock out berhasil dicatat.',
    CONCAT('SEED-ONE-',DATE_FORMAT(@target_date,'%Y%m%d'),'-',ar.employee_id,'-OUT'),
    '127.0.0.1','HRIS Attendance One Day Seed',s.hr_user_id,s.hr_user_id
  FROM attendance_records ar
  JOIN employees e ON e.id=ar.employee_id
  JOIN tmp_attendance_one_day_scenarios s ON s.employee_id=ar.employee_id
  WHERE ar.business_date=@target_date AND ar.clock_out_at IS NOT NULL;
  SET seeded_scan_events=seeded_scan_events+ROW_COUNT();

  -- Sedikit event gagal untuk histori terminal; tidak mengubah record utama.
  INSERT INTO attendance_scan_events (
    uid,attendance_record_id,employee_id,site_id,device_id,barcode_value,
    event_type,scanned_at,result_status,result_message,idempotency_key,
    ip_address,user_agent,created_by,updated_by
  )
  SELECT
    UUID(),ar.id,ar.employee_id,ar.site_id,s.device_id,e.employee_number,
    CASE WHEN MOD(s.kind_bucket,2)=0 THEN 'CLOCK_IN' ELSE 'CLOCK_OUT' END,
    DATE_ADD(TIMESTAMP(@target_date,'12:00:00'),INTERVAL MOD(s.clock_in_bucket,180) MINUTE),
    CASE WHEN MOD(s.workflow_bucket,3)=0 THEN 'ERROR' ELSE 'REJECTED' END,
    CASE WHEN MOD(s.workflow_bucket,3)=0 THEN 'Gangguan simulasi pada layanan scan.' ELSE 'Percobaan scan duplikat ditolak.' END,
    CONCAT('SEED-ONE-',DATE_FORMAT(@target_date,'%Y%m%d'),'-',ar.employee_id,'-FAIL'),
    '127.0.0.1','HRIS Attendance One Day Seed',s.hr_user_id,s.hr_user_id
  FROM attendance_records ar
  JOIN employees e ON e.id=ar.employee_id
  JOIN tmp_attendance_one_day_scenarios s ON s.employee_id=ar.employee_id
  WHERE ar.business_date=@target_date AND MOD(s.scenario_bucket,100)<5;
  SET seeded_scan_events=seeded_scan_events+ROW_COUNT();

  INSERT INTO attendance_classification_requests (
    uid,employee_id,site_id,classification_type,start_date,end_date,reason,
    approval_status,requested_by,requested_at,reviewed_by,reviewed_at,
    review_notes,cancelled_by,cancelled_at,created_by,updated_by
  )
  SELECT
    UUID(),s.employee_id,s.site_id,
    CASE WHEN s.kind_bucket<55 THEN 'SICK' WHEN s.kind_bucket<85 THEN 'PERMISSION' ELSE 'LEAVE' END,
    @target_date,@target_date,
    CASE WHEN s.kind_bucket<55 THEN 'Kondisi kesehatan tidak memungkinkan bekerja.'
         WHEN s.kind_bucket<85 THEN 'Keperluan keluarga yang tidak dapat ditinggalkan.'
         ELSE 'Cuti pribadi terencana.' END,
    CASE WHEN s.workflow_bucket<55 THEN 'APPROVED'
         WHEN s.workflow_bucket<80 THEN 'PENDING'
         WHEN s.workflow_bucket<95 THEN 'REJECTED' ELSE 'CANCELLED' END,
    s.hr_user_id,DATE_ADD(TIMESTAMP(DATE_SUB(@target_date,INTERVAL 1 DAY),'09:00:00'),INTERVAL MOD(s.clock_in_bucket,180) MINUTE),
    CASE WHEN s.workflow_bucket<55 OR s.workflow_bucket BETWEEN 80 AND 94 THEN s.hr_user_id ELSE NULL END,
    CASE WHEN s.workflow_bucket<55 OR s.workflow_bucket BETWEEN 80 AND 94
         THEN DATE_ADD(TIMESTAMP(DATE_SUB(@target_date,INTERVAL 1 DAY),'13:00:00'),INTERVAL MOD(s.clock_out_bucket,120) MINUTE)
         ELSE NULL END,
    CASE WHEN s.workflow_bucket<55 THEN 'Dokumen dan alasan telah diverifikasi.'
         WHEN s.workflow_bucket BETWEEN 80 AND 94 THEN 'Bukti atau alasan belum memenuhi ketentuan.' ELSE NULL END,
    CASE WHEN s.workflow_bucket>=95 THEN s.hr_user_id ELSE NULL END,
    CASE WHEN s.workflow_bucket>=95
         THEN DATE_ADD(TIMESTAMP(DATE_SUB(@target_date,INTERVAL 1 DAY),'11:00:00'),INTERVAL MOD(s.clock_out_bucket,60) MINUTE)
         ELSE NULL END,
    s.hr_user_id,s.hr_user_id
  FROM tmp_attendance_one_day_scenarios s
  WHERE s.scenario='CLASSIFICATION';
  SET seeded_classifications=ROW_COUNT();

  -- Klasifikasi approved langsung menjadi fakta terapproval; selain itu tetap
  -- menunggu finalisasi dan akan menjadi Alpha jika tidak disetujui.
  INSERT INTO attendance_records (
    uid,employee_id,site_id,shift_id,business_date,attendance_status,
    calendar_day_type,calendar_reason_type,calendar_event_id,calendar_site_rule_id,
    notes,created_by,updated_by
  )
  SELECT
    UUID(),s.employee_id,s.site_id,s.shift_id,@target_date,acr.classification_type,
    s.calendar_day_type,s.calendar_reason_type,s.calendar_event_id,s.calendar_site_rule_id,
    acr.reason,s.hr_user_id,s.hr_user_id
  FROM attendance_classification_requests acr
  JOIN tmp_attendance_one_day_scenarios s ON s.employee_id=acr.employee_id
  WHERE acr.start_date=@target_date AND acr.end_date=@target_date
    AND acr.approval_status='APPROVED';
  SET seeded_records=seeded_records+ROW_COUNT();

  INSERT INTO attendance_classification_details (
    uid,request_id,employee_id,business_date,shift_assignment_id,
    attendance_record_id,outcome,notes,created_by,updated_by
  )
  SELECT
    UUID(),acr.id,acr.employee_id,@target_date,s.shift_assignment_id,
    ar.id,
    CASE WHEN acr.approval_status='APPROVED' THEN 'APPLIED' ELSE 'PENDING' END,
    CASE WHEN acr.approval_status='APPROVED' THEN NULL ELSE 'Belum diterapkan karena hasil review belum approved.' END,
    s.hr_user_id,s.hr_user_id
  FROM attendance_classification_requests acr
  JOIN tmp_attendance_one_day_scenarios s ON s.employee_id=acr.employee_id
  LEFT JOIN attendance_records ar
    ON ar.employee_id=acr.employee_id AND ar.business_date=@target_date
  WHERE acr.start_date=@target_date AND acr.end_date=@target_date;

  INSERT INTO attendance_corrections (
    uid,attendance_record_id,correction_type,
    old_clock_in_at,new_clock_in_at,old_clock_out_at,new_clock_out_at,
    old_status,new_status,reason,approval_status,requested_by,requested_at,
    reviewed_by,reviewed_at,review_notes,applied_at,created_by,updated_by
  )
  SELECT
    UUID(),ar.id,
    CASE WHEN ar.clock_in_at IS NULL THEN 'CLOCK_IN' ELSE 'CLOCK_OUT' END,
    ar.clock_in_at,
    CASE WHEN ar.clock_in_at IS NULL THEN DATE_SUB(s.scheduled_start,INTERVAL MOD(s.clock_in_bucket,16) MINUTE) ELSE NULL END,
    ar.clock_out_at,
    CASE WHEN ar.clock_out_at IS NULL THEN DATE_ADD(s.scheduled_end,INTERVAL MOD(s.clock_out_bucket,21) MINUTE) ELSE NULL END,
    ar.attendance_status,NULL,
    CASE WHEN ar.clock_in_at IS NULL THEN 'Jam masuk terlewat saat scan awal.' ELSE 'Jam pulang terlewat saat scan akhir.' END,
    CASE WHEN s.workflow_bucket<45 THEN 'APPROVED'
         WHEN s.workflow_bucket<75 THEN 'PENDING'
         WHEN s.workflow_bucket<90 THEN 'REJECTED' ELSE 'CANCELLED' END,
    s.hr_user_id,DATE_ADD(TIMESTAMP(DATE_ADD(@target_date,INTERVAL 1 DAY),'08:00:00'),INTERVAL MOD(s.clock_in_bucket,180) MINUTE),
    CASE WHEN s.workflow_bucket<45 OR s.workflow_bucket BETWEEN 75 AND 89 THEN s.hr_user_id ELSE NULL END,
    CASE WHEN s.workflow_bucket<45 OR s.workflow_bucket BETWEEN 75 AND 89
         THEN DATE_ADD(TIMESTAMP(DATE_ADD(@target_date,INTERVAL 1 DAY),'11:00:00'),INTERVAL MOD(s.clock_out_bucket,120) MINUTE)
         ELSE NULL END,
    CASE WHEN s.workflow_bucket<45 THEN 'Koreksi diverifikasi dari catatan operasional.'
         WHEN s.workflow_bucket BETWEEN 75 AND 89 THEN 'Bukti koreksi belum memadai.' ELSE NULL END,
    CASE WHEN s.workflow_bucket<45
         THEN DATE_ADD(TIMESTAMP(DATE_ADD(@target_date,INTERVAL 1 DAY),'11:00:00'),INTERVAL MOD(s.clock_out_bucket,120) MINUTE)
         ELSE NULL END,
    s.hr_user_id,s.hr_user_id
  FROM attendance_records ar
  JOIN tmp_attendance_one_day_scenarios s ON s.employee_id=ar.employee_id
  WHERE ar.business_date=@target_date AND s.scenario='ABNORMAL';
  SET seeded_corrections=ROW_COUNT();

  UPDATE attendance_records ar
  JOIN attendance_corrections ac
    ON ac.attendance_record_id=ar.id AND ac.approval_status='APPROVED'
  JOIN tmp_attendance_one_day_scenarios s ON s.employee_id=ar.employee_id
  SET
    ar.clock_in_at=CASE WHEN ac.correction_type='CLOCK_IN' THEN ac.new_clock_in_at ELSE ar.clock_in_at END,
    ar.clock_out_at=CASE WHEN ac.correction_type='CLOCK_OUT' THEN ac.new_clock_out_at ELSE ar.clock_out_at END,
    ar.clock_in_device_id=CASE WHEN ac.correction_type='CLOCK_IN' THEN NULL ELSE ar.clock_in_device_id END,
    ar.clock_out_device_id=CASE WHEN ac.correction_type='CLOCK_OUT' THEN NULL ELSE ar.clock_out_device_id END,
    ar.clock_in_source=CASE WHEN ac.correction_type='CLOCK_IN' THEN 'CORRECTION' ELSE ar.clock_in_source END,
    ar.clock_out_source=CASE WHEN ac.correction_type='CLOCK_OUT' THEN 'CORRECTION' ELSE ar.clock_out_source END,
    ar.late_minutes=CASE
      WHEN ac.correction_type='CLOCK_IN' AND TIMESTAMPDIFF(MINUTE,s.scheduled_start,ac.new_clock_in_at)>s.late_tolerance_minutes
        THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,s.scheduled_start,ac.new_clock_in_at))
      WHEN ac.correction_type='CLOCK_IN' THEN 0 ELSE ar.late_minutes END,
    ar.early_leave_minutes=CASE
      WHEN ac.correction_type='CLOCK_OUT' AND TIMESTAMPDIFF(MINUTE,ac.new_clock_out_at,s.scheduled_end)>s.early_leave_tolerance_minutes
        THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,ac.new_clock_out_at,s.scheduled_end))
      WHEN ac.correction_type='CLOCK_OUT' THEN 0 ELSE ar.early_leave_minutes END,
    ar.worked_minutes=GREATEST(0,TIMESTAMPDIFF(
      MINUTE,
      CASE WHEN ac.correction_type='CLOCK_IN' THEN ac.new_clock_in_at ELSE ar.clock_in_at END,
      CASE WHEN ac.correction_type='CLOCK_OUT' THEN ac.new_clock_out_at ELSE ar.clock_out_at END
    )),
    ar.is_corrected=1,
    ar.updated_by=ac.reviewed_by;

  COMMIT;

  SELECT
    @target_date target_date,
    (SELECT COUNT(*) FROM tmp_attendance_one_day_employees) eligible_employees,
    seeded_records attendance_records,
    seeded_scan_events scan_events,
    seeded_classifications classification_requests,
    seeded_corrections corrections,
    'Belum difinalisasi; jalankan finalisasi manual dari Monitoring Harian.' next_action;

  SELECT
    s.site_code site,
    sc.scenario,
    COUNT(*) total
  FROM tmp_attendance_one_day_scenarios sc
  JOIN tmp_attendance_one_day_sites s ON s.site_id=sc.site_id
  GROUP BY s.site_code,sc.scenario
  ORDER BY s.site_code,sc.scenario;

  DROP TEMPORARY TABLE tmp_attendance_one_day_scenarios;
  DROP TEMPORARY TABLE tmp_attendance_one_day_sites;
  DROP TEMPORARY TABLE tmp_attendance_one_day_employees;
END$$
DELIMITER ;

CALL seed_attendance_one_date();
DROP PROCEDURE seed_attendance_one_date;
