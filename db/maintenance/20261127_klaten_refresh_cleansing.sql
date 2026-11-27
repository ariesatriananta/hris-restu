-- OWNER-RUN ONLY: approved 27 November 2026 ALL-SITES operational refresh.
-- Prepare for Database Klaten - 20261126.xlsx. NOT a schema migration.
-- Never auto-run from deploy/startup/cron. Backup full DB and retain R2 objects.
-- All masters, configuration, users, ALL files, employee number sequences,
-- existing audit and cron logs remain. One SYSTEM refresh audit is appended.
-- No TRUNCATE, FK disabling, AUTO_INCREMENT reset, sequence reset or R2 operation.
-- Requires MariaDB 10.4+/MySQL8, CREATE ROUTINE and temporary tables.
-- 1. Fill exact database name; run WHOLE FILE as SCRIPT in PREVIEW.
-- 2. Inspect all table counts. Enter four expected counts from PREVIEW below.
-- 3. Stop API/public recruitment writers/workers/cron. Confirm backup/stopped=1.
-- 4. Set EXECUTE and run whole file ONCE. Exceptions roll back application data.
-- 5. Only after success run separately reviewed new import. Do not reuse old import.
-- An audit marker blocks rerunning this reset after success/new import.
-- Use a fresh autocommit=1 connection, FK checks ON. DDL routine creation commits.
SET @klt_refresh_database='ISI_NAMA_DATABASE_TARGET';
SET @klt_refresh_mode='PREVIEW';
SET @klt_refresh_backup_confirmed=0;
SET @klt_refresh_writers_stopped=0;
SET @klt_refresh_expected_employees=NULL;
SET @klt_refresh_expected_candidates=NULL;
SET @klt_refresh_expected_attendance=NULL;
SET @klt_refresh_expected_scans=NULL;

