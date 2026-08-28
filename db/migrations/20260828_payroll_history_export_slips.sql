-- Payroll Milestone 4 - Riwayat, export, dan slip.
-- Jalankan setelah 20260828_payroll_approval_closing.sql.
-- Migration tidak menerbitkan dokumen. Periode CLOSED lama mendapat snapshot
-- profil LEGACY_BACKFILL dari profil perusahaan saat migration dijalankan.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS payroll_period_company_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  company_name VARCHAR(150) NOT NULL,
  legal_address VARCHAR(500) NOT NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(191) NULL,
  website VARCHAR(255) NULL,
  tax_number VARCHAR(50) NULL,
  logo_file_uid CHAR(36) NULL,
  snapshot_source VARCHAR(30) NOT NULL,
  snapped_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  snapped_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_period_company_snapshots_uid (uid),
  UNIQUE KEY uq_payroll_period_company_snapshots_period (payroll_period_id),
  CONSTRAINT chk_payroll_company_snapshot_source
    CHECK (snapshot_source IN ('CLOSE','LEGACY_BACKFILL')),
  CONSTRAINT fk_payroll_company_snapshot_period
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_company_snapshot_user
    FOREIGN KEY (snapped_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_output_audits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  payroll_run_id BIGINT UNSIGNED NOT NULL,
  output_type VARCHAR(30) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  employee_result_count INT UNSIGNED NOT NULL DEFAULT 0,
  selection_json JSON NULL,
  checksum_sha256 CHAR(64) NULL,
  generated_by BIGINT UNSIGNED NOT NULL,
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_output_audits_uid (uid),
  UNIQUE KEY uq_payroll_output_audits_idempotency (idempotency_key),
  KEY idx_payroll_output_audits_period (payroll_period_id,generated_at),
  KEY idx_payroll_output_audits_run (payroll_run_id,generated_at),
  CONSTRAINT chk_payroll_output_audit_type
    CHECK (output_type IN ('SUMMARY_EXPORT','PAYMENT_EXPORT','SLIP_PRINT')),
  CONSTRAINT fk_payroll_output_audit_period
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_output_audit_run
    FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_output_audit_user
    FOREIGN KEY (generated_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions(uid,code,module,name,description)
VALUES
  (UUID(),'payroll.export','payroll','Ekspor Rekap Payroll','Mengekspor rekap Payroll dengan rekening disamarkan sesuai akses site.'),
  (UUID(),'payroll.payment_export','payroll','Ekspor Daftar Pembayaran Payroll','Mengekspor rekening lengkap dari Payroll CLOSED dan FINAL.'),
  (UUID(),'payroll.print','payroll','Cetak Slip Payroll','Menerbitkan slip Payroll individual atau massal sesuai akses site.')
ON DUPLICATE KEY UPDATE
  module=VALUES(module),name=VALUES(name),description=VALUES(description);

INSERT INTO role_permissions(uid,role_id,permission_id)
SELECT UUID(),r.id,p.id
FROM roles r
JOIN permissions p ON p.code='payroll.export'
WHERE r.code IN ('SUPER_ADMIN','PAYROLL_FINANCE','DIRECTOR') AND r.is_active=1
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),permission_id=VALUES(permission_id);

INSERT INTO role_permissions(uid,role_id,permission_id)
SELECT UUID(),r.id,p.id
FROM roles r
JOIN permissions p ON p.code IN ('payroll.payment_export','payroll.print')
WHERE r.code IN ('SUPER_ADMIN','PAYROLL_FINANCE') AND r.is_active=1
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),permission_id=VALUES(permission_id);

-- Strategi legacy eksplisit: data ini adalah profil saat backfill, bukan klaim
-- bahwa profil tersebut identik dengan profil pada tanggal closing lama.
INSERT INTO payroll_period_company_snapshots(
  uid,payroll_period_id,company_name,legal_address,phone,email,website,
  tax_number,logo_file_uid,snapshot_source,snapped_at,snapped_by,
  created_by,updated_by
)
SELECT
  UUID(),period.id,
  COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(setting.setting_value,'$.companyName')),''),'PT Restu Sejati Inti Abadi'),
  COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(setting.setting_value,'$.legalAddress')),''),'Alamat perusahaan belum tersedia'),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(setting.setting_value,'$.phone')),''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(setting.setting_value,'$.email')),''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(setting.setting_value,'$.website')),''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(setting.setting_value,'$.taxNumber')),''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(setting.setting_value,'$.logoFileUid')),''),
  'LEGACY_BACKFILL',COALESCE(period.closed_at,NOW(3)),period.closed_by,
  period.closed_by,period.closed_by
FROM payroll_periods period
LEFT JOIN system_settings setting
  ON setting.site_id IS NULL AND setting.setting_key='company.profile'
LEFT JOIN payroll_period_company_snapshots existing
  ON existing.payroll_period_id=period.id
WHERE period.status='CLOSED' AND existing.id IS NULL;

COMMIT;

SELECT p.code permission_code,r.code role_code
FROM role_permissions rp
JOIN permissions p ON p.id=rp.permission_id
JOIN roles r ON r.id=rp.role_id
WHERE p.code IN ('payroll.export','payroll.payment_export','payroll.print')
ORDER BY p.code,r.code;
