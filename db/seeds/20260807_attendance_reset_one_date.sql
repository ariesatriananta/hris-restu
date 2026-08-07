-- Reset data operasional Attendance untuk SATU tanggal bisnis.
-- Jalankan hanya pada environment development/uji.
-- Ubah variabel ini sebelum eksekusi.

-- Table yang akan dihapus :
-- attendance_classification_details
-- attendance_classification_requests
-- attendance_corrections
-- attendance_scan_events
-- attendance_records
-- attendance_daily_finalization_runs

SET @target_date = DATE('2026-08-07');

DROP PROCEDURE IF EXISTS reset_attendance_one_date;
DELIMITER $$
CREATE PROCEDURE reset_attendance_one_date()
BEGIN
  DECLARE deleted_classification_details BIGINT DEFAULT 0;
  DECLARE deleted_classification_requests BIGINT DEFAULT 0;
  DECLARE deleted_corrections BIGINT DEFAULT 0;
  DECLARE deleted_scan_events BIGINT DEFAULT 0;
  DECLARE deleted_records BIGINT DEFAULT 0;
  DECLARE deleted_finalization_runs BIGINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_attendance_reset_record_ids;
    RESIGNAL;
  END;

  IF @target_date IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: @target_date wajib diisi.';
  END IF;

  -- Satu request rentang tidak boleh dipotong hanya pada salah satu tanggal.
  IF EXISTS (
    SELECT 1
    FROM attendance_classification_requests
    WHERE start_date<=@target_date
      AND end_date>=@target_date
      AND (start_date<>@target_date OR end_date<>@target_date)
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: ada klasifikasi multi-hari yang melintasi tanggal target.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_attendance_reset_record_ids;
  CREATE TEMPORARY TABLE tmp_attendance_reset_record_ids (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB;

  INSERT INTO tmp_attendance_reset_record_ids (id)
  SELECT id
  FROM attendance_records
  WHERE business_date=@target_date;

  IF EXISTS (
    SELECT 1
    FROM production_transactions pt
    LEFT JOIN tmp_attendance_reset_record_ids target ON target.id=pt.attendance_record_id
    WHERE target.id IS NOT NULL OR pt.business_date=@target_date
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: Attendance tanggal target sudah dipakai transaksi produksi.';
  END IF;

  -- Status selain DRAFT/CANCELLED berarti periode sudah pernah dihitung atau dikunci.
  IF EXISTS (
    SELECT 1
    FROM payroll_periods pp
    WHERE @target_date BETWEEN pp.period_start AND pp.period_end
      AND pp.status NOT IN ('DRAFT','CANCELLED')
  ) OR EXISTS (
    SELECT 1
    FROM payroll_attendance_summaries pas
    JOIN payroll_employee_results per ON per.id=pas.payroll_employee_result_id
    JOIN payroll_periods pp ON pp.id=per.payroll_period_id
    WHERE @target_date BETWEEN pp.period_start AND pp.period_end
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Reset dibatalkan: tanggal target sudah masuk perhitungan/snapshot payroll.';
  END IF;

  START TRANSACTION;

  DELETE acd
  FROM attendance_classification_details acd
  JOIN attendance_classification_requests acr ON acr.id=acd.request_id
  WHERE acd.business_date=@target_date
    AND acr.start_date=@target_date
    AND acr.end_date=@target_date;
  SET deleted_classification_details=ROW_COUNT();

  DELETE FROM attendance_classification_requests
  WHERE start_date=@target_date AND end_date=@target_date;
  SET deleted_classification_requests=ROW_COUNT();

  DELETE ac
  FROM attendance_corrections ac
  JOIN tmp_attendance_reset_record_ids target ON target.id=ac.attendance_record_id;
  SET deleted_corrections=ROW_COUNT();

  -- Event sukses dihapus berdasarkan relasi record. Event gagal/tanpa record
  -- dihapus berdasarkan tanggal scan aktual.
  DELETE ase
  FROM attendance_scan_events ase
  LEFT JOIN tmp_attendance_reset_record_ids target
    ON target.id=ase.attendance_record_id
  WHERE target.id IS NOT NULL
     OR (ase.attendance_record_id IS NULL AND DATE(ase.scanned_at)=@target_date);
  SET deleted_scan_events=ROW_COUNT();

  DELETE ar
  FROM attendance_records ar
  JOIN tmp_attendance_reset_record_ids target ON target.id=ar.id;
  SET deleted_records=ROW_COUNT();

  DELETE FROM attendance_daily_finalization_runs
  WHERE business_date=@target_date;
  SET deleted_finalization_runs=ROW_COUNT();

  COMMIT;

  DROP TEMPORARY TABLE tmp_attendance_reset_record_ids;

  SELECT
    @target_date target_date,
    deleted_classification_details classification_details,
    deleted_classification_requests classification_requests,
    deleted_corrections corrections,
    deleted_scan_events scan_events,
    deleted_records attendance_records,
    deleted_finalization_runs finalization_runs;
END$$
DELIMITER ;

CALL reset_attendance_one_date();
DROP PROCEDURE reset_attendance_one_date;
