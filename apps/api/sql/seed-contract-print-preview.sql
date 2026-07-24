-- Seed master produksi untuk menguji Preview Cetak Kontrak.
-- Prasyarat:
-- 1. Jalankan migration 20260725_production_rates_and_contract_print.sql.
-- 2. Pastikan production_sections dan production_module_sections sudah terisi.
--
-- Script ini tidak membuat employee/kontrak fiktif dan tidak mengisi
-- employee_job_assignments. Sumber pekerjaan kontrak berasal dari
-- production_jobs.position_id sesuai posisi karyawan pada tanggal mulai kontrak.
-- Untuk v1, pekerjaan produksi dikaitkan ke posisi existing OPERATOR.

START TRANSACTION;

SET @operator_position_id := NULL;
SET @pcs_unit_id := NULL;
SET @effective_from := '2026-01-01';

SELECT id
INTO @operator_position_id
FROM positions
WHERE code = 'OPERATOR'
   OR id = 1
ORDER BY CASE WHEN code = 'OPERATOR' THEN 0 ELSE 1 END
LIMIT 1;

SELECT id
INTO @pcs_unit_id
FROM work_units
WHERE code = 'PCS'
LIMIT 1;

INSERT INTO production_jobs
  (uid, code, name, description, default_unit_id, position_id, category, is_active, created_at, updated_at)
SELECT
  UUID(),
  CONCAT('BORONGAN-', ps.code),
  ps.name,
  CONCAT('Pekerjaan produksi borongan: ', ps.name),
  @pcs_unit_id,
  @operator_position_id,
  'BORONGAN',
  ps.is_active,
  NOW(3),
  NOW(3)
FROM production_sections ps
WHERE @operator_position_id IS NOT NULL
  AND @pcs_unit_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  default_unit_id = VALUES(default_unit_id),
  position_id = VALUES(position_id),
  category = VALUES(category),
  is_active = VALUES(is_active),
  updated_at = NOW(3);

INSERT INTO production_job_rates
  (uid, site_id, production_job_id, unit_id, effective_from, effective_to, rate_amount,
   currency, status, reference_number, notes, created_at, updated_at)
SELECT
  UUID(),
  pm.site_id,
  pj.id,
  @pcs_unit_id,
  @effective_from,
  NULL,
  750.00
    + ((pm.id % 3) * 100.00)
    + ((ps.id % 7) * 75.00)
    + ((pms.id % 5) * 50.00),
  'IDR',
  'ACTIVE',
  'TARIF-AWAL-PRODUKSI',
  CONCAT('Tarif awal ', ps.name, ' untuk ', pm.name, '.'),
  NOW(3),
  NOW(3)
FROM production_module_sections pms
JOIN production_modules pm ON pm.id = pms.production_module_id
JOIN production_sections ps ON ps.id = pms.production_section_id
JOIN production_jobs pj ON pj.code = CONCAT('BORONGAN-', ps.code)
WHERE pms.is_active = 1
  AND pm.is_active = 1
  AND ps.is_active = 1
  AND @pcs_unit_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  unit_id = VALUES(unit_id),
  effective_to = NULL,
  rate_amount = VALUES(rate_amount),
  currency = VALUES(currency),
  status = VALUES(status),
  reference_number = VALUES(reference_number),
  notes = VALUES(notes),
  updated_at = NOW(3);

UPDATE employee_contracts c
JOIN contract_types ct ON ct.id = c.contract_type_id
JOIN employees e ON e.id = c.employee_id
JOIN employee_employment_histories h
  ON h.employee_id = e.id
 AND h.effective_from <= c.start_date
 AND (h.effective_to IS NULL OR h.effective_to >= c.start_date)
SET c.terms_json = JSON_REMOVE(COALESCE(c.terms_json, JSON_OBJECT()), '$.contractPrintV1')
WHERE ct.code IN ('PKWT', 'TRAINING')
  AND h.position_id = @operator_position_id;

COMMIT;

SELECT
  @operator_position_id AS operator_position_id,
  (SELECT COUNT(*) FROM production_sections) AS production_sections_available,
  (SELECT COUNT(*) FROM production_jobs WHERE position_id = @operator_position_id) AS production_jobs_seeded,
  (SELECT COUNT(*) FROM production_module_sections WHERE is_active = 1) AS module_sections_available,
  (
    SELECT COUNT(*)
    FROM production_job_rates r
    JOIN production_jobs j ON j.id = r.production_job_id
    WHERE j.position_id = @operator_position_id
      AND r.reference_number = 'TARIF-AWAL-PRODUKSI'
  ) AS production_job_rates_seeded;

SELECT c.uid AS contract_uid, c.contract_number, e.employee_number, e.full_name, s.code AS site,
       p.name AS position_name
FROM employee_contracts c
JOIN contract_types ct ON ct.id = c.contract_type_id
JOIN employees e ON e.id = c.employee_id
JOIN employee_employment_histories h
  ON h.employee_id = e.id
 AND h.effective_from <= c.start_date
 AND (h.effective_to IS NULL OR h.effective_to >= c.start_date)
JOIN sites s ON s.id = h.site_id AND s.address IS NOT NULL AND TRIM(s.address) <> ''
JOIN positions p ON p.id = h.position_id
WHERE ct.code IN ('PKWT', 'TRAINING')
  AND h.position_id = @operator_position_id
  AND e.national_id_number IS NOT NULL AND TRIM(e.national_id_number) <> ''
  AND e.address IS NOT NULL AND TRIM(e.address) <> ''
ORDER BY c.start_date DESC, c.id DESC
LIMIT 10;

-- Jika operator_position_id NULL, pastikan posisi OPERATOR existing tersedia.
-- Jika result kontrak kosong, pastikan karyawan produksi memiliki history aktif
-- dengan posisi OPERATOR pada tanggal mulai kontrak.
