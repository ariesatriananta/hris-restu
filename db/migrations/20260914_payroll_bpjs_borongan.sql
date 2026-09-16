-- BPJS Payroll Borongan: policy tahunan, UMK site, kepesertaan,
-- settlement bulanan, dan snapshot hasil per run.
--
-- Migration ini tidak mengaktifkan potongan pada periode lama. Kolom
-- payroll_periods.deduct_bpjs bernilai 0 secara default sehingga perilaku
-- Payroll yang sudah ada tetap sama sampai user memilih Potong BPJS=Ya.

CREATE TABLE IF NOT EXISTS payroll_bpjs_policies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  policy_year SMALLINT UNSIGNED NOT NULL,
  health_employer_enabled TINYINT(1) NOT NULL DEFAULT 1,
  health_employer_rate DECIMAL(7,4) NOT NULL DEFAULT 4.0000,
  health_employee_enabled TINYINT(1) NOT NULL DEFAULT 1,
  health_employee_rate DECIMAL(7,4) NOT NULL DEFAULT 1.0000,
  jht_employer_enabled TINYINT(1) NOT NULL DEFAULT 1,
  jht_employer_rate DECIMAL(7,4) NOT NULL DEFAULT 3.7000,
  jht_employee_enabled TINYINT(1) NOT NULL DEFAULT 1,
  jht_employee_rate DECIMAL(7,4) NOT NULL DEFAULT 2.0000,
  jkk_employer_enabled TINYINT(1) NOT NULL DEFAULT 1,
  jkk_employer_rate DECIMAL(7,4) NOT NULL DEFAULT 0.5400,
  jkm_employer_enabled TINYINT(1) NOT NULL DEFAULT 1,
  jkm_employer_rate DECIMAL(7,4) NOT NULL DEFAULT 0.3000,
  jp_employer_enabled TINYINT(1) NOT NULL DEFAULT 0,
  jp_employer_rate DECIMAL(7,4) NOT NULL DEFAULT 2.0000,
  jp_employee_enabled TINYINT(1) NOT NULL DEFAULT 1,
  jp_employee_rate DECIMAL(7,4) NOT NULL DEFAULT 1.0000,
  health_wage_ceiling DECIMAL(18,2) NULL,
  jp_wage_ceiling DECIMAL(18,2) NULL,
  rounding_unit INT UNSIGNED NOT NULL DEFAULT 1000,
  regulation_reference VARCHAR(255) NULL,
  notes VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  cancelled_at DATETIME(3) NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_bpjs_policies_uid (uid),
  UNIQUE KEY uq_payroll_bpjs_policies_year (policy_year),
  KEY idx_payroll_bpjs_policies_status (status,policy_year),
  CONSTRAINT chk_payroll_bpjs_policy_year CHECK (policy_year BETWEEN 2000 AND 2100),
  CONSTRAINT chk_payroll_bpjs_policy_flags CHECK (
    health_employer_enabled IN (0,1) AND health_employee_enabled IN (0,1)
    AND jht_employer_enabled IN (0,1) AND jht_employee_enabled IN (0,1)
    AND jkk_employer_enabled IN (0,1) AND jkm_employer_enabled IN (0,1)
    AND jp_employer_enabled IN (0,1)
    AND jp_employee_enabled IN (0,1)
  ),
  CONSTRAINT chk_payroll_bpjs_policy_rates CHECK (
    health_employer_rate BETWEEN 0 AND 100 AND health_employee_rate BETWEEN 0 AND 100
    AND jht_employer_rate BETWEEN 0 AND 100 AND jht_employee_rate BETWEEN 0 AND 100
    AND jkk_employer_rate BETWEEN 0 AND 100 AND jkm_employer_rate BETWEEN 0 AND 100
    AND jp_employer_rate BETWEEN 0 AND 100 AND jp_employee_rate BETWEEN 0 AND 100
  ),
  CONSTRAINT chk_payroll_bpjs_policy_rounding CHECK (rounding_unit BETWEEN 1 AND 1000000),
  CONSTRAINT chk_payroll_bpjs_policy_status CHECK (status IN ('ACTIVE','CANCELLED')),
  CONSTRAINT fk_payroll_bpjs_policy_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_payroll_bpjs_policy_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_payroll_bpjs_policy_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_bpjs_policy_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_bpjs_policy_id BIGINT UNSIGNED NOT NULL,
  revision_type VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  before_data JSON NULL,
  after_data JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_bpjs_policy_revisions_uid (uid),
  UNIQUE KEY uq_payroll_bpjs_policy_revisions_idempotency (idempotency_key),
  KEY idx_payroll_bpjs_policy_revisions_master (payroll_bpjs_policy_id,revised_at),
  CONSTRAINT chk_payroll_bpjs_policy_revision_type CHECK (revision_type IN ('CREATE','CORRECTION','CANCELLATION','REACTIVATION')),
  CONSTRAINT fk_payroll_bpjs_policy_revision_master FOREIGN KEY (payroll_bpjs_policy_id) REFERENCES payroll_bpjs_policies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_bpjs_policy_revision_user FOREIGN KEY (revised_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legacy: dipertahankan untuk referensi snapshot sebelum JKK global.
CREATE TABLE IF NOT EXISTS site_bpjs_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  setting_year SMALLINT UNSIGNED NOT NULL,
  site_minimum_wage_id BIGINT UNSIGNED NOT NULL,
  jkk_employer_enabled TINYINT(1) NOT NULL DEFAULT 1,
  jkk_employer_rate DECIMAL(7,4) NOT NULL DEFAULT 0.5400,
  notes VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  cancelled_at DATETIME(3) NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_bpjs_settings_uid (uid),
  UNIQUE KEY uq_site_bpjs_settings_site_year (site_id,setting_year),
  KEY idx_site_bpjs_settings_status (status,setting_year,site_id),
  KEY idx_site_bpjs_settings_umk (site_minimum_wage_id),
  CONSTRAINT chk_site_bpjs_setting_year CHECK (setting_year BETWEEN 2000 AND 2100),
  CONSTRAINT chk_site_bpjs_setting_jkk CHECK (jkk_employer_enabled IN (0,1) AND jkk_employer_rate BETWEEN 0 AND 100),
  CONSTRAINT chk_site_bpjs_setting_status CHECK (status IN ('ACTIVE','CANCELLED')),
  CONSTRAINT fk_site_bpjs_setting_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_site_bpjs_setting_umk FOREIGN KEY (site_minimum_wage_id) REFERENCES site_minimum_wages(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_site_bpjs_setting_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_site_bpjs_setting_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_site_bpjs_setting_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_bpjs_setting_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_bpjs_setting_id BIGINT UNSIGNED NOT NULL,
  revision_type VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  before_data JSON NULL,
  after_data JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_bpjs_setting_revisions_uid (uid),
  UNIQUE KEY uq_site_bpjs_setting_revisions_idempotency (idempotency_key),
  KEY idx_site_bpjs_setting_revisions_master (site_bpjs_setting_id,revised_at),
  CONSTRAINT chk_site_bpjs_setting_revision_type CHECK (revision_type IN ('CREATE','CORRECTION','CANCELLATION','REACTIVATION')),
  CONSTRAINT fk_site_bpjs_setting_revision_master FOREIGN KEY (site_bpjs_setting_id) REFERENCES site_bpjs_settings(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_site_bpjs_setting_revision_user FOREIGN KEY (revised_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_bpjs_enrollments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  health_enabled TINYINT(1) NOT NULL DEFAULT 1,
  jht_enabled TINYINT(1) NOT NULL DEFAULT 1,
  jkk_enabled TINYINT(1) NOT NULL DEFAULT 1,
  jkm_enabled TINYINT(1) NOT NULL DEFAULT 1,
  jp_enabled TINYINT(1) NOT NULL DEFAULT 1,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_bpjs_enrollments_uid (uid),
  UNIQUE KEY uq_employee_bpjs_enrollments_start (employee_id,effective_from),
  KEY idx_employee_bpjs_enrollments_dates (employee_id,effective_from,effective_to),
  CONSTRAINT chk_employee_bpjs_enrollment_dates CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CONSTRAINT chk_employee_bpjs_enrollment_flags CHECK (health_enabled IN (0,1) AND jht_enabled IN (0,1) AND jkk_enabled IN (0,1) AND jkm_enabled IN (0,1) AND jp_enabled IN (0,1)),
  CONSTRAINT fk_employee_bpjs_enrollment_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employee_bpjs_enrollment_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_employee_bpjs_enrollment_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_bpjs_enrollment_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_bpjs_enrollment_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  before_data JSON NULL,
  after_data JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_bpjs_enrollment_revisions_uid (uid),
  UNIQUE KEY uq_employee_bpjs_enrollment_revisions_idempotency (idempotency_key),
  KEY idx_employee_bpjs_enrollment_revisions_master (employee_bpjs_enrollment_id,revised_at),
  CONSTRAINT fk_employee_bpjs_enrollment_revision_master FOREIGN KEY (employee_bpjs_enrollment_id) REFERENCES employee_bpjs_enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employee_bpjs_enrollment_revision_user FOREIGN KEY (revised_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS migrate_payroll_bpjs_period_columns;
DELIMITER $$
CREATE PROCEDURE migrate_payroll_bpjs_period_columns()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='payroll_periods' AND column_name='deduct_bpjs'
  ) THEN
    ALTER TABLE payroll_periods
      ADD COLUMN deduct_bpjs TINYINT(1) NOT NULL DEFAULT 0 AFTER employee_type_code;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='payroll_periods' AND column_name='bpjs_contribution_month'
  ) THEN
    ALTER TABLE payroll_periods
      ADD COLUMN bpjs_contribution_month DATE NULL AFTER deduct_bpjs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema=DATABASE() AND table_name='payroll_periods'
      AND constraint_name='chk_payroll_period_bpjs'
  ) THEN
    ALTER TABLE payroll_periods ADD CONSTRAINT chk_payroll_period_bpjs CHECK (
      (deduct_bpjs=0 AND bpjs_contribution_month IS NULL)
      OR
      (deduct_bpjs=1 AND employee_type_code='BORONGAN'
       AND DAY(bpjs_contribution_month)=1)
    );
  END IF;
END$$
DELIMITER ;
CALL migrate_payroll_bpjs_period_columns();
DROP PROCEDURE migrate_payroll_bpjs_period_columns;

CREATE TABLE IF NOT EXISTS payroll_bpjs_monthly_settlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  contribution_month DATE NOT NULL,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_bpjs_settlements_uid (uid),
  UNIQUE KEY uq_payroll_bpjs_settlements_employee_month (employee_id,contribution_month),
  KEY idx_payroll_bpjs_settlements_period (payroll_period_id),
  KEY idx_payroll_bpjs_settlements_site_month (site_id,contribution_month),
  CONSTRAINT chk_payroll_bpjs_settlement_month CHECK (DAY(contribution_month)=1),
  CONSTRAINT fk_payroll_bpjs_settlement_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_bpjs_settlement_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_bpjs_settlement_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_bpjs_settlement_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_employee_bpjs_details (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_employee_result_id BIGINT UNSIGNED NOT NULL,
  payroll_bpjs_settlement_id BIGINT UNSIGNED NOT NULL,
  payroll_bpjs_policy_id BIGINT UNSIGNED NOT NULL,
  site_bpjs_setting_id BIGINT UNSIGNED NULL,
  site_minimum_wage_id BIGINT UNSIGNED NOT NULL,
  employee_bpjs_enrollment_id BIGINT UNSIGNED NULL,
  contribution_month DATE NOT NULL,
  minimum_wage_snapshot DECIMAL(18,2) NOT NULL,
  rounding_unit_snapshot INT UNSIGNED NOT NULL,
  health_employer_rate_snapshot DECIMAL(7,4) NOT NULL,
  health_employer_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  health_employee_rate_snapshot DECIMAL(7,4) NOT NULL,
  health_employee_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  jht_employer_rate_snapshot DECIMAL(7,4) NOT NULL,
  jht_employer_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  jht_employee_rate_snapshot DECIMAL(7,4) NOT NULL,
  jht_employee_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  jkk_employer_rate_snapshot DECIMAL(7,4) NOT NULL,
  jkk_employer_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  jkm_employer_rate_snapshot DECIMAL(7,4) NOT NULL,
  jkm_employer_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  jp_employer_rate_snapshot DECIMAL(7,4) NOT NULL,
  jp_employer_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  jp_employee_rate_snapshot DECIMAL(7,4) NOT NULL,
  jp_employee_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_employee_deduction DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_employer_contribution DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  policy_snapshot JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_employee_bpjs_details_uid (uid),
  UNIQUE KEY uq_payroll_employee_bpjs_details_result (payroll_employee_result_id),
  KEY idx_payroll_employee_bpjs_settlement (payroll_bpjs_settlement_id),
  KEY idx_payroll_employee_bpjs_policy (payroll_bpjs_policy_id),
  KEY idx_payroll_employee_bpjs_month (contribution_month),
  CONSTRAINT chk_payroll_employee_bpjs_amounts CHECK (
    minimum_wage_snapshot>0 AND rounding_unit_snapshot>0
    AND health_employer_amount>=0 AND health_employee_amount>=0
    AND jht_employer_amount>=0 AND jht_employee_amount>=0
    AND jkk_employer_amount>=0 AND jkm_employer_amount>=0
    AND jp_employer_amount>=0 AND jp_employee_amount>=0
    AND total_employee_deduction>=0 AND total_employer_contribution>=0
  ),
  CONSTRAINT fk_payroll_employee_bpjs_result FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_employee_bpjs_settlement FOREIGN KEY (payroll_bpjs_settlement_id) REFERENCES payroll_bpjs_monthly_settlements(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_employee_bpjs_policy FOREIGN KEY (payroll_bpjs_policy_id) REFERENCES payroll_bpjs_policies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_employee_bpjs_site_setting FOREIGN KEY (site_bpjs_setting_id) REFERENCES site_bpjs_settings(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_employee_bpjs_umk FOREIGN KEY (site_minimum_wage_id) REFERENCES site_minimum_wages(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_employee_bpjs_enrollment FOREIGN KEY (employee_bpjs_enrollment_id) REFERENCES employee_bpjs_enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_employee_bpjs_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_payroll_employee_bpjs_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;

INSERT INTO payroll_component_types(
  uid,code,name,component_category,calculation_method,is_taxable,is_active,description
) VALUES
  (UUID(),'BPJS_HEALTH_EMPLOYEE','BPJS Kesehatan Karyawan','DEDUCTION','FORMULA',0,1,'Potongan BPJS Kesehatan bagian karyawan dari snapshot sistem.'),
  (UUID(),'BPJS_JHT_EMPLOYEE','JHT Karyawan','DEDUCTION','FORMULA',0,1,'Potongan JHT bagian karyawan dari snapshot sistem.'),
  (UUID(),'BPJS_JP_EMPLOYEE','Jaminan Pensiun Karyawan','DEDUCTION','FORMULA',0,1,'Potongan JP bagian karyawan dari snapshot sistem.')
ON DUPLICATE KEY UPDATE
  name=VALUES(name),description=VALUES(description),is_active=1;

COMMIT;

SELECT table_name
FROM information_schema.tables
WHERE table_schema=DATABASE()
  AND table_name IN (
    'payroll_bpjs_policies','payroll_bpjs_policy_revisions',
    'site_bpjs_settings','site_bpjs_setting_revisions',
    'employee_bpjs_enrollments','employee_bpjs_enrollment_revisions',
    'payroll_bpjs_monthly_settlements',
    'payroll_employee_bpjs_details'
  )
ORDER BY table_name;
