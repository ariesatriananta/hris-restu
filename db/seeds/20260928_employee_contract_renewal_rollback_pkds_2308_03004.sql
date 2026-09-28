-- Rollback terarah renewal PKDS-2308-03004 untuk pengujian ulang lifecycle
-- kesiapan kerja: kontrak, Shift, dan pekerjaan utama.
--
-- Kondisi audit 28 September 2026:
--   - kontrak sumber PKWT/RSIAKDS-HR/003/VII/2025 tetap EXPIRED;
--   - kontrak renewal PKWT/RSIAKDS-HR/038/VII/2026 berstatus ACTIVE;
--   - histori mulai 29 Juli 2026 sebelumnya INACTIVE lalu diubah ACTIVE;
--   - pekerjaan BORONGAN-LINTING mulai 26 September 2026 sudah ada sebelum
--     renewal dan sengaja dipertahankan untuk menguji realignment;
--   - belum ada Shift, Attendance, scan, Produksi, Payroll, atau jadwal
--     lanjutan yang bergantung pada kontrak renewal.
--
-- Hasil rollback:
--   - kontrak renewal dan event aktivasinya dihapus;
--   - kontrak sumber tetap EXPIRED;
--   - karyawan dan histori efektif 29 Juli 2026 kembali INACTIVE;
--   - pekerjaan BORONGAN-LINTING mulai 26 September 2026 dipertahankan;
--   - tidak membuat, mengubah, atau menghapus penugasan Shift.
--
-- Script tidak dijalankan otomatis. Periksa SELECT preview, lalu ubah
-- konfirmasi menjadi YES-I-UNDERSTAND. Seluruh perubahan atomik.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @confirm_renewal_rollback_pkds_2308_03004 = 'NO'; -- ubah menjadi YES-I-UNDERSTAND
SET @target_employee_number = 'PKDS-2308-03004';
SET @source_contract_uid = '4fec7333-8511-11f1-afeb-c88a9a853f1c';
SET @renewal_contract_uid = '4a3b1b32-543f-4f22-b45f-da8f36d3bb6d';
SET @expected_job_assignment_uid = '6ad36b7d-2759-4e3e-bee8-89b3eddc1b54';
SET @rollback_reason = 'Rollback renewal PKDS-2308-03004 untuk menguji ulang lifecycle kesiapan kerja.';
SET @rollback_request_id = 'RENEWAL-ROLLBACK-PKDS-2308-03004-20260928';

-- Preview: wajib tepat satu baris dengan sumber EXPIRED, renewal ACTIVE,
-- histori ACTIVE mulai 2026-07-29, tanpa Shift, dan pekerjaan mulai 2026-09-26.
SELECT employee.employee_number,
       employee_status.code employee_status,
       source.contract_number source_contract,
       source.status source_status,
       DATE_FORMAT(source.end_date,'%Y-%m-%d') source_end,
       renewal.contract_number renewal_contract,
       renewal.status renewal_status,
       DATE_FORMAT(renewal.start_date,'%Y-%m-%d') renewal_start,
       history_status.code history_status,
       DATE_FORMAT(history.effective_from,'%Y-%m-%d') history_start,
       job.code production_job,
       DATE_FORMAT(job_assignment.effective_from,'%Y-%m-%d') job_start,
       (SELECT COUNT(*)
          FROM employee_shift_assignments shift_assignment
         WHERE shift_assignment.employee_id=employee.id) shift_rows
  FROM employees employee
  JOIN employee_statuses employee_status
    ON employee_status.id=employee.employee_status_id
  JOIN employee_contracts source
    ON source.employee_id=employee.id
   AND source.uid=@source_contract_uid
  JOIN employee_contracts renewal
    ON renewal.employee_id=employee.id
   AND renewal.uid=@renewal_contract_uid
  JOIN employee_employment_histories history
    ON history.employee_id=employee.id
   AND history.effective_from=renewal.start_date
   AND history.effective_to IS NULL
  JOIN employee_statuses history_status
    ON history_status.id=history.employee_status_id
  JOIN employee_job_assignments job_assignment
    ON job_assignment.employee_id=employee.id
   AND job_assignment.uid=@expected_job_assignment_uid
  JOIN production_jobs job
    ON job.id=job_assignment.production_job_id
 WHERE employee.employee_number=@target_employee_number;

