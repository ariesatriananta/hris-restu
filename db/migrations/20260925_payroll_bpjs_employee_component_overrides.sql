-- Menyamakan pengaturan BPJS individual dengan delapan porsi kebijakan global.
-- GLOBAL mengikuti kebijakan tahun Payroll; CUSTOM menjadi keputusan akhir
-- untuk setiap porsi. Persentase tetap berasal dari kebijakan global.

DROP PROCEDURE IF EXISTS migrate_bpjs_employee_component_overrides;
DELIMITER $$
CREATE PROCEDURE migrate_bpjs_employee_component_overrides()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name='employee_bpjs_enrollments'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migration dibatalkan: tabel employee_bpjs_enrollments tidak ditemukan.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='employee_bpjs_enrollments'
      AND column_name='configuration_mode'
  ) THEN
    ALTER TABLE employee_bpjs_enrollments
      ADD COLUMN configuration_mode VARCHAR(10) NOT NULL DEFAULT 'CUSTOM' AFTER employee_id,
      ADD COLUMN health_employer_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER configuration_mode,
      ADD COLUMN health_employee_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER health_employer_enabled,
      ADD COLUMN jht_employer_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER health_employee_enabled,
      ADD COLUMN jht_employee_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER jht_employer_enabled,
      ADD COLUMN jkk_employer_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER jht_employee_enabled,
      ADD COLUMN jkm_employer_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER jkk_employer_enabled,
      ADD COLUMN jp_employer_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER jkm_employer_enabled,
      ADD COLUMN jp_employee_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER jp_employer_enabled;

  END IF;

  -- Tetap jalankan pemetaan ketika percobaan migration sebelumnya sempat
  -- berhenti sesudah kolom baru dibuat tetapi sebelum kolom lama dibuang.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='employee_bpjs_enrollments'
      AND column_name='health_enabled'
  ) THEN
    -- Pertahankan arti data lama semaksimal mungkin. Baris lama merupakan
    -- pengaturan khusus per program sehingga dipetakan ke kedua porsinya.
    UPDATE employee_bpjs_enrollments
    SET configuration_mode='CUSTOM',
        health_employer_enabled=health_enabled,
        health_employee_enabled=health_enabled,
        jht_employer_enabled=jht_enabled,
        jht_employee_enabled=jht_enabled,
        jkk_employer_enabled=jkk_enabled,
        jkm_employer_enabled=jkm_enabled,
        jp_employer_enabled=jp_enabled,
        jp_employee_enabled=jp_enabled;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema=DATABASE() AND table_name='employee_bpjs_enrollments'
      AND constraint_name='chk_employee_bpjs_enrollment_flags'
  ) THEN
    SET @drop_old_bpjs_enrollment_check=CONCAT(
      'ALTER TABLE employee_bpjs_enrollments ',
      IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT ','DROP CHECK '),
      'chk_employee_bpjs_enrollment_flags'
    );
    PREPARE drop_old_bpjs_enrollment_check_statement FROM @drop_old_bpjs_enrollment_check;
    EXECUTE drop_old_bpjs_enrollment_check_statement;
    DEALLOCATE PREPARE drop_old_bpjs_enrollment_check_statement;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='employee_bpjs_enrollments'
      AND column_name='health_enabled'
  ) THEN
    ALTER TABLE employee_bpjs_enrollments
      DROP COLUMN health_enabled,
      DROP COLUMN jht_enabled,
      DROP COLUMN jkk_enabled,
      DROP COLUMN jkm_enabled,
      DROP COLUMN jp_enabled;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema=DATABASE() AND table_name='employee_bpjs_enrollments'
      AND constraint_name='chk_employee_bpjs_enrollment_component_flags'
  ) THEN
    ALTER TABLE employee_bpjs_enrollments
      ADD CONSTRAINT chk_employee_bpjs_enrollment_component_flags CHECK (
        configuration_mode IN ('GLOBAL','CUSTOM')
        AND health_employer_enabled IN (0,1)
        AND health_employee_enabled IN (0,1)
        AND jht_employer_enabled IN (0,1)
        AND jht_employee_enabled IN (0,1)
        AND jkk_employer_enabled IN (0,1)
        AND jkm_employer_enabled IN (0,1)
        AND jp_employer_enabled IN (0,1)
        AND jp_employee_enabled IN (0,1)
      );
  END IF;
END$$
DELIMITER ;

CALL migrate_bpjs_employee_component_overrides();
DROP PROCEDURE migrate_bpjs_employee_component_overrides;

SELECT column_name,column_type,column_default
FROM information_schema.columns
WHERE table_schema=DATABASE() AND table_name='employee_bpjs_enrollments'
ORDER BY ordinal_position;
