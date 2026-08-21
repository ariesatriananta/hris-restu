-- Fase Produksi 2C: izin ekspor Rekap Produksi.
--
-- Aman dijalankan ulang. Pembatasan site tetap ditegakkan oleh API berdasarkan
-- user_site_access; DIRECTOR dan SUPER_ADMIN mengikuti akses global yang sudah
-- berlaku pada modul Produksi.

START TRANSACTION;

INSERT INTO permissions(uid,code,module,name,description)
VALUES(
  UUID(),
  'production.export',
  'production',
  'Ekspor Rekap Produksi',
  'Mengekspor Rekap Produksi sesuai periode, filter, dan akses site user.'
)
ON DUPLICATE KEY UPDATE
  module=VALUES(module),
  name=VALUES(name),
  description=VALUES(description);

INSERT INTO role_permissions(uid,role_id,permission_id)
SELECT UUID(),r.id,p.id
FROM roles r
JOIN permissions p ON p.code='production.export'
WHERE r.code IN (
  'SUPER_ADMIN',
  'PRODUCTION_ADMIN',
  'PAYROLL_FINANCE',
  'DIRECTOR'
)
  AND r.is_active=1
ON DUPLICATE KEY UPDATE
  role_id=VALUES(role_id),
  permission_id=VALUES(permission_id);

COMMIT;

SELECT r.code role_code,p.code permission_code
FROM role_permissions rp
JOIN roles r ON r.id=rp.role_id
JOIN permissions p ON p.id=rp.permission_id
WHERE p.code='production.export'
ORDER BY r.code;
