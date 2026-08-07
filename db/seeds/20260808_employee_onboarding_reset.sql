-- Reset onboarding beberapa karyawan menjadi seperti baru selesai diinput.
-- KHUSUS environment development/uji. Script ini destruktif dan tidak dapat
-- mengembalikan histori yang sudah dihapus.
--
-- Yang dipertahankan:
--   - master employees, nomor/barcode, tanggal bergabung, tipe, dan penempatan;
--   - dokumen umum karyawan, files, salary/job assignment, dan audit_logs;
--   - master Shift, perangkat, serta kalender Attendance.
--
-- Yang dihapus/reset untuk karyawan target:
--   - seluruh data operasional Attendance dan penugasan Shift;
--   - run finalisasi lama dipertahankan dan diberi marker invalidasi terbaru;
--   - seluruh kontrak, lifecycle kontrak, dan jadwal status kerja;
--   - seluruh jadwal mutasi dan histori employment lama;
--   - histori employment dibangun ulang menjadi satu INITIAL + INACTIVE;
--   - status current employees menjadi INACTIVE dan data resign dikosongkan.
--
-- Script berhenti SEBELUM DELETE jika:
--   - input ID tidak valid/tidak ditemukan/berulang;
--   - ada kontrak bertanda tangan atau memiliki scan kontrak;
--   - ada transaksi produksi atau hasil payroll untuk karyawan target.
--
-- Isi daftar ID internal employees, dipisahkan koma tanpa karakter lain.
SET @target_employee_ids = '123,234,565';
SET @confirm_reset = 'RESET_ONBOARDING_DEVELOPMENT';

