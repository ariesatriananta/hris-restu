-- Barcode selalu identik dengan Employee ID dan tidak dapat diubah terpisah.
-- Nilai barcode lama dihitung ulang otomatis dari employee_number saat kolom diubah.

ALTER TABLE employees
  MODIFY COLUMN barcode VARCHAR(100)
  GENERATED ALWAYS AS (employee_number) STORED;
