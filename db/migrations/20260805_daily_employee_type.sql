-- Menambahkan jenis karyawan HARIAN tanpa mengubah struktur relasi karyawan.
-- Nama CHECK payroll_basis pada database lama dapat berbeda dari schema sumber.
-- Karena itu constraint dicari dari metadata, lalu migration aman dijalankan ulang.

SET @employee_types_basis_constraint = (
  SELECT tc.CONSTRAINT_NAME
  FROM information_schema.TABLE_CONSTRAINTS tc
  JOIN information_schema.CHECK_CONSTRAINTS cc
    ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
   AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
  WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
    AND tc.TABLE_NAME = 'employee_types'
    AND tc.CONSTRAINT_TYPE = 'CHECK'
    AND LOWER(cc.CHECK_CLAUSE) LIKE '%payroll_basis%'
  LIMIT 1
);

SET @ddl = IF(
  @employee_types_basis_constraint IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE employee_types DROP CONSTRAINT `',
    REPLACE(@employee_types_basis_constraint, '`', '``'),
    '`'
  )
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE employee_types
  ADD CONSTRAINT chk_employee_types_basis
    CHECK (payroll_basis IN ('PIECE_RATE', 'MONTHLY', 'TIME_BASED'));

INSERT INTO employee_types (uid, code, name, payroll_basis, description)
VALUES (
  UUID(),
  'HARIAN',
  'Karyawan Harian',
  'TIME_BASED',
  'Karyawan dengan satuan upah berbasis waktu dan pembayaran harian atau mingguan.'
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  payroll_basis = VALUES(payroll_basis),
  description = VALUES(description),
  is_active = 1;
