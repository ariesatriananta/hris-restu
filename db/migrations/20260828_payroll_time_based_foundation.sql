-- Payroll M5A1 - Skema upah berbasis waktu, policy versioning, dan master tarif.
-- Jalankan setelah 20260828_payroll_history_export_slips.sql.
-- Non-destruktif: fakta Produksi Training tetap dipertahankan. Migration tidak
-- mengubah run Payroll immutable dan aman dijalankan ulang pada schema target.

DROP PROCEDURE IF EXISTS assert_payroll_m5a1_training_ready;
DELIMITER $$
CREATE PROCEDURE assert_payroll_m5a1_training_ready()
BEGIN
  IF EXISTS (
    SELECT 1 FROM payroll_employee_results per
    JOIN payroll_runs pr ON pr.id=per.payroll_run_id
    JOIN payroll_periods pp ON pp.id=per.payroll_period_id
    WHERE per.employee_type_snapshot='TRAINING'
      AND (pp.status IN ('APPROVED','CLOSED') OR pr.run_type='FINAL')
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='M5A1 dibatalkan: Payroll immutable masih memuat upah Training. Jalankan preflight dan lakukan remediasi owner.';
  END IF;
END$$
DELIMITER ;
CALL assert_payroll_m5a1_training_ready();
DROP PROCEDURE assert_payroll_m5a1_training_ready;

-- Guard immutable di atas wajib selesai sebelum DDL pertama. MySQL melakukan
-- implicit commit pada ALTER/CREATE sehingga urutan ini mencegah schema
-- setengah termigrasi ketika data Training lama masih menjadi blocker.
DROP PROCEDURE IF EXISTS ensure_payroll_m5a1_columns;
DELIMITER $$
CREATE PROCEDURE ensure_payroll_m5a1_columns()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employee_types' AND column_name='pay_frequency') THEN
    ALTER TABLE employee_types ADD COLUMN pay_frequency VARCHAR(20) NOT NULL DEFAULT 'WEEKLY' AFTER payroll_basis;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='payroll_periods' AND column_name='pay_frequency') THEN
    ALTER TABLE payroll_periods ADD COLUMN pay_frequency VARCHAR(20) NOT NULL DEFAULT 'WEEKLY' AFTER payroll_basis;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employee_salary_histories' AND column_name='status') THEN
    ALTER TABLE employee_salary_histories
      ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' AFTER reason,
      ADD COLUMN cancelled_at DATETIME(3) NULL AFTER status,
      ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancelled_at,
      ADD COLUMN cancellation_reason VARCHAR(500) NULL AFTER cancelled_by;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employee_salary_histories' AND index_name='idx_employee_salary_status') THEN
    ALTER TABLE employee_salary_histories ADD KEY idx_employee_salary_status (employee_id,status,effective_from,effective_to);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='employee_types' AND constraint_name='chk_employee_types_frequency') THEN
    ALTER TABLE employee_types ADD CONSTRAINT chk_employee_types_frequency CHECK (pay_frequency IN ('WEEKLY','MONTHLY'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='payroll_periods' AND constraint_name='chk_payroll_period_frequency') THEN
    ALTER TABLE payroll_periods ADD CONSTRAINT chk_payroll_period_frequency CHECK (pay_frequency IN ('WEEKLY','MONTHLY'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='employee_salary_histories' AND constraint_name='chk_employee_salary_status') THEN
    ALTER TABLE employee_salary_histories ADD CONSTRAINT chk_employee_salary_status CHECK (status IN ('ACTIVE','CANCELLED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='employee_salary_histories' AND constraint_name='fk_employee_salary_cancelled_by') THEN
    ALTER TABLE employee_salary_histories ADD CONSTRAINT fk_employee_salary_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$
DELIMITER ;
CALL ensure_payroll_m5a1_columns();
DROP PROCEDURE ensure_payroll_m5a1_columns;

-- Normalisasi dimensi lama MONTHLY yang sebelumnya tercampur di payroll_basis.
UPDATE payroll_periods
SET pay_frequency=CASE WHEN payroll_basis='MONTHLY' THEN 'MONTHLY' ELSE 'WEEKLY' END,
    payroll_basis=CASE WHEN payroll_basis='MONTHLY' THEN 'TIME_BASED' ELSE payroll_basis END;

SET @payroll_period_basis_constraint = (
  SELECT tc.CONSTRAINT_NAME
  FROM information_schema.TABLE_CONSTRAINTS tc
  JOIN information_schema.CHECK_CONSTRAINTS cc
    ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA
   AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME
  WHERE tc.CONSTRAINT_SCHEMA=DATABASE()
    AND tc.TABLE_NAME='payroll_periods'
    AND tc.CONSTRAINT_TYPE='CHECK'
    AND LOWER(cc.CHECK_CLAUSE) LIKE '%payroll_basis%'
  LIMIT 1
);
SET @ddl = IF(
  @payroll_period_basis_constraint IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE payroll_periods DROP CONSTRAINT `',REPLACE(@payroll_period_basis_constraint,'`','``'),'`')
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
ALTER TABLE payroll_periods
  ADD CONSTRAINT chk_payroll_period_basis CHECK (payroll_basis IN ('PIECE_RATE','TIME_BASED'));

START TRANSACTION;

UPDATE employee_types
SET payroll_basis=CASE WHEN code='BORONGAN' THEN 'PIECE_RATE' ELSE 'TIME_BASED' END,
    pay_frequency=CASE WHEN code='BULANAN' THEN 'MONTHLY' ELSE 'WEEKLY' END,
    description=CASE
      WHEN code='TRAINING' THEN 'Pekerja masa pelatihan dengan tarif harian; hasil Produksi hanya untuk monitoring.'
      ELSE description
    END
WHERE code IN ('BORONGAN','HARIAN','BULANAN','TRAINING');

CREATE TABLE IF NOT EXISTS payroll_policy_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  employee_type_code VARCHAR(30) NOT NULL,
  wage_basis VARCHAR(20) NOT NULL,
  pay_frequency VARCHAR(20) NOT NULL,
  cutoff_type VARCHAR(20) NOT NULL,
  cutoff_day TINYINT UNSIGNED NULL,
  week_starts_on TINYINT UNSIGNED NOT NULL DEFAULT 1,
  prorate_basis VARCHAR(30) NOT NULL,
  attendance_pay_rule VARCHAR(30) NOT NULL,
  deduction_divisor VARCHAR(30) NOT NULL,
  rounding_mode VARCHAR(20) NOT NULL DEFAULT 'HALF_UP',
  rounding_scale TINYINT UNSIGNED NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  notes VARCHAR(500) NULL,
  cancelled_at DATETIME(3) NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_policy_versions_uid (uid),
  KEY idx_payroll_policy_scope_dates (site_id,employee_type_code,effective_from,effective_to,status),
  CONSTRAINT chk_payroll_policy_employee_type CHECK (employee_type_code IN ('BORONGAN','HARIAN','BULANAN','TRAINING')),
  CONSTRAINT chk_payroll_policy_basis CHECK (wage_basis IN ('PIECE_RATE','TIME_BASED')),
  CONSTRAINT chk_payroll_policy_frequency CHECK (pay_frequency IN ('WEEKLY','MONTHLY')),
  CONSTRAINT chk_payroll_policy_cutoff CHECK ((pay_frequency='WEEKLY' AND cutoff_type='WEEK_END' AND cutoff_day IS NULL AND week_starts_on=1) OR (pay_frequency='MONTHLY' AND ((cutoff_type='LAST_DAY' AND cutoff_day IS NULL) OR (cutoff_type='DAY_OF_MONTH' AND cutoff_day BETWEEN 1 AND 31)))),
  CONSTRAINT chk_payroll_policy_prorate CHECK (prorate_basis IN ('NONE','CALENDAR_ELIGIBLE')),
  CONSTRAINT chk_payroll_policy_attendance CHECK (attendance_pay_rule IN ('INFORMATIONAL','PRESENT_ONLY','MONTHLY_DEDUCTION')),
  CONSTRAINT chk_payroll_policy_divisor CHECK (deduction_divisor IN ('NONE','SCHEDULED_WORKDAYS')),
  CONSTRAINT chk_payroll_policy_rounding CHECK (rounding_mode='HALF_UP' AND rounding_scale=0),
  CONSTRAINT chk_payroll_policy_currency CHECK (currency='IDR'),
  CONSTRAINT chk_payroll_policy_dates CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CONSTRAINT chk_payroll_policy_status CHECK (status IN ('ACTIVE','CANCELLED')),
  CONSTRAINT fk_payroll_policy_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_policy_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_policy_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_policy_version_id BIGINT UNSIGNED NOT NULL,
  revision_type VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_policy_revisions_uid (uid),
  UNIQUE KEY uq_payroll_policy_revisions_idempotency (idempotency_key),
  KEY idx_payroll_policy_revisions_policy (payroll_policy_version_id,revised_at),
  CONSTRAINT chk_payroll_policy_revision_type CHECK (revision_type IN ('CREATE','CANCELLATION')),
  CONSTRAINT fk_payroll_policy_revision_policy FOREIGN KEY (payroll_policy_version_id) REFERENCES payroll_policy_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_daily_rate_histories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  employee_type_code VARCHAR(30) NOT NULL,
  daily_rate DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  notes VARCHAR(500) NULL,
  cancelled_at DATETIME(3) NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_daily_rate_uid (uid),
  KEY idx_employee_daily_rate_employee_dates (employee_id,effective_from,effective_to,status),
  KEY idx_employee_daily_rate_site_type (site_id,employee_type_code,status),
  CONSTRAINT chk_employee_daily_rate_type CHECK (employee_type_code IN ('HARIAN','TRAINING')),
  CONSTRAINT chk_employee_daily_rate_amount CHECK (daily_rate>0),
  CONSTRAINT chk_employee_daily_rate_currency CHECK (currency='IDR'),
  CONSTRAINT chk_employee_daily_rate_dates CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CONSTRAINT chk_employee_daily_rate_status CHECK (status IN ('ACTIVE','CANCELLED')),
  CONSTRAINT fk_employee_daily_rate_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employee_daily_rate_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employee_daily_rate_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_daily_rate_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_daily_rate_history_id BIGINT UNSIGNED NOT NULL,
  revision_type VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_daily_rate_revisions_uid (uid),
  UNIQUE KEY uq_employee_daily_rate_revisions_idempotency (idempotency_key),
  KEY idx_employee_daily_rate_revisions_rate (employee_daily_rate_history_id,revised_at),
  CONSTRAINT chk_employee_daily_rate_revision_type CHECK (revision_type IN ('CREATE','CORRECTION','CANCELLATION')),
  CONSTRAINT fk_employee_daily_rate_revision_rate FOREIGN KEY (employee_daily_rate_history_id) REFERENCES employee_daily_rate_histories(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_salary_history_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_salary_history_id BIGINT UNSIGNED NOT NULL,
  revision_type VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_salary_history_revisions_uid (uid),
  UNIQUE KEY uq_employee_salary_history_revisions_idempotency (idempotency_key),
  KEY idx_employee_salary_history_revisions_salary (employee_salary_history_id,revised_at),
  CONSTRAINT chk_employee_salary_revision_type CHECK (revision_type IN ('CREATE','CORRECTION','CANCELLATION')),
  CONSTRAINT fk_employee_salary_revision_salary FOREIGN KEY (employee_salary_history_id) REFERENCES employee_salary_histories(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_period_policy_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  payroll_policy_version_id BIGINT UNSIGNED NOT NULL,
  policy_snapshot JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_period_policy_snapshot_uid (uid),
  UNIQUE KEY uq_payroll_period_policy_snapshot_period (payroll_period_id),
  CONSTRAINT fk_payroll_period_policy_snapshot_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_period_policy_snapshot_policy FOREIGN KEY (payroll_policy_version_id) REFERENCES payroll_policy_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Policy awal menjaga coverage historis. Perubahan operasional berikutnya wajib
-- dibuat sebagai versi future-effective melalui aplikasi.
INSERT INTO payroll_policy_versions(
  uid,site_id,employee_type_code,wage_basis,pay_frequency,cutoff_type,
  cutoff_day,week_starts_on,prorate_basis,attendance_pay_rule,
  deduction_divisor,rounding_mode,rounding_scale,currency,effective_from,
  status,notes
)
SELECT UUID(),s.id,m.employee_type_code,m.wage_basis,m.pay_frequency,
       m.cutoff_type,NULL,1,m.prorate_basis,m.attendance_pay_rule,
       m.deduction_divisor,'HALF_UP',0,'IDR','2000-01-01','ACTIVE',
       'Policy awal M5A1; perubahan berikutnya harus future-effective.'
FROM sites s
JOIN (
  SELECT 'BORONGAN' employee_type_code,'PIECE_RATE' wage_basis,'WEEKLY' pay_frequency,'WEEK_END' cutoff_type,'NONE' prorate_basis,'INFORMATIONAL' attendance_pay_rule,'NONE' deduction_divisor
  UNION ALL SELECT 'HARIAN','TIME_BASED','WEEKLY','WEEK_END','NONE','PRESENT_ONLY','NONE'
  UNION ALL SELECT 'TRAINING','TIME_BASED','WEEKLY','WEEK_END','NONE','PRESENT_ONLY','NONE'
  UNION ALL SELECT 'BULANAN','TIME_BASED','MONTHLY','LAST_DAY','CALENDAR_ELIGIBLE','MONTHLY_DEDUCTION','SCHEDULED_WORKDAYS'
) m
WHERE s.is_active=1
  AND NOT EXISTS (
    SELECT 1 FROM payroll_policy_versions existing
    WHERE existing.site_id=s.id AND existing.employee_type_code=m.employee_type_code
  );

INSERT INTO permissions(uid,code,module,name,description) VALUES
  (UUID(),'payroll.policy.view','payroll','Lihat Kebijakan Payroll','Melihat versi kebijakan Payroll sesuai akses site.'),
  (UUID(),'payroll.policy.manage','payroll','Kelola Kebijakan Payroll','Membuat versi kebijakan Payroll yang berlaku ke depan.'),
  (UUID(),'payroll.rate.manage','payroll','Kelola Tarif Waktu Payroll','Mengelola tarif harian dan gaji pokok sesuai akses site.')
ON DUPLICATE KEY UPDATE module=VALUES(module),name=VALUES(name),description=VALUES(description);

INSERT INTO role_permissions(uid,role_id,permission_id)
SELECT UUID(),r.id,p.id FROM roles r JOIN permissions p ON p.code='payroll.rate.manage'
WHERE r.code='PAYROLL_FINANCE' AND r.is_active=1
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),permission_id=VALUES(permission_id);

INSERT INTO role_permissions(uid,role_id,permission_id)
SELECT UUID(),r.id,p.id FROM roles r JOIN permissions p ON p.code='payroll.policy.view'
WHERE r.code IN ('PAYROLL_FINANCE','DIRECTOR') AND r.is_active=1
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),permission_id=VALUES(permission_id);

COMMIT;

SELECT code,payroll_basis,pay_frequency FROM employee_types
WHERE code IN ('BORONGAN','HARIAN','BULANAN','TRAINING') ORDER BY code;
