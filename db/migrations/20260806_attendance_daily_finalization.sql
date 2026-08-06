-- Milestone 7B: finalisasi harian Attendance.
-- Go-live 2026-08-06; migration ini tidak melakukan backfill atau finalisasi otomatis.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS attendance_daily_finalization_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  business_date DATE NOT NULL,
  trigger_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
  grace_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  reason VARCHAR(500) NOT NULL,
  summary JSON NULL,
  warnings JSON NULL,
  error_message VARCHAR(500) NULL,
  requested_by BIGINT UNSIGNED NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_daily_finalization_runs_uid (uid),
  KEY idx_attendance_finalization_site_date (site_id,business_date,id),
  KEY idx_attendance_finalization_status (status,started_at),
  CONSTRAINT chk_attendance_finalization_trigger CHECK (trigger_type IN ('MANUAL','CRON')),
  CONSTRAINT chk_attendance_finalization_status CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','SKIPPED')),
  CONSTRAINT chk_attendance_finalization_grace CHECK (grace_minutes=60),
  CONSTRAINT fk_attendance_finalization_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_finalization_requested_by FOREIGN KEY (requested_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (uid,code,module,name,description)
VALUES (UUID(),'attendance.finalize','attendance','Finalisasi Attendance','Menjalankan finalisasi harian Attendance secara manual sesuai akses site.')
ON DUPLICATE KEY UPDATE module=VALUES(module),name=VALUES(name),description=VALUES(description);

INSERT INTO role_permissions (uid,role_id,permission_id)
SELECT UUID(),r.id,p.id FROM roles r JOIN permissions p ON p.code='attendance.finalize'
WHERE r.code IN ('SUPER_ADMIN','HR_OFFICER')
ON DUPLICATE KEY UPDATE uid=role_permissions.uid;

COMMIT;

SELECT p.code,r.code role_code
FROM permissions p
LEFT JOIN role_permissions rp ON rp.permission_id=p.id
LEFT JOIN roles r ON r.id=rp.role_id
WHERE p.code='attendance.finalize'
ORDER BY r.code;
