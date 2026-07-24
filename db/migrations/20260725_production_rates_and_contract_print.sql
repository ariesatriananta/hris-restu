-- Alamat legal site untuk cetak kontrak.
-- Tabel work_units, production_jobs, production_job_rates, dan
-- employee_job_assignments sudah tersedia pada struktur database existing.
-- Migration ini hanya melengkapi alamat site dan relasi default pekerjaan ke jabatan.

START TRANSACTION;

UPDATE sites
SET address = CASE code
  WHEN 'JEPARA' THEN 'Jl Jepara Kudus No 149.'
  WHEN 'SEMARANG' THEN 'Jl Jend Sudirman No 114.'
  WHEN 'KLATEN' THEN 'Jl Mayjen Suprapto No 195.'
  ELSE address
END
WHERE code IN ('JEPARA', 'SEMARANG', 'KLATEN');

COMMIT;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_jobs'
    AND COLUMN_NAME = 'position_id'
);
SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE production_jobs ADD COLUMN position_id BIGINT UNSIGNED NULL AFTER default_unit_id',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_jobs'
    AND INDEX_NAME = 'idx_production_jobs_position_active'
);
SET @ddl := IF(
  @index_exists = 0,
  'ALTER TABLE production_jobs ADD KEY idx_production_jobs_position_active (position_id, is_active)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'production_jobs'
    AND CONSTRAINT_NAME = 'fk_production_jobs_position'
);
SET @ddl := IF(
  @fk_exists = 0,
  'ALTER TABLE production_jobs ADD CONSTRAINT fk_production_jobs_position FOREIGN KEY (position_id) REFERENCES positions (id) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
