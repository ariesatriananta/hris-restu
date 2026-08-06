-- Permission granular untuk fondasi modul Attendance.
-- Migration ini tidak mengubah struktur tabel dan aman dijalankan ulang.

START TRANSACTION;

INSERT INTO permissions (uid, code, module, name, description)
VALUES
  (UUID(), 'attendance.view', 'attendance', 'Lihat Attendance', 'Melihat halaman, metadata, dan data Attendance sesuai akses site.'),
  (UUID(), 'attendance.scan', 'attendance', 'Scan Attendance', 'Mencatat masuk atau pulang melalui proses scan Attendance.'),
  (UUID(), 'attendance.correct', 'attendance', 'Koreksi Attendance', 'Mengajukan koreksi terhadap catatan Attendance.'),
  (UUID(), 'attendance.approve', 'attendance', 'Setujui Koreksi Attendance', 'Meninjau dan menyetujui atau menolak koreksi Attendance.'),
  (UUID(), 'attendance.manage_shift', 'attendance', 'Kelola Shift Attendance', 'Mengelola shift dan penugasan shift karyawan.'),
  (UUID(), 'attendance.manage_device', 'attendance', 'Kelola Perangkat Attendance', 'Mengelola perangkat scan Attendance.'),
  (UUID(), 'attendance.export', 'attendance', 'Ekspor Attendance', 'Mengekspor data Attendance sesuai akses site.')
ON DUPLICATE KEY UPDATE
  module = VALUES(module),
  name = VALUES(name),
  description = VALUES(description);

INSERT INTO role_permissions (uid, role_id, permission_id)
SELECT UUID(), r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'attendance.view',
    'attendance.scan',
    'attendance.correct',
    'attendance.approve',
    'attendance.manage_shift',
    'attendance.manage_device',
    'attendance.export'
  )
WHERE r.code IN ('SUPER_ADMIN', 'HR_OFFICER')
ON DUPLICATE KEY UPDATE uid = role_permissions.uid;

INSERT INTO role_permissions (uid, role_id, permission_id)
SELECT UUID(), r.id, p.id
FROM roles r
JOIN permissions p
  ON p.code IN (
    'attendance.view',
    'attendance.scan',
    'attendance.export'
  )
WHERE r.code = 'SITE_SUPERVISOR'
ON DUPLICATE KEY UPDATE uid = role_permissions.uid;

COMMIT;
