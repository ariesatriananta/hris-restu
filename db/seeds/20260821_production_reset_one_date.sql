-- Reset transaksi demo Produksi untuk SATU tanggal bisnis.
-- Jalankan hanya pada environment development/uji.
-- Ubah @target_date sebelum menjalankan script.
--
-- Script hanya menghapus transaksi yang dibuat oleh
-- 20260821_production_seed_one_date.sql berdasarkan idempotency key stabil.
-- Transaksi manual, setoran susulan, dan transaksi dari Terminal Produksi
-- pada tanggal yang sama tetap dipertahankan.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @target_date = DATE('2026-08-07');

DROP PROCEDURE IF EXISTS reset_production_one_date;
DELIMITER $$
CREATE PROCEDURE reset_production_one_date()
BEGIN
  DECLARE target_seed_transactions BIGINT DEFAULT 0;
  DECLARE preserved_other_transactions BIGINT DEFAULT 0;
  DECLARE deleted_transactions BIGINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_production_reset_transaction_ids;
    RESIGNAL;
  END;

  IF @target_date IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: @target_date wajib diisi.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_production_reset_transaction_ids;
  CREATE TEMPORARY TABLE tmp_production_reset_transaction_ids (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB;

  INSERT INTO tmp_production_reset_transaction_ids (id)
  SELECT pt.id
  FROM production_transactions pt
  WHERE pt.business_date=@target_date
    AND pt.idempotency_key LIKE CONCAT(
      'SEED-PRD-',DATE_FORMAT(@target_date,'%Y%m%d'),'-%'
    )
    AND pt.transaction_number LIKE CONCAT(
      'PRD-',DATE_FORMAT(@target_date,'%Y%m%d'),'-SEED-%'
    )
    AND pt.notes='Setoran demo Produksi satu tanggal.';

  SELECT COUNT(*) INTO target_seed_transactions
  FROM tmp_production_reset_transaction_ids;

  SELECT COUNT(*) INTO preserved_other_transactions
  FROM production_transactions pt
  LEFT JOIN tmp_production_reset_transaction_ids target ON target.id=pt.id
  WHERE pt.business_date=@target_date AND target.id IS NULL;

  -- Jangan menghapus fakta yang sudah menjadi sumber koreksi/void atau hasil
  -- koreksi. Rantai revisi Produksi bersifat append-only dan harus tetap utuh.
  IF EXISTS (
    SELECT 1
    FROM production_transaction_revisions revision
    LEFT JOIN tmp_production_reset_transaction_ids source
      ON source.id=revision.production_transaction_id
    LEFT JOIN tmp_production_reset_transaction_ids replacement
      ON replacement.id=revision.replacement_transaction_id
    WHERE source.id IS NOT NULL OR replacement.id IS NOT NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: transaksi seed tanggal target sudah memiliki revisi koreksi atau void.';
  END IF;

  -- Snapshot dan lock Payroll tidak boleh diputus oleh reset data demo.
  IF EXISTS (
    SELECT 1
    FROM production_transactions pt
    JOIN tmp_production_reset_transaction_ids target ON target.id=pt.id
    WHERE pt.payroll_locked_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1
    FROM payroll_production_details detail
    JOIN tmp_production_reset_transaction_ids target
      ON target.id=detail.production_transaction_id
  ) OR EXISTS (
    SELECT 1
    FROM payroll_training_production_details detail
    JOIN tmp_production_reset_transaction_ids target
      ON target.id=detail.production_transaction_id
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: transaksi seed tanggal target sudah dikunci atau disnapshot Payroll.';
  END IF;

  -- Status selain DRAFT/CANCELLED berarti fakta pada tanggal ini sudah masuk
  -- proses Payroll. Run PROCESSING juga diblokir untuk menutup race kalkulasi.
  IF EXISTS (
    SELECT 1
    FROM payroll_periods period
    WHERE @target_date BETWEEN period.period_start AND period.period_end
      AND period.status NOT IN ('DRAFT','CANCELLED')
  ) OR EXISTS (
    SELECT 1
    FROM payroll_runs run
    JOIN payroll_periods period ON period.id=run.payroll_period_id
    WHERE @target_date BETWEEN period.period_start AND period.period_end
      AND run.status='PROCESSING'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: tanggal target sedang atau sudah diproses Payroll.';
  END IF;

  START TRANSACTION;

  DELETE pt
  FROM production_transactions pt
  JOIN tmp_production_reset_transaction_ids target ON target.id=pt.id;
  SET deleted_transactions=ROW_COUNT();

  COMMIT;

  DROP TEMPORARY TABLE tmp_production_reset_transaction_ids;

  SELECT
    @target_date target_date,
    target_seed_transactions seed_transactions_found,
    deleted_transactions seed_transactions_deleted,
    preserved_other_transactions other_transactions_preserved;
END$$
DELIMITER ;

CALL reset_production_one_date();
DROP PROCEDURE reset_production_one_date;
