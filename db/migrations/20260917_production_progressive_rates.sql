-- Tarif Produksi progresif harian per karyawan, site, dan pekerjaan.
-- Jalankan setelah migration Produksi yang sudah ada. Tidak mengubah nominal
-- transaksi lama; transaksi lama diberi satu rincian sesuai snapshot aslinya.

CREATE TABLE IF NOT EXISTS production_job_rate_tiers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  job_rate_id BIGINT UNSIGNED NOT NULL,
  min_quantity DECIMAL(18,4) NOT NULL,
  rate_amount DECIMAL(18,4) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_job_rate_tiers_uid (uid),
  UNIQUE KEY uq_production_job_rate_tiers_start (job_rate_id,min_quantity),
  CONSTRAINT chk_production_job_rate_tiers_min CHECK (min_quantity >= 1),
  CONSTRAINT chk_production_job_rate_tiers_amount CHECK (rate_amount >= 0),
  CONSTRAINT fk_production_job_rate_tiers_rate FOREIGN KEY (job_rate_id) REFERENCES production_job_rates(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_transaction_rate_details (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  production_transaction_id BIGINT UNSIGNED NOT NULL,
  job_rate_tier_id BIGINT UNSIGNED NULL,
  min_quantity_snapshot DECIMAL(18,4) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL,
  rate_snapshot DECIMAL(18,4) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_transaction_rate_details_uid (uid),
  UNIQUE KEY uq_production_transaction_rate_details_tier (production_transaction_id,min_quantity_snapshot),
  KEY idx_production_transaction_rate_details_tier (job_rate_tier_id),
  CONSTRAINT chk_production_transaction_rate_details_min CHECK (min_quantity_snapshot >= 1),
  CONSTRAINT chk_production_transaction_rate_details_quantity CHECK (quantity > 0),
  CONSTRAINT chk_production_transaction_rate_details_amount CHECK (rate_snapshot >= 0 AND amount >= 0),
  CONSTRAINT fk_production_transaction_rate_details_transaction FOREIGN KEY (production_transaction_id) REFERENCES production_transactions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_transaction_rate_details_tier FOREIGN KEY (job_rate_tier_id) REFERENCES production_job_rate_tiers(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_production_rate_details (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_production_detail_id BIGINT UNSIGNED NOT NULL,
  min_quantity_snapshot DECIMAL(18,4) NOT NULL,
  quantity_snapshot DECIMAL(18,4) NOT NULL,
  rate_snapshot DECIMAL(18,4) NOT NULL,
  amount_snapshot DECIMAL(18,2) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_production_rate_details_uid (uid),
  UNIQUE KEY uq_payroll_production_rate_details_tier (payroll_production_detail_id,min_quantity_snapshot),
  CONSTRAINT chk_payroll_production_rate_details_values CHECK (min_quantity_snapshot>=1 AND quantity_snapshot>0 AND rate_snapshot>=0 AND amount_snapshot>=0),
  CONSTRAINT fk_payroll_production_rate_details_parent FOREIGN KEY (payroll_production_detail_id) REFERENCES payroll_production_details(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO production_job_rate_tiers
  (uid,job_rate_id,min_quantity,rate_amount,created_by,updated_by)
SELECT UUID(),r.id,1,r.rate_amount,r.created_by,r.updated_by
FROM production_job_rates r
WHERE NOT EXISTS (
  SELECT 1 FROM production_job_rate_tiers t
  WHERE t.job_rate_id=r.id AND t.min_quantity=1
);

INSERT INTO production_transaction_rate_details
  (uid,production_transaction_id,job_rate_tier_id,min_quantity_snapshot,
   quantity,rate_snapshot,amount,created_by,updated_by)
SELECT UUID(),pt.id,NULL,1,pt.quantity,pt.rate_snapshot,pt.gross_amount,
       pt.created_by,pt.updated_by
FROM production_transactions pt
WHERE NOT EXISTS (
  SELECT 1 FROM production_transaction_rate_details detail
  WHERE detail.production_transaction_id=pt.id
);

INSERT INTO payroll_production_rate_details
  (uid,payroll_production_detail_id,min_quantity_snapshot,quantity_snapshot,
   rate_snapshot,amount_snapshot,created_by,updated_by)
SELECT UUID(),detail.id,1,detail.quantity_snapshot,detail.rate_snapshot,
       detail.amount_snapshot,detail.created_by,detail.updated_by
FROM payroll_production_details detail
WHERE NOT EXISTS (
  SELECT 1 FROM payroll_production_rate_details tier
  WHERE tier.payroll_production_detail_id=detail.id
);
