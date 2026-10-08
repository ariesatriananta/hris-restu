-- Susulan migration Potongan Hasil Linting: kebijakan berdasarkan site + pekerjaan.
-- Jalankan manual sebelum deploy API/UI baru, setelah migration pertama.
-- Jalankan saat penulisan master kebijakan dihentikan. DDL MySQL melakukan auto-commit.
-- Tidak mengubah transaksi Produksi, snapshot Payroll, atau persentase policy.
-- Bagian legacy dipertahankan sebagai metadata nullable, bukan syarat potongan.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preview konflik lintas bagian. Jika ada baris, tentukan kebijakan yang benar
-- terlebih dahulu; migration menolak memilih atau menghapus data otomatis.
SELECT a.uid policy_uid,b.uid conflicting_policy_uid,a.site_id,a.production_job_id
FROM production_quantity_deduction_policies a
JOIN production_quantity_deduction_policies b
  ON b.site_id=a.site_id AND b.production_job_id=a.production_job_id AND b.id>a.id
WHERE (a.status='ACTIVE' AND b.status='ACTIVE'
       AND a.effective_from<=COALESCE(b.effective_to,'9999-12-31')
       AND b.effective_from<=COALESCE(a.effective_to,'9999-12-31'))
   OR a.effective_from=b.effective_from;

DROP PROCEDURE IF EXISTS migrate_production_quantity_deduction_job_scope;
DELIMITER $$
CREATE PROCEDURE migrate_production_quantity_deduction_job_scope()
BEGIN
  IF EXISTS (
    SELECT 1 FROM production_quantity_deduction_policies a
    JOIN production_quantity_deduction_policies b
      ON b.site_id=a.site_id AND b.production_job_id=a.production_job_id AND b.id>a.id
    WHERE (a.status='ACTIVE' AND b.status='ACTIVE'
           AND a.effective_from<=COALESCE(b.effective_to,'9999-12-31')
           AND b.effective_from<=COALESCE(a.effective_to,'9999-12-31'))
       OR a.effective_from=b.effective_from
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migration dibatalkan: kebijakan site/pekerjaan konflik. Periksa preview.';
  END IF;

  ALTER TABLE production_quantity_deduction_policies
    MODIFY COLUMN production_section_id BIGINT UNSIGNED NULL
      COMMENT 'Legacy metadata; not a policy scope',
    DROP INDEX uq_production_quantity_deduction_start,
    DROP INDEX idx_production_quantity_deduction_lookup,
    ADD UNIQUE KEY uq_production_quantity_deduction_start (site_id,production_job_id,effective_from),
    ADD KEY idx_production_quantity_deduction_lookup (site_id,production_job_id,status,effective_from,effective_to),
    ADD KEY idx_production_quantity_deduction_legacy_section (production_section_id);
END$$
DELIMITER ;

CALL migrate_production_quantity_deduction_job_scope();
DROP PROCEDURE migrate_production_quantity_deduction_job_scope;
