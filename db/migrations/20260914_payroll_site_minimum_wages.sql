-- Master Upah Minimum Kabupaten/Kota (UMK) per site dan tahun.
-- Fondasi ini belum mengubah kalkulasi Payroll/BPJS. Nilai akan menjadi
-- sumber konfigurasi untuk formula BPJS pada migration/fitur lanjutan.

CREATE TABLE IF NOT EXISTS site_minimum_wages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  wage_year SMALLINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'IDR',
  regulation_reference VARCHAR(255) NULL,
  notes VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  cancelled_at DATETIME(3) NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_minimum_wages_uid (uid),
  UNIQUE KEY uq_site_minimum_wages_site_year (site_id,wage_year),
  KEY idx_site_minimum_wages_year_status (wage_year,status,site_id),
  CONSTRAINT chk_site_minimum_wages_year CHECK (wage_year BETWEEN 2000 AND 2100),
  CONSTRAINT chk_site_minimum_wages_amount CHECK (amount>0),
  CONSTRAINT chk_site_minimum_wages_currency CHECK (currency='IDR'),
  CONSTRAINT chk_site_minimum_wages_status CHECK (status IN ('ACTIVE','CANCELLED')),
  CONSTRAINT fk_site_minimum_wages_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_site_minimum_wages_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_site_minimum_wages_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_site_minimum_wages_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_minimum_wage_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_minimum_wage_id BIGINT UNSIGNED NOT NULL,
  revision_type VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_minimum_wage_revisions_uid (uid),
  UNIQUE KEY uq_site_minimum_wage_revisions_idempotency (idempotency_key),
  KEY idx_site_minimum_wage_revisions_master (site_minimum_wage_id,revised_at),
  CONSTRAINT chk_site_minimum_wage_revision_type CHECK (revision_type IN ('CREATE','CORRECTION','CANCELLATION','REACTIVATION')),
  CONSTRAINT fk_site_minimum_wage_revision_master FOREIGN KEY (site_minimum_wage_id) REFERENCES site_minimum_wages(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_site_minimum_wage_revision_user FOREIGN KEY (revised_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT table_name
FROM information_schema.tables
WHERE table_schema=DATABASE()
  AND table_name IN ('site_minimum_wages','site_minimum_wage_revisions')
ORDER BY table_name;
