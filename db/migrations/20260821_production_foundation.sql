-- Fondasi akses Produksi Borongan dan penyelarasan Pekerja Training.
--
-- Aman dijalankan ulang. Migration ini tidak mengubah struktur tabel dan tidak
-- membuat transaksi Produksi. Scope site tetap dipaksakan oleh API melalui
-- user_site_access.

START TRANSACTION;

-- Borongan dan Training sama-sama eligible untuk pencatatan Produksi. Upah
-- Training tetap berbasis waktu; hasil Produksi hanya menjadi monitoring.
UPDATE employee_types
SET
  name='Pekerja Training',
  payroll_basis='TIME_BASED',
  description='Pekerja masa pelatihan dengan tarif harian; hasil Produksi hanya untuk monitoring.'
WHERE code='TRAINING';

INSERT INTO permissions (uid,code,module,name,description)
VALUES (
  UUID(),
  'production.manage_master',
  'production',
  'Kelola Master Produksi',
  'Kelola satuan, pekerjaan, histori tarif, dan penugasan pekerjaan Produksi.'
)
ON DUPLICATE KEY UPDATE
  module=VALUES(module),
  name=VALUES(name),
  description=VALUES(description);

-- Super Admin memiliki seluruh kemampuan Produksi, termasuk master global.
INSERT INTO role_permissions (uid,role_id,permission_id)
SELECT UUID(),r.id,p.id
FROM roles r
JOIN permissions p ON p.module='production'
WHERE r.code='SUPER_ADMIN'
ON DUPLICATE KEY UPDATE uid=role_permissions.uid;

-- Admin Produksi menjalankan operasional site, tetapi tidak mengubah master.
INSERT INTO role_permissions (uid,role_id,permission_id)
SELECT UUID(),r.id,p.id
FROM roles r
JOIN permissions p
  ON p.code IN ('production.view','production.scan','production.correct')
WHERE r.code='PRODUCTION_ADMIN'
ON DUPLICATE KEY UPDATE uid=role_permissions.uid;

-- Role monitoring memperoleh akses baca; scope site tetap berlaku kecuali
-- SUPER_ADMIN/DIRECTOR yang memang memiliki cakupan lintas site di API.
INSERT INTO role_permissions (uid,role_id,permission_id)
SELECT UUID(),r.id,p.id
FROM roles r
JOIN permissions p ON p.code='production.view'
WHERE r.code IN (
  'DIRECTOR',
  'HR_OFFICER',
  'PAYROLL_FINANCE',
  'SITE_SUPERVISOR'
)
ON DUPLICATE KEY UPDATE uid=role_permissions.uid;

COMMIT;

SELECT
  r.code role_code,
  GROUP_CONCAT(p.code ORDER BY p.code SEPARATOR ', ') production_permissions
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id=r.id
LEFT JOIN permissions p ON p.id=rp.permission_id AND p.module='production'
WHERE r.code IN (
  'SUPER_ADMIN',
  'PRODUCTION_ADMIN',
  'DIRECTOR',
  'HR_OFFICER',
  'PAYROLL_FINANCE',
  'SITE_SUPERVISOR'
)
GROUP BY r.id,r.code
ORDER BY r.code;
