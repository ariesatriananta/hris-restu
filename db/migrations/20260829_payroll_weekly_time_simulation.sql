-- Payroll M5B - Simulasi TIME_BASED mingguan HARIAN dan TRAINING.
-- Jalankan setelah 20260829_payroll_time_readiness.sql.
-- Migration hanya menyiapkan snapshot; tidak membuat atau menghitung run.

DROP PROCEDURE IF EXISTS ensure_payroll_m5b_schema;
DELIMITER $$
CREATE PROCEDURE ensure_payroll_m5b_schema()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='payroll_runs'
       AND column_name='total_basic_salary_amount'
  ) THEN
    ALTER TABLE payroll_runs
      ADD COLUMN total_basic_salary_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00
        AFTER total_piece_rate_amount;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema=DATABASE() AND table_name='payroll_time_details'
  ) THEN
    CREATE TABLE payroll_time_details (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      uid CHAR(36) NOT NULL,
      payroll_employee_result_id BIGINT UNSIGNED NOT NULL,
      attendance_record_id BIGINT UNSIGNED NULL,
      employee_daily_rate_history_id BIGINT UNSIGNED NOT NULL,
      business_date DATE NOT NULL,
      attendance_status_snapshot VARCHAR(30) NOT NULL,
      calendar_day_type_snapshot VARCHAR(30) NOT NULL,
      is_scheduled TINYINT(1) NOT NULL DEFAULT 0,
      is_payable TINYINT(1) NOT NULL DEFAULT 0,
      daily_rate_snapshot DECIMAL(18,2) NOT NULL,
      amount_snapshot DECIMAL(18,2) NOT NULL,
      worked_minutes_snapshot INT UNSIGNED NULL,
      warning_code VARCHAR(30) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      created_by BIGINT UNSIGNED NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      updated_by BIGINT UNSIGNED NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_payroll_time_details_uid (uid),
      UNIQUE KEY uq_payroll_time_result_date (payroll_employee_result_id,business_date),
      KEY idx_payroll_time_attendance (attendance_record_id),
      KEY idx_payroll_time_rate (employee_daily_rate_history_id),
      KEY idx_payroll_time_date (business_date),
      CONSTRAINT chk_payroll_time_flags CHECK (is_scheduled IN (0,1) AND is_payable IN (0,1)),
      CONSTRAINT chk_payroll_time_amounts CHECK (daily_rate_snapshot>0 AND amount_snapshot>=0),
      CONSTRAINT chk_payroll_time_payable CHECK (
        (is_payable=1 AND attendance_status_snapshot='PRESENT' AND amount_snapshot=daily_rate_snapshot)
        OR (is_payable=0 AND amount_snapshot=0)
      ),
      CONSTRAINT chk_payroll_time_warning CHECK (warning_code IS NULL OR warning_code='OFFDAY_PRESENT'),
      CONSTRAINT fk_payroll_time_result FOREIGN KEY (payroll_employee_result_id)
        REFERENCES payroll_employee_results(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_payroll_time_attendance FOREIGN KEY (attendance_record_id)
        REFERENCES attendance_records(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_payroll_time_rate FOREIGN KEY (employee_daily_rate_history_id)
        REFERENCES employee_daily_rate_histories(id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema=DATABASE()
       AND table_name='payroll_training_production_details'
  ) THEN
    CREATE TABLE payroll_training_production_details (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      uid CHAR(36) NOT NULL,
      payroll_employee_result_id BIGINT UNSIGNED NOT NULL,
      production_transaction_id BIGINT UNSIGNED NOT NULL,
      production_job_id BIGINT UNSIGNED NOT NULL,
      business_date DATE NOT NULL,
      transaction_number_snapshot VARCHAR(60) NOT NULL,
      job_name_snapshot VARCHAR(150) NOT NULL,
      unit_name_snapshot VARCHAR(100) NOT NULL,
      quantity_snapshot DECIMAL(18,4) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      created_by BIGINT UNSIGNED NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      updated_by BIGINT UNSIGNED NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_payroll_training_production_uid (uid),
      UNIQUE KEY uq_payroll_training_result_transaction
        (payroll_employee_result_id,production_transaction_id),
      KEY idx_payroll_training_production_transaction (production_transaction_id),
      KEY idx_payroll_training_production_job (production_job_id),
      CONSTRAINT chk_payroll_training_production_quantity CHECK (quantity_snapshot>0),
      CONSTRAINT fk_payroll_training_production_result
        FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_payroll_training_production_transaction
        FOREIGN KEY (production_transaction_id) REFERENCES production_transactions(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
      CONSTRAINT fk_payroll_training_production_job
        FOREIGN KEY (production_job_id) REFERENCES production_jobs(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;
END$$
DELIMITER ;

CALL ensure_payroll_m5b_schema();
DROP PROCEDURE ensure_payroll_m5b_schema;

-- Constraint lama belum mengenal total upah berbasis waktu. Nama constraint
-- dicari agar kompatibel dengan restore yang mungkin mengganti nama CHECK.
SET @m5b_run_total_constraint = NULL;
SET @m5b_find_run_total = IF(
  LOCATE('MariaDB',VERSION())>0,
  CONCAT(
    'SELECT cc.CONSTRAINT_NAME INTO @m5b_run_total_constraint ',
    'FROM information_schema.CHECK_CONSTRAINTS cc ',
    'WHERE cc.CONSTRAINT_SCHEMA=DATABASE() AND cc.TABLE_NAME=''payroll_runs'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%total_piece_rate_amount%'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%total_deductions%'' LIMIT 1'
  ),
  CONCAT(
    'SELECT tc.CONSTRAINT_NAME INTO @m5b_run_total_constraint ',
    'FROM information_schema.TABLE_CONSTRAINTS tc ',
    'JOIN information_schema.CHECK_CONSTRAINTS cc ',
    'ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA ',
    'AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME ',
    'WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME=''payroll_runs'' ',
    'AND tc.CONSTRAINT_TYPE=''CHECK'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%total_piece_rate_amount%'' ',
    'AND cc.CHECK_CLAUSE LIKE ''%total_deductions%'' LIMIT 1'
  )
);
PREPARE m5b_find_run_total_statement FROM @m5b_find_run_total;
EXECUTE m5b_find_run_total_statement;
DEALLOCATE PREPARE m5b_find_run_total_statement;

SET @m5b_drop_run_total = IF(
  @m5b_run_total_constraint IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE payroll_runs ',
    IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT `','DROP CHECK `'),
    REPLACE(@m5b_run_total_constraint,'`','``'),'`'
  )
);
PREPARE m5b_drop_run_total_statement FROM @m5b_drop_run_total;
EXECUTE m5b_drop_run_total_statement;
DEALLOCATE PREPARE m5b_drop_run_total_statement;

ALTER TABLE payroll_runs
  ADD CONSTRAINT chk_payroll_runs_totals CHECK (
    total_piece_rate_amount>=0
    AND total_basic_salary_amount>=0
    AND total_earnings>=0
    AND total_deductions>=0
  );

SELECT table_name
FROM information_schema.tables
WHERE table_schema=DATABASE()
  AND table_name IN ('payroll_time_details','payroll_training_production_details')
ORDER BY table_name;

SELECT column_name,column_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema=DATABASE() AND table_name='payroll_runs'
  AND column_name='total_basic_salary_amount';
