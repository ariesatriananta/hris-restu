-- Payroll Milestone 2 - Simulasi PIECE_RATE.
-- Jalankan setelah 20260828_payroll_period_readiness.sql.
-- Migration tidak menjalankan kalkulasi dan aman terhadap data run yang ada.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS payroll_period_manual_components (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  payroll_component_type_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  notes VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  active_slot TINYINT UNSIGNED NULL DEFAULT 1,
  idempotency_key VARCHAR(100) NOT NULL,
  cancelled_at DATETIME(3) NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_manual_components_uid (uid),
  UNIQUE KEY uq_payroll_manual_components_idempotency (idempotency_key),
  UNIQUE KEY uq_payroll_manual_components_active (payroll_period_id,employee_id,payroll_component_type_id,active_slot),
  KEY idx_payroll_manual_components_period_status (payroll_period_id,status),
  KEY idx_payroll_manual_components_employee (employee_id),
  KEY idx_payroll_manual_components_type (payroll_component_type_id),
  CONSTRAINT chk_payroll_manual_component_amount CHECK (amount>=0),
  CONSTRAINT chk_payroll_manual_component_status CHECK (status IN ('ACTIVE','CANCELLED')),
  CONSTRAINT chk_payroll_manual_component_slot CHECK ((status='ACTIVE' AND active_slot=1) OR (status='CANCELLED' AND active_slot IS NULL)),
  CONSTRAINT chk_payroll_manual_component_cancel CHECK ((status='ACTIVE' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL) OR (status='CANCELLED' AND active_slot IS NULL AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND CHAR_LENGTH(TRIM(cancellation_reason))>=5)),
  CONSTRAINT fk_payroll_manual_component_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_manual_component_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_manual_component_type FOREIGN KEY (payroll_component_type_id) REFERENCES payroll_component_types(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_manual_component_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_period_manual_component_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_period_manual_component_id BIGINT UNSIGNED NOT NULL,
  revision_type VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  before_data JSON NOT NULL,
  after_data JSON NULL,
  reason VARCHAR(500) NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_manual_component_revisions_uid (uid),
  UNIQUE KEY uq_payroll_manual_component_revisions_idempotency (idempotency_key),
  KEY idx_payroll_manual_component_revisions_source (payroll_period_manual_component_id,revised_at),
  CONSTRAINT chk_payroll_manual_component_revision_type CHECK (revision_type IN ('CREATE','CORRECTION','CANCELLATION')),
  CONSTRAINT fk_payroll_manual_component_revision_source FOREIGN KEY (payroll_period_manual_component_id) REFERENCES payroll_period_manual_components(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Net negatif harus terlihat dalam simulasi. Nilai non-negatif lain tetap
-- dijaga. Database hasil restore dapat mengganti nama CHECK menjadi
-- CONSTRAINT_1/CONSTRAINT_3, jadi constraint dicari berdasarkan isi aturannya.
-- Cara ini juga membuat migration dapat dilanjutkan setelah eksekusi parsial.
SET @payroll_runs_amount_constraint = NULL;
SET @find_payroll_runs_amount_constraint = IF(
  LOCATE('MariaDB',VERSION())>0,
  CONCAT(
    'SELECT cc.CONSTRAINT_NAME INTO @payroll_runs_amount_constraint ',
    'FROM information_schema.CHECK_CONSTRAINTS cc ',
    'WHERE cc.CONSTRAINT_SCHEMA=DATABASE() ',
    'AND cc.TABLE_NAME=''payroll_runs'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%total_piece_rate_amount%'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%total_deductions%'' LIMIT 1'
  ),
  CONCAT(
    'SELECT tc.CONSTRAINT_NAME INTO @payroll_runs_amount_constraint ',
    'FROM information_schema.TABLE_CONSTRAINTS tc ',
    'JOIN information_schema.CHECK_CONSTRAINTS cc ',
    'ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA ',
    'AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME ',
    'WHERE tc.CONSTRAINT_SCHEMA=DATABASE() ',
    'AND tc.TABLE_NAME=''payroll_runs'' AND tc.CONSTRAINT_TYPE=''CHECK'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%total_piece_rate_amount%'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%total_deductions%'' LIMIT 1'
  )
);
PREPARE find_payroll_runs_amount_statement
  FROM @find_payroll_runs_amount_constraint;
EXECUTE find_payroll_runs_amount_statement;
DEALLOCATE PREPARE find_payroll_runs_amount_statement;
SET @drop_payroll_runs_amount_constraint = IF(
  @payroll_runs_amount_constraint IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE payroll_runs ',
    IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT `','DROP CHECK `'),
    REPLACE(@payroll_runs_amount_constraint,'`','``'),
    '`'
  )
);
PREPARE payroll_runs_amount_statement
  FROM @drop_payroll_runs_amount_constraint;
EXECUTE payroll_runs_amount_statement;
DEALLOCATE PREPARE payroll_runs_amount_statement;

ALTER TABLE payroll_runs
  ADD CONSTRAINT chk_payroll_runs_totals CHECK (
    total_piece_rate_amount>=0 AND total_earnings>=0 AND total_deductions>=0
  );

SET @payroll_employee_amount_constraint = NULL;
SET @find_payroll_employee_amount_constraint = IF(
  LOCATE('MariaDB',VERSION())>0,
  CONCAT(
    'SELECT cc.CONSTRAINT_NAME INTO @payroll_employee_amount_constraint ',
    'FROM information_schema.CHECK_CONSTRAINTS cc ',
    'WHERE cc.CONSTRAINT_SCHEMA=DATABASE() ',
    'AND cc.TABLE_NAME=''payroll_employee_results'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%piece_rate_amount%'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%total_deductions%'' LIMIT 1'
  ),
  CONCAT(
    'SELECT tc.CONSTRAINT_NAME INTO @payroll_employee_amount_constraint ',
    'FROM information_schema.TABLE_CONSTRAINTS tc ',
    'JOIN information_schema.CHECK_CONSTRAINTS cc ',
    'ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA ',
    'AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME ',
    'WHERE tc.CONSTRAINT_SCHEMA=DATABASE() ',
    'AND tc.TABLE_NAME=''payroll_employee_results'' ',
    'AND tc.CONSTRAINT_TYPE=''CHECK'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%piece_rate_amount%'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%total_deductions%'' LIMIT 1'
  )
);
PREPARE find_payroll_employee_amount_statement
  FROM @find_payroll_employee_amount_constraint;
EXECUTE find_payroll_employee_amount_statement;
DEALLOCATE PREPARE find_payroll_employee_amount_statement;
SET @drop_payroll_employee_amount_constraint = IF(
  @payroll_employee_amount_constraint IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE payroll_employee_results ',
    IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT `','DROP CHECK `'),
    REPLACE(@payroll_employee_amount_constraint,'`','``'),
    '`'
  )
);
PREPARE payroll_employee_amount_statement
  FROM @drop_payroll_employee_amount_constraint;
EXECUTE payroll_employee_amount_statement;
DEALLOCATE PREPARE payroll_employee_amount_statement;

ALTER TABLE payroll_employee_results
  ADD CONSTRAINT chk_payroll_employee_amounts CHECK (
    piece_rate_amount>=0 AND basic_salary_amount>=0
    AND additional_earnings>=0 AND gross_earnings>=0 AND total_deductions>=0
  );

COMMIT;

SELECT table_name
FROM information_schema.tables
WHERE table_schema=DATABASE()
  AND table_name IN ('payroll_period_manual_components','payroll_period_manual_component_revisions')
ORDER BY table_name;
