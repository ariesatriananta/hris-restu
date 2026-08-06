-- Fondasi aktivasi satu kali untuk perangkat Attendance.
-- Kode aktivasi dan token perangkat hanya disimpan sebagai hash.

START TRANSACTION;

ALTER TABLE scan_devices
  ADD COLUMN activation_code_hash VARCHAR(255) NULL AFTER device_token_hash,
  ADD COLUMN activation_code_expires_at DATETIME(3) NULL AFTER activation_code_hash,
  ADD COLUMN activated_at DATETIME(3) NULL AFTER activation_code_expires_at,
  ADD COLUMN activated_by BIGINT UNSIGNED NULL AFTER activated_at,
  ADD UNIQUE KEY uq_scan_devices_token_hash (device_token_hash),
  ADD UNIQUE KEY uq_scan_devices_activation_hash (activation_code_hash),
  ADD KEY idx_scan_devices_activated_by (activated_by),
  ADD CONSTRAINT fk_scan_devices_activated_by
    FOREIGN KEY (activated_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL;

COMMIT;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'scan_devices'
  AND COLUMN_NAME IN (
    'activation_code_hash',
    'activation_code_expires_at',
    'activated_at',
    'activated_by'
  )
ORDER BY ORDINAL_POSITION;
