-- Tipe kontrak tambahan untuk master contract_types.
-- Aman dijalankan pada database yang sudah memakai migration 20260715_contract_types.sql.

INSERT INTO contract_types (uid, code, name, description)
VALUES
  (UUID(), 'TRAINING', 'Training', 'Kontrak atau kesepakatan selama masa pelatihan.'),
  (UUID(), 'PROJECT', 'Project', 'Kontrak kerja untuk proyek tertentu.'),
  (UUID(), 'RETAIN', 'Retain', 'Kontrak retensi atau perpanjangan masa kerja.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = 1;
