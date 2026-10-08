-- Potongan kuantitas standar untuk pekerjaan BORONGAN-LINTING.
-- Migration ini tidak membuat policy awal dan tidak menghitung ulang transaksi lama.

CREATE TABLE production_quantity_deduction_policies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  production_section_id BIGINT UNSIGNED NOT NULL,
  production_job_id BIGINT UNSIGNED NOT NULL,
  percentage DECIMAL(7,4) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  notes VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_quantity_deduction_uid (uid),
  UNIQUE KEY uq_production_quantity_deduction_start (site_id,production_section_id,production_job_id,effective_from),
  KEY idx_production_quantity_deduction_lookup (site_id,production_section_id,production_job_id,status,effective_from,effective_to),
  CONSTRAINT chk_production_quantity_deduction_percentage CHECK (percentage >= 0 AND percentage < 100),
  CONSTRAINT chk_production_quantity_deduction_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT chk_production_quantity_deduction_status CHECK (status IN ('ACTIVE','INACTIVE')),
  CONSTRAINT fk_production_quantity_deduction_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_quantity_deduction_section FOREIGN KEY (production_section_id) REFERENCES production_sections(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_production_quantity_deduction_job FOREIGN KEY (production_job_id) REFERENCES production_jobs(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE production_transactions
  ADD COLUMN production_section_id BIGINT UNSIGNED NULL AFTER work_group_id,
  ADD COLUMN quantity_deduction_policy_id BIGINT UNSIGNED NULL AFTER quantity,
  ADD COLUMN quantity_deduction_percentage DECIMAL(7,4) NOT NULL DEFAULT 0 AFTER quantity_deduction_policy_id,
  ADD COLUMN deducted_quantity DECIMAL(18,4) NOT NULL DEFAULT 0 AFTER quantity_deduction_percentage,
  ADD COLUMN payable_quantity DECIMAL(18,4) NULL AFTER deducted_quantity,
  ADD KEY idx_production_transaction_section_date (production_section_id,business_date),
  ADD KEY idx_production_transaction_deduction_policy (quantity_deduction_policy_id),
  ADD CONSTRAINT fk_production_transaction_section FOREIGN KEY (production_section_id) REFERENCES production_sections(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_production_transaction_deduction_policy FOREIGN KEY (quantity_deduction_policy_id) REFERENCES production_quantity_deduction_policies(id) ON UPDATE CASCADE ON DELETE RESTRICT;

UPDATE production_transactions
SET payable_quantity=quantity,
    updated_at=updated_at
WHERE payable_quantity IS NULL;

ALTER TABLE production_transactions
  MODIFY payable_quantity DECIMAL(18,4) NOT NULL,
  ADD CONSTRAINT chk_production_transaction_deduction_percentage CHECK (quantity_deduction_percentage >= 0 AND quantity_deduction_percentage < 100),
  ADD CONSTRAINT chk_production_transaction_deducted_quantity CHECK (deducted_quantity >= 0 AND deducted_quantity <= quantity),
  ADD CONSTRAINT chk_production_transaction_payable_quantity CHECK (payable_quantity >= 0 AND payable_quantity = quantity - deducted_quantity);

ALTER TABLE payroll_production_details
  ADD COLUMN production_section_id_snapshot BIGINT UNSIGNED NULL AFTER production_job_id,
  ADD COLUMN quantity_deduction_policy_id_snapshot BIGINT UNSIGNED NULL AFTER quantity_snapshot,
  ADD COLUMN quantity_deduction_percentage_snapshot DECIMAL(7,4) NOT NULL DEFAULT 0 AFTER quantity_deduction_policy_id_snapshot,
  ADD COLUMN deducted_quantity_snapshot DECIMAL(18,4) NOT NULL DEFAULT 0 AFTER quantity_deduction_percentage_snapshot,
  ADD COLUMN payable_quantity_snapshot DECIMAL(18,4) NULL AFTER deducted_quantity_snapshot;

UPDATE payroll_production_details
SET payable_quantity_snapshot=quantity_snapshot,
    updated_at=updated_at
WHERE payable_quantity_snapshot IS NULL;

ALTER TABLE payroll_production_details
  MODIFY payable_quantity_snapshot DECIMAL(18,4) NOT NULL,
  ADD CONSTRAINT chk_payroll_production_deduction_percentage CHECK (quantity_deduction_percentage_snapshot >= 0 AND quantity_deduction_percentage_snapshot < 100),
  ADD CONSTRAINT chk_payroll_production_deducted_quantity CHECK (deducted_quantity_snapshot >= 0 AND deducted_quantity_snapshot <= quantity_snapshot),
  ADD CONSTRAINT chk_payroll_production_payable_quantity CHECK (payable_quantity_snapshot >= 0 AND payable_quantity_snapshot = quantity_snapshot - deducted_quantity_snapshot);