DROP PROCEDURE IF EXISTS reset_employee_onboarding;
DELIMITER $$
CREATE PROCEDURE reset_employee_onboarding()
BEGIN
  DECLARE clean_employee_ids TEXT;
  DECLARE requested_employee_count INT UNSIGNED DEFAULT 0;
  DECLARE target_employee_count INT UNSIGNED DEFAULT 0;
  DECLARE inactive_status_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE inserted_finalization_invalidations BIGINT DEFAULT 0;
  DECLARE deleted_classification_details BIGINT DEFAULT 0;
  DECLARE deleted_classification_requests BIGINT DEFAULT 0;
  DECLARE deleted_corrections BIGINT DEFAULT 0;
  DECLARE deleted_scan_events BIGINT DEFAULT 0;
  DECLARE deleted_attendance_records BIGINT DEFAULT 0;
  DECLARE deleted_shift_assignments BIGINT DEFAULT 0;
  DECLARE deleted_scheduled_status_changes BIGINT DEFAULT 0;
  DECLARE deleted_contract_events BIGINT DEFAULT 0;
  DECLARE deleted_contracts BIGINT DEFAULT 0;
  DECLARE deleted_generated_contract_documents BIGINT DEFAULT 0;
  DECLARE deleted_scheduled_mutations BIGINT DEFAULT 0;
  DECLARE deleted_employment_histories BIGINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_onboarding_reset_record_ids;
    DROP TEMPORARY TABLE IF EXISTS tmp_onboarding_reset_site_dates;
    DROP TEMPORARY TABLE IF EXISTS tmp_onboarding_reset_employees;
    RESIGNAL;
  END;

  SET clean_employee_ids=REPLACE(TRIM(COALESCE(@target_employee_ids,'')),' ','');

  IF COALESCE(@confirm_reset,'')<>'RESET_ONBOARDING_DEVELOPMENT' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: isi @confirm_reset dengan RESET_ONBOARDING_DEVELOPMENT.';
  END IF;

  IF clean_employee_ids='' OR clean_employee_ids NOT REGEXP '^[0-9]+(,[0-9]+)*$' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: @target_employee_ids wajib berupa CSV ID numerik, contoh 123,234,565.';
  END IF;

  SET requested_employee_count=
    1+LENGTH(clean_employee_ids)-LENGTH(REPLACE(clean_employee_ids,',',''));

  DROP TEMPORARY TABLE IF EXISTS tmp_onboarding_reset_employees;
  CREATE TEMPORARY TABLE tmp_onboarding_reset_employees (
    employee_id BIGINT UNSIGNED NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB;

  INSERT INTO tmp_onboarding_reset_employees (employee_id)
  SELECT e.id
  FROM employees e
  WHERE FIND_IN_SET(CAST(e.id AS CHAR),clean_employee_ids)>0;

  SELECT COUNT(*) INTO target_employee_count
  FROM tmp_onboarding_reset_employees;

  IF target_employee_count<>requested_employee_count THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada employee ID yang tidak ditemukan atau ditulis berulang.';
  END IF;

  SELECT MIN(id) INTO inactive_status_id
  FROM employee_statuses
  WHERE code='INACTIVE';

  IF inactive_status_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: referensi employee_statuses INACTIVE tidak ditemukan.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_onboarding_reset_employees target
    LEFT JOIN employee_employment_histories eh
      ON eh.employee_id=target.employee_id AND eh.change_type='INITIAL'
    GROUP BY target.employee_id
    HAVING COUNT(eh.id)<>1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: setiap karyawan target wajib memiliki tepat satu histori INITIAL.';
  END IF;

  START TRANSACTION;

  -- Kunci master target. Selama eksekusi, hentikan sementara API dan seluruh
  -- cron lifecycle/mutasi/finalisasi agar tidak ada transaksi baru menyelip.
  SELECT e.id locked_employee_id
  FROM employees e
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=e.id
  ORDER BY e.id
  FOR UPDATE;

  -- Kontrak bertanda tangan/scan dianggap sudah menjadi dokumen legal.
  IF EXISTS (
    SELECT 1
    FROM employee_contracts c
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=c.employee_id
    WHERE c.signed_date IS NOT NULL OR c.issued_file_id IS NOT NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada kontrak bertanda tangan atau memiliki scan kontrak.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM employee_job_assignments eja
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=eja.employee_id
  ) OR EXISTS (
    SELECT 1
    FROM employee_payroll_components epc
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=epc.employee_id
  ) OR EXISTS (
    SELECT 1
    FROM employee_salary_histories esh
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=esh.employee_id
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada assignment pekerjaan, komponen payroll, atau histori gaji.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM generated_documents gd
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=gd.employee_id
    WHERE gd.document_type='PAYSLIP'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada dokumen payslip untuk karyawan target.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM employee_documents ed
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=ed.employee_id
    WHERE UPPER(ed.document_type) IN ('PKWT','CONTRACT','KONTRAK')
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada dokumen karyawan bertipe kontrak yang perlu ditinjau manual.';
  END IF;

  -- Produksi dan payroll tidak dihapus oleh script ini; keberadaannya memblokir
  -- seluruh reset agar histori finansial/operasional tidak kehilangan induk.
  IF EXISTS (
    SELECT 1
    FROM production_transactions pt
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=pt.employee_id
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada transaksi produksi untuk karyawan target.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM payroll_employee_results per
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=per.employee_id
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada hasil payroll untuk karyawan target.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM attendance_records ar
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=ar.employee_id
    JOIN payroll_periods pp ON ar.business_date BETWEEN pp.period_start AND pp.period_end
    WHERE pp.status NOT IN ('DRAFT','CANCELLED')
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: Attendance target berada dalam periode payroll yang sudah diproses.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_onboarding_reset_record_ids;
  CREATE TEMPORARY TABLE tmp_onboarding_reset_record_ids (
    attendance_record_id BIGINT UNSIGNED NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB;

  INSERT INTO tmp_onboarding_reset_record_ids (attendance_record_id)
  SELECT ar.id
  FROM attendance_records ar
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=ar.employee_id;

  -- Guard tambahan untuk relasi produksi yang mungkin menunjuk record milik
  -- target walaupun employee_id transaksi tidak konsisten.
  IF EXISTS (
    SELECT 1
    FROM production_transactions pt
    JOIN tmp_onboarding_reset_record_ids target
      ON target.attendance_record_id=pt.attendance_record_id
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: Attendance target direferensikan transaksi produksi.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_onboarding_reset_site_dates;
  CREATE TEMPORARY TABLE tmp_onboarding_reset_site_dates (
    site_id BIGINT UNSIGNED NOT NULL,
    business_date DATE NOT NULL,
    PRIMARY KEY (site_id,business_date)
  ) ENGINE=InnoDB;

  INSERT IGNORE INTO tmp_onboarding_reset_site_dates (site_id,business_date)
  SELECT ar.site_id,ar.business_date
  FROM attendance_records ar
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=ar.employee_id;

  INSERT IGNORE INTO tmp_onboarding_reset_site_dates (site_id,business_date)
  SELECT ase.site_id,DATE(ase.scanned_at)
  FROM attendance_scan_events ase
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=ase.employee_id;

  INSERT IGNORE INTO tmp_onboarding_reset_site_dates (site_id,business_date)
  SELECT ase.site_id,DATE(ase.scanned_at)
  FROM attendance_scan_events ase
  JOIN employees e ON e.employee_number=ase.barcode_value
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=e.id;

  INSERT IGNORE INTO tmp_onboarding_reset_site_dates (site_id,business_date)
  SELECT acr.site_id,acd.business_date
  FROM attendance_classification_requests acr
  JOIN attendance_classification_details acd ON acd.request_id=acr.id
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=acr.employee_id;

  -- Run finalisasi bisa ada walaupun record target belum terbentuk. Tandai
  -- site-tanggal bila target pernah eligible atau memiliki assignment efektif.
  INSERT IGNORE INTO tmp_onboarding_reset_site_dates (site_id,business_date)
  SELECT run.site_id,run.business_date
  FROM attendance_daily_finalization_runs run
  JOIN employee_employment_histories eh
    ON eh.site_id=run.site_id
   AND eh.effective_from<=run.business_date
   AND (eh.effective_to IS NULL OR eh.effective_to>=run.business_date)
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=eh.employee_id
  JOIN employee_statuses es
    ON es.id=eh.employee_status_id AND es.allows_attendance=1;

  INSERT IGNORE INTO tmp_onboarding_reset_site_dates (site_id,business_date)
  SELECT run.site_id,run.business_date
  FROM attendance_daily_finalization_runs run
  JOIN employee_shift_assignments esa
    ON esa.effective_from<=run.business_date
   AND (esa.effective_to IS NULL OR esa.effective_to>=run.business_date)
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=esa.employee_id
  JOIN shifts sh ON sh.id=esa.shift_id AND sh.site_id=run.site_id;

  IF EXISTS (
    SELECT 1
    FROM attendance_daily_finalization_runs run
    JOIN tmp_onboarding_reset_site_dates affected
      ON affected.site_id=run.site_id
     AND affected.business_date=run.business_date
    WHERE run.status='RUNNING'
      AND run.id=(
        SELECT MAX(latest.id)
        FROM attendance_daily_finalization_runs latest
        WHERE latest.site_id=run.site_id
          AND latest.business_date=run.business_date
      )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada finalisasi Attendance terdampak yang masih RUNNING.';
  END IF;

  -- Run finalisasi adalah histori bersama seluruh karyawan site. Jangan hapus
  -- run lama; tambahkan marker terbaru agar histori utuh dan finalisasi ulang
  -- terlihat wajib pada Monitoring/Rekap.
  INSERT INTO attendance_daily_finalization_runs (
    uid,site_id,business_date,trigger_type,status,grace_minutes,reason,
    summary,warnings,requested_by,started_at,finished_at,created_by,updated_by
  )
  SELECT
    UUID(),affected.site_id,affected.business_date,'MANUAL','SKIPPED',60,
    'Diinvalidasi oleh reset onboarding development; jalankan finalisasi ulang.',
    JSON_OBJECT(),
    JSON_ARRAY('Data Attendance berubah akibat reset onboarding karyawan.'),
    NULL,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),NULL,NULL
  FROM tmp_onboarding_reset_site_dates affected
  WHERE EXISTS (
    SELECT 1
    FROM attendance_daily_finalization_runs old_run
    WHERE old_run.site_id=affected.site_id
      AND old_run.business_date=affected.business_date
  );
  SET inserted_finalization_invalidations=ROW_COUNT();

  DELETE acd
  FROM attendance_classification_details acd
  LEFT JOIN attendance_classification_requests acr ON acr.id=acd.request_id
  LEFT JOIN tmp_onboarding_reset_employees request_target
    ON request_target.employee_id=acr.employee_id
  LEFT JOIN tmp_onboarding_reset_employees detail_target
    ON detail_target.employee_id=acd.employee_id
  LEFT JOIN tmp_onboarding_reset_record_ids record_target
    ON record_target.attendance_record_id=acd.attendance_record_id
  WHERE request_target.employee_id IS NOT NULL
     OR detail_target.employee_id IS NOT NULL
     OR record_target.attendance_record_id IS NOT NULL;
  SET deleted_classification_details=ROW_COUNT();

  DELETE acr
  FROM attendance_classification_requests acr
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=acr.employee_id;
  SET deleted_classification_requests=ROW_COUNT();

  DELETE ac
  FROM attendance_corrections ac
  JOIN tmp_onboarding_reset_record_ids target
    ON target.attendance_record_id=ac.attendance_record_id;
  SET deleted_corrections=ROW_COUNT();

  DELETE ase
  FROM attendance_scan_events ase
  LEFT JOIN tmp_onboarding_reset_employees employee_target
    ON employee_target.employee_id=ase.employee_id
  LEFT JOIN tmp_onboarding_reset_record_ids record_target
    ON record_target.attendance_record_id=ase.attendance_record_id
  LEFT JOIN employees barcode_employee
    ON barcode_employee.employee_number=ase.barcode_value
  LEFT JOIN tmp_onboarding_reset_employees barcode_target
    ON barcode_target.employee_id=barcode_employee.id
  WHERE employee_target.employee_id IS NOT NULL
     OR record_target.attendance_record_id IS NOT NULL
     OR barcode_target.employee_id IS NOT NULL;
  SET deleted_scan_events=ROW_COUNT();

  DELETE ar
  FROM attendance_records ar
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=ar.employee_id;
  SET deleted_attendance_records=ROW_COUNT();

  DELETE esa
  FROM employee_shift_assignments esa
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=esa.employee_id;
  SET deleted_shift_assignments=ROW_COUNT();

  DELETE sc
  FROM scheduled_employee_status_changes sc
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=sc.employee_id;
  SET deleted_scheduled_status_changes=ROW_COUNT();

  DELETE ev
  FROM employee_contract_lifecycle_events ev
  JOIN employee_contracts c ON c.id=ev.contract_id
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=c.employee_id;
  SET deleted_contract_events=ROW_COUNT();

  DELETE c
  FROM employee_contracts c
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=c.employee_id;
  SET deleted_contracts=ROW_COUNT();

  DELETE gd
  FROM generated_documents gd
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=gd.employee_id
  WHERE gd.document_type='PKWT';
  SET deleted_generated_contract_documents=ROW_COUNT();

  -- scheduled_employee_mutations harus dihapus sebelum histori karena memiliki
  -- FK RESTRICT ke base_history_id.
  DELETE sm
  FROM scheduled_employee_mutations sm
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=sm.employee_id;
  SET deleted_scheduled_mutations=ROW_COUNT();

  DELETE eh
  FROM employee_employment_histories eh
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=eh.employee_id
  WHERE eh.change_type<>'INITIAL';
  SET deleted_employment_histories=ROW_COUNT();

  UPDATE employee_employment_histories eh
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=eh.employee_id
  JOIN employees e ON e.id=eh.employee_id
  SET eh.employee_status_id=inactive_status_id,
      eh.effective_from=e.join_date,
      eh.effective_to=NULL,
      eh.reference_number=NULL,
      eh.reason=NULL,
      eh.updated_by=NULL
  WHERE eh.change_type='INITIAL';

  -- Current master dikembalikan ke snapshot onboarding INITIAL asli.
  UPDATE employees e
  JOIN tmp_onboarding_reset_employees target ON target.employee_id=e.id
  JOIN employee_employment_histories initial_history
    ON initial_history.employee_id=e.id AND initial_history.change_type='INITIAL'
  SET e.employee_type_id=initial_history.employee_type_id,
      e.employee_status_id=inactive_status_id,
      e.current_site_id=initial_history.site_id,
      e.current_department_id=initial_history.department_id,
      e.current_position_id=initial_history.position_id,
      e.current_work_group_id=initial_history.work_group_id,
      e.current_production_module_section_id=initial_history.production_module_section_id,
      e.resign_date=NULL,
      e.resign_reason=NULL,
      e.updated_by=NULL;

  -- Verifikasi akhir dilakukan sebelum COMMIT agar kegagalan apa pun rollback.
  IF EXISTS (
    SELECT 1
    FROM tmp_onboarding_reset_employees target
    JOIN employees e ON e.id=target.employee_id
    JOIN employee_statuses es ON es.id=e.employee_status_id
    WHERE es.code<>'INACTIVE'
       OR e.resign_date IS NOT NULL
       OR e.resign_reason IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM tmp_onboarding_reset_employees target
    LEFT JOIN employee_employment_histories eh ON eh.employee_id=target.employee_id
    LEFT JOIN employee_statuses es ON es.id=eh.employee_status_id
    GROUP BY target.employee_id
    HAVING COUNT(eh.id)<>1
       OR MAX(eh.change_type)<>'INITIAL'
       OR MAX(es.code)<>'INACTIVE'
       OR MAX(eh.effective_to IS NULL)<>1
  ) OR EXISTS (
    SELECT 1 FROM employee_contracts c
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=c.employee_id
  ) OR EXISTS (
    SELECT 1 FROM attendance_records ar
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=ar.employee_id
  ) OR EXISTS (
    SELECT 1
    FROM attendance_scan_events ase
    LEFT JOIN tmp_onboarding_reset_employees employee_target
      ON employee_target.employee_id=ase.employee_id
    LEFT JOIN employees barcode_employee
      ON barcode_employee.employee_number=ase.barcode_value
    LEFT JOIN tmp_onboarding_reset_employees barcode_target
      ON barcode_target.employee_id=barcode_employee.id
    WHERE employee_target.employee_id IS NOT NULL
       OR barcode_target.employee_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM attendance_classification_requests acr
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=acr.employee_id
  ) OR EXISTS (
    SELECT 1 FROM attendance_classification_details acd
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=acd.employee_id
  ) OR EXISTS (
    SELECT 1 FROM employee_shift_assignments esa
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=esa.employee_id
  ) OR EXISTS (
    SELECT 1 FROM scheduled_employee_status_changes sc
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=sc.employee_id
  ) OR EXISTS (
    SELECT 1 FROM scheduled_employee_mutations sm
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=sm.employee_id
  ) OR EXISTS (
    SELECT 1 FROM generated_documents gd
    JOIN tmp_onboarding_reset_employees target ON target.employee_id=gd.employee_id
    WHERE gd.document_type='PKWT'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: verifikasi akhir onboarding gagal.';
  END IF;

  COMMIT;

  SELECT
    e.id employee_id,
    e.employee_number,
    e.full_name,
    es.code employee_status,
    DATE_FORMAT(eh.effective_from,'%Y-%m-%d') history_effective_from,
    eh.change_type history_change_type
  FROM tmp_onboarding_reset_employees target
  JOIN employees e ON e.id=target.employee_id
  JOIN employee_statuses es ON es.id=e.employee_status_id
  JOIN employee_employment_histories eh ON eh.employee_id=e.id
  ORDER BY e.id;

  SELECT
    target_employee_count employees_reset,
    inserted_finalization_invalidations finalization_invalidations,
    deleted_classification_details classification_details,
    deleted_classification_requests classification_requests,
    deleted_corrections corrections,
    deleted_scan_events scan_events,
    deleted_attendance_records attendance_records,
    deleted_shift_assignments shift_assignments,
    deleted_scheduled_status_changes scheduled_status_changes,
    deleted_contract_events contract_lifecycle_events,
    deleted_contracts contracts,
    deleted_generated_contract_documents generated_contract_documents,
    deleted_scheduled_mutations scheduled_mutations,
    deleted_employment_histories old_employment_histories;

  DROP TEMPORARY TABLE tmp_onboarding_reset_record_ids;
  DROP TEMPORARY TABLE tmp_onboarding_reset_site_dates;
  DROP TEMPORARY TABLE tmp_onboarding_reset_employees;
END$$
DELIMITER ;

CALL reset_employee_onboarding();
DROP PROCEDURE reset_employee_onboarding;
