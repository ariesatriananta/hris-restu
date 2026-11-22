-- OWNER-RUN ONLY, after the approved Klaten legacy import. NOT a migration.
-- Scope: that exact source hash only; 395 active + 3330 archives, 585 contracts.
-- No inserts of employees/histories/contracts. No dates, status, ID, modules,
-- assignments, sequence, terms_json, files, master or configuration changed.
-- 1. Backup DB. Fill exact DB name. Run WHOLE FILE as SCRIPT in PREVIEW first.
-- 2. Stop writers/cron; set mode EXECUTE and both confirmations=1; run again.
-- 3. Success COMMITs. Any exception rolls back all data changes. FK stays on.
-- Fresh connection, autocommit=1. Requires CREATE ROUTINE and temporary tables.
-- Refuses changed scope, real operational facts, signed/printed contracts,
-- nonempty conflicting snapshots, or unexpected placement/history values.
SET @klt_cleanup_database='ISI_NAMA_DATABASE_TARGET';
SET @klt_cleanup_mode='PREVIEW';
SET @klt_cleanup_backup_confirmed=0;
SET @klt_cleanup_writers_stopped=0;

DELIMITER $$
DROP PROCEDURE IF EXISTS owner_klaten_placement_cleanup_20261123$$
CREATE PROCEDURE owner_klaten_placement_cleanup_20261123(
  IN p_database VARCHAR(64),IN p_mode VARCHAR(10),IN p_backup INT,IN p_stopped INT
)
SQL SECURITY INVOKER
main: BEGIN
  DECLARE v_hash CHAR(64) DEFAULT 'f5b8dd224012b1f3f439e8bbed65f15146784ef2e0ec0b7e14a8af28fdf55afc';
  DECLARE v_site BIGINT UNSIGNED;
  DECLARE v_department BIGINT UNSIGNED;
  DECLARE v_position BIGINT UNSIGNED;
  DECLARE v_position_name VARCHAR(150);
  DECLARE v_bad BIGINT DEFAULT 0;
  DECLARE v_active BIGINT DEFAULT 0;
  DECLARE v_archive BIGINT DEFAULT 0;
  DECLARE v_history BIGINT DEFAULT 0;
  DECLARE v_contract BIGINT DEFAULT 0;
  DECLARE v_safe INT DEFAULT 0;
  DECLARE v_tx INT DEFAULT 0;
  DECLARE v_lock INT DEFAULT 0;
  DECLARE v_lock_name VARCHAR(64);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_tx=1 THEN ROLLBACK; END IF;
    SET SESSION SQL_SAFE_UPDATES=v_safe;
    IF v_lock=1 THEN DO RELEASE_LOCK(v_lock_name); END IF;
    RESIGNAL;
  END;
  SET v_safe=@@SESSION.SQL_SAFE_UPDATES;
  IF p_database IS NULL OR DATABASE() IS NULL OR BINARY p_database<>BINARY DATABASE()
    OR p_database='ISI_NAMA_DATABASE_TARGET' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: isi nama database target yang tepat.';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('PREVIEW','EXECUTE') OR @@AUTOCOMMIT<>1 OR @@FOREIGN_KEY_CHECKS<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: mode PREVIEW/EXECUTE, koneksi baru autocommit=1 dan FK aktif wajib.';
  END IF;
  IF p_mode='EXECUTE' AND (COALESCE(p_backup,0)<>1 OR COALESCE(p_stopped,0)<>1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: konfirmasi backup dan penghentian writer/cron dahulu.';
  END IF;
  -- Share import lock so this cannot race the original import routine.
  SET v_lock_name=CONCAT('klt-import:',LEFT(SHA2(DATABASE(),256),40));
  SELECT GET_LOCK(v_lock_name,0) INTO v_lock;
  IF COALESCE(v_lock,0)<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: import/perapian lain sedang berjalan.'; END IF;
  SET SESSION SQL_SAFE_UPDATES=0;
  SELECT COUNT(*) INTO v_bad FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
    AND ENGINE='InnoDB' AND TABLE_NAME IN ('employees','employee_employment_histories','employee_contracts','audit_logs');
  IF v_bad<>4 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: semua tabel yang diubah harus InnoDB.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM audit_logs
    WHERE record_uid='939e1c2b-dda6-56c2-8558-dcf5409bad6e' AND module='EMPLOYEES'
      AND action='OTHER' AND JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.sourceHash'))=v_hash;
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: marker import Klaten sumber yang disepakati tidak cocok.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM sites WHERE code='KLATEN' AND is_active=1;
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: master site Klaten tidak sesuai.'; END IF;
  SELECT id INTO v_site FROM sites WHERE code='KLATEN';
  SELECT COUNT(*) INTO v_bad FROM departments WHERE site_id=v_site AND code='PROD' AND is_active=1;
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: Departemen Produksi Klaten tidak sesuai.'; END IF;
  SELECT id INTO v_department FROM departments WHERE site_id=v_site AND code='PROD' AND is_active=1;
  SELECT COUNT(*) INTO v_bad FROM positions WHERE code='OPERATOR' AND is_active=1;
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: master Operator Produksi tidak sesuai.'; END IF;
  SELECT id,name INTO v_position,v_position_name FROM positions WHERE code='OPERATOR' AND is_active=1;

  START TRANSACTION; SET v_tx=1;
  DROP TEMPORARY TABLE IF EXISTS _klt_cleanup_people;
  DROP TEMPORARY TABLE IF EXISTS _klt_cleanup_histories;
  DROP TEMPORARY TABLE IF EXISTS _klt_cleanup_contracts;
  CREATE TEMPORARY TABLE _klt_cleanup_people ENGINE=InnoDB AS
    SELECT e.id,es.code status_code FROM employees e
      JOIN employee_statuses es ON es.id=e.employee_status_id
    WHERE e.current_site_id=v_site AND JSON_VALID(e.notes)
      AND JSON_UNQUOTE(JSON_EXTRACT(e.notes,'$.legacyImport.sourceHash'))=v_hash;
  IF (SELECT COUNT(*) FROM _klt_cleanup_people)<>3725
    OR (SELECT COUNT(*) FROM _klt_cleanup_people WHERE status_code='ACTIVE')<>395
    OR (SELECT COUNT(*) FROM _klt_cleanup_people WHERE status_code IN ('INACTIVE','RESIGNED'))<>3330 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jumlah/status/site karyawan import sudah berubah. Review ulang scope.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM employees e JOIN _klt_cleanup_people t ON t.id=e.id
    WHERE (e.current_department_id IS NOT NULL AND e.current_department_id<>v_department)
      OR (e.current_position_id IS NOT NULL AND e.current_position_id<>v_position);
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: ada dept/posisi lain; jangan menimpa penempatan yang belum disetujui.'; END IF;
  CREATE TEMPORARY TABLE _klt_cleanup_histories ENGINE=InnoDB AS
    SELECT h.id,h.employee_id FROM employee_employment_histories h
    JOIN _klt_cleanup_people t ON t.id=h.employee_id
    WHERE t.status_code='ACTIVE' AND h.change_type='INITIAL' AND h.status='ACTIVE'
      AND h.effective_from='2026-11-23' AND h.effective_to IS NULL
      AND h.notes LIKE CONCAT('Import ',v_hash,':%');
  IF (SELECT COUNT(*) FROM _klt_cleanup_histories)<>395
    OR (SELECT COUNT(DISTINCT employee_id) FROM _klt_cleanup_histories)<>395
    OR (SELECT COUNT(*) FROM employee_employment_histories h JOIN _klt_cleanup_people t ON t.id=h.employee_id)<>395 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: histori baseline tidak lagi tepat satu per aktif atau ada histori lain.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM employee_employment_histories h JOIN _klt_cleanup_histories t ON t.id=h.id
    WHERE (h.department_id IS NOT NULL AND h.department_id<>v_department)
      OR (h.position_id IS NOT NULL AND h.position_id<>v_position);
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: histori memiliki dept/posisi berbeda. Perlu review manual.'; END IF;
  CREATE TEMPORARY TABLE _klt_cleanup_contracts ENGINE=InnoDB AS
    SELECT c.id FROM employee_contracts c JOIN _klt_cleanup_people t ON t.id=c.employee_id
    WHERE t.status_code='ACTIVE' AND c.status IN ('ACTIVE','EXPIRED')
      AND JSON_UNQUOTE(JSON_EXTRACT(c.terms_json,'$.legacyImport.sourceHash'))=v_hash
      AND JSON_EXTRACT(c.terms_json,'$.legacyImport.reconstructed')=true;
  IF (SELECT COUNT(*) FROM _klt_cleanup_contracts)<>585
    OR (SELECT COUNT(*) FROM employee_contracts c JOIN _klt_cleanup_people t ON t.id=c.employee_id)<>585 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: kontrak rekonstruksi import tidak sesuai scope 585.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM employee_contracts c JOIN _klt_cleanup_contracts t ON t.id=c.id
    WHERE c.signed_date IS NOT NULL OR c.issued_file_id IS NOT NULL
      OR JSON_EXTRACT(c.terms_json,'$.contractPrintV1') IS NOT NULL
      OR JSON_EXTRACT(c.terms_json,'$.contractPrintV2') IS NOT NULL
      OR (NULLIF(TRIM(c.position_name_snapshot),'') IS NOT NULL
        AND BINARY c.position_name_snapshot<>BINARY v_position_name);
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: kontrak sudah ditandatangani/dicetak atau snapshot jabatan berbeda.'; END IF;
  -- Baseline repair only, before any trial facts exist for these employees.
  SELECT (SELECT COUNT(*) FROM attendance_records a JOIN _klt_cleanup_people t ON t.id=a.employee_id)
    INTO v_bad;
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: Attendance sudah digunakan; review dampak sebelum perapian baseline.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM production_transactions p JOIN _klt_cleanup_people t ON t.id=p.employee_id;
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: Produksi sudah digunakan; review dampak dahulu.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM payroll_employee_results p JOIN _klt_cleanup_people t ON t.id=p.employee_id;
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: Payroll sudah digunakan; review dampak dahulu.'; END IF;
  IF p_mode='EXECUTE' AND (SELECT COUNT(*) FROM cron_runs WHERE status='RUNNING')>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: masih ada cron RUNNING. Periksa dan hentikan proses dahulu.';
  END IF;

  SELECT COUNT(*) INTO v_active FROM employees e JOIN _klt_cleanup_people t ON t.id=e.id
    WHERE t.status_code='ACTIVE' AND (NOT(e.current_department_id<=>v_department) OR NOT(e.current_position_id<=>v_position));
  SELECT COUNT(*) INTO v_archive FROM employees e JOIN _klt_cleanup_people t ON t.id=e.id
    WHERE t.status_code<>'ACTIVE' AND (e.current_department_id IS NOT NULL OR e.current_position_id IS NOT NULL);
  SELECT COUNT(*) INTO v_history FROM employee_employment_histories h JOIN _klt_cleanup_histories t ON t.id=h.id
    WHERE NOT(h.department_id<=>v_department) OR NOT(h.position_id<=>v_position);
  SELECT COUNT(*) INTO v_contract FROM employee_contracts c JOIN _klt_cleanup_contracts t ON t.id=c.id
    WHERE NULLIF(TRIM(c.position_name_snapshot),'') IS NULL;
  SELECT DATABASE() target_database,p_mode mode,v_department department_id,v_position position_id,v_position_name position_name,
    v_active active_profiles_to_update,v_archive archive_profiles_to_clear,
    v_history baseline_histories_to_update,v_contract contract_snapshots_to_fill;
  IF p_mode='PREVIEW' THEN
    ROLLBACK; SET v_tx=0;
    SET SESSION SQL_SAFE_UPDATES=v_safe;
    DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
    SELECT 'PREVIEW_ONLY_NO_APPLICATION_DATA_CHANGED' result;
    LEAVE main;
  END IF;

  UPDATE employees e JOIN _klt_cleanup_people t ON t.id=e.id
    SET e.current_department_id=v_department,e.current_position_id=v_position
    WHERE t.status_code='ACTIVE' AND (NOT(e.current_department_id<=>v_department) OR NOT(e.current_position_id<=>v_position));
  UPDATE employees e JOIN _klt_cleanup_people t ON t.id=e.id
    SET e.current_department_id=NULL,e.current_position_id=NULL
    WHERE t.status_code IN ('INACTIVE','RESIGNED') AND (e.current_department_id IS NOT NULL OR e.current_position_id IS NOT NULL);
  UPDATE employee_employment_histories h JOIN _klt_cleanup_histories t ON t.id=h.id
    SET h.department_id=v_department,h.position_id=v_position
    WHERE NOT(h.department_id<=>v_department) OR NOT(h.position_id<=>v_position);
  UPDATE employee_contracts c JOIN _klt_cleanup_contracts t ON t.id=c.id
    SET c.position_name_snapshot=v_position_name
    WHERE NULLIF(TRIM(c.position_name_snapshot),'') IS NULL;

  SELECT COUNT(*) INTO v_bad FROM employees e JOIN _klt_cleanup_people t ON t.id=e.id
    WHERE (t.status_code='ACTIVE' AND (NOT(e.current_department_id<=>v_department) OR NOT(e.current_position_id<=>v_position)))
      OR (t.status_code<>'ACTIVE' AND (e.current_department_id IS NOT NULL OR e.current_position_id IS NOT NULL));
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: profil belum sesuai; rollback.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM employee_employment_histories h JOIN _klt_cleanup_histories t ON t.id=h.id
    WHERE NOT(h.department_id<=>v_department) OR NOT(h.position_id<=>v_position);
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: histori belum selaras; rollback.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM employee_contracts c JOIN _klt_cleanup_contracts t ON t.id=c.id
    WHERE NOT(c.position_name_snapshot<=>v_position_name);
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: snapshot jabatan belum sesuai; rollback.'; END IF;
  IF v_active+v_archive+v_history+v_contract>0 THEN
    INSERT INTO audit_logs(uid,site_id,module,action,table_name,description,reason,after_data)
    VALUES(UUID(),v_site,'EMPLOYEES','OTHER','employees',
      'Owner-run perapian dept/posisi hasil import legacy Klaten.',
      'Persetujuan Owner: aktif Produksi/Operator; arsip dept/posisi unknown NULL; lengkapi histori baseline dan snapshot kontrak rekonstruksi.',
      JSON_OBJECT('sourceHash',v_hash,'activeProfilesUpdated',v_active,'archiveProfilesCleared',v_archive,
        'baselineHistoriesUpdated',v_history,'contractSnapshotsFilled',v_contract));
  END IF;
  COMMIT; SET v_tx=0;
  SET SESSION SQL_SAFE_UPDATES=v_safe;
  DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
  SELECT CASE WHEN v_active+v_archive+v_history+v_contract=0 THEN 'ALREADY_TIDY_NO_CHANGES' ELSE 'KLATEN_PLACEMENT_CLEANUP_COMMITTED' END result;
END$$
DELIMITER ;
CALL owner_klaten_placement_cleanup_20261123(
  @klt_cleanup_database,@klt_cleanup_mode,@klt_cleanup_backup_confirmed,@klt_cleanup_writers_stopped
);
DROP PROCEDURE IF EXISTS owner_klaten_placement_cleanup_20261123;
