-- Payroll Milestone 3 - Approval dan Closing.
-- Jalankan setelah 20260828_payroll_simulation.sql.
--
-- Tabel aksi bersifat append-only. Selain menjadi jejak workflow yang mudah
-- dibaca, unique idempotency_key mencegah submit/review/closing ganda pada
-- retry jaringan. CREATE TABLE IF NOT EXISTS membuat migration aman dilanjutkan
-- setelah eksekusi parsial pada MySQL maupun MariaDB.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS payroll_workflow_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  payroll_run_id BIGINT UNSIGNED NOT NULL,
  payroll_approval_id BIGINT UNSIGNED NULL,
  action_type VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  reason VARCHAR(500) NULL,
  is_super_admin_override TINYINT(1) NOT NULL DEFAULT 0,
  performed_by BIGINT UNSIGNED NOT NULL,
  performed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_workflow_actions_uid (uid),
  UNIQUE KEY uq_payroll_workflow_actions_idempotency (idempotency_key),
  KEY idx_payroll_workflow_actions_period (payroll_period_id,performed_at),
  KEY idx_payroll_workflow_actions_run (payroll_run_id,performed_at),
  KEY idx_payroll_workflow_actions_approval (payroll_approval_id,performed_at),
  CONSTRAINT chk_payroll_workflow_action_type CHECK (action_type IN ('SUBMIT','WITHDRAW','APPROVE','REJECT','CLOSE')),
  CONSTRAINT chk_payroll_workflow_override CHECK (is_super_admin_override IN (0,1)),
  CONSTRAINT chk_payroll_workflow_reason CHECK ((action_type IN ('WITHDRAW','REJECT') AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason))>=5) OR action_type NOT IN ('WITHDRAW','REJECT')),
  CONSTRAINT fk_payroll_workflow_action_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_workflow_action_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_workflow_action_approval FOREIGN KEY (payroll_approval_id) REFERENCES payroll_approvals(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_workflow_action_user FOREIGN KEY (performed_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

SELECT table_name
FROM information_schema.tables
WHERE table_schema=DATABASE()
  AND table_name='payroll_workflow_actions';
