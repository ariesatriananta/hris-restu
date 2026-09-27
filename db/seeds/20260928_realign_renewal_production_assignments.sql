-- Repair terarah untuk menyelaraskan tanggal mulai Penugasan Kerja Produksi
-- dengan tanggal mulai kontrak perpanjangan yang dibuat pada 27 September 2026.
--
-- Target dibatasi ke enam assignment yang telah diverifikasi. Script akan
-- membatalkan seluruh transaksi bila identitas, tanggal, status, pekerjaan,
-- site, atau histori assignment tidak lagi sama dengan kondisi audit.
--
-- Script tidak dijalankan otomatis. Periksa target pada SELECT awal, lalu ubah
-- konfirmasi menjadi YES-I-UNDERSTAND sebelum menjalankannya.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @confirm_assignment_realign = 'NO'; -- ubah menjadi YES-I-UNDERSTAND
SET @repair_reason = 'Menyelaraskan tanggal mulai Penugasan Kerja Produksi dengan kontrak perpanjangan.';

DROP TEMPORARY TABLE IF EXISTS tmp_assignment_realign_targets;
CREATE TEMPORARY TABLE tmp_assignment_realign_targets (
  employee_number VARCHAR(50) NOT NULL,
  contract_number VARCHAR(100) NOT NULL,
  expected_contract_start DATE NOT NULL,
  assignment_uid CHAR(36) NOT NULL,
  expected_assignment_start DATE NOT NULL,
  PRIMARY KEY (employee_number),
  UNIQUE KEY uq_tmp_assignment_realign_contract (contract_number),
  UNIQUE KEY uq_tmp_assignment_realign_assignment (assignment_uid)
);

INSERT INTO tmp_assignment_realign_targets(
  employee_number,contract_number,expected_contract_start,
  assignment_uid,expected_assignment_start
) VALUES
  ('PKDS-2306-18004','PKWT/RSIAKDS-HR/037/IX/2026','2026-09-16','a88a9c68-91ef-48a5-bc61-d8dabbe7f92a','2026-09-26'),
  ('PKDS-2307-09001','PKWT/RSIAKDS-HR/036/IX/2026','2026-09-16','d7fbaf15-c357-4139-8f86-3c8bfb349679','2026-09-26'),
  ('PKDS-2309-21001','PKWT/RSIAKDS-HR/038/IX/2026','2026-09-15','e84a1a74-b576-43fb-bdf0-1e0224846c54','2026-09-26'),
  ('PKDS-2509-22003','PKWT/RSIAKDS-HR/034/IX/2026','2026-09-22','601e8739-90ef-4534-bec1-971020705ab4','2026-09-26'),
  ('PSMG-2301-05012','PKWT/RSIASMG-HR/007/IX/2026','2026-09-20','8fac6a26-0e0d-4ec3-9ad9-00fa035d02b4','2026-09-26'),
  ('PSMG-2301-10016','PKWT/RSIASMG-HR/015/IX/2026','2026-09-15','07951a31-1ee2-4260-973b-690458b762a1','2026-09-26');

-- Preview read-only. Semua baris harus menunjukkan nilai expected yang sama.
SELECT target.employee_number,
       target.contract_number,
       target.expected_contract_start,
       target.assignment_uid,
       target.expected_assignment_start,
       contract.status contract_status,
       contract.start_date actual_contract_start,
       assignment.status assignment_status,
       assignment.is_primary,
       assignment.effective_from actual_assignment_start,
       assignment.effective_to actual_assignment_end,
       assignment.site_id,
       assignment.production_job_id
FROM tmp_assignment_realign_targets target
LEFT JOIN employees employee
  ON employee.employee_number=target.employee_number
LEFT JOIN employee_contracts contract
  ON contract.employee_id=employee.id
 AND contract.contract_number=target.contract_number
LEFT JOIN employee_job_assignments assignment
  ON assignment.employee_id=employee.id
 AND assignment.uid=target.assignment_uid
