-- Akses operasional modul Karyawan untuk HR Officer per site.
--
-- Permission ini tidak menghilangkan pembatasan site. API tetap membatasi data
-- karyawan berdasarkan user_site_access milik HR Officer yang sedang login.
-- Migration aman dijalankan ulang dan tidak mengubah struktur tabel.

START TRANSACTION;

INSERT INTO role_permissions (uid, role_id, permission_id)
SELECT UUID(), r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'employees.view',
    'employees.manage',
    'documents.manage'
  )
WHERE r.code = 'HR_OFFICER'
  AND r.is_active = 1
ON DUPLICATE KEY UPDATE uid = role_permissions.uid;

COMMIT;

-- Verifikasi: ketiga permission harus tampil untuk HR_OFFICER.
SELECT
  r.code role_code,
  p.code permission_code,
  p.name permission_name
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.code = 'HR_OFFICER'
  AND p.code IN (
    'employees.view',
    'employees.manage',
    'documents.manage'
  )
ORDER BY p.code;