DROP PROCEDURE IF EXISTS rollback_renewal_pkds_2308_03004;
DELIMITER $$
CREATE PROCEDURE rollback_renewal_pkds_2308_03004()
BEGIN
  DECLARE employee_id_value BIGINT UNSIGNED DEFAULT NULL;
  DECLARE employee_uid_value CHAR(36) DEFAULT NULL;
  DECLARE site_id_value BIGINT UNSIGNED DEFAULT NULL;
  DECLARE employee_status_code VARCHAR(50) DEFAULT NULL;
  DECLARE active_status_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE inactive_status_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE source_contract_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE source_contract_number VARCHAR(100) DEFAULT NULL;
  DECLARE source_status VARCHAR(30) DEFAULT NULL;
  DECLARE source_end DATE DEFAULT NULL;
  DECLARE renewal_contract_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE renewal_contract_number VARCHAR(100) DEFAULT NULL;
  DECLARE renewal_status VARCHAR(30) DEFAULT NULL;
  DECLARE renewal_start DATE DEFAULT NULL;
  DECLARE renewal_end DATE DEFAULT NULL;
  DECLARE renewal_signed_date DATE DEFAULT NULL;
  DECLARE renewal_file_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE lifecycle_event_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE history_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE history_uid CHAR(36) DEFAULT NULL;
  DECLARE history_status_code VARCHAR(50) DEFAULT NULL;
  DECLARE dependency_count INT DEFAULT 0;
  DECLARE later_audit_count INT DEFAULT 0;
  DECLARE shift_count INT DEFAULT 0;
  DECLARE valid_job_count INT DEFAULT 0;
  DECLARE history_updated INT DEFAULT 0;
  DECLARE employee_updated INT DEFAULT 0;
  DECLARE lifecycle_deleted INT DEFAULT 0;
  DECLARE contract_deleted INT DEFAULT 0;
  DECLARE audit_user_id BIGINT UNSIGNED DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF @confirm_renewal_rollback_pkds_2308_03004<>'YES-I-UNDERSTAND' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: konfirmasi belum diisi.';
  END IF;

  START TRANSACTION;

  SELECT employee.id,employee.uid,employee.current_site_id,status.code
    INTO employee_id_value,employee_uid_value,site_id_value,
         employee_status_code
    FROM employees employee
    JOIN employee_statuses status
      ON status.id=employee.employee_status_id
   WHERE employee.employee_number=@target_employee_number
   FOR UPDATE;

  IF employee_id_value IS NULL OR employee_status_code<>'ACTIVE' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: target tidak ditemukan atau status utama bukan ACTIVE.';
  END IF;

  SELECT id INTO active_status_id
    FROM employee_statuses
   WHERE code='ACTIVE'
   LIMIT 1;

  SELECT id INTO inactive_status_id
    FROM employee_statuses
   WHERE code='INACTIVE'
   LIMIT 1;

  IF active_status_id IS NULL OR inactive_status_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: referensi status ACTIVE/INACTIVE tidak tersedia.';
  END IF;

  SELECT source.id,source.contract_number,source.status,source.end_date
    INTO source_contract_id,source_contract_number,source_status,source_end
    FROM employee_contracts source
   WHERE source.uid=@source_contract_uid
     AND source.employee_id=employee_id_value
   FOR UPDATE;

  IF source_contract_id IS NULL
     OR source_contract_number<>'PKWT/RSIAKDS-HR/003/VII/2025'
     OR source_status<>'EXPIRED'
     OR source_end<>'2026-07-28' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: kontrak sumber tidak lagi sesuai kondisi audit.';
  END IF;

  SELECT renewal.id,renewal.contract_number,renewal.status,
         renewal.start_date,renewal.end_date,renewal.signed_date,
         renewal.issued_file_id
    INTO renewal_contract_id,renewal_contract_number,renewal_status,
         renewal_start,renewal_end,renewal_signed_date,renewal_file_id
    FROM employee_contracts renewal
   WHERE renewal.uid=@renewal_contract_uid
     AND renewal.employee_id=employee_id_value
   FOR UPDATE;

  IF renewal_contract_id IS NULL
     OR renewal_contract_number<>'PKWT/RSIAKDS-HR/038/VII/2026'
     OR renewal_status<>'ACTIVE'
     OR renewal_start<>'2026-07-29'
     OR renewal_end<>'2027-07-28'
     OR renewal_signed_date IS NOT NULL
     OR renewal_file_id IS NOT NULL
     OR renewal_start<>DATE_ADD(source_end,INTERVAL 1 DAY) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: kontrak renewal tidak lagi sesuai kondisi audit.';
  END IF;

  SELECT lifecycle.id
    INTO lifecycle_event_id
    FROM employee_contract_lifecycle_events lifecycle
   WHERE lifecycle.contract_id=renewal_contract_id
     AND lifecycle.from_status='DRAFT'
     AND lifecycle.to_status='ACTIVE'
     AND lifecycle.effective_date=renewal_start
   FOR UPDATE;

  IF lifecycle_event_id IS NULL OR
     (SELECT COUNT(*)
        FROM employee_contract_lifecycle_events lifecycle
       WHERE lifecycle.contract_id=renewal_contract_id)<>1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: lifecycle kontrak renewal tidak tepat satu.';
  END IF;

  SELECT history.id,history.uid,status.code
    INTO history_id,history_uid,history_status_code
    FROM employee_employment_histories history
    JOIN employee_statuses status
      ON status.id=history.employee_status_id
   WHERE history.employee_id=employee_id_value
     AND history.effective_from=renewal_start
     AND history.effective_to IS NULL
   FOR UPDATE;

  IF history_id IS NULL
     OR history_status_code<>'ACTIVE'
     OR NOT EXISTS (
       SELECT 1
         FROM employee_employment_histories history
        WHERE history.id=history_id
          AND history.reason='Rollback perpanjangan PKWT: kontrak sebelumnya telah berakhir.'
          AND history.notes='Dikembalikan menjadi INACTIVE oleh rollback seed 20260926.'
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: histori kerja bukan baris INACTIVE lama yang diaktifkan kembali.';
  END IF;

  SELECT COUNT(*) INTO shift_count
    FROM employee_shift_assignments shift_assignment
   WHERE shift_assignment.employee_id=employee_id_value;

  IF shift_count<>0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: target sudah memiliki histori Shift.';
  END IF;

  SELECT COUNT(*) INTO valid_job_count
    FROM employee_job_assignments assignment
    JOIN production_jobs job
      ON job.id=assignment.production_job_id
   WHERE assignment.employee_id=employee_id_value
     AND assignment.uid=@expected_job_assignment_uid
     AND job.code='BORONGAN-LINTING'
     AND assignment.status='ACTIVE'
     AND assignment.is_primary=1
     AND assignment.effective_from='2026-09-26'
     AND assignment.effective_to IS NULL;

  IF valid_job_count<>1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: pekerjaan yang akan dipakai untuk uji realignment sudah berubah.';
  END IF;

  SELECT
    (SELECT COUNT(*)
       FROM attendance_records attendance
      WHERE attendance.employee_id=employee_id_value
        AND attendance.business_date>=renewal_start)
    +
    (SELECT COUNT(*)
       FROM attendance_scan_events scan_event
      WHERE scan_event.employee_id=employee_id_value
        AND DATE(scan_event.scanned_at)>=renewal_start)
    +
    (SELECT COUNT(*)
       FROM production_transactions production
      WHERE production.employee_id=employee_id_value
        AND production.business_date>=renewal_start)
    +
    (SELECT COUNT(*)
       FROM payroll_employee_results payroll_result
      WHERE payroll_result.employee_id=employee_id_value)
    +
    (SELECT COUNT(*)
       FROM payroll_bpjs_monthly_settlements settlement
      WHERE settlement.employee_id=employee_id_value)
    +
    (SELECT COUNT(*)
       FROM scheduled_employee_status_changes scheduled_status
      WHERE scheduled_status.employee_id=employee_id_value
        AND scheduled_status.status IN ('SCHEDULED','FAILED'))
    +
    (SELECT COUNT(*)
       FROM scheduled_employee_mutations scheduled_mutation
      WHERE scheduled_mutation.employee_id=employee_id_value
        AND scheduled_mutation.status IN ('SCHEDULED','FAILED'))
    INTO dependency_count;

  IF dependency_count<>0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: ditemukan Attendance, Produksi, Payroll, BPJS, atau jadwal lanjutan.';
  END IF;

  SELECT COUNT(*) INTO later_audit_count
    FROM audit_logs audit
   WHERE audit.record_uid=@renewal_contract_uid
     AND audit.id>13611;

  IF later_audit_count<>0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: kontrak renewal memiliki audit lanjutan.';
  END IF;

  SELECT COALESCE(
           (SELECT lifecycle.actor_user_id
              FROM employee_contract_lifecycle_events lifecycle
             WHERE lifecycle.id=lifecycle_event_id),
           (SELECT renewal.created_by
              FROM employee_contracts renewal
             WHERE renewal.id=renewal_contract_id)
         )
    INTO audit_user_id;

  IF audit_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: pengguna audit tidak ditemukan.';
  END IF;

  UPDATE employee_employment_histories history
     SET history.employee_status_id=inactive_status_id,
         history.updated_by=audit_user_id
   WHERE history.id=history_id
     AND history.employee_status_id=active_status_id
     AND history.effective_from=renewal_start
     AND history.effective_to IS NULL;
  SET history_updated=ROW_COUNT();

  UPDATE employees employee
     SET employee.employee_status_id=inactive_status_id,
         employee.resign_date=NULL,
         employee.resign_reason=NULL,
         employee.updated_by=audit_user_id
   WHERE employee.id=employee_id_value
     AND employee.employee_status_id=active_status_id;
  SET employee_updated=ROW_COUNT();

  DELETE FROM employee_contract_lifecycle_events
   WHERE id=lifecycle_event_id
     AND contract_id=renewal_contract_id;
  SET lifecycle_deleted=ROW_COUNT();

  INSERT INTO audit_logs(
    uid,user_id,site_id,module,action,table_name,record_id,record_uid,
    description,reason,before_data,after_data,request_id,ip_address,
    user_agent,created_by,updated_by
  ) VALUES(
    UUID(),audit_user_id,site_id_value,'EMPLOYEES','UPDATE',
    'employee_employment_histories',history_id,history_uid,
    'Mengembalikan histori kerja menjadi INACTIVE sebelum uji ulang renewal.',
    @rollback_reason,
    JSON_OBJECT(
      'employeeNumber',@target_employee_number,
      'status','ACTIVE',
      'effectiveFrom',DATE_FORMAT(renewal_start,'%Y-%m-%d')
    ),
    JSON_OBJECT(
      'employeeNumber',@target_employee_number,
      'status','INACTIVE',
      'effectiveFrom',DATE_FORMAT(renewal_start,'%Y-%m-%d')
    ),
    @rollback_request_id,'127.0.0.1','HRIS Renewal Rollback',
    audit_user_id,audit_user_id
  );

  INSERT INTO audit_logs(
    uid,user_id,site_id,module,action,table_name,record_id,record_uid,
    description,reason,before_data,after_data,request_id,ip_address,
    user_agent,created_by,updated_by
  ) VALUES(
    UUID(),audit_user_id,site_id_value,'EMPLOYEES','UPDATE',
    'employees',employee_id_value,employee_uid_value,
    'Mengembalikan status karyawan menjadi INACTIVE sebelum uji ulang renewal.',
    @rollback_reason,
    JSON_OBJECT('employeeNumber',@target_employee_number,'status','ACTIVE'),
    JSON_OBJECT('employeeNumber',@target_employee_number,'status','INACTIVE'),
    @rollback_request_id,'127.0.0.1','HRIS Renewal Rollback',
    audit_user_id,audit_user_id
  );

  INSERT INTO audit_logs(
    uid,user_id,site_id,module,action,table_name,record_id,record_uid,
    description,reason,before_data,after_data,request_id,ip_address,
    user_agent,created_by,updated_by
  ) VALUES(
    UUID(),audit_user_id,site_id_value,'EMPLOYEES','DELETE',
    'employee_contracts',renewal_contract_id,@renewal_contract_uid,
    CONCAT('Rollback kontrak renewal ',renewal_contract_number,'.'),
    @rollback_reason,
    JSON_OBJECT(
      'employeeNumber',@target_employee_number,
      'contractNumber',renewal_contract_number,
      'status','ACTIVE',
      'startDate',DATE_FORMAT(renewal_start,'%Y-%m-%d'),
      'endDate',DATE_FORMAT(renewal_end,'%Y-%m-%d'),
      'sourceContractUid',@source_contract_uid,
      'sourceContractNumber',source_contract_number
    ),
    JSON_OBJECT(
      'deleted',TRUE,
      'sourceContractStatus','EXPIRED',
      'jobAssignmentPreserved',TRUE,
      'shiftRowsPreserved',0
    ),
    @rollback_request_id,'127.0.0.1','HRIS Renewal Rollback',
    audit_user_id,audit_user_id
  );

  DELETE FROM employee_contracts
   WHERE id=renewal_contract_id
     AND uid=@renewal_contract_uid
     AND status='ACTIVE';
  SET contract_deleted=ROW_COUNT();

  IF history_updated<>1
     OR employee_updated<>1
     OR lifecycle_deleted<>1
     OR contract_deleted<>1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: jumlah perubahan tidak tepat satu per komponen.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM employee_contracts contract
     WHERE contract.employee_id=employee_id_value
       AND contract.status IN ('DRAFT','SCHEDULED','ACTIVE')
  ) OR NOT EXISTS (
    SELECT 1
      FROM employee_contracts contract
     WHERE contract.id=source_contract_id
       AND contract.status='EXPIRED'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback dibatalkan: hasil akhir kontrak tidak kembali ke sumber EXPIRED.';
  END IF;

  COMMIT;

  SELECT 'BERHASIL' result,
         @target_employee_number employee_number,
         source_contract_number remaining_contract,
         'EXPIRED' remaining_contract_status,
         'INACTIVE' employee_status,
         '2026-09-26' preserved_job_start,
         0 shift_rows;
END$$
DELIMITER ;

CALL rollback_renewal_pkds_2308_03004();
DROP PROCEDURE rollback_renewal_pkds_2308_03004;