ORDER BY target.employee_number;

DROP PROCEDURE IF EXISTS repair_renewal_production_assignment_dates;
DELIMITER $$
CREATE PROCEDURE repair_renewal_production_assignment_dates()
BEGIN
  DECLARE expected_count INT DEFAULT 6;
  DECLARE valid_target_count INT DEFAULT 0;
  DECLARE valid_previous_count INT DEFAULT 0;
  DECLARE conflict_count INT DEFAULT 0;
  DECLARE updated_count INT DEFAULT 0;
  DECLARE audit_user_id BIGINT UNSIGNED DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF @confirm_assignment_realign<>'YES-I-UNDERSTAND' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Repair dibatalkan: konfirmasi belum diisi.';
  END IF;

  START TRANSACTION;

  SELECT COUNT(*) INTO valid_target_count
  FROM tmp_assignment_realign_targets target
  JOIN employees employee
    ON employee.employee_number=target.employee_number
  JOIN employee_contracts contract
    ON contract.employee_id=employee.id
   AND contract.contract_number=target.contract_number
   AND contract.status='ACTIVE'
   AND contract.start_date=target.expected_contract_start
  JOIN employee_job_assignments assignment
    ON assignment.employee_id=employee.id
   AND assignment.uid=target.assignment_uid
   AND assignment.status='ACTIVE'
   AND assignment.is_primary=1
   AND assignment.effective_from=target.expected_assignment_start
   AND assignment.effective_to IS NULL;

  IF valid_target_count<>expected_count THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Repair dibatalkan: kondisi target sudah berubah atau tidak lengkap.';
  END IF;

  -- Harus ada assignment utama sebelumnya dengan pekerjaan dan site yang sama,
  -- berakhir tepat H-1 dari kontrak baru, dan bukan hasil penutupan manual.
  SELECT COUNT(*) INTO valid_previous_count
  FROM tmp_assignment_realign_targets target
  JOIN employees employee
    ON employee.employee_number=target.employee_number
  JOIN employee_contracts contract
    ON contract.employee_id=employee.id
   AND contract.contract_number=target.contract_number
  JOIN employee_job_assignments current_assignment
    ON current_assignment.employee_id=employee.id
   AND current_assignment.uid=target.assignment_uid
  WHERE EXISTS (
    SELECT 1
    FROM employee_job_assignments previous_assignment
    WHERE previous_assignment.employee_id=employee.id
      AND previous_assignment.site_id=current_assignment.site_id
      AND previous_assignment.production_job_id=current_assignment.production_job_id
      AND previous_assignment.status='ACTIVE'
      AND previous_assignment.is_primary=1
      AND previous_assignment.effective_to=DATE_SUB(contract.start_date,INTERVAL 1 DAY)
      AND previous_assignment.updated_at>previous_assignment.created_at
      AND NOT EXISTS (
        SELECT 1
        FROM audit_logs manual_audit
        WHERE manual_audit.table_name='employee_job_assignments'
          AND manual_audit.record_id=previous_assignment.id
          AND manual_audit.action='UPDATE'
          AND manual_audit.description IN (
            'Menutup penugasan pekerjaan Produksi.',
            'Mengoreksi histori penugasan pekerjaan Produksi.'
          )
      )
  );

  IF valid_previous_count<>expected_count THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Repair dibatalkan: histori assignment sebelumnya tidak sesuai.';
  END IF;

  -- Hindari benturan histori primer maupun unique key ketika tanggal dimundurkan.
  SELECT COUNT(*) INTO conflict_count
  FROM tmp_assignment_realign_targets target
  JOIN employees employee
    ON employee.employee_number=target.employee_number
  JOIN employee_contracts contract
    ON contract.employee_id=employee.id
   AND contract.contract_number=target.contract_number
  JOIN employee_job_assignments current_assignment
    ON current_assignment.employee_id=employee.id
   AND current_assignment.uid=target.assignment_uid
  JOIN employee_job_assignments conflict
    ON conflict.employee_id=employee.id
   AND conflict.id<>current_assignment.id
   AND (
     (
       conflict.status='ACTIVE'
       AND conflict.is_primary=1
       AND conflict.effective_from<=DATE_SUB(current_assignment.effective_from,INTERVAL 1 DAY)
       AND (conflict.effective_to IS NULL OR conflict.effective_to>=contract.start_date)
     )
     OR (
       conflict.production_job_id=current_assignment.production_job_id
       AND conflict.site_id=current_assignment.site_id
       AND conflict.effective_from=contract.start_date
     )
   );

  IF conflict_count<>0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Repair dibatalkan: ditemukan assignment yang akan bertumpang tindih.';
  END IF;

  SELECT MIN(u.id) INTO audit_user_id
  FROM users u
  JOIN user_roles user_role ON user_role.user_id=u.id
  JOIN roles role ON role.id=user_role.role_id AND role.code='SUPER_ADMIN'
  WHERE u.status='ACTIVE';

  IF audit_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Repair dibatalkan: Super Admin aktif untuk audit tidak ditemukan.';
  END IF;

  UPDATE employee_job_assignments assignment
  JOIN employees employee ON employee.id=assignment.employee_id
  JOIN tmp_assignment_realign_targets target
    ON target.employee_number=employee.employee_number
   AND target.assignment_uid=assignment.uid
  JOIN employee_contracts contract
    ON contract.employee_id=employee.id
   AND contract.contract_number=target.contract_number
  SET assignment.effective_from=contract.start_date,
      assignment.updated_by=audit_user_id
  WHERE assignment.status='ACTIVE'
    AND assignment.is_primary=1
    AND assignment.effective_from=target.expected_assignment_start
    AND assignment.effective_to IS NULL;
  SET updated_count=ROW_COUNT();

  IF updated_count<>expected_count THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Repair dibatalkan: jumlah assignment yang diperbarui tidak tepat enam.';
  END IF;

  INSERT INTO audit_logs(
    uid,user_id,site_id,module,action,table_name,record_id,record_uid,
    description,reason,before_data,after_data,request_id,ip_address,
    user_agent,created_by,updated_by
  )
  SELECT UUID(),audit_user_id,assignment.site_id,'PRODUCTION','UPDATE',
         'employee_job_assignments',assignment.id,assignment.uid,
         'Menyelaraskan tanggal mulai pekerjaan utama dengan kontrak perpanjangan.',
         @repair_reason,
         JSON_OBJECT(
           'employeeNumber',employee.employee_number,
           'contractNumber',contract.contract_number,
           'effectiveFrom',DATE_FORMAT(target.expected_assignment_start,'%Y-%m-%d')
         ),
         JSON_OBJECT(
           'employeeNumber',employee.employee_number,
           'contractNumber',contract.contract_number,
           'effectiveFrom',DATE_FORMAT(contract.start_date,'%Y-%m-%d')
         ),
         CONCAT('RENEWAL-ASSIGNMENT-REALIGN-',UPPER(REPLACE(assignment.uid,'-',''))),
         '127.0.0.1','HRIS Renewal Assignment Repair',audit_user_id,audit_user_id
  FROM tmp_assignment_realign_targets target
  JOIN employees employee
    ON employee.employee_number=target.employee_number
  JOIN employee_contracts contract
    ON contract.employee_id=employee.id
   AND contract.contract_number=target.contract_number
  JOIN employee_job_assignments assignment
    ON assignment.employee_id=employee.id
   AND assignment.uid=target.assignment_uid;

  COMMIT;

  SELECT 'BERHASIL' result,
         updated_count assignment_rows_updated,
         expected_count expected_rows;
END$$
DELIMITER ;

CALL repair_renewal_production_assignment_dates();
DROP PROCEDURE repair_renewal_production_assignment_dates;
DROP TEMPORARY TABLE tmp_assignment_realign_targets;
