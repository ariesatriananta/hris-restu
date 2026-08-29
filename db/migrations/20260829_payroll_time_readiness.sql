-- Payroll M5A2 - Period scheme identity untuk readiness berbasis waktu.
-- Jalankan setelah 20260828_payroll_time_based_foundation.sql.
-- Tidak membuat run maupun hasil Payroll.

DROP PROCEDURE IF EXISTS assert_payroll_m5a2_ready;
DELIMITER $$
CREATE PROCEDURE assert_payroll_m5a2_ready()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='payroll_periods'
      AND column_name='employee_type_code'
  ) AND EXISTS (
    SELECT 1 FROM payroll_periods WHERE payroll_basis='TIME_BASED'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='M5A2 dibatalkan: periode TIME_BASED lama belum memiliki identitas jenis karyawan.';
  END IF;
END$$
DELIMITER ;
CALL assert_payroll_m5a2_ready();
DROP PROCEDURE assert_payroll_m5a2_ready;

DROP PROCEDURE IF EXISTS ensure_payroll_m5a2_columns;
DELIMITER $$
CREATE PROCEDURE ensure_payroll_m5a2_columns()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='payroll_periods'
      AND column_name='employee_type_code'
  ) THEN
    ALTER TABLE payroll_periods
      ADD COLUMN employee_type_code VARCHAR(30) NULL AFTER pay_frequency;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema=DATABASE() AND table_name='payroll_periods'
      AND index_name='idx_payroll_periods_scheme_dates'
  ) THEN
    ALTER TABLE payroll_periods
      ADD KEY idx_payroll_periods_scheme_dates
        (site_id,payroll_basis,pay_frequency,employee_type_code,period_start,period_end);
  END IF;
END$$
DELIMITER ;
CALL ensure_payroll_m5a2_columns();
DROP PROCEDURE ensure_payroll_m5a2_columns;

-- Pemeriksaan ini sengaja dilakukan setelah kolom dipastikan tersedia.
-- MySQL memvalidasi nama kolom ketika procedure dijalankan, walaupun cabang IF
-- yang memuat referensi kolom tersebut seharusnya tidak terpenuhi.
DROP PROCEDURE IF EXISTS assert_payroll_m5a2_time_identity;
DELIMITER $$
CREATE PROCEDURE assert_payroll_m5a2_time_identity()
BEGIN
  IF EXISTS (
    SELECT 1 FROM payroll_periods
    WHERE employee_type_code IS NULL AND payroll_basis='TIME_BASED'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='M5A2 dibatalkan: periode TIME_BASED lama perlu diremediasi owner sebelum kolom dikunci.';
  END IF;
END$$
DELIMITER ;
CALL assert_payroll_m5a2_time_identity();
DROP PROCEDURE assert_payroll_m5a2_time_identity;

UPDATE payroll_periods
SET employee_type_code='BORONGAN'
WHERE employee_type_code IS NULL AND payroll_basis='PIECE_RATE';

DROP PROCEDURE IF EXISTS assert_payroll_m5a2_scheme;
DELIMITER $$
CREATE PROCEDURE assert_payroll_m5a2_scheme()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM payroll_periods
    WHERE employee_type_code IS NULL
       OR NOT (
         (employee_type_code='BORONGAN' AND payroll_basis='PIECE_RATE' AND pay_frequency='WEEKLY')
         OR (employee_type_code IN ('HARIAN','TRAINING') AND payroll_basis='TIME_BASED' AND pay_frequency='WEEKLY')
         OR (employee_type_code='BULANAN' AND payroll_basis='TIME_BASED' AND pay_frequency='MONTHLY')
       )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='M5A2 dibatalkan: ada periode lama dengan kombinasi jenis, basis, atau frekuensi Payroll yang tidak valid.';
  END IF;
END$$
DELIMITER ;
CALL assert_payroll_m5a2_scheme();
DROP PROCEDURE assert_payroll_m5a2_scheme;

ALTER TABLE payroll_periods
  MODIFY employee_type_code VARCHAR(30) NOT NULL;

DROP PROCEDURE IF EXISTS ensure_payroll_m5a2_constraint;
DELIMITER $$
CREATE PROCEDURE ensure_payroll_m5a2_constraint()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema=DATABASE() AND table_name='payroll_periods'
      AND constraint_name='chk_payroll_period_scheme'
  ) THEN
    ALTER TABLE payroll_periods
      ADD CONSTRAINT chk_payroll_period_scheme CHECK (
        (employee_type_code='BORONGAN' AND payroll_basis='PIECE_RATE' AND pay_frequency='WEEKLY')
        OR (employee_type_code IN ('HARIAN','TRAINING') AND payroll_basis='TIME_BASED' AND pay_frequency='WEEKLY')
        OR (employee_type_code='BULANAN' AND payroll_basis='TIME_BASED' AND pay_frequency='MONTHLY')
      );
  END IF;
END$$
DELIMITER ;
CALL ensure_payroll_m5a2_constraint();
DROP PROCEDURE ensure_payroll_m5a2_constraint;

SELECT employee_type_code,payroll_basis,pay_frequency,COUNT(*) total
FROM payroll_periods
GROUP BY employee_type_code,payroll_basis,pay_frequency
ORDER BY employee_type_code;
