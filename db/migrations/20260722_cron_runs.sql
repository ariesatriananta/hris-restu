-- Jejak eksekusi webhook cron. Satu baris dibuat untuk setiap request agar
-- kegagalan, skip karena lock, dan hasil rekonsiliasi dapat diaudit.

CREATE TABLE cron_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  job_code VARCHAR(50) NOT NULL,
  business_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  summary JSON NULL,
  error_message VARCHAR(500) NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cron_runs_uid (uid),
  KEY idx_cron_runs_job_started (job_code, started_at),
  KEY idx_cron_runs_status_date (status, business_date),
  CONSTRAINT chk_cron_runs_status CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
