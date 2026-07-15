-- Lifecycle kontrak, status SCHEDULED, dan retirement status LEAVE.
ALTER TABLE employee_contracts
  ADD COLUMN terminated_at DATE NULL AFTER status,
  ADD COLUMN termination_reason VARCHAR(500) NULL AFTER terminated_at,
  DROP CONSTRAINT chk_employee_contracts_status,
  ADD CONSTRAINT chk_employee_contracts_status CHECK (status IN ('DRAFT','SCHEDULED','ACTIVE','EXPIRED','TERMINATED','CANCELLED'));

CREATE TABLE employee_contract_lifecycle_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, uid CHAR(36) NOT NULL,
  contract_id BIGINT UNSIGNED NOT NULL, from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL, effective_date DATE NOT NULL,
  reason VARCHAR(500) NULL, source VARCHAR(20) NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(id), UNIQUE KEY uq_employee_contract_lifecycle_events_uid(uid),
  KEY idx_contract_lifecycle_contract_date(contract_id,effective_date),
  CONSTRAINT chk_contract_lifecycle_source CHECK (source IN ('MANUAL','CRON')),
  CONSTRAINT fk_contract_lifecycle_contract FOREIGN KEY(contract_id) REFERENCES employee_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_contract_lifecycle_actor FOREIGN KEY(actor_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE employee_statuses SET is_active=0 WHERE code='LEAVE';
