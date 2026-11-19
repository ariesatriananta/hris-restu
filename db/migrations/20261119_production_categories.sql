-- M1 Attendance Rate foundation. Owner-run additive migration; do not auto-run.
-- Back up before execution. MySQL/MariaDB DDL is not transactional.
-- No seeds, category guesses, backfill, production rewrites or Payroll changes.
-- Run each statement once; on partial failure resume only from the failed statement.
-- Legacy master categories remain NULL (Belum dipetakan) until explicitly mapped.

ALTER TABLE production_modules
  ADD COLUMN production_category VARCHAR(20) NULL AFTER description,
  ADD CONSTRAINT chk_production_module_category CHECK (production_category IS NULL OR production_category IN ('REGULER','PREMIUM'));

ALTER TABLE production_brands
  ADD COLUMN production_category VARCHAR(20) NULL AFTER name,
  ADD CONSTRAINT chk_production_brand_category CHECK (production_category IS NULL OR production_category IN ('REGULER','PREMIUM'));

CREATE TABLE production_module_category_histories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  module_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(20) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prod_module_category_uid (uid),
  UNIQUE KEY uq_prod_module_category_start (module_id,effective_from),
  KEY idx_prod_module_category_dates (module_id,effective_from,effective_to),
  CONSTRAINT chk_prod_module_category CHECK (category IN ('REGULER','PREMIUM')),
  CONSTRAINT chk_prod_module_category_dates CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CONSTRAINT fk_prod_module_category_master FOREIGN KEY (module_id) REFERENCES production_modules(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_brand_category_histories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  brand_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(20) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prod_brand_category_uid (uid),
  UNIQUE KEY uq_prod_brand_category_start (brand_id,effective_from),
  KEY idx_prod_brand_category_dates (brand_id,effective_from,effective_to),
  CONSTRAINT chk_prod_brand_category CHECK (category IN ('REGULER','PREMIUM')),
  CONSTRAINT chk_prod_brand_category_dates CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CONSTRAINT fk_prod_brand_category_master FOREIGN KEY (brand_id) REFERENCES production_brands(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verification only: existing masters should still be unmapped; history counts zero.
SELECT COUNT(*) total,SUM(production_category IS NULL) unmapped FROM production_modules;
SELECT COUNT(*) total,SUM(production_category IS NULL) unmapped FROM production_brands;
SELECT COUNT(*) module_category_history_count FROM production_module_category_histories;
SELECT COUNT(*) brand_category_history_count FROM production_brand_category_histories;
