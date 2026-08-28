-- Payroll 0 - Integrity Hardening.
--
-- Mengikat approval ke satu hasil perhitungan, mencegah dua run PROCESSING
-- untuk periode yang sama, serta memasang matriks permission awal Payroll.
-- Jalankan sebelum implementasi mesin hitung Payroll.

DROP PROCEDURE IF EXISTS assert_payroll_integrity_migration_ready;
DELIMITER $$
CREATE PROCEDURE assert_payroll_integrity_migration_ready()
BEGIN
  IF EXISTS (
    SELECT 1
      FROM payroll_runs
     WHERE status='PROCESSING'
     GROUP BY payroll_period_id
    HAVING COUNT(*)>1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migration dibatalkan: ada lebih dari satu run Payroll PROCESSING pada periode yang sama.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM payroll_approvals approval
     WHERE NOT EXISTS (
       SELECT 1 FROM payroll_runs run
        WHERE run.payroll_period_id=approval.payroll_period_id
     )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migration dibatalkan: ada approval Payroll tanpa histori run yang dapat ditautkan.';
  END IF;
END$$
DELIMITER ;

CALL assert_payroll_integrity_migration_ready();
DROP PROCEDURE assert_payroll_integrity_migration_ready;

ALTER TABLE payroll_runs
  ADD COLUMN idempotency_key VARCHAR(100) NULL AFTER payroll_period_id,
  ADD COLUMN processing_slot TINYINT UNSIGNED NULL AFTER status;

UPDATE payroll_runs
SET idempotency_key=CONCAT('LEGACY-PAYROLL-RUN-',id),
    processing_slot=CASE WHEN status='PROCESSING' THEN 1 ELSE NULL END;

ALTER TABLE payroll_runs
  MODIFY COLUMN idempotency_key VARCHAR(100) NOT NULL,
  ADD UNIQUE KEY uq_payroll_runs_idempotency (idempotency_key),
  ADD UNIQUE KEY uq_payroll_runs_period_id (payroll_period_id,id),
  ADD UNIQUE KEY uq_payroll_runs_processing_period
    (payroll_period_id,processing_slot),
  ADD CONSTRAINT chk_payroll_runs_processing_slot CHECK (
    (status='PROCESSING' AND processing_slot=1)
    OR (status<>'PROCESSING' AND processing_slot IS NULL)
  );

ALTER TABLE payroll_approvals
  ADD COLUMN payroll_run_id BIGINT UNSIGNED NULL AFTER payroll_period_id;

UPDATE payroll_approvals approval
LEFT JOIN payroll_periods period ON period.id=approval.payroll_period_id
SET approval.payroll_run_id=COALESCE(
  CASE WHEN EXISTS (
    SELECT 1 FROM payroll_runs current_run
     WHERE current_run.id=period.current_run_id
       AND current_run.payroll_period_id=approval.payroll_period_id
  ) THEN period.current_run_id ELSE NULL END,
  (
    SELECT run.id
      FROM payroll_runs run
     WHERE run.payroll_period_id=approval.payroll_period_id
     ORDER BY run.run_number DESC,run.id DESC
     LIMIT 1
  )
);

ALTER TABLE payroll_approvals
  DROP INDEX uq_payroll_approvals_level,
  MODIFY COLUMN payroll_run_id BIGINT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uq_payroll_approvals_run_level
    (payroll_run_id,approval_level),
  ADD KEY idx_payroll_approvals_period_run
    (payroll_period_id,payroll_run_id),
  ADD CONSTRAINT fk_payroll_approvals_run
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_payroll_approvals_period_run
    FOREIGN KEY (payroll_period_id,payroll_run_id)
    REFERENCES payroll_runs(payroll_period_id,id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

START TRANSACTION;

INSERT INTO role_permissions(uid,role_id,permission_id)
SELECT UUID(),role.id,permission.id
  FROM roles role
  JOIN permissions permission
    ON permission.code IN ('payroll.view','payroll.calculate','payroll.close')
 WHERE role.code='PAYROLL_FINANCE' AND role.is_active=1
ON DUPLICATE KEY UPDATE uid=role_permissions.uid;

INSERT INTO role_permissions(uid,role_id,permission_id)
SELECT UUID(),role.id,permission.id
  FROM roles role
  JOIN permissions permission
    ON permission.code IN ('payroll.view','payroll.approve')
 WHERE role.code='DIRECTOR' AND role.is_active=1
ON DUPLICATE KEY UPDATE uid=role_permissions.uid;

COMMIT;

SELECT role.code role_code,permission.code permission_code
  FROM role_permissions mapping
  JOIN roles role ON role.id=mapping.role_id
  JOIN permissions permission ON permission.id=mapping.permission_id
 WHERE role.code IN ('PAYROLL_FINANCE','DIRECTOR')
   AND permission.module='payroll'
 ORDER BY role.code,permission.code;

SELECT
  (SELECT COUNT(*) FROM (
    SELECT payroll_period_id
      FROM payroll_runs
     WHERE status='PROCESSING'
     GROUP BY payroll_period_id
    HAVING COUNT(*)>1
  ) duplicate_processing) duplicate_processing_periods,
  (SELECT COUNT(*)
     FROM payroll_approvals approval
     JOIN payroll_runs run ON run.id=approval.payroll_run_id
    WHERE run.payroll_period_id<>approval.payroll_period_id
  ) approval_run_period_mismatches;
