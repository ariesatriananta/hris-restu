-- ============================================================================
-- HRIS PT RESTU SEJATI INTI ABADI
-- Database Schema - Termin 1
-- MySQL 8.0+ | InnoDB | utf8mb4 | Asia/Jakarta
-- ============================================================================
-- Catatan implementasi:
-- 1. id  : primary key internal untuk relasi dan performa.
-- 2. uid : identifier publik. Aplikasi wajib mengisi UUID untuk setiap record.
-- 3. created_by / updated_by secara logis mengacu ke users.id. Kolom audit tidak
--    diberi foreign key agar histori tetap utuh saat akun dinonaktifkan/dihapus.
-- 4. Timestamp disimpan sebagai DATETIME(3) dengan timezone koneksi Asia/Jakarta.
-- 5. Semua nominal uang menggunakan DECIMAL, bukan FLOAT/DOUBLE.
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+07:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS hris_pt_restu
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hris_pt_restu;

-- ============================================================================
-- A. ORGANISASI, OTORISASI, DAN KONFIGURASI
-- ============================================================================

CREATE TABLE sites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(20) NOT NULL,
  employee_number_prefix CHAR(3) NOT NULL,
  name VARCHAR(100) NOT NULL,
  address TEXT NULL,
  city VARCHAR(100) NULL,
  province VARCHAR(100) NULL,
  phone VARCHAR(30) NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sites_uid (uid),
  UNIQUE KEY uq_sites_code (code),
  UNIQUE KEY uq_sites_employee_number_prefix (employee_number_prefix),
  KEY idx_sites_active (is_active),
  CONSTRAINT chk_sites_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_number_sequences (
  site_id BIGINT UNSIGNED NOT NULL,
  join_date DATE NOT NULL,
  last_sequence SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (site_id, join_date),
  CONSTRAINT chk_employee_number_sequence CHECK (last_sequence BETWEEN 0 AND 999),
  CONSTRAINT fk_employee_number_sequences_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_uid (uid),
  UNIQUE KEY uq_roles_code (code),
  CONSTRAINT chk_roles_system CHECK (is_system IN (0, 1)),
  CONSTRAINT chk_roles_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_uid (uid),
  UNIQUE KEY uq_permissions_code (code),
  KEY idx_permissions_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_permissions_uid (uid),
  UNIQUE KEY uq_role_permissions_pair (role_id, permission_id),
  KEY idx_role_permissions_permission (permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(191) NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  password_changed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_uid (uid),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_status (status),
  CONSTRAINT chk_users_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOCKED')),
  CONSTRAINT chk_users_change_password CHECK (must_change_password IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_roles_uid (uid),
  UNIQUE KEY uq_user_roles_pair (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_site_access (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_site_access_uid (uid),
  UNIQUE KEY uq_user_site_access_pair (user_id, site_id),
  KEY idx_user_site_access_site (site_id),
  CONSTRAINT chk_user_site_default CHECK (is_default IN (0, 1)),
  CONSTRAINT fk_user_site_access_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_site_access_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  device_name VARCHAR(150) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  expires_at DATETIME(3) NOT NULL,
  last_used_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  revoke_reason VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_sessions_uid (uid),
  UNIQUE KEY uq_user_sessions_token_hash (refresh_token_hash),
  KEY idx_user_sessions_user_active (user_id, revoked_at, expires_at),
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE system_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NULL,
  setting_key VARCHAR(100) NOT NULL,
  scope_key VARCHAR(150) GENERATED ALWAYS AS (
    CONCAT(COALESCE(CAST(site_id AS CHAR), 'GLOBAL'), ':', setting_key)
  ) STORED,
  setting_value JSON NOT NULL,
  description VARCHAR(255) NULL,
  is_secret TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_system_settings_uid (uid),
  UNIQUE KEY uq_system_settings_scope (scope_key),
  KEY idx_system_settings_key (setting_key),
  CONSTRAINT chk_system_settings_secret CHECK (is_secret IN (0, 1)),
  CONSTRAINT fk_system_settings_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- B. MASTER ORGANISASI DAN KARYAWAN
-- ============================================================================

CREATE TABLE departments (
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
  UNIQUE KEY uq_departments_uid (uid),
  UNIQUE KEY uq_departments_site_code (site_id, code),
  KEY idx_departments_site_active (site_id, is_active),
  CONSTRAINT chk_departments_active CHECK (is_active IN (0, 1)),
  CONSTRAINT fk_departments_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE positions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'PRODUCTION',
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_positions_uid (uid),
  UNIQUE KEY uq_positions_code (code),
  KEY idx_positions_category_active (category, is_active),
  CONSTRAINT chk_positions_category CHECK (category IN ('PRODUCTION', 'STAFF', 'MANAGEMENT')),
  CONSTRAINT chk_positions_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE work_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  department_id BIGINT UNSIGNED NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  leader_name VARCHAR(150) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_work_groups_uid (uid),
  UNIQUE KEY uq_work_groups_site_code (site_id, code),
  KEY idx_work_groups_department (department_id),
  CONSTRAINT chk_work_groups_active CHECK (is_active IN (0, 1)),
  CONSTRAINT fk_work_groups_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_work_groups_department FOREIGN KEY (department_id) REFERENCES departments (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE employee_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  payroll_basis VARCHAR(20) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_types_uid (uid),
  UNIQUE KEY uq_employee_types_code (code),
  CONSTRAINT chk_employee_types_basis CHECK (payroll_basis IN ('PIECE_RATE', 'MONTHLY')),
  CONSTRAINT chk_employee_types_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_statuses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  allows_attendance TINYINT(1) NOT NULL DEFAULT 1,
  allows_production TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_statuses_uid (uid),
  UNIQUE KEY uq_employee_statuses_code (code),
  CONSTRAINT chk_employee_statuses_attendance CHECK (allows_attendance IN (0, 1)),
  CONSTRAINT chk_employee_statuses_production CHECK (allows_production IN (0, 1)),
  CONSTRAINT chk_employee_statuses_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contract_types (
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
  UNIQUE KEY uq_contract_types_uid (uid),
  UNIQUE KEY uq_contract_types_code (code),
  CONSTRAINT chk_contract_types_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employees (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_number VARCHAR(50) NOT NULL,
  barcode VARCHAR(100) GENERATED ALWAYS AS (employee_number) STORED,
  employee_type_id BIGINT UNSIGNED NOT NULL,
  employee_status_id BIGINT UNSIGNED NOT NULL,
  current_site_id BIGINT UNSIGNED NOT NULL,
  current_department_id BIGINT UNSIGNED NULL,
  current_position_id BIGINT UNSIGNED NULL,
  current_work_group_id BIGINT UNSIGNED NULL,
  current_production_module_section_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(150) NOT NULL,
  nickname VARCHAR(100) NULL,
  national_id_number VARCHAR(30) NULL,
  family_card_number VARCHAR(30) NULL,
  gender VARCHAR(10) NOT NULL,
  birth_place VARCHAR(100) NULL,
  birth_date DATE NULL,
  marital_status VARCHAR(20) NULL,
  religion VARCHAR(30) NULL,
  address TEXT NULL,
  rtrw VARCHAR(7) NULL,
  kelurahan VARCHAR(100) NULL,
  kecamatan VARCHAR(100) NULL,
  city VARCHAR(100) NULL,
  province VARCHAR(100) NULL,
  postal_code VARCHAR(10) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(191) NULL,
  emergency_contact_name VARCHAR(150) NULL,
  emergency_contact_phone VARCHAR(30) NULL,
  emergency_contact_relation VARCHAR(50) NULL,
  bank_name VARCHAR(100) NULL,
  bank_account_number VARCHAR(50) NULL,
  bank_account_name VARCHAR(150) NULL,
  tax_number VARCHAR(30) NULL,
  bpjs_health_number VARCHAR(30) NULL,
  bpjs_employment_number VARCHAR(30) NULL,
  join_date DATE NOT NULL,
  join_date_training DATE NULL,
  join_date_borong DATE NULL,
  permanent_date DATE NULL,
  resign_date DATE NULL,
  resign_reason VARCHAR(255) NULL,
  photo_file_id BIGINT UNSIGNED NULL COMMENT 'Logical reference to files.id; FK added after files table exists is intentionally omitted.',
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employees_uid (uid),
  UNIQUE KEY uq_employees_number (employee_number),
  UNIQUE KEY uq_employees_barcode (barcode),
  UNIQUE KEY uq_employees_email (email),
  UNIQUE KEY uq_employees_national_id (national_id_number),
  KEY idx_employees_site_status (current_site_id, employee_status_id),
  KEY idx_employees_department (current_department_id),
  KEY idx_employees_position (current_position_id),
  KEY idx_employees_work_group (current_work_group_id),
  KEY idx_employees_production_module_section (current_production_module_section_id),
  KEY idx_employees_type (employee_type_id),
  KEY idx_employees_name (full_name),
  CONSTRAINT chk_employees_gender CHECK (gender IN ('MALE', 'FEMALE', 'LAKI-LAKI', 'PEREMPUAN')),
  CONSTRAINT chk_employees_marital CHECK (marital_status IS NULL OR marital_status IN ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'BELUM_KAWIN', 'KAWIN', 'CERAI_HIDUP', 'CERAI_MATI')),
  CONSTRAINT chk_employees_rtrw CHECK (rtrw IS NULL OR rtrw REGEXP '^[0-9]{3}/[0-9]{3}$'),
  CONSTRAINT chk_employees_training_join_date CHECK (join_date_training IS NULL OR join_date_training >= join_date),
  CONSTRAINT chk_employees_borong_join_date CHECK (join_date_borong IS NULL OR join_date_borong >= join_date),
  CONSTRAINT chk_employees_dates CHECK (resign_date IS NULL OR resign_date >= join_date),
  CONSTRAINT fk_employees_type FOREIGN KEY (employee_type_id) REFERENCES employee_types (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employees_status FOREIGN KEY (employee_status_id) REFERENCES employee_statuses (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employees_site FOREIGN KEY (current_site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employees_department FOREIGN KEY (current_department_id) REFERENCES departments (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_employees_position FOREIGN KEY (current_position_id) REFERENCES positions (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_employees_work_group FOREIGN KEY (current_work_group_id) REFERENCES work_groups (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_employees_production_module_section FOREIGN KEY (current_production_module_section_id) REFERENCES production_module_sections (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_employment_histories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  department_id BIGINT UNSIGNED NULL,
  position_id BIGINT UNSIGNED NULL,
  work_group_id BIGINT UNSIGNED NULL,
  production_module_section_id BIGINT UNSIGNED NULL,
  employee_type_id BIGINT UNSIGNED NOT NULL,
  employee_status_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  change_type VARCHAR(30) NOT NULL,
  reference_number VARCHAR(100) NULL,
  reason VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_employment_histories_uid (uid),
  KEY idx_employment_history_employee_date (employee_id, effective_from, effective_to),
  KEY idx_employment_history_site (site_id),
  CONSTRAINT chk_employment_history_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT chk_employment_history_change CHECK (change_type IN ('INITIAL', 'TRANSFER', 'PROMOTION', 'DEMOTION', 'STATUS_CHANGE', 'TYPE_CHANGE', 'GROUP_CHANGE', 'PRODUCTION_ASSIGNMENT_CHANGE', 'OTHER')),
  CONSTRAINT fk_employment_history_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employment_history_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employment_history_department FOREIGN KEY (department_id) REFERENCES departments (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_employment_history_position FOREIGN KEY (position_id) REFERENCES positions (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_employment_history_group FOREIGN KEY (work_group_id) REFERENCES work_groups (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_employment_history_production_module_section FOREIGN KEY (production_module_section_id) REFERENCES production_module_sections (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_employment_history_type FOREIGN KEY (employee_type_id) REFERENCES employee_types (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employment_history_status FOREIGN KEY (employee_status_id) REFERENCES employee_statuses (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_contracts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  contract_number VARCHAR(100) NOT NULL,
  contract_type_id BIGINT UNSIGNED NOT NULL,
  sequence_number SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  signed_date DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  terminated_at DATE NULL,
  termination_reason VARCHAR(500) NULL,
  position_name_snapshot VARCHAR(150) NULL,
  site_name_snapshot VARCHAR(150) NULL,
  salary_or_rate_notes VARCHAR(255) NULL,
  terms_json JSON NULL,
  issued_file_id BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_contracts_uid (uid),
  UNIQUE KEY uq_employee_contracts_number (contract_number),
  KEY idx_employee_contracts_employee_dates (employee_id, start_date, end_date),
  KEY idx_employee_contracts_type (contract_type_id),
  KEY idx_employee_contracts_status (status),
  CONSTRAINT chk_employee_contracts_status CHECK (status IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED')),
  CONSTRAINT chk_employee_contracts_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT fk_employee_contracts_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employee_contracts_type FOREIGN KEY (contract_type_id) REFERENCES contract_types (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_contract_lifecycle_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  contract_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  effective_date DATE NOT NULL,
  reason VARCHAR(500) NULL,
  source VARCHAR(20) NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id), UNIQUE KEY uq_employee_contract_lifecycle_events_uid (uid),
  KEY idx_contract_lifecycle_contract_date (contract_id, effective_date),
  CONSTRAINT chk_contract_lifecycle_source CHECK (source IN ('MANUAL', 'CRON')),
  CONSTRAINT fk_contract_lifecycle_contract FOREIGN KEY (contract_id) REFERENCES employee_contracts (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_contract_lifecycle_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_salary_histories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  basic_salary DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  reason VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_salary_histories_uid (uid),
  KEY idx_employee_salary_history_dates (employee_id, effective_from, effective_to),
  CONSTRAINT chk_employee_salary_nonnegative CHECK (basic_salary >= 0),
  CONSTRAINT chk_employee_salary_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT fk_employee_salary_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- C. FILE DAN DOKUMEN
-- ============================================================================

CREATE TABLE files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  storage_provider VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
  storage_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  extension VARCHAR(20) NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'PRIVATE',
  uploaded_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_files_uid (uid),
  UNIQUE KEY uq_files_storage_path (storage_provider, storage_path),
  KEY idx_files_checksum (checksum_sha256),
  CONSTRAINT chk_files_provider CHECK (storage_provider IN ('LOCAL', 'S3', 'MINIO')),
  CONSTRAINT chk_files_visibility CHECK (visibility IN ('PRIVATE', 'INTERNAL'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE employees
  ADD CONSTRAINT fk_employees_photo_file FOREIGN KEY (photo_file_id) REFERENCES files (id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE employee_contracts
  ADD CONSTRAINT fk_employee_contracts_file FOREIGN KEY (issued_file_id) REFERENCES files (id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE document_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NULL,
  code VARCHAR(50) NOT NULL,
  scope_code VARCHAR(100) GENERATED ALWAYS AS (
    CONCAT(COALESCE(CAST(site_id AS CHAR), 'GLOBAL'), ':', code)
  ) STORED,
  document_type VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL,
  version_no INT UNSIGNED NOT NULL DEFAULT 1,
  template_format VARCHAR(20) NOT NULL DEFAULT 'HTML',
  template_content LONGTEXT NULL,
  template_file_id BIGINT UNSIGNED NULL,
  config_json JSON NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_document_templates_uid (uid),
  UNIQUE KEY uq_document_templates_version (scope_code, version_no),
  KEY idx_document_templates_type_active (document_type, is_active),
  CONSTRAINT chk_document_templates_type CHECK (document_type IN ('PKWT', 'ID_CARD', 'PAYSLIP', 'OTHER')),
  CONSTRAINT chk_document_templates_format CHECK (template_format IN ('HTML', 'DOCX', 'PDF')),
  CONSTRAINT chk_document_templates_active CHECK (is_active IN (0, 1)),
  CONSTRAINT chk_document_templates_dates CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CONSTRAINT fk_document_templates_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_document_templates_file FOREIGN KEY (template_file_id) REFERENCES files (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  document_number VARCHAR(100) NULL,
  name VARCHAR(150) NOT NULL,
  file_id BIGINT UNSIGNED NOT NULL,
  issued_date DATE NULL,
  expiry_date DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_documents_uid (uid),
  KEY idx_employee_documents_employee_type (employee_id, document_type),
  KEY idx_employee_documents_expiry (expiry_date),
  CONSTRAINT chk_employee_documents_status CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED')),
  CONSTRAINT chk_employee_documents_dates CHECK (expiry_date IS NULL OR issued_date IS NULL OR expiry_date >= issued_date),
  CONSTRAINT fk_employee_documents_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employee_documents_file FOREIGN KEY (file_id) REFERENCES files (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE generated_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NULL,
  document_template_id BIGINT UNSIGNED NULL,
  document_type VARCHAR(30) NOT NULL,
  reference_type VARCHAR(50) NULL,
  reference_id BIGINT UNSIGNED NULL,
  document_number VARCHAR(100) NULL,
  snapshot_data JSON NOT NULL,
  file_id BIGINT UNSIGNED NOT NULL,
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  generated_by BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_generated_documents_uid (uid),
  UNIQUE KEY uq_generated_documents_number (document_number),
  KEY idx_generated_documents_reference (reference_type, reference_id),
  KEY idx_generated_documents_employee (employee_id, document_type),
  CONSTRAINT chk_generated_documents_type CHECK (document_type IN ('PKWT', 'ID_CARD', 'PAYSLIP', 'OTHER')),
  CONSTRAINT chk_generated_documents_status CHECK (status IN ('ISSUED', 'REVOKED', 'ARCHIVED')),
  CONSTRAINT fk_generated_documents_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_generated_documents_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_generated_documents_template FOREIGN KEY (document_template_id) REFERENCES document_templates (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_generated_documents_file FOREIGN KEY (file_id) REFERENCES files (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- D. SHIFT DAN ATTENDANCE
-- ============================================================================

CREATE TABLE shifts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  crosses_midnight TINYINT(1) NOT NULL DEFAULT 0,
  late_tolerance_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  early_leave_tolerance_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shifts_uid (uid),
  UNIQUE KEY uq_shifts_site_code (site_id, code),
  KEY idx_shifts_site_active (site_id, is_active),
  CONSTRAINT chk_shifts_midnight CHECK (crosses_midnight IN (0, 1)),
  CONSTRAINT chk_shifts_active CHECK (is_active IN (0, 1)),
  CONSTRAINT fk_shifts_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_shift_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  shift_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  work_days_json JSON NULL COMMENT 'Array nomor hari ISO 1=Senin sampai 7=Minggu.',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_shift_assignments_uid (uid),
  KEY idx_employee_shift_dates (employee_id, effective_from, effective_to),
  KEY idx_employee_shift_shift (shift_id),
  CONSTRAINT chk_employee_shift_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT fk_employee_shift_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employee_shift_shift FOREIGN KEY (shift_id) REFERENCES shifts (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE scan_devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  device_type VARCHAR(30) NOT NULL,
  device_token_hash VARCHAR(255) NULL,
  location_description VARCHAR(255) NULL,
  last_seen_at DATETIME(3) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scan_devices_uid (uid),
  UNIQUE KEY uq_scan_devices_site_code (site_id, code),
  CONSTRAINT chk_scan_devices_type CHECK (device_type IN ('MOBILE_CAMERA', 'USB_SCANNER', 'TERMINAL', 'OTHER')),
  CONSTRAINT chk_scan_devices_active CHECK (is_active IN (0, 1)),
  CONSTRAINT fk_scan_devices_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attendance_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  shift_id BIGINT UNSIGNED NULL,
  business_date DATE NOT NULL,
  attendance_status VARCHAR(20) NOT NULL DEFAULT 'PRESENT',
  clock_in_at DATETIME(3) NULL,
  clock_out_at DATETIME(3) NULL,
  clock_in_device_id BIGINT UNSIGNED NULL,
  clock_out_device_id BIGINT UNSIGNED NULL,
  clock_in_source VARCHAR(20) NULL,
  clock_out_source VARCHAR(20) NULL,
  clock_in_photo_file_id BIGINT UNSIGNED NULL,
  clock_out_photo_file_id BIGINT UNSIGNED NULL,
  late_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  early_leave_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  worked_minutes INT UNSIGNED NULL,
  is_corrected TINYINT(1) NOT NULL DEFAULT 0,
  notes VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_records_uid (uid),
  UNIQUE KEY uq_attendance_employee_date (employee_id, business_date),
  KEY idx_attendance_site_date (site_id, business_date),
  KEY idx_attendance_date_status (business_date, attendance_status),
  KEY idx_attendance_clock_in_device (clock_in_device_id),
  KEY idx_attendance_clock_out_device (clock_out_device_id),
  CONSTRAINT chk_attendance_status CHECK (attendance_status IN ('PRESENT', 'ABSENT', 'LEAVE', 'SICK', 'PERMISSION', 'HOLIDAY')),
  CONSTRAINT chk_attendance_clock_order CHECK (clock_out_at IS NULL OR clock_in_at IS NULL OR clock_out_at >= clock_in_at),
  CONSTRAINT chk_attendance_corrected CHECK (is_corrected IN (0, 1)),
  CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_shift FOREIGN KEY (shift_id) REFERENCES shifts (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_attendance_clock_in_device FOREIGN KEY (clock_in_device_id) REFERENCES scan_devices (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_attendance_clock_out_device FOREIGN KEY (clock_out_device_id) REFERENCES scan_devices (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_attendance_clock_in_photo FOREIGN KEY (clock_in_photo_file_id) REFERENCES files (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_attendance_clock_out_photo FOREIGN KEY (clock_out_photo_file_id) REFERENCES files (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attendance_scan_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  attendance_record_id BIGINT UNSIGNED NULL,
  employee_id BIGINT UNSIGNED NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NULL,
  barcode_value VARCHAR(100) NOT NULL,
  event_type VARCHAR(20) NOT NULL,
  scanned_at DATETIME(3) NOT NULL,
  result_status VARCHAR(20) NOT NULL,
  result_message VARCHAR(255) NULL,
  idempotency_key VARCHAR(100) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_scan_events_uid (uid),
  UNIQUE KEY uq_attendance_scan_idempotency (idempotency_key),
  KEY idx_attendance_scan_site_time (site_id, scanned_at),
  KEY idx_attendance_scan_employee_time (employee_id, scanned_at),
  KEY idx_attendance_scan_barcode_time (barcode_value, scanned_at),
  CONSTRAINT chk_attendance_scan_event_type CHECK (event_type IN ('CLOCK_IN', 'CLOCK_OUT')),
  CONSTRAINT chk_attendance_scan_result CHECK (result_status IN ('SUCCESS', 'REJECTED', 'ERROR')),
  CONSTRAINT fk_attendance_scan_record FOREIGN KEY (attendance_record_id) REFERENCES attendance_records (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_attendance_scan_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_attendance_scan_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_scan_device FOREIGN KEY (device_id) REFERENCES scan_devices (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attendance_corrections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  attendance_record_id BIGINT UNSIGNED NOT NULL,
  correction_type VARCHAR(30) NOT NULL,
  old_clock_in_at DATETIME(3) NULL,
  new_clock_in_at DATETIME(3) NULL,
  old_clock_out_at DATETIME(3) NULL,
  new_clock_out_at DATETIME(3) NULL,
  old_status VARCHAR(20) NULL,
  new_status VARCHAR(20) NULL,
  reason VARCHAR(500) NOT NULL,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  requested_by BIGINT UNSIGNED NOT NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(3) NULL,
  review_notes VARCHAR(500) NULL,
  applied_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_corrections_uid (uid),
  KEY idx_attendance_corrections_record (attendance_record_id),
  KEY idx_attendance_corrections_approval (approval_status, requested_at),
  CONSTRAINT chk_attendance_correction_type CHECK (correction_type IN ('CLOCK_IN', 'CLOCK_OUT', 'BOTH', 'STATUS')),
  CONSTRAINT chk_attendance_correction_approval CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT fk_attendance_correction_record FOREIGN KEY (attendance_record_id) REFERENCES attendance_records (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- E. PRODUKSI BORONGAN DAN TARIF PER SITE
-- ============================================================================

CREATE TABLE work_units (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  decimal_precision TINYINT UNSIGNED NOT NULL DEFAULT 2,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_work_units_uid (uid),
  UNIQUE KEY uq_work_units_code (code),
  CONSTRAINT chk_work_units_precision CHECK (decimal_precision <= 4),
  CONSTRAINT chk_work_units_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(500) NULL,
  default_unit_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_jobs_uid (uid),
  UNIQUE KEY uq_production_jobs_code (code),
  KEY idx_production_jobs_active (is_active),
  CONSTRAINT chk_production_jobs_active CHECK (is_active IN (0, 1)),
  CONSTRAINT fk_production_jobs_unit FOREIGN KEY (default_unit_id) REFERENCES work_units (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_job_rates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  production_job_id BIGINT UNSIGNED NOT NULL,
  unit_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  rate_amount DECIMAL(18,4) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  reference_number VARCHAR(100) NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_job_rates_uid (uid),
  UNIQUE KEY uq_production_job_rates_start (site_id, production_job_id, effective_from),
  KEY idx_production_job_rates_lookup (site_id, production_job_id, effective_from, effective_to, status),
  CONSTRAINT chk_production_job_rates_amount CHECK (rate_amount >= 0),
  CONSTRAINT chk_production_job_rates_status CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE')),
  CONSTRAINT chk_production_job_rates_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT fk_production_job_rates_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_job_rates_job FOREIGN KEY (production_job_id) REFERENCES production_jobs (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_job_rates_unit FOREIGN KEY (unit_id) REFERENCES work_units (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_job_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  production_job_id BIGINT UNSIGNED NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_job_assignments_uid (uid),
  UNIQUE KEY uq_employee_job_assignment_start (employee_id, production_job_id, site_id, effective_from),
  KEY idx_employee_job_assignment_dates (employee_id, effective_from, effective_to),
  CONSTRAINT chk_employee_job_assignment_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT chk_employee_job_assignment_primary CHECK (is_primary IN (0, 1)),
  CONSTRAINT fk_employee_job_assignment_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employee_job_assignment_job FOREIGN KEY (production_job_id) REFERENCES production_jobs (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employee_job_assignment_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  transaction_number VARCHAR(60) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  work_group_id BIGINT UNSIGNED NULL,
  production_job_id BIGINT UNSIGNED NOT NULL,
  unit_id BIGINT UNSIGNED NOT NULL,
  job_rate_id BIGINT UNSIGNED NOT NULL,
  attendance_record_id BIGINT UNSIGNED NOT NULL,
  scan_device_id BIGINT UNSIGNED NULL,
  business_date DATE NOT NULL,
  transaction_at DATETIME(3) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL,
  rate_snapshot DECIMAL(18,4) NOT NULL,
  gross_amount DECIMAL(18,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  idempotency_key VARCHAR(100) NULL,
  notes VARCHAR(500) NULL,
  voided_at DATETIME(3) NULL,
  voided_by BIGINT UNSIGNED NULL,
  void_reason VARCHAR(500) NULL,
  payroll_locked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_transactions_uid (uid),
  UNIQUE KEY uq_production_transactions_number (transaction_number),
  UNIQUE KEY uq_production_transactions_idempotency (idempotency_key),
  KEY idx_production_employee_date (employee_id, business_date),
  KEY idx_production_site_date (site_id, business_date),
  KEY idx_production_job_date (production_job_id, business_date),
  KEY idx_production_group_date (work_group_id, business_date),
  KEY idx_production_status_date (status, business_date),
  CONSTRAINT chk_production_quantity CHECK (quantity > 0),
  CONSTRAINT chk_production_rate CHECK (rate_snapshot >= 0),
  CONSTRAINT chk_production_gross CHECK (gross_amount >= 0),
  CONSTRAINT chk_production_status CHECK (status IN ('POSTED', 'VOID')),
  CONSTRAINT fk_production_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_group FOREIGN KEY (work_group_id) REFERENCES work_groups (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_production_job FOREIGN KEY (production_job_id) REFERENCES production_jobs (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_unit FOREIGN KEY (unit_id) REFERENCES work_units (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_rate FOREIGN KEY (job_rate_id) REFERENCES production_job_rates (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_attendance FOREIGN KEY (attendance_record_id) REFERENCES attendance_records (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_device FOREIGN KEY (scan_device_id) REFERENCES scan_devices (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_transaction_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  production_transaction_id BIGINT UNSIGNED NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  revision_type VARCHAR(20) NOT NULL,
  before_data JSON NOT NULL,
  after_data JSON NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_revisions_uid (uid),
  UNIQUE KEY uq_production_revisions_number (production_transaction_id, revision_number),
  CONSTRAINT chk_production_revision_type CHECK (revision_type IN ('CORRECTION', 'VOID')),
  CONSTRAINT fk_production_revision_transaction FOREIGN KEY (production_transaction_id) REFERENCES production_transactions (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- F. PAYROLL
-- ============================================================================

CREATE TABLE payroll_component_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  component_category VARCHAR(20) NOT NULL,
  calculation_method VARCHAR(20) NOT NULL DEFAULT 'FIXED',
  is_taxable TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  description VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_component_types_uid (uid),
  UNIQUE KEY uq_payroll_component_types_code (code),
  CONSTRAINT chk_payroll_component_category CHECK (component_category IN ('EARNING', 'DEDUCTION')),
  CONSTRAINT chk_payroll_component_method CHECK (calculation_method IN ('FIXED', 'MANUAL', 'FORMULA')),
  CONSTRAINT chk_payroll_component_taxable CHECK (is_taxable IN (0, 1)),
  CONSTRAINT chk_payroll_component_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE employee_payroll_components (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  payroll_component_type_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  formula_json JSON NULL,
  notes VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_payroll_components_uid (uid),
  KEY idx_employee_payroll_components_dates (employee_id, effective_from, effective_to, is_active),
  KEY idx_employee_payroll_components_type (payroll_component_type_id),
  CONSTRAINT chk_employee_payroll_components_amount CHECK (amount >= 0),
  CONSTRAINT chk_employee_payroll_components_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT chk_employee_payroll_components_active CHECK (is_active IN (0, 1)),
  CONSTRAINT fk_employee_payroll_component_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_employee_payroll_component_type FOREIGN KEY (payroll_component_type_id) REFERENCES payroll_component_types (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_periods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  period_code VARCHAR(50) NOT NULL,
  period_name VARCHAR(150) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_date DATE NULL,
  payroll_basis VARCHAR(20) NOT NULL DEFAULT 'PIECE_RATE',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  current_run_id BIGINT UNSIGNED NULL COMMENT 'Logical reference to payroll_runs.id; circular FK intentionally omitted.',
  approved_at DATETIME(3) NULL,
  approved_by BIGINT UNSIGNED NULL,
  closed_at DATETIME(3) NULL,
  closed_by BIGINT UNSIGNED NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_periods_uid (uid),
  UNIQUE KEY uq_payroll_periods_site_code (site_id, period_code),
  KEY idx_payroll_periods_site_dates (site_id, period_start, period_end),
  KEY idx_payroll_periods_status (status),
  CONSTRAINT chk_payroll_period_dates CHECK (period_end >= period_start),
  CONSTRAINT chk_payroll_period_basis CHECK (payroll_basis IN ('PIECE_RATE', 'MONTHLY')),
  CONSTRAINT chk_payroll_period_status CHECK (status IN ('DRAFT', 'CALCULATED', 'APPROVED', 'CLOSED', 'CANCELLED')),
  CONSTRAINT fk_payroll_period_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  run_number INT UNSIGNED NOT NULL,
  run_type VARCHAR(20) NOT NULL DEFAULT 'SIMULATION',
  status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
  calculation_version VARCHAR(30) NOT NULL DEFAULT '1.0',
  calculation_started_at DATETIME(3) NOT NULL,
  calculation_finished_at DATETIME(3) NULL,
  employee_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_piece_rate_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_earnings DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_deductions DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_net_pay DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  error_message TEXT NULL,
  parameters_json JSON NULL,
  calculated_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_runs_uid (uid),
  UNIQUE KEY uq_payroll_runs_number (payroll_period_id, run_number),
  KEY idx_payroll_runs_status (status),
  CONSTRAINT chk_payroll_runs_type CHECK (run_type IN ('SIMULATION', 'FINAL')),
  CONSTRAINT chk_payroll_runs_status CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  CONSTRAINT chk_payroll_runs_totals CHECK (total_piece_rate_amount >= 0 AND total_earnings >= 0 AND total_deductions >= 0 AND total_net_pay >= 0),
  CONSTRAINT fk_payroll_runs_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE payroll_periods
  ADD CONSTRAINT fk_payroll_period_current_run FOREIGN KEY (current_run_id) REFERENCES payroll_runs (id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE payroll_employee_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_run_id BIGINT UNSIGNED NOT NULL,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  employee_number_snapshot VARCHAR(50) NOT NULL,
  employee_name_snapshot VARCHAR(150) NOT NULL,
  employee_type_snapshot VARCHAR(30) NOT NULL,
  department_name_snapshot VARCHAR(100) NULL,
  position_name_snapshot VARCHAR(100) NULL,
  work_group_name_snapshot VARCHAR(100) NULL,
  attendance_days INT UNSIGNED NOT NULL DEFAULT 0,
  production_transaction_count INT UNSIGNED NOT NULL DEFAULT 0,
  piece_rate_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  basic_salary_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  additional_earnings DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  gross_earnings DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_deductions DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  net_pay DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  bank_name_snapshot VARCHAR(100) NULL,
  bank_account_number_snapshot VARCHAR(50) NULL,
  bank_account_name_snapshot VARCHAR(150) NULL,
  calculation_notes VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CALCULATED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_employee_results_uid (uid),
  UNIQUE KEY uq_payroll_employee_result (payroll_run_id, employee_id),
  KEY idx_payroll_employee_period (payroll_period_id, employee_id),
  KEY idx_payroll_employee_site (site_id),
  CONSTRAINT chk_payroll_employee_amounts CHECK (piece_rate_amount >= 0 AND basic_salary_amount >= 0 AND additional_earnings >= 0 AND gross_earnings >= 0 AND total_deductions >= 0 AND net_pay >= 0),
  CONSTRAINT chk_payroll_employee_status CHECK (status IN ('CALCULATED', 'REVIEWED', 'EXCLUDED')),
  CONSTRAINT fk_payroll_employee_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_employee_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_employee_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_employee_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_production_details (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_employee_result_id BIGINT UNSIGNED NOT NULL,
  production_transaction_id BIGINT UNSIGNED NOT NULL,
  production_job_id BIGINT UNSIGNED NOT NULL,
  business_date DATE NOT NULL,
  transaction_number_snapshot VARCHAR(60) NOT NULL,
  job_name_snapshot VARCHAR(150) NOT NULL,
  unit_name_snapshot VARCHAR(100) NOT NULL,
  quantity_snapshot DECIMAL(18,4) NOT NULL,
  rate_snapshot DECIMAL(18,4) NOT NULL,
  amount_snapshot DECIMAL(18,2) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_production_details_uid (uid),
  UNIQUE KEY uq_payroll_production_transaction (payroll_employee_result_id, production_transaction_id),
  KEY idx_payroll_production_job (production_job_id),
  KEY idx_payroll_production_date (business_date),
  CONSTRAINT chk_payroll_production_quantity CHECK (quantity_snapshot > 0),
  CONSTRAINT chk_payroll_production_amounts CHECK (rate_snapshot >= 0 AND amount_snapshot >= 0),
  CONSTRAINT fk_payroll_production_result FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_production_transaction FOREIGN KEY (production_transaction_id) REFERENCES production_transactions (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_production_job FOREIGN KEY (production_job_id) REFERENCES production_jobs (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_attendance_summaries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_employee_result_id BIGINT UNSIGNED NOT NULL,
  scheduled_days INT UNSIGNED NOT NULL DEFAULT 0,
  present_days INT UNSIGNED NOT NULL DEFAULT 0,
  absent_days INT UNSIGNED NOT NULL DEFAULT 0,
  leave_days INT UNSIGNED NOT NULL DEFAULT 0,
  sick_days INT UNSIGNED NOT NULL DEFAULT 0,
  permission_days INT UNSIGNED NOT NULL DEFAULT 0,
  holiday_days INT UNSIGNED NOT NULL DEFAULT 0,
  late_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  early_leave_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  worked_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_attendance_summaries_uid (uid),
  UNIQUE KEY uq_payroll_attendance_result (payroll_employee_result_id),
  CONSTRAINT fk_payroll_attendance_result FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_employee_component_details (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_employee_result_id BIGINT UNSIGNED NOT NULL,
  payroll_component_type_id BIGINT UNSIGNED NOT NULL,
  component_code_snapshot VARCHAR(50) NOT NULL,
  component_name_snapshot VARCHAR(150) NOT NULL,
  component_category VARCHAR(20) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_id BIGINT UNSIGNED NULL,
  amount DECIMAL(18,2) NOT NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_employee_components_detail_uid (uid),
  KEY idx_payroll_component_result (payroll_employee_result_id),
  KEY idx_payroll_component_type (payroll_component_type_id),
  CONSTRAINT chk_payroll_employee_component_category CHECK (component_category IN ('EARNING', 'DEDUCTION')),
  CONSTRAINT chk_payroll_employee_component_source CHECK (source_type IN ('RECURRING', 'MANUAL', 'SYSTEM')),
  CONSTRAINT chk_payroll_employee_component_amount CHECK (amount >= 0),
  CONSTRAINT fk_payroll_component_result FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_component_type_detail FOREIGN KEY (payroll_component_type_id) REFERENCES payroll_component_types (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  approval_level SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  approval_role VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  requested_by BIGINT UNSIGNED NOT NULL,
  reviewed_at DATETIME(3) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_approvals_uid (uid),
  UNIQUE KEY uq_payroll_approvals_level (payroll_period_id, approval_level),
  KEY idx_payroll_approvals_status (status, requested_at),
  CONSTRAINT chk_payroll_approvals_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT fk_payroll_approvals_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- G. AUDIT TRAIL
-- ============================================================================

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  site_id BIGINT UNSIGNED NULL,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(30) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id BIGINT UNSIGNED NULL,
  record_uid CHAR(36) NULL,
  description VARCHAR(500) NULL,
  reason VARCHAR(500) NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  request_id VARCHAR(100) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_audit_logs_uid (uid),
  KEY idx_audit_logs_record (table_name, record_id),
  KEY idx_audit_logs_record_uid (record_uid),
  KEY idx_audit_logs_user_time (user_id, occurred_at),
  KEY idx_audit_logs_site_time (site_id, occurred_at),
  KEY idx_audit_logs_module_action (module, action, occurred_at),
  KEY idx_audit_logs_request (request_id),
  CONSTRAINT chk_audit_logs_action CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'VOID', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT', 'CLOSE', 'OTHER')),
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_audit_logs_site FOREIGN KEY (site_id) REFERENCES sites (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- H. SEED DATA DASAR
-- ============================================================================

INSERT INTO sites (uid, code, employee_number_prefix, name, city, province, timezone)
VALUES
  (UUID(), 'JEPARA', 'KDS', 'Site Jepara', 'Jepara', 'Jawa Tengah', 'Asia/Jakarta'),
  (UUID(), 'SEMARANG', 'SMG', 'Site Semarang', 'Semarang', 'Jawa Tengah', 'Asia/Jakarta'),
  (UUID(), 'KLATEN', 'SLO', 'Site Klaten', 'Klaten', 'Jawa Tengah', 'Asia/Jakarta');

INSERT INTO roles (uid, code, name, description, is_system)
VALUES
  (UUID(), 'SUPER_ADMIN', 'Super Admin', 'Akses penuh konfigurasi dan seluruh site.', 1),
  (UUID(), 'DIRECTOR', 'Direksi / Owner', 'Monitoring dan laporan lintas site.', 1),
  (UUID(), 'HR_OFFICER', 'HR Officer', 'Mengelola karyawan, kontrak, mutasi, dan attendance.', 1),
  (UUID(), 'PRODUCTION_ADMIN', 'Admin Produksi', 'Mengelola transaksi dan koreksi setoran produksi.', 1),
  (UUID(), 'PAYROLL_FINANCE', 'Finance / Payroll', 'Simulasi, validasi, approval, dan closing payroll.', 1),
  (UUID(), 'SITE_SUPERVISOR', 'Supervisor / PIC Site', 'Monitoring site dan approval koreksi operasional.', 1);

INSERT INTO employee_types (uid, code, name, payroll_basis, description)
VALUES
  (UUID(), 'BORONGAN', 'Pekerja Borongan', 'PIECE_RATE', 'Pekerja produksi yang dibayar berdasarkan hasil kerja.'),
  (UUID(), 'BULANAN', 'Karyawan Bulanan', 'MONTHLY', 'Staff/non-produksi yang dibayar bulanan dan dapat menggunakan aturan shift.');

INSERT INTO employee_statuses (uid, code, name, allows_attendance, allows_production)
VALUES
  (UUID(), 'ACTIVE', 'Aktif', 1, 1),
  (UUID(), 'RESIGNED', 'Resign', 0, 0),
  (UUID(), 'INACTIVE', 'Nonaktif', 0, 0);

INSERT INTO contract_types (uid, code, name, description)
VALUES
  (UUID(), 'PKWT', 'Perjanjian Kerja Waktu Tertentu', 'Kontrak kerja dengan masa berlaku tertentu.'),
  (UUID(), 'PKWTT', 'Perjanjian Kerja Waktu Tidak Tertentu', 'Hubungan kerja tanpa batas waktu tertentu.'),
  (UUID(), 'OTHER', 'Kontrak Lainnya', 'Dokumen kontrak di luar PKWT dan PKWTT.'),
  (UUID(), 'TRAINING', 'Training', 'Kontrak atau kesepakatan selama masa pelatihan.'),
  (UUID(), 'PROJECT', 'Project', 'Kontrak kerja untuk proyek tertentu.'),
  (UUID(), 'RETAIN', 'Retain', 'Kontrak retensi atau perpanjangan masa kerja.');

INSERT INTO work_units (uid, code, name, decimal_precision)
VALUES
  (UUID(), 'PCS', 'Pcs / Batang', 0),
  (UUID(), 'PACK', 'Pak', 0),
  (UUID(), 'BOX', 'Box', 0),
  (UUID(), 'KG', 'Kilogram', 2),
  (UUID(), 'UNIT', 'Unit', 2);

INSERT INTO payroll_component_types
  (uid, code, name, component_category, calculation_method, is_taxable, description)
VALUES
  (UUID(), 'BONUS', 'Bonus', 'EARNING', 'MANUAL', 0, 'Penambahan pendapatan manual atau berdasarkan kebijakan.'),
  (UUID(), 'ALLOWANCE', 'Tunjangan', 'EARNING', 'FIXED', 0, 'Tunjangan tetap atau berkala.'),
  (UUID(), 'OTHER_EARNING', 'Pendapatan Lainnya', 'EARNING', 'MANUAL', 0, 'Komponen pendapatan lain.'),
  (UUID(), 'PENALTY', 'Penalti', 'DEDUCTION', 'MANUAL', 0, 'Pengurangan berdasarkan aturan operasional.'),
  (UUID(), 'LOAN', 'Potongan Pinjaman', 'DEDUCTION', 'MANUAL', 0, 'Potongan pinjaman karyawan.'),
  (UUID(), 'OTHER_DEDUCTION', 'Potongan Lainnya', 'DEDUCTION', 'MANUAL', 0, 'Komponen potongan lain.');

INSERT INTO permissions (uid, code, module, name)
VALUES
  (UUID(), 'dashboard.view', 'dashboard', 'Lihat Dashboard'),
  (UUID(), 'employees.view', 'employees', 'Lihat Karyawan'),
  (UUID(), 'employees.manage', 'employees', 'Kelola Karyawan'),
  (UUID(), 'attendance.view', 'attendance', 'Lihat Attendance'),
  (UUID(), 'attendance.scan', 'attendance', 'Scan Attendance'),
  (UUID(), 'attendance.correct', 'attendance', 'Koreksi Attendance'),
  (UUID(), 'production.view', 'production', 'Lihat Produksi'),
  (UUID(), 'production.scan', 'production', 'Input Setoran Produksi'),
  (UUID(), 'production.correct', 'production', 'Koreksi Setoran Produksi'),
  (UUID(), 'payroll.view', 'payroll', 'Lihat Payroll'),
  (UUID(), 'payroll.calculate', 'payroll', 'Hitung Payroll'),
  (UUID(), 'payroll.approve', 'payroll', 'Approve Payroll'),
  (UUID(), 'payroll.close', 'payroll', 'Closing Payroll'),
  (UUID(), 'documents.manage', 'documents', 'Kelola Dokumen'),
  (UUID(), 'reports.view', 'reports', 'Lihat Laporan'),
  (UUID(), 'users.manage', 'users', 'Kelola User dan Hak Akses'),
  (UUID(), 'settings.manage', 'settings', 'Kelola Pengaturan Sistem'),
  (UUID(), 'audit.view', 'audit', 'Lihat Audit Trail');

-- Super Admin mendapatkan seluruh permission awal.
INSERT INTO role_permissions (uid, role_id, permission_id)
SELECT UUID(), r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPER_ADMIN';

-- Pengaturan global awal.
INSERT INTO system_settings (uid, site_id, setting_key, setting_value, description)
VALUES
  (UUID(), NULL, 'business.timezone', JSON_OBJECT('value', 'Asia/Jakarta'), 'Timezone bisnis utama.'),
  (UUID(), NULL, 'attendance.production_requires_presence', JSON_OBJECT('value', TRUE), 'Setoran produksi mensyaratkan attendance pada tanggal yang sama.'),
  (UUID(), NULL, 'payroll.allow_post_close_correction', JSON_OBJECT('value', FALSE), 'Koreksi setelah payroll closing dinonaktifkan pada scope awal.'),
  (UUID(), NULL, 'file.max_upload_mb', JSON_OBJECT('value', 10), 'Batas ukuran upload file awal dalam MB.');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- END OF SCHEMA
-- Setelah eksekusi, aplikasi wajib membuat user Super Admin pertama dengan
-- password hash Argon2id/bcrypt dan menghubungkannya ke role SUPER_ADMIN.
-- ============================================================================
