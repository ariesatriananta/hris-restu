-- Employee ID otomatis untuk karyawan baru.
-- Nomor karyawan lama sengaja tidak diubah.

START TRANSACTION;

ALTER TABLE sites
  ADD COLUMN employee_number_prefix CHAR(3) NULL AFTER code;

UPDATE sites
SET employee_number_prefix = CASE code
  WHEN 'JEPARA' THEN 'KDS'
  WHEN 'SEMARANG' THEN 'SMG'
  WHEN 'KLATEN' THEN 'SLO'
  ELSE employee_number_prefix
END;

ALTER TABLE sites
  MODIFY COLUMN employee_number_prefix CHAR(3) NOT NULL,
  ADD UNIQUE KEY uq_sites_employee_number_prefix (employee_number_prefix);

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

COMMIT;
