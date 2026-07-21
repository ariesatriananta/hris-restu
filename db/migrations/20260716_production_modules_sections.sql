-- Struktur penempatan produksi untuk pekerja borongan.
-- Jalankan setelah migration lifecycle kontrak.

START TRANSACTION;

CREATE TABLE production_modules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_modules_uid (uid),
  UNIQUE KEY uq_production_modules_site_code (site_id, code),
  KEY idx_production_modules_site_active (site_id, is_active),
  CONSTRAINT chk_production_modules_active CHECK (is_active IN (0, 1)),
  CONSTRAINT fk_production_modules_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_sections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_sections_uid (uid),
  UNIQUE KEY uq_production_sections_code (code),
  KEY idx_production_sections_active (is_active),
  CONSTRAINT chk_production_sections_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_module_sections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  production_module_id BIGINT UNSIGNED NOT NULL,
  production_section_id BIGINT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_module_sections_uid (uid),
  UNIQUE KEY uq_production_module_sections_pair (production_module_id, production_section_id),
  KEY idx_production_module_sections_module_active (production_module_id, is_active),
  CONSTRAINT chk_production_module_sections_active CHECK (is_active IN (0, 1)),
  CONSTRAINT fk_production_module_sections_module FOREIGN KEY (production_module_id) REFERENCES production_modules (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_module_sections_section FOREIGN KEY (production_section_id) REFERENCES production_sections (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE employees
  ADD COLUMN current_production_module_section_id BIGINT UNSIGNED NULL AFTER current_work_group_id,
  ADD KEY idx_employees_production_module_section (current_production_module_section_id),
  ADD CONSTRAINT fk_employees_production_module_section FOREIGN KEY (current_production_module_section_id) REFERENCES production_module_sections (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE employee_employment_histories
  ADD COLUMN production_module_section_id BIGINT UNSIGNED NULL AFTER work_group_id,
  ADD KEY idx_employment_history_production_module_section (production_module_section_id),
  ADD CONSTRAINT fk_employment_history_production_module_section FOREIGN KEY (production_module_section_id) REFERENCES production_module_sections (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE employee_employment_histories
  DROP CONSTRAINT chk_employment_history_change,
  ADD CONSTRAINT chk_employment_history_change CHECK (change_type IN ('INITIAL', 'TRANSFER', 'PROMOTION', 'DEMOTION', 'STATUS_CHANGE', 'TYPE_CHANGE', 'GROUP_CHANGE', 'PRODUCTION_ASSIGNMENT_CHANGE', 'OTHER'));

COMMIT;
