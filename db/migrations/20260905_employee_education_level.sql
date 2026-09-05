-- Menambahkan Pendidikan Terakhir berbasis klasifikasi biodata Dukcapil.
-- Kolom tetap nullable agar data historis tidak diisi dengan asumsi. Aplikasi
-- mewajibkan nilai ini untuk karyawan dan pelamar baru.

DROP PROCEDURE IF EXISTS add_employee_education_level;
DELIMITER $$
CREATE PROCEDURE add_employee_education_level()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees'
      AND COLUMN_NAME='education_level'
  ) THEN
    ALTER TABLE employees
      ADD COLUMN education_level VARCHAR(30) NULL AFTER religion;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='employees'
      AND CONSTRAINT_NAME='chk_employees_education_level'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT chk_employees_education_level CHECK (
        education_level IS NULL OR education_level IN (
          'NO_SCHOOLING','NOT_COMPLETED_PRIMARY','PRIMARY',
          'JUNIOR_SECONDARY','SENIOR_SECONDARY','DIPLOMA_I_II',
          'DIPLOMA_III','DIPLOMA_IV_BACHELOR','MASTER','DOCTORATE'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='recruitment_candidates'
      AND COLUMN_NAME='education_level'
  ) THEN
    ALTER TABLE recruitment_candidates
      ADD COLUMN education_level VARCHAR(30) NULL AFTER birth_date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND TABLE_NAME='recruitment_candidates'
      AND CONSTRAINT_NAME='chk_recruitment_candidates_education_level'
  ) THEN
    ALTER TABLE recruitment_candidates
      ADD CONSTRAINT chk_recruitment_candidates_education_level CHECK (
        education_level IS NULL OR education_level IN (
          'NO_SCHOOLING','NOT_COMPLETED_PRIMARY','PRIMARY',
          'JUNIOR_SECONDARY','SENIOR_SECONDARY','DIPLOMA_I_II',
          'DIPLOMA_III','DIPLOMA_IV_BACHELOR','MASTER','DOCTORATE'
        )
      );
  END IF;
END$$
DELIMITER ;

CALL add_employee_education_level();
DROP PROCEDURE add_employee_education_level;
