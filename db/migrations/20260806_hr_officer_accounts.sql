-- Akun HR Officer per site.
-- Password disimpan sebagai Argon2id, bukan plaintext.
-- Migration aman dijalankan ulang dan akan mengembalikan akun ke konfigurasi
-- role/site serta password awal yang sudah disepakati.

START TRANSACTION;

INSERT INTO users
  (
    uid,
    username,
    password_hash,
    full_name,
    status,
    must_change_password,
    failed_login_attempts,
    locked_until,
    password_changed_at
  )
VALUES
  (
    UUID(),
    'hr_smg',
    '$argon2id$v=19$m=65536,t=3,p=4$hl4npBa362sALxELQ1vngw$Oz0HS5DVjG+bzo8DVGRCNolNYNLmaqZV086R4uGMfvE',
    'HR Officer Semarang',
    'ACTIVE',
    0,
    0,
    NULL,
    CURRENT_TIMESTAMP(3)
  ),
  (
    UUID(),
    'hr_jpr',
    '$argon2id$v=19$m=65536,t=3,p=4$1ZPblD3VMDath9bLILS5Dg$laB8mEesncLoRPUMg6egpyRAhQW3ps1+9B/YmEE4QU0',
    'HR Officer Jepara',
    'ACTIVE',
    0,
    0,
    NULL,
    CURRENT_TIMESTAMP(3)
  ),
  (
    UUID(),
    'hr_klt',
    '$argon2id$v=19$m=65536,t=3,p=4$QD8bzedFJUEcVW1vwtEQug$8B6DkWmMGAE6S59HSoZMGLixSYXwuFvydrpJIzCP3DY',
    'HR Officer Klaten',
    'ACTIVE',
    0,
    0,
    NULL,
    CURRENT_TIMESTAMP(3)
  )
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  full_name = VALUES(full_name),
  status = 'ACTIVE',
  must_change_password = 0,
  failed_login_attempts = 0,
  locked_until = NULL,
  password_changed_at = CURRENT_TIMESTAMP(3);

-- Ketiga akun ini adalah akun khusus HR Officer. Role lain dibersihkan agar
-- tidak memperoleh hak akses di luar matriks HR Officer.
DELETE ur
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
WHERE u.username IN ('hr_smg', 'hr_jpr', 'hr_klt')
  AND r.code <> 'HR_OFFICER';

INSERT INTO user_roles (uid, user_id, role_id)
SELECT UUID(), u.id, r.id
FROM users u
JOIN roles r ON r.code = 'HR_OFFICER' AND r.is_active = 1
WHERE u.username IN ('hr_smg', 'hr_jpr', 'hr_klt')
ON DUPLICATE KEY UPDATE uid = user_roles.uid;

-- Akses site dibuat eksklusif sesuai username agar site scope API tidak bocor.
DELETE usa
FROM user_site_access usa
JOIN users u ON u.id = usa.user_id
JOIN sites s ON s.id = usa.site_id
WHERE
  (u.username = 'hr_smg' AND s.code <> 'SEMARANG')
  OR (u.username = 'hr_jpr' AND s.code <> 'JEPARA')
  OR (u.username = 'hr_klt' AND s.code <> 'KLATEN');

INSERT INTO user_site_access (uid, user_id, site_id, is_default)
SELECT UUID(), u.id, s.id, 1
FROM users u
JOIN sites s
  ON s.code = CASE u.username
    WHEN 'hr_smg' THEN 'SEMARANG'
    WHEN 'hr_jpr' THEN 'JEPARA'
    WHEN 'hr_klt' THEN 'KLATEN'
  END
  AND s.is_active = 1
WHERE u.username IN ('hr_smg', 'hr_jpr', 'hr_klt')
ON DUPLICATE KEY UPDATE is_default = 1;

COMMIT;

-- Verifikasi tanpa menampilkan password hash.
SELECT
  u.username,
  u.full_name,
  u.status,
  r.code AS role_code,
  s.code AS site_code,
  usa.is_default
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
JOIN user_site_access usa ON usa.user_id = u.id
JOIN sites s ON s.id = usa.site_id
WHERE u.username IN ('hr_smg', 'hr_jpr', 'hr_klt')
ORDER BY u.username;
