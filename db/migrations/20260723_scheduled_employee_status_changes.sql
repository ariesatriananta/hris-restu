-- Antrean perubahan status kerja masa depan. Terpisah dari mutasi penempatan.
CREATE TABLE scheduled_employee_status_changes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  contract_id BIGINT UNSIGNED NULL,
  action VARCHAR(20) NOT NULL,
  effective_date DATE NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
  failure_reason VARCHAR(500) NULL,
  applied_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  open_employee_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN status IN ('SCHEDULED', 'FAILED') THEN employee_id ELSE NULL END
  ) STORED,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scheduled_employee_status_changes_uid (uid),
  UNIQUE KEY uq_scheduled_employee_status_changes_open_employee (open_employee_id),
  KEY idx_scheduled_employee_status_changes_due (status, effective_date),
  KEY idx_scheduled_employee_status_changes_employee (employee_id, effective_date),
  CONSTRAINT chk_scheduled_employee_status_changes_action CHECK (action IN ('TERMINATE', 'RESIGN')),
  CONSTRAINT chk_scheduled_employee_status_changes_status CHECK (status IN ('SCHEDULED', 'APPLIED', 'FAILED', 'CANCELLED')),
  CONSTRAINT fk_scheduled_employee_status_change_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_scheduled_employee_status_change_contract FOREIGN KEY (contract_id) REFERENCES employee_contracts(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_scheduled_employee_status_change_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_scheduled_employee_status_change_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
