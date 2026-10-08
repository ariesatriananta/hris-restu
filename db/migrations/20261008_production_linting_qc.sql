-- Owner-run additive migration. No seeds, backfill, quantity or Payroll changes.
-- Run once before deploying QC master APIs. MySQL DDL is not transactional.

CREATE TABLE production_brands (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(40) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_brand_uid (uid),
  UNIQUE KEY uq_production_brand_code (code),
  UNIQUE KEY uq_production_brand_site_name (site_id,name),
  KEY idx_production_brand_options (site_id,is_active,sort_order),
  CONSTRAINT chk_production_brand_active CHECK (is_active IN (0,1)),
  CONSTRAINT fk_production_brand_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_defects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_defect_uid (uid),
  UNIQUE KEY uq_production_defect_code (code),
  UNIQUE KEY uq_production_defect_name (name),
  KEY idx_production_defect_options (is_active,sort_order),
  CONSTRAINT chk_production_defect_active CHECK (is_active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_transaction_qc (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  production_transaction_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NULL,
  brand_code_snapshot VARCHAR(40) NULL,
  brand_name_snapshot VARCHAR(150) NULL,
  weight_1_grams DECIMAL(10,2) NULL,
  weight_2_grams DECIMAL(10,2) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_qc_uid (uid),
  UNIQUE KEY uq_production_qc_transaction (production_transaction_id),
  KEY idx_production_qc_brand (brand_id),
  CONSTRAINT chk_production_qc_weight_1 CHECK (weight_1_grams IS NULL OR weight_1_grams>0),
  CONSTRAINT chk_production_qc_weight_2 CHECK (weight_2_grams IS NULL OR weight_2_grams>0),
  CONSTRAINT fk_production_qc_transaction FOREIGN KEY (production_transaction_id) REFERENCES production_transactions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_qc_brand FOREIGN KEY (brand_id) REFERENCES production_brands(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_transaction_qc_defects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  production_transaction_qc_id BIGINT UNSIGNED NOT NULL,
  defect_id BIGINT UNSIGNED NOT NULL,
  defect_code_snapshot VARCHAR(40) NOT NULL,
  defect_name_snapshot VARCHAR(150) NOT NULL,
  sort_order_snapshot INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_qc_defect_uid (uid),
  UNIQUE KEY uq_production_qc_defect_item (production_transaction_qc_id,defect_id),
  KEY idx_production_qc_defect_master (defect_id),
  CONSTRAINT chk_production_qc_defect_quantity CHECK (quantity>=0),
  CONSTRAINT fk_production_qc_defect_header FOREIGN KEY (production_transaction_qc_id) REFERENCES production_transaction_qc(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_qc_defect_master FOREIGN KEY (defect_id) REFERENCES production_defects(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

