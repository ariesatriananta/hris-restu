-- Reset Payroll end-to-end berdasarkan SATU nomor/kode periode.
-- Jalankan hanya pada environment development/uji.
--
-- Hasil akhir:
--   1. periode dan seluruh transaksi turunannya dihapus;
--   2. lock Payroll pada transaksi Produksi terkait dilepas secara aman;
--   3. fakta sumber Attendance, Produksi, dan master karyawan dipertahankan;
--   4. periode dengan rentang/skema yang sama dapat dibuat dan diproses ulang.
--
-- Audit operasional lama sengaja dipertahankan. Script menambahkan satu audit
-- DELETE agar tindakan reset demo tetap dapat ditelusuri.
-- Script ini sengaja dapat menghapus periode APPROVED/CLOSED untuk kebutuhan
-- replay demo; perilaku tersebut tidak boleh dijadikan fitur operasional.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @confirm_non_production = 'NO'; -- ubah menjadi YES-I-UNDERSTAND
SET @target_period_code = 'PAY-JEPARA-20260801-20260826-032872AF';

DROP PROCEDURE IF EXISTS reset_payroll_one_period;
DELIMITER $$
CREATE PROCEDURE reset_payroll_one_period()
BEGIN
  DECLARE target_matches BIGINT DEFAULT 0;
  DECLARE target_period_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE target_period_uid CHAR(36) DEFAULT NULL;
  DECLARE target_site_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE target_period_start DATE DEFAULT NULL;
  DECLARE target_period_end DATE DEFAULT NULL;
  DECLARE target_period_status VARCHAR(20) DEFAULT NULL;
  DECLARE reset_user_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE target_runs BIGINT DEFAULT 0;
  DECLARE target_results BIGINT DEFAULT 0;
  DECLARE target_manual_components BIGINT DEFAULT 0;
  DECLARE target_approvals BIGINT DEFAULT 0;
  DECLARE target_outputs BIGINT DEFAULT 0;
  DECLARE target_production_transactions BIGINT DEFAULT 0;
  DECLARE unlocked_production_transactions BIGINT DEFAULT 0;
  DECLARE deleted_periods BIGINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_output_ids;
    DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_approval_ids;
    DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_manual_ids;
    DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_production_ids;
    DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_result_ids;
    DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_run_ids;
    RESIGNAL;
  END;

  IF @confirm_non_production<>'YES-I-UNDERSTAND' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: konfirmasi environment non-production belum diisi.';
  END IF;

  IF @target_period_code IS NULL OR TRIM(@target_period_code)='' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: @target_period_code wajib diisi.';
  END IF;

  SELECT COUNT(*) INTO target_matches
  FROM payroll_periods
  WHERE period_code=@target_period_code;

  IF target_matches=0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: nomor periode Payroll tidak ditemukan.';
  END IF;

  IF target_matches<>1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: nomor periode Payroll tidak unik.';
  END IF;

  SELECT MIN(u.id) INTO reset_user_id
  FROM users u
  JOIN user_roles ur ON ur.user_id=u.id
  JOIN roles r ON r.id=ur.role_id AND r.code='SUPER_ADMIN'
  WHERE u.status='ACTIVE';

  IF reset_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: Super Admin aktif untuk audit reset tidak ditemukan.';
  END IF;

  START TRANSACTION;

  SELECT id,uid,site_id,period_start,period_end,status
    INTO target_period_id,target_period_uid,target_site_id,
         target_period_start,target_period_end,target_period_status
  FROM payroll_periods
  WHERE period_code=@target_period_code
  FOR UPDATE;

  -- Jangan memutus kalkulasi yang masih berjalan. Tunggu atau selesaikan run.
  IF EXISTS (
    SELECT 1 FROM payroll_runs
    WHERE payroll_period_id=target_period_id AND status='PROCESSING'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: masih ada run Payroll berstatus PROCESSING.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_run_ids;
  CREATE TEMPORARY TABLE tmp_payroll_reset_run_ids (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    uid CHAR(36) NOT NULL UNIQUE
  ) ENGINE=InnoDB;

  INSERT INTO tmp_payroll_reset_run_ids (id,uid)
  SELECT id,uid FROM payroll_runs
  WHERE payroll_period_id=target_period_id;

  DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_result_ids;
  CREATE TEMPORARY TABLE tmp_payroll_reset_result_ids (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    uid CHAR(36) NOT NULL UNIQUE
  ) ENGINE=InnoDB;

  INSERT INTO tmp_payroll_reset_result_ids (id,uid)
  SELECT id,uid FROM payroll_employee_results
  WHERE payroll_period_id=target_period_id;

  DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_production_ids;
  CREATE TEMPORARY TABLE tmp_payroll_reset_production_ids (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB;

  INSERT IGNORE INTO tmp_payroll_reset_production_ids (id)
  SELECT detail.production_transaction_id
  FROM payroll_production_details detail
  JOIN tmp_payroll_reset_result_ids result ON result.id=detail.payroll_employee_result_id
  UNION
  SELECT detail.production_transaction_id
  FROM payroll_training_production_details detail
  JOIN tmp_payroll_reset_result_ids result ON result.id=detail.payroll_employee_result_id;

  DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_manual_ids;
  CREATE TEMPORARY TABLE tmp_payroll_reset_manual_ids (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    uid CHAR(36) NOT NULL UNIQUE
  ) ENGINE=InnoDB;

  INSERT INTO tmp_payroll_reset_manual_ids (id,uid)
  SELECT id,uid FROM payroll_period_manual_components
  WHERE payroll_period_id=target_period_id;

  DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_approval_ids;
  CREATE TEMPORARY TABLE tmp_payroll_reset_approval_ids (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    uid CHAR(36) NOT NULL UNIQUE
  ) ENGINE=InnoDB;

  INSERT INTO tmp_payroll_reset_approval_ids (id,uid)
  SELECT id,uid FROM payroll_approvals
  WHERE payroll_period_id=target_period_id;

  DROP TEMPORARY TABLE IF EXISTS tmp_payroll_reset_output_ids;
  CREATE TEMPORARY TABLE tmp_payroll_reset_output_ids (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    uid CHAR(36) NOT NULL UNIQUE
  ) ENGINE=InnoDB;

  INSERT INTO tmp_payroll_reset_output_ids (id,uid)
  SELECT id,uid FROM payroll_output_audits
  WHERE payroll_period_id=target_period_id;

  SELECT COUNT(*) INTO target_runs FROM tmp_payroll_reset_run_ids;
  SELECT COUNT(*) INTO target_results FROM tmp_payroll_reset_result_ids;
  SELECT COUNT(*) INTO target_manual_components FROM tmp_payroll_reset_manual_ids;
  SELECT COUNT(*) INTO target_approvals FROM tmp_payroll_reset_approval_ids;
  SELECT COUNT(*) INTO target_outputs FROM tmp_payroll_reset_output_ids;
  SELECT COUNT(*) INTO target_production_transactions
  FROM tmp_payroll_reset_production_ids;

  -- Anak approval/run harus dibuang sebelum induknya.
  DELETE action
  FROM payroll_workflow_actions action
  WHERE action.payroll_period_id=target_period_id;

  DELETE output
  FROM payroll_output_audits output
  WHERE output.payroll_period_id=target_period_id;

  DELETE approval
  FROM payroll_approvals approval
  WHERE approval.payroll_period_id=target_period_id;

  -- Detail snapshot hasil Payroll.
  DELETE detail
  FROM payroll_production_details detail
  JOIN tmp_payroll_reset_result_ids result
    ON result.id=detail.payroll_employee_result_id;

  DELETE detail
  FROM payroll_training_production_details detail
  JOIN tmp_payroll_reset_result_ids result
    ON result.id=detail.payroll_employee_result_id;

  DELETE detail
  FROM payroll_time_details detail
  JOIN tmp_payroll_reset_result_ids result
    ON result.id=detail.payroll_employee_result_id;

  DELETE detail
  FROM payroll_monthly_daily_details detail
  JOIN tmp_payroll_reset_result_ids result
    ON result.id=detail.payroll_employee_result_id;

  DELETE summary
  FROM payroll_monthly_summaries summary
  JOIN tmp_payroll_reset_result_ids result
    ON result.id=summary.payroll_employee_result_id;

  DELETE summary
  FROM payroll_attendance_summaries summary
  JOIN tmp_payroll_reset_result_ids result
    ON result.id=summary.payroll_employee_result_id;

  DELETE detail
  FROM payroll_employee_component_details detail
  JOIN tmp_payroll_reset_result_ids result
    ON result.id=detail.payroll_employee_result_id;

  DELETE result
  FROM payroll_employee_results result
  WHERE result.payroll_period_id=target_period_id;

  -- Komponen manual memang milik periode, sehingga ikut dikembalikan ke nol.
  DELETE revision
  FROM payroll_period_manual_component_revisions revision
  JOIN tmp_payroll_reset_manual_ids manual
    ON manual.id=revision.payroll_period_manual_component_id;

  DELETE manual
  FROM payroll_period_manual_components manual
  WHERE manual.payroll_period_id=target_period_id;

  DELETE FROM payroll_period_company_snapshots
  WHERE payroll_period_id=target_period_id;

  DELETE FROM payroll_period_policy_snapshots
  WHERE payroll_period_id=target_period_id;

  -- Lepas lock hanya bila transaksi tidak lagi dipakai snapshot Payroll lain.
  UPDATE production_transactions production
  JOIN tmp_payroll_reset_production_ids target ON target.id=production.id
  SET production.payroll_locked_at=NULL,
      production.updated_by=reset_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM payroll_production_details remaining
    WHERE remaining.production_transaction_id=production.id
  ) AND NOT EXISTS (
    SELECT 1 FROM payroll_training_production_details remaining
    WHERE remaining.production_transaction_id=production.id
  );
  SET unlocked_production_transactions=ROW_COUNT();

  -- Putus circular reference period.current_run_id -> payroll_runs lebih dulu.
  UPDATE payroll_periods
  SET current_run_id=NULL,updated_by=reset_user_id
  WHERE id=target_period_id;

  DELETE run
  FROM payroll_runs run
  WHERE run.payroll_period_id=target_period_id;

  DELETE period
  FROM payroll_periods period
  WHERE period.id=target_period_id;
  SET deleted_periods=ROW_COUNT();

  IF deleted_periods<>1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: periode target gagal dihapus tepat satu baris.';
  END IF;

  -- Audit aplikasi lama tidak dihapus. Tambahkan jejak reset non-production.
  INSERT INTO audit_logs (
    uid,user_id,site_id,module,action,table_name,record_id,record_uid,
    description,reason,before_data,after_data,request_id,ip_address,
    user_agent,created_by,updated_by
  ) VALUES (
    UUID(),reset_user_id,target_site_id,'PAYROLL','DELETE','payroll_periods',
    target_period_id,target_period_uid,
    CONCAT('Reset end-to-end periode Payroll demo ',@target_period_code,'.'),
    'Mengembalikan dataset demo agar periode dapat dibuat dan diproses ulang.',
    JSON_OBJECT(
      'periodCode',@target_period_code,
      'periodStart',target_period_start,
      'periodEnd',target_period_end,
      'status',target_period_status,
      'runs',target_runs,
      'employeeResults',target_results,
      'manualComponents',target_manual_components,
      'approvals',target_approvals,
      'outputs',target_outputs
    ),
    JSON_OBJECT(
      'periodDeleted',TRUE,
      'productionTransactionsUnlocked',unlocked_production_transactions
    ),
    CONCAT('SEED-PAYROLL-RESET-',UPPER(REPLACE(target_period_uid,'-',''))),
    '127.0.0.1','HRIS Payroll Reset One Period Seed',
    reset_user_id,reset_user_id
  );

  -- Verifikasi sebelum commit: tidak boleh ada turunan yang tertinggal.
  IF EXISTS (SELECT 1 FROM payroll_periods WHERE id=target_period_id)
     OR EXISTS (SELECT 1 FROM payroll_runs WHERE payroll_period_id=target_period_id)
     OR EXISTS (SELECT 1 FROM payroll_employee_results WHERE payroll_period_id=target_period_id)
     OR EXISTS (SELECT 1 FROM payroll_approvals WHERE payroll_period_id=target_period_id)
     OR EXISTS (SELECT 1 FROM payroll_workflow_actions WHERE payroll_period_id=target_period_id)
     OR EXISTS (SELECT 1 FROM payroll_output_audits WHERE payroll_period_id=target_period_id)
     OR EXISTS (SELECT 1 FROM payroll_period_manual_components WHERE payroll_period_id=target_period_id)
     OR EXISTS (SELECT 1 FROM payroll_period_policy_snapshots WHERE payroll_period_id=target_period_id)
     OR EXISTS (SELECT 1 FROM payroll_period_company_snapshots WHERE payroll_period_id=target_period_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: masih ada data turunan Payroll yang tertinggal.';
  END IF;

  COMMIT;

  DROP TEMPORARY TABLE tmp_payroll_reset_output_ids;
  DROP TEMPORARY TABLE tmp_payroll_reset_approval_ids;
  DROP TEMPORARY TABLE tmp_payroll_reset_manual_ids;
  DROP TEMPORARY TABLE tmp_payroll_reset_production_ids;
  DROP TEMPORARY TABLE tmp_payroll_reset_result_ids;
  DROP TEMPORARY TABLE tmp_payroll_reset_run_ids;

  SELECT
    @target_period_code period_code,
    target_period_start period_start,
    target_period_end period_end,
    target_period_status previous_status,
    target_runs payroll_runs_deleted,
    target_results employee_results_deleted,
    target_manual_components manual_components_deleted,
    target_approvals approvals_deleted,
    target_outputs output_audits_deleted,
    target_production_transactions production_transactions_referenced,
    unlocked_production_transactions production_transactions_unlocked,
    deleted_periods periods_deleted,
    'Buat kembali periode Payroll dari halaman Periode Payroll.' next_action;
END$$
DELIMITER ;

CALL reset_payroll_one_period();
DROP PROCEDURE reset_payroll_one_period;
