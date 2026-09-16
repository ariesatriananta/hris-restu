-- Menyederhanakan konfigurasi BPJS Borongan: JKK menjadi kebijakan global
-- tahunan dan UMK langsung diselesaikan berdasarkan site + tahun bulan iuran.
--
-- Migration ini aman dijalankan setelah 20260914_payroll_bpjs_borongan.sql.
-- Tabel site_bpjs_settings dipertahankan sebagai histori legacy karena dapat
-- direferensikan snapshot Payroll lama, tetapi tidak dipakai oleh run baru.

DROP PROCEDURE IF EXISTS migrate_payroll_bpjs_global_jkk;
DELIMITER $$
CREATE PROCEDURE migrate_payroll_bpjs_global_jkk()
BEGIN
  DECLARE conflicting_years BIGINT DEFAULT 0;
  DECLARE jkk_columns_added TINYINT DEFAULT 0;

  SELECT COUNT(*) INTO conflicting_years
  FROM (
    SELECT setting_year
    FROM site_bpjs_settings
    WHERE status='ACTIVE'
    GROUP BY setting_year
    HAVING COUNT(DISTINCT CONCAT(jkk_employer_enabled,'|',jkk_employer_rate))>1
  ) conflicting;

  IF conflicting_years>0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migration dibatalkan: konfigurasi JKK site lama berbeda pada tahun yang sama. Selaraskan nilainya dahulu.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE()
      AND table_name='payroll_bpjs_policies'
      AND column_name='jkk_employer_enabled'
  ) THEN
    ALTER TABLE payroll_bpjs_policies
      ADD COLUMN jkk_employer_enabled TINYINT(1) NOT NULL DEFAULT 1
      AFTER jht_employee_rate;
    SET jkk_columns_added=1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE()
      AND table_name='payroll_bpjs_policies'
      AND column_name='jkk_employer_rate'
  ) THEN
    ALTER TABLE payroll_bpjs_policies
      ADD COLUMN jkk_employer_rate DECIMAL(7,4) NOT NULL DEFAULT 0.5400
      AFTER jkk_employer_enabled;
    SET jkk_columns_added=1;
  END IF;

  IF jkk_columns_added=1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema=DATABASE()
      AND table_name='payroll_bpjs_policies'
      AND constraint_name='chk_payroll_bpjs_policy_jkk_flag'
  ) THEN
    ALTER TABLE payroll_bpjs_policies
      ADD CONSTRAINT chk_payroll_bpjs_policy_jkk_flag
      CHECK (jkk_employer_enabled IN (0,1));
  END IF;

  IF jkk_columns_added=1 AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema=DATABASE()
      AND table_name='payroll_bpjs_policies'
      AND constraint_name='chk_payroll_bpjs_policy_jkk_rate'
  ) THEN
    ALTER TABLE payroll_bpjs_policies
      ADD CONSTRAINT chk_payroll_bpjs_policy_jkk_rate
      CHECK (jkk_employer_rate BETWEEN 0 AND 100);
  END IF;

  -- Pertahankan tarif legacy sebagai nilai awal bila seluruh site pada tahun
  -- tersebut memang memakai konfigurasi yang sama.
  IF jkk_columns_added=1 THEN
    UPDATE payroll_bpjs_policies policy
    JOIN (
      SELECT
        setting_year,
        MAX(jkk_employer_enabled) jkk_employer_enabled,
        MAX(jkk_employer_rate) jkk_employer_rate
      FROM site_bpjs_settings
      WHERE status='ACTIVE'
      GROUP BY setting_year
    ) legacy ON legacy.setting_year=policy.policy_year
    SET policy.jkk_employer_enabled=legacy.jkk_employer_enabled,
        policy.jkk_employer_rate=legacy.jkk_employer_rate;
  END IF;

  -- Snapshot lama tetap menunjuk konfigurasi site. Snapshot baru menyimpan
  -- NULL karena sumber JKK-nya sudah menjadi payroll_bpjs_policies.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE()
      AND table_name='payroll_employee_bpjs_details'
      AND column_name='site_bpjs_setting_id'
      AND is_nullable='NO'
  ) THEN
    ALTER TABLE payroll_employee_bpjs_details
      MODIFY COLUMN site_bpjs_setting_id BIGINT UNSIGNED NULL;
  END IF;
END$$
DELIMITER ;

CALL migrate_payroll_bpjs_global_jkk();
DROP PROCEDURE migrate_payroll_bpjs_global_jkk;

SELECT policy_year,jkk_employer_enabled,jkk_employer_rate,status
FROM payroll_bpjs_policies
ORDER BY policy_year;

SELECT column_name,is_nullable,column_type
FROM information_schema.columns
WHERE table_schema=DATABASE()
  AND table_name='payroll_employee_bpjs_details'
  AND column_name='site_bpjs_setting_id';
