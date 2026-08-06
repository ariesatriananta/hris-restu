-- Shift awal Borongan per site. Migration hanya menambahkan record yang belum
-- tersedia dan tidak menimpa konfigurasi yang sudah diubah melalui aplikasi.

START TRANSACTION;

INSERT INTO shifts
  (
    uid,
    site_id,
    code,
    name,
    start_time,
    end_time,
    crosses_midnight,
    late_tolerance_minutes,
    early_leave_tolerance_minutes,
    is_active
  )
SELECT
  UUID(),
  s.id,
  'BORONGAN_DEFAULT',
  'Shift Borongan',
  '06:00:00',
  '15:00:00',
  0,
  15,
  15,
  1
FROM sites s
WHERE s.code IN ('JEPARA', 'SEMARANG', 'KLATEN')
ON DUPLICATE KEY UPDATE uid = shifts.uid;

COMMIT;

SELECT
  s.code AS site,
  sh.code,
  sh.name,
  TIME_FORMAT(sh.start_time, '%H:%i') AS start_time,
  TIME_FORMAT(sh.end_time, '%H:%i') AS end_time,
  sh.late_tolerance_minutes,
  sh.early_leave_tolerance_minutes,
  sh.is_active
FROM shifts sh
JOIN sites s ON s.id = sh.site_id
WHERE sh.code = 'BORONGAN_DEFAULT'
ORDER BY s.code;
