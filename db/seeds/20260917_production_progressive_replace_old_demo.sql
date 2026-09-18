-- Reset data demo sebelum memasang tarif progresif client.
-- HANYA development/uji/staging. Jalankan SEBELUM migration
-- 20260917_production_progressive_rates.sql, lalu jalankan seed tarif baru.
-- Menghapus seluruh 12 tarif awal LINTING/BATIL/PACKING/SLOP/KEMAS1/KEMAS2
-- beserta seluruh setoran yang mereferensikannya. Bisa dijalankan ulang jika
-- 10 tarif pertama sudah terhapus: dua tarif KEMAS akan menjadi sisa target.
-- Termasuk setoran manual yang memakai tarif awal tersebut; periksa ringkasan
-- staging dan backup database sebelum mengubah konfirmasi berikut.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET @confirm_non_production = 'NO'; -- ubah menjadi YES-I-UNDERSTAND

DROP PROCEDURE IF EXISTS reset_old_progressive_demo_rates;
DELIMITER $$
CREATE PROCEDURE reset_old_progressive_demo_rates()
BEGIN
  DECLARE target_rates INT DEFAULT 0;
  DECLARE target_transactions BIGINT DEFAULT 0;
  DECLARE non_seed_transactions BIGINT DEFAULT 0;
  DECLARE deleted_transactions BIGINT DEFAULT 0;
  DECLARE deleted_rates INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_old_progressive_transactions;
    DROP TEMPORARY TABLE IF EXISTS tmp_old_progressive_rates;
    RESIGNAL;
  END;

  IF @confirm_non_production<>'YES-I-UNDERSTAND' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: konfirmasi environment non-production belum diisi.';
  END IF;

  -- Script ini sengaja dijalankan sebelum migration tarif progresif, supaya
  -- belum ada tier/detail baru yang dapat terhapus tanpa sengaja.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema=DATABASE()
      AND table_name IN ('production_job_rate_tiers','production_transaction_rate_details')
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: jalankan script ini sebelum migration tarif progresif.';
  END IF;

  -- Jangan menghapus setoran/rate yang sudah menjadi sumber payroll.
  IF EXISTS (SELECT 1 FROM payroll_periods)
     OR EXISTS (SELECT 1 FROM payroll_employee_results)
     OR EXISTS (SELECT 1 FROM payroll_production_details)
     OR EXISTS (SELECT 1 FROM payroll_training_production_details) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: data Payroll belum kosong. Reset periode terkait dahulu.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_old_progressive_rates;
  CREATE TEMPORARY TABLE tmp_old_progressive_rates (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB;

  INSERT INTO tmp_old_progressive_rates (id)
  SELECT rate.id
  FROM production_job_rates rate
  JOIN sites site ON site.id=rate.site_id
  JOIN production_jobs job ON job.id=rate.production_job_id
  WHERE rate.reference_number='TARIF-AWAL-PRODUKSI'
    AND (
      (site.code IN ('SEMARANG','JEPARA','KLATEN')
        AND job.code IN ('BORONGAN-LINTING','BORONGAN-PACKING','BORONGAN-SLOP'))
      OR (site.code='KLATEN' AND job.code IN
        ('BORONGAN-BATIL','BORONGAN-KEMAS1','BORONGAN-KEMAS2'))
    );

  SELECT COUNT(*) INTO target_rates FROM tmp_old_progressive_rates;
  IF target_rates<1 OR target_rates>12 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: jumlah tarif awal target di luar cakupan 1-12 baris.';
  END IF;

  -- Jangan mengklaim bersih bila ada tarif awal lain di luar cakupan eksplisit.
  IF EXISTS (
    SELECT 1 FROM production_job_rates rate
    LEFT JOIN tmp_old_progressive_rates target ON target.id=rate.id
    WHERE rate.reference_number='TARIF-AWAL-PRODUKSI' AND target.id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada tarif awal lain di luar 12 pasangan target.';
  END IF;

  -- Jangan meninggalkan tarif lain yang bertumpang tindih dengan target.
  IF EXISTS (
    SELECT 1 FROM production_job_rates rate
    JOIN sites site ON site.id=rate.site_id
    JOIN production_jobs job ON job.id=rate.production_job_id
    LEFT JOIN tmp_old_progressive_rates target ON target.id=rate.id
    WHERE target.id IS NULL
      AND (
        (site.code IN ('SEMARANG','JEPARA','KLATEN')
          AND job.code IN ('BORONGAN-LINTING','BORONGAN-PACKING','BORONGAN-SLOP'))
        OR (site.code='KLATEN' AND job.code IN
          ('BORONGAN-BATIL','BORONGAN-KEMAS1','BORONGAN-KEMAS2'))
      )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada tarif lain pada pasangan site-pekerjaan target.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_old_progressive_transactions;
  CREATE TEMPORARY TABLE tmp_old_progressive_transactions (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB;

  INSERT INTO tmp_old_progressive_transactions (id)
  SELECT pt.id
  FROM production_transactions pt
  JOIN tmp_old_progressive_rates rate ON rate.id=pt.job_rate_id;

  SELECT COUNT(*) INTO target_transactions
  FROM tmp_old_progressive_transactions;

  -- Permintaan reset ini adalah transaksi Produksi benar-benar kosong.
  IF EXISTS (
    SELECT 1 FROM production_transactions pt
    LEFT JOIN tmp_old_progressive_transactions target ON target.id=pt.id
    WHERE target.id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada setoran lain di luar tarif awal target.';
  END IF;

  SELECT COUNT(*) INTO non_seed_transactions
  FROM production_transactions pt
  JOIN tmp_old_progressive_transactions target ON target.id=pt.id
  WHERE pt.idempotency_key IS NULL
     OR pt.idempotency_key NOT LIKE 'SEED-PRD-%';

  IF EXISTS (
    SELECT 1 FROM production_transactions pt
    JOIN tmp_old_progressive_transactions target ON target.id=pt.id
    WHERE pt.payroll_locked_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM production_transaction_revisions revision
    LEFT JOIN tmp_old_progressive_transactions source
      ON source.id=revision.production_transaction_id
    LEFT JOIN tmp_old_progressive_transactions replacement
      ON replacement.id=revision.replacement_transaction_id
    WHERE source.id IS NOT NULL OR replacement.id IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM production_job_rate_revisions revision
    JOIN tmp_old_progressive_rates target ON target.id=revision.production_job_rate_id
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: transaksi/tarif target sudah dikunci atau memiliki revisi.';
  END IF;

  START TRANSACTION;

  DELETE pt
  FROM production_transactions pt
  JOIN tmp_old_progressive_transactions target ON target.id=pt.id;
  SET deleted_transactions=ROW_COUNT();

  DELETE rate
  FROM production_job_rates rate
  JOIN tmp_old_progressive_rates target ON target.id=rate.id;
  SET deleted_rates=ROW_COUNT();

  IF deleted_transactions<>target_transactions OR deleted_rates<>target_rates
     OR EXISTS (SELECT 1 FROM production_transactions)
     OR EXISTS (
       SELECT 1 FROM production_job_rates
       WHERE reference_number='TARIF-AWAL-PRODUKSI'
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: jumlah baris tidak sesuai atau data lama masih tersisa.';
  END IF;

  COMMIT;

  DROP TEMPORARY TABLE tmp_old_progressive_transactions;
  DROP TEMPORARY TABLE tmp_old_progressive_rates;

  SELECT target_rates old_rates_deleted,
         deleted_transactions old_rate_transactions_deleted,
         non_seed_transactions non_seed_transactions_included,
         'Setoran sudah kosong. Jalankan migration dan seed tarif progresif berikutnya.' next_action;
END$$
DELIMITER ;

CALL reset_old_progressive_demo_rates();
DROP PROCEDURE reset_old_progressive_demo_rates;
