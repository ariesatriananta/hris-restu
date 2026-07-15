-- Master tipe kontrak dan migrasi relasi employee_contracts.
-- Jalankan sekali setelah migration Employee ID/barcode sebelumnya.

START TRANSACTION;

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

INSERT INTO contract_types (uid, code, name, description)
VALUES
  (UUID(), 'PKWT', 'Perjanjian Kerja Waktu Tertentu', 'Kontrak kerja dengan masa berlaku tertentu.'),
  (UUID(), 'PKWTT', 'Perjanjian Kerja Waktu Tidak Tertentu', 'Hubungan kerja tanpa batas waktu tertentu.'),
  (UUID(), 'OTHER', 'Kontrak Lainnya', 'Dokumen kontrak di luar PKWT dan PKWTT.');

ALTER TABLE employee_contracts
  ADD COLUMN contract_type_id BIGINT UNSIGNED NULL AFTER employee_id;

UPDATE employee_contracts ec
JOIN contract_types ct ON ct.code = ec.contract_type
SET ec.contract_type_id = ct.id;

ALTER TABLE employee_contracts
  MODIFY COLUMN contract_type_id BIGINT UNSIGNED NOT NULL,
  ADD KEY idx_employee_contracts_type (contract_type_id),
  ADD CONSTRAINT fk_employee_contracts_type
    FOREIGN KEY (contract_type_id) REFERENCES contract_types (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  DROP CONSTRAINT chk_employee_contracts_type,
  DROP COLUMN contract_type;

COMMIT;