DELIMITER $$
DROP PROCEDURE IF EXISTS owner_klaten_refresh_cleansing_20261127$$
CREATE PROCEDURE owner_klaten_refresh_cleansing_20261127(
  IN p_database VARCHAR(64), IN p_mode VARCHAR(10),
  IN p_backup INT, IN p_stopped INT, IN p_employees BIGINT,
  IN p_candidates BIGINT, IN p_attendance BIGINT, IN p_scans BIGINT
)
SQL SECURITY INVOKER
main: BEGIN
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_max INT DEFAULT 0;
  DECLARE v_bad BIGINT DEFAULT 0;
  DECLARE v_employees BIGINT DEFAULT 0;
  DECLARE v_candidates BIGINT DEFAULT 0;
  DECLARE v_attendance BIGINT DEFAULT 0;
  DECLARE v_scans BIGINT DEFAULT 0;
  DECLARE v_time_zone VARCHAR(64);
  DECLARE v_table VARCHAR(64);
  DECLARE v_safe_updates INT DEFAULT 0;
  DECLARE v_transaction INT DEFAULT 0;
  DECLARE v_lock INT DEFAULT 0;
  DECLARE v_lock_name VARCHAR(64);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_transaction=1 THEN ROLLBACK; END IF;
    SET SESSION SQL_SAFE_UPDATES=v_safe_updates;
    SET SESSION time_zone=v_time_zone;
    IF v_lock=1 THEN DO RELEASE_LOCK(v_lock_name); END IF;
    RESIGNAL;
  END;

  SET v_safe_updates=@@SESSION.SQL_SAFE_UPDATES;
  SET v_time_zone=@@SESSION.time_zone;
  IF p_database IS NULL OR DATABASE() IS NULL OR BINARY p_database<>BINARY DATABASE()
    OR p_database='ISI_NAMA_DATABASE_TARGET' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: isi nama database target yang sama dengan database terpilih.';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('PREVIEW','EXECUTE') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: mode harus PREVIEW atau EXECUTE.';
  END IF;
  IF @@SESSION.FOREIGN_KEY_CHECKS<>1 OR @@SESSION.AUTOCOMMIT<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: gunakan koneksi baru, autocommit=1 dan foreign_key_checks=1.';
  END IF;
  IF p_mode='EXECUTE' AND (COALESCE(p_backup,0)<>1 OR COALESCE(p_stopped,0)<>1 OR p_employees IS NULL
      OR p_candidates IS NULL OR p_attendance IS NULL OR p_scans IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: wajib backup, hentikan seluruh writer/cron dan isi jumlah karyawan hasil preview.';
  END IF;
  IF EXISTS(SELECT 1 FROM audit_logs WHERE record_uid='4226d3f9-f128-4e25-a501-3f2d3f150727'
      AND module='SYSTEM' AND action='OTHER') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: refresh cleansing ini sudah committed. Jangan reset hasil import baru.';
  END IF;
  SET v_lock_name=CONCAT('klt-refresh-20261127:',LEFT(SHA2(DATABASE(),256),40));
  SELECT GET_LOCK(v_lock_name,0) INTO v_lock;
  IF COALESCE(v_lock,0)<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: cleansing lain sedang berjalan.';
  END IF;
  -- Temporary-table bookkeeping also uses joins without a key predicate.
  SET SESSION SQL_SAFE_UPDATES=0;
  SET SESSION time_zone='+00:00';

  DROP TEMPORARY TABLE IF EXISTS _kr_plan;
  DROP TEMPORARY TABLE IF EXISTS _kr_preserved;
  CREATE TEMPORARY TABLE _kr_plan (
    seq INT PRIMARY KEY, table_name VARCHAR(64) NOT NULL UNIQUE,
    before_count BIGINT NOT NULL DEFAULT 0, after_count BIGINT NULL
  ) ENGINE=InnoDB;
  -- Explicit operational inventory, child before parent. ALL files are preserved.
  INSERT INTO _kr_plan(seq,table_name) VALUES
    (1,'payroll_workflow_actions'),
    (2,'payroll_output_audits'),
    (3,'payroll_approvals'),
    (4,'payroll_production_rate_details'),
    (5,'payroll_production_details'),
    (6,'payroll_training_production_details'),
    (7,'payroll_time_details'),
    (8,'payroll_monthly_daily_details'),
    (9,'payroll_monthly_summaries'),
    (10,'payroll_attendance_summaries'),
    (11,'payroll_employee_bpjs_details'),
    (12,'payroll_employee_component_details'),
    (13,'payroll_bpjs_monthly_settlements'),
    (14,'payroll_employee_results'),
    (15,'payroll_period_manual_component_revisions'),
    (16,'payroll_period_manual_components'),
    (17,'payroll_period_policy_snapshots'),
    (18,'payroll_period_company_snapshots'),
    (19,'payroll_runs'),
    (20,'payroll_periods'),
    (21,'production_transaction_qc_defects'),
    (22,'production_transaction_qc'),
    (23,'production_transaction_revisions'),
    (24,'production_transaction_pairs'),
    (25,'production_transaction_rate_details'),
    (26,'production_transactions'),
    (27,'attendance_classification_details'),
    (28,'attendance_classification_requests'),
    (29,'attendance_corrections'),
    (30,'attendance_scan_events'),
    (31,'attendance_records'),
    (32,'attendance_daily_finalization_runs'),
    (33,'recruitment_status_events'),
    (34,'recruitment_candidate_files'),
    (35,'recruitment_candidates'),
    (36,'generated_documents'),
    (37,'employee_contract_lifecycle_events'),
    (38,'scheduled_employee_status_changes'),
    (39,'scheduled_employee_mutations'),
    (40,'employee_contracts'),
    (41,'employee_employment_histories'),
    (42,'employee_job_assignment_revisions'),
    (43,'employee_job_assignments'),
    (44,'employee_salary_history_revisions'),
    (45,'employee_daily_rate_revisions'),
    (46,'employee_bpjs_enrollment_revisions'),
    (47,'employee_salary_histories'),
    (48,'employee_daily_rate_histories'),
    (49,'employee_bpjs_enrollments'),
    (50,'employee_shift_assignments'),
    (51,'employee_payroll_components'),
    (52,'employee_documents'),
    (53,'employees');

  SELECT COUNT(*) INTO v_bad FROM _kr_plan p
    LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=DATABASE() AND t.TABLE_NAME=p.table_name
    WHERE t.TABLE_NAME IS NULL OR t.TABLE_TYPE<>'BASE TABLE' OR t.ENGINE<>'InnoDB';
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: tabel target hilang/bukan InnoDB. Cocokkan schema; jangan lewati tabel.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_logs' AND ENGINE='InnoDB';
  IF v_bad<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: audit_logs InnoDB wajib tersedia.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM information_schema.TRIGGERS t
    LEFT JOIN _kr_plan p ON p.table_name=t.EVENT_OBJECT_TABLE
    WHERE t.TRIGGER_SCHEMA=DATABASE() AND (
      (p.seq IS NOT NULL AND t.EVENT_MANIPULATION='DELETE')
      OR (t.EVENT_OBJECT_TABLE='payroll_periods' AND t.EVENT_MANIPULATION='UPDATE')
      OR (t.EVENT_OBJECT_TABLE='audit_logs' AND t.EVENT_MANIPULATION='INSERT')
    );
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: ada trigger pada tabel target/audit. Review efek trigger sebelum cleansing.';
  END IF;

  -- Snapshot FK metadata, then join the plan copies independently: avoids
  -- MariaDB/MySQL temporary-table "cannot reopen table" on self joins.
  DROP TEMPORARY TABLE IF EXISTS _kr_fk;
  CREATE TEMPORARY TABLE _kr_fk ENGINE=InnoDB AS
    SELECT k.TABLE_NAME child_table,k.COLUMN_NAME child_column,
      k.REFERENCED_TABLE_NAME parent_table,k.REFERENCED_COLUMN_NAME parent_column,
      k.REFERENCED_TABLE_SCHEMA parent_schema,
      CAST(NULL AS SIGNED) child_seq,CAST(NULL AS SIGNED) parent_seq
    FROM information_schema.KEY_COLUMN_USAGE k
    WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL;
  UPDATE _kr_fk f JOIN _kr_plan p ON p.table_name=f.child_table SET f.child_seq=p.seq;
  UPDATE _kr_fk f JOIN _kr_plan p ON p.table_name=f.parent_table
    AND f.parent_schema=DATABASE() SET f.parent_seq=p.seq;
  SELECT COUNT(*) INTO v_bad FROM _kr_fk
    WHERE parent_seq IS NOT NULL AND child_seq IS NULL;
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: tabel di luar rencana mereferensikan target. Perlu review dependency baru.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM _kr_fk
    WHERE child_seq>=parent_seq AND NOT
      (child_table='payroll_periods' AND child_column='current_run_id' AND parent_table='payroll_runs');
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: urutan DELETE tidak sesuai FK aktual. Perlu review schema.';
  END IF;
  -- Also stop on unreviewed logical references with no FK (no silent orphans).
  SELECT COUNT(*) INTO v_bad FROM information_schema.COLUMNS c
    LEFT JOIN _kr_plan p ON p.table_name=c.TABLE_NAME
    WHERE c.TABLE_SCHEMA=DATABASE() AND p.table_name IS NULL
      AND c.COLUMN_NAME IN ('employee_id','candidate_id','attendance_record_id',
        'contract_id','production_transaction_id','payroll_run_id');
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: referensi operasional di luar rencana (termasuk tanpa FK). Review schema.';
  END IF;
  -- Incoming cross-database FKs must never cascade into another application.
  SELECT COUNT(*) INTO v_bad FROM information_schema.KEY_COLUMN_USAGE k
    JOIN _kr_plan p ON p.table_name=k.REFERENCED_TABLE_NAME
    WHERE k.REFERENCED_TABLE_SCHEMA=DATABASE() AND k.TABLE_SCHEMA<>DATABASE();
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: ada FK dari database lain ke tabel target.';
  END IF;

  CREATE TEMPORARY TABLE _kr_preserved (
    seq INT AUTO_INCREMENT PRIMARY KEY,table_name VARCHAR(64) UNIQUE,
    before_count BIGINT DEFAULT 0,after_count BIGINT NULL
  ) ENGINE=InnoDB;
  INSERT INTO _kr_preserved(table_name)
    SELECT t.TABLE_NAME FROM information_schema.TABLES t
    LEFT JOIN _kr_plan p ON p.table_name=t.TABLE_NAME
    WHERE t.TABLE_SCHEMA=DATABASE() AND t.TABLE_TYPE='BASE TABLE'
      AND p.table_name IS NULL AND t.TABLE_NAME<>'audit_logs'
    ORDER BY t.TABLE_NAME;

  START TRANSACTION;
  SET v_transaction=1;
  SELECT COUNT(*) INTO v_employees FROM employees;
  SELECT COUNT(*) INTO v_candidates FROM recruitment_candidates;
  SELECT COUNT(*) INTO v_attendance FROM attendance_records;
  SELECT COUNT(*) INTO v_scans FROM attendance_scan_events;
  IF p_mode='EXECUTE' AND (p_employees<>v_employees OR p_employees<1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jumlah karyawan berubah/kosong. Jalankan preview ulang; jangan rerun setelah import.';
  END IF;
  IF p_mode='EXECUTE' AND (p_candidates<>v_candidates OR p_attendance<>v_attendance OR p_scans<>v_scans) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jumlah kandidat/attendance/scan berubah. Jalankan PREVIEW ulang.';
  END IF;
  SELECT (SELECT COUNT(*) FROM payroll_runs WHERE status='PROCESSING')
    +(SELECT COUNT(*) FROM attendance_daily_finalization_runs WHERE status='RUNNING')
    +(SELECT COUNT(*) FROM cron_runs WHERE status='RUNNING') INTO v_bad;
  IF p_mode='EXECUTE' AND v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: masih ada proses RUNNING/PROCESSING. Periksa proses sebelum reset.';
  END IF;

  SELECT MAX(seq) INTO v_max FROM _kr_plan;
  SET v_i=1;
  WHILE v_i<=v_max DO
    SELECT table_name INTO v_table FROM _kr_plan WHERE seq=v_i;
    SET @kr_sql=CONCAT('SELECT COUNT(*) INTO @kr_count FROM `',v_table,'`');
    PREPARE kr_stmt FROM @kr_sql; EXECUTE kr_stmt; DEALLOCATE PREPARE kr_stmt;
    UPDATE _kr_plan SET before_count=@kr_count WHERE seq=v_i;
    SET v_i=v_i+1;
  END WHILE;
  SELECT COALESCE(MAX(seq),0) INTO v_max FROM _kr_preserved;
  SET v_i=1;
  WHILE v_i<=v_max DO
    SELECT table_name INTO v_table FROM _kr_preserved WHERE seq=v_i;
    SET @kr_sql=CONCAT('SELECT COUNT(*) INTO @kr_count FROM `',REPLACE(v_table,'`','``'),'`');
    PREPARE kr_stmt FROM @kr_sql; EXECUTE kr_stmt; DEALLOCATE PREPARE kr_stmt;
    UPDATE _kr_preserved SET before_count=@kr_count WHERE seq=v_i;
    SET v_i=v_i+1;
  END WHILE;

  SELECT DATABASE() target_database,p_mode mode,'ALL_SITES_OPERATIONAL_REFRESH' scope,
    v_employees employees,v_candidates recruitment_candidates,v_attendance attendance_records,
    v_scans attendance_scan_events,v_bad active_processes;
  SELECT table_name,before_count,before_count planned_delete_count FROM _kr_plan ORDER BY seq;
  SELECT table_name,before_count FROM _kr_preserved ORDER BY seq;

  IF p_mode='PREVIEW' THEN
    ROLLBACK;
    SET v_transaction=0;
    SET SESSION SQL_SAFE_UPDATES=v_safe_updates;
    SET SESSION time_zone=v_time_zone;
    DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
    SELECT 'PREVIEW_ONLY_NO_APPLICATION_DATA_CHANGED' result;
    LEAVE main;
  END IF;

  SET SESSION SQL_SAFE_UPDATES=0;
  -- Only known FK cycle: period -> current run -> period.
  UPDATE payroll_periods SET current_run_id=NULL WHERE current_run_id IS NOT NULL;
  SELECT MAX(seq) INTO v_max FROM _kr_plan;
  SET v_i=1;
  WHILE v_i<=v_max DO
    SELECT table_name INTO v_table FROM _kr_plan WHERE seq=v_i;
    SET @kr_sql=CONCAT('DELETE FROM `',v_table,'`');
    PREPARE kr_stmt FROM @kr_sql; EXECUTE kr_stmt; DEALLOCATE PREPARE kr_stmt;
    SET @kr_sql=CONCAT('SELECT COUNT(*) INTO @kr_count FROM `',v_table,'`');
    PREPARE kr_stmt FROM @kr_sql; EXECUTE kr_stmt; DEALLOCATE PREPARE kr_stmt;
    UPDATE _kr_plan SET after_count=@kr_count WHERE seq=v_i;
    IF @kr_count<>0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: tabel operasional belum kosong; seluruh perubahan dibatalkan.';
    END IF;
    SET v_i=v_i+1;
  END WHILE;
  SELECT COALESCE(MAX(seq),0) INTO v_max FROM _kr_preserved;
  SET v_i=1;
  WHILE v_i<=v_max DO
    SELECT table_name INTO v_table FROM _kr_preserved WHERE seq=v_i;
    SET @kr_sql=CONCAT('SELECT COUNT(*) INTO @kr_count FROM `',REPLACE(v_table,'`','``'),'`');
    PREPARE kr_stmt FROM @kr_sql; EXECUTE kr_stmt; DEALLOCATE PREPARE kr_stmt;
    UPDATE _kr_preserved SET after_count=@kr_count WHERE seq=v_i;
    SET v_i=v_i+1;
  END WHILE;
  SELECT COUNT(*) INTO v_bad FROM _kr_preserved WHERE before_count<>after_count;
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jumlah master/config berubah; seluruh perubahan dibatalkan.';
  END IF;
  INSERT INTO audit_logs(uid,record_uid,module,action,table_name,description,reason,after_data)
    VALUES(UUID(),'4226d3f9-f128-4e25-a501-3f2d3f150727','SYSTEM','OTHER','employees',
      'Owner-run refresh data operasional sebelum import Klaten cutoff 26 November 2026.',
      'Persetujuan Owner: hapus operasional seluruh site; pertahankan master/config/users/files/sequence/audit/cron.',
      JSON_OBJECT('refreshVersion','20261127','scope','ALL_SITES','employeesDeleted',v_employees,
        'candidatesDeleted',v_candidates,'attendanceDeleted',v_attendance,'scanEventsDeleted',v_scans,
        'fileMetadataDeleted',0,'r2ObjectsDeleted',0));
  COMMIT;
  SET v_transaction=0;
  SET SESSION SQL_SAFE_UPDATES=v_safe_updates;
  DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
  SET SESSION time_zone=v_time_zone;
  SELECT 'KLATEN_REFRESH_CLEANSING_COMMITTED' result,'R2_UNCHANGED' storage_status;
  SELECT table_name,before_count,after_count FROM _kr_plan ORDER BY seq;
  SELECT table_name,before_count,after_count FROM _kr_preserved ORDER BY seq;
END$$
DELIMITER ;

CALL owner_klaten_refresh_cleansing_20261127(
  @klt_refresh_database,@klt_refresh_mode,
  @klt_refresh_backup_confirmed,@klt_refresh_writers_stopped,@klt_refresh_expected_employees,
  @klt_refresh_expected_candidates,@klt_refresh_expected_attendance,@klt_refresh_expected_scans
);
DROP PROCEDURE IF EXISTS owner_klaten_refresh_cleansing_20261127;
