-- Fase Produksi 2D: Exception & Integrity.
-- Jalankan setelah 20260821_production_transaction_revisions.sql.

START TRANSACTION;

ALTER TABLE scan_devices
  ADD COLUMN production_token_hash VARCHAR(255) NULL AFTER device_token_hash,
  ADD COLUMN production_activated_at DATETIME(3) NULL AFTER activated_by,
  ADD COLUMN production_activated_by BIGINT UNSIGNED NULL AFTER production_activated_at,
  ADD UNIQUE KEY uq_scan_devices_production_token_hash (production_token_hash),
  ADD KEY idx_scan_devices_production_activated_by (production_activated_by),
  ADD CONSTRAINT fk_scan_devices_production_activated_by
    FOREIGN KEY (production_activated_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

-- Menjaga terminal Produksi yang sudah aktif agar tidak langsung logout.
UPDATE scan_devices
SET production_token_hash=device_token_hash,
    production_activated_at=activated_at,
    production_activated_by=activated_by
WHERE device_type IN ('USB_SCANNER','TERMINAL')
  AND device_token_hash IS NOT NULL
  AND activated_at IS NOT NULL;

ALTER TABLE production_transactions
  ADD COLUMN entry_source VARCHAR(20) NOT NULL DEFAULT 'TERMINAL' AFTER status,
  ADD CONSTRAINT chk_production_entry_source
    CHECK (entry_source IN ('TERMINAL','HISTORICAL','CORRECTION'));

UPDATE production_transactions transaction_row
JOIN production_transaction_revisions revision
  ON revision.replacement_transaction_id=transaction_row.id
SET transaction_row.entry_source='CORRECTION';

ALTER TABLE employee_job_assignments
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' AFTER is_primary,
  ADD CONSTRAINT chk_employee_job_assignment_status
    CHECK (status IN ('ACTIVE','CANCELLED'));

CREATE TABLE employee_job_assignment_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_job_assignment_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  before_data JSON NOT NULL,
  after_data JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_job_assignment_revisions_uid (uid),
  UNIQUE KEY uq_employee_job_assignment_revisions_idempotency (idempotency_key),
  KEY idx_employee_job_assignment_revisions_assignment (employee_job_assignment_id,revised_at),
  CONSTRAINT fk_employee_job_assignment_revisions_assignment
    FOREIGN KEY (employee_job_assignment_id) REFERENCES employee_job_assignments(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_job_rate_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  production_job_rate_id BIGINT UNSIGNED NOT NULL,
  revision_type VARCHAR(20) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  before_data JSON NOT NULL,
  after_data JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  revised_by BIGINT UNSIGNED NOT NULL,
  revised_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_job_rate_revisions_uid (uid),
  UNIQUE KEY uq_production_job_rate_revisions_idempotency (idempotency_key),
  KEY idx_production_job_rate_revisions_rate (production_job_rate_id,revised_at),
  CONSTRAINT chk_production_job_rate_revision_type
    CHECK (revision_type IN ('CORRECTION','CANCELLATION')),
  CONSTRAINT fk_production_job_rate_revisions_rate
    FOREIGN KEY (production_job_rate_id) REFERENCES production_job_rates(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE payroll_production_details
  ADD KEY idx_payroll_production_transaction (production_transaction_id);

COMMIT;
