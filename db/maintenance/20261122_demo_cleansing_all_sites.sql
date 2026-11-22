-- OWNER-RUN ONLY. Approved scope: ALL SITES, including demo recruitment.
-- NOT a migration. NEVER run this file from startup/deployment/cron.
-- MariaDB 10.4+ / MySQL 8.0. Run as a SCRIPT (DELIMITER support required).
-- Requires CREATE ROUTINE, temporary tables, SELECT, DELETE, UPDATE, INSERT.
-- Persistent application schema is unchanged; one helper routine is created/dropped.
--
-- 1. Backup the full target DB; retain R2 objects needed to restore that backup.
-- 2. Fill expected_database with the EXACT database name. Leave mode PREVIEW.
-- 3. Run entire script; inspect counts and SAVE file manifest result as CSV.
-- 4. Stop application writers, public recruitment, workers and all cron jobs.
-- 5. Set mode EXECUTE, both confirmations to 1, and expected_employees to the
--    PREVIEW employee count. Run entire script once. EXECUTE COMMITS ON SUCCESS.
-- On any SQL error inside the routine: ROLLBACK + rethrow. Do not bypass errors.
-- FK checks stay enabled. No TRUNCATE, AUTO_INCREMENT reset or sequence reset.
-- Does NOT delete any R2 object, audit history, cron history, master or config.
-- NEVER rerun EXECUTE after real employee import / opening the pilot.
-- Use a fresh connection with no existing transaction.

SET @cleansing_expected_database = 'ISI_NAMA_DATABASE_TARGET';
SET @cleansing_mode = 'PREVIEW'; -- PREVIEW or EXECUTE
SET @cleansing_backup_confirmed = 0;
SET @cleansing_writers_stopped = 0;
SET @cleansing_expected_employees = NULL; -- exact count from PREVIEW

DELIMITER $$
DROP PROCEDURE IF EXISTS owner_demo_cleansing_20261122$$
CREATE PROCEDURE owner_demo_cleansing_20261122(
  IN p_database VARCHAR(64), IN p_mode VARCHAR(10),
  IN p_backup INT, IN p_stopped INT, IN p_employees BIGINT
)
SQL SECURITY INVOKER
main: BEGIN
  DECLARE v_i INT DEFAULT 0;
  DECLARE v_max INT DEFAULT 0;
  DECLARE v_bad BIGINT DEFAULT 0;
  DECLARE v_employees BIGINT DEFAULT 0;
  DECLARE v_files BIGINT DEFAULT 0;
  DECLARE v_table VARCHAR(64);
  DECLARE v_column VARCHAR(64);
  DECLARE v_safe_updates INT DEFAULT 0;
  DECLARE v_transaction INT DEFAULT 0;
  DECLARE v_lock INT DEFAULT 0;
  DECLARE v_lock_name VARCHAR(64);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_transaction=1 THEN ROLLBACK; END IF;
    SET SESSION SQL_SAFE_UPDATES=v_safe_updates;
    IF v_lock=1 THEN DO RELEASE_LOCK(v_lock_name); END IF;
    RESIGNAL;
  END;

  SET v_safe_updates=@@SESSION.SQL_SAFE_UPDATES;
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
  IF p_mode='EXECUTE' AND (COALESCE(p_backup,0)<>1 OR COALESCE(p_stopped,0)<>1 OR p_employees IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: wajib backup, hentikan seluruh writer/cron dan isi jumlah karyawan hasil preview.';
  END IF;
  SET v_lock_name=CONCAT('gc20261122:',LEFT(SHA2(DATABASE(),256),40));
  SELECT GET_LOCK(v_lock_name,0) INTO v_lock;
  IF COALESCE(v_lock,0)<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: cleansing lain sedang berjalan.';
  END IF;
  -- Temporary-table bookkeeping also uses joins without a key predicate.
  SET SESSION SQL_SAFE_UPDATES=0;

  DROP TEMPORARY TABLE IF EXISTS _gc_plan;
  DROP TEMPORARY TABLE IF EXISTS _gc_preserved;
  DROP TEMPORARY TABLE IF EXISTS _gc_file_refs;
  DROP TEMPORARY TABLE IF EXISTS _gc_keep_files;
  DROP TEMPORARY TABLE IF EXISTS _gc_delete_files;
  CREATE TEMPORARY TABLE _gc_plan (
    seq INT PRIMARY KEY, table_name VARCHAR(64) NOT NULL UNIQUE,
    before_count BIGINT NOT NULL DEFAULT 0, after_count BIGINT NULL
  ) ENGINE=InnoDB;
  -- Explicit inventory and child-before-parent order. files is PARTIAL cleanup.
  INSERT INTO _gc_plan(seq,table_name) VALUES
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
    (53,'employees'),
    (54,'files');

  SELECT COUNT(*) INTO v_bad FROM _gc_plan p
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
    LEFT JOIN _gc_plan p ON p.table_name=t.EVENT_OBJECT_TABLE
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
  DROP TEMPORARY TABLE IF EXISTS _gc_fk;
  CREATE TEMPORARY TABLE _gc_fk ENGINE=InnoDB AS
    SELECT k.TABLE_NAME child_table,k.COLUMN_NAME child_column,
      k.REFERENCED_TABLE_NAME parent_table,k.REFERENCED_COLUMN_NAME parent_column,
      k.REFERENCED_TABLE_SCHEMA parent_schema,
      CAST(NULL AS SIGNED) child_seq,CAST(NULL AS SIGNED) parent_seq
    FROM information_schema.KEY_COLUMN_USAGE k
    WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL;
  UPDATE _gc_fk f JOIN _gc_plan p ON p.table_name=f.child_table SET f.child_seq=p.seq;
  UPDATE _gc_fk f JOIN _gc_plan p ON p.table_name=f.parent_table
    AND f.parent_schema=DATABASE() SET f.parent_seq=p.seq;
  SELECT COUNT(*) INTO v_bad FROM _gc_fk
    WHERE parent_seq IS NOT NULL AND parent_table<>'files' AND child_seq IS NULL;
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: tabel di luar rencana mereferensikan target. Perlu review dependency baru.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM _gc_fk
    WHERE child_seq>=parent_seq AND NOT
      (child_table='payroll_periods' AND child_column='current_run_id' AND parent_table='payroll_runs');
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: urutan DELETE tidak sesuai FK aktual. Perlu review schema.';
  END IF;
  -- Incoming cross-database FKs must never cascade into another application.
  SELECT COUNT(*) INTO v_bad FROM information_schema.KEY_COLUMN_USAGE k
    JOIN _gc_plan p ON p.table_name=k.REFERENCED_TABLE_NAME
    WHERE k.REFERENCED_TABLE_SCHEMA=DATABASE() AND k.TABLE_SCHEMA<>DATABASE();
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: ada FK dari database lain ke tabel target.';
  END IF;

  CREATE TEMPORARY TABLE _gc_keep_files (id BIGINT UNSIGNED PRIMARY KEY) ENGINE=InnoDB;
  CREATE TEMPORARY TABLE _gc_delete_files (
    id BIGINT UNSIGNED PRIMARY KEY,uid CHAR(36),storage_provider VARCHAR(20),storage_path VARCHAR(500)
  ) ENGINE=InnoDB;
  CREATE TEMPORARY TABLE _gc_file_refs (
    seq INT AUTO_INCREMENT PRIMARY KEY,table_name VARCHAR(64),column_name VARCHAR(64)
  ) ENGINE=InnoDB;
  INSERT INTO _gc_file_refs(table_name,column_name)
    SELECT DISTINCT child_table,child_column FROM _gc_fk
    WHERE parent_schema=DATABASE() AND parent_table='files' AND child_seq IS NULL;
  SELECT COUNT(*) INTO v_bad FROM _gc_fk
    WHERE parent_schema=DATABASE() AND parent_table='files' AND parent_column<>'id';
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: referensi files selain id membutuhkan review.';
  END IF;
  CREATE TEMPORARY TABLE _gc_preserved (
    seq INT AUTO_INCREMENT PRIMARY KEY,table_name VARCHAR(64) UNIQUE,
    before_count BIGINT DEFAULT 0,after_count BIGINT NULL
  ) ENGINE=InnoDB;
  INSERT INTO _gc_preserved(table_name)
    SELECT t.TABLE_NAME FROM information_schema.TABLES t
    LEFT JOIN _gc_plan p ON p.table_name=t.TABLE_NAME
    WHERE t.TABLE_SCHEMA=DATABASE() AND t.TABLE_TYPE='BASE TABLE'
      AND p.table_name IS NULL AND t.TABLE_NAME<>'audit_logs'
    ORDER BY t.TABLE_NAME;

  START TRANSACTION;
  SET v_transaction=1;
  SELECT COUNT(*) INTO v_employees FROM employees;
  IF p_mode='EXECUTE' AND (p_employees<>v_employees OR p_employees<1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jumlah karyawan berubah/kosong. Jalankan preview ulang; jangan rerun setelah import.';
  END IF;
  SELECT (SELECT COUNT(*) FROM payroll_runs WHERE status='PROCESSING')
    +(SELECT COUNT(*) FROM attendance_daily_finalization_runs WHERE status='RUNNING')
    +(SELECT COUNT(*) FROM cron_runs WHERE status='RUNNING') INTO v_bad;
  IF p_mode='EXECUTE' AND v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: masih ada proses RUNNING/PROCESSING. Periksa proses sebelum reset.';
  END IF;

  -- Protect every file referenced by retained-table FKs (including templates).
  SELECT COALESCE(MAX(seq),0) INTO v_max FROM _gc_file_refs;
  SET v_i=1;
  WHILE v_i<=v_max DO
    SELECT table_name,column_name INTO v_table,v_column FROM _gc_file_refs WHERE seq=v_i;
    SET @gc_sql=CONCAT('INSERT IGNORE INTO _gc_keep_files(id) SELECT f.id FROM files f JOIN `',
      REPLACE(v_table,'`','``'),'` r ON r.`',REPLACE(v_column,'`','``'),'`=f.id');
    PREPARE gc_stmt FROM @gc_sql; EXECUTE gc_stmt; DEALLOCATE PREPARE gc_stmt;
    SET v_i=v_i+1;
  END WHILE;
  -- Protect logical references in JSON/settings as well as obvious asset paths.
  -- Scan settings internally, including secret settings; never print their values.
  INSERT IGNORE INTO _gc_keep_files(id)
    SELECT f.id FROM files f WHERE EXISTS (
      SELECT 1 FROM system_settings s WHERE
        LOCATE(f.uid,CAST(s.setting_value AS CHAR))>0
        OR (f.storage_path<>'' AND LOCATE(f.storage_path,CAST(s.setting_value AS CHAR))>0)
    ) OR LOWER(f.storage_path) REGEXP '(^|/)(settings|assets|templates|company-logo)(/|$)'
      OR LOWER(f.storage_path) REGEXP '(^|/)[^/]*logo[^/]*$';
  -- Templates can embed assets in HTML/JSON without a foreign key.
  INSERT IGNORE INTO _gc_keep_files(id)
    SELECT f.id FROM files f WHERE EXISTS (
      SELECT 1 FROM document_templates t WHERE
        LOCATE(f.uid,CONCAT(COALESCE(t.template_content,''),' ',COALESCE(CAST(t.config_json AS CHAR),'')))>0
        OR (f.storage_path<>'' AND LOCATE(f.storage_path,
          CONCAT(COALESCE(t.template_content,''),' ',COALESCE(CAST(t.config_json AS CHAR),'')))>0)
    );
  INSERT INTO _gc_delete_files(id,uid,storage_provider,storage_path)
    SELECT f.id,f.uid,f.storage_provider,f.storage_path FROM files f
      LEFT JOIN _gc_keep_files k ON k.id=f.id WHERE k.id IS NULL;
  SELECT COUNT(*) INTO v_files FROM _gc_delete_files;

  SELECT MAX(seq) INTO v_max FROM _gc_plan;
  SET v_i=1;
  WHILE v_i<=v_max DO
    SELECT table_name INTO v_table FROM _gc_plan WHERE seq=v_i;
    SET @gc_sql=CONCAT('SELECT COUNT(*) INTO @gc_count FROM `',v_table,'`');
    PREPARE gc_stmt FROM @gc_sql; EXECUTE gc_stmt; DEALLOCATE PREPARE gc_stmt;
    UPDATE _gc_plan SET before_count=@gc_count WHERE seq=v_i;
    SET v_i=v_i+1;
  END WHILE;
  SELECT COALESCE(MAX(seq),0) INTO v_max FROM _gc_preserved;
  SET v_i=1;
  WHILE v_i<=v_max DO
    SELECT table_name INTO v_table FROM _gc_preserved WHERE seq=v_i;
    SET @gc_sql=CONCAT('SELECT COUNT(*) INTO @gc_count FROM `',REPLACE(v_table,'`','``'),'`');
    PREPARE gc_stmt FROM @gc_sql; EXECUTE gc_stmt; DEALLOCATE PREPARE gc_stmt;
    UPDATE _gc_preserved SET before_count=@gc_count WHERE seq=v_i;
    SET v_i=v_i+1;
  END WHILE;

  SELECT DATABASE() target_database,p_mode mode,'ALL_SITES' scope,
    v_employees employees,v_files file_metadata_to_delete,v_bad active_processes;
  SELECT table_name,before_count,
    CASE WHEN table_name='files' THEN v_files ELSE before_count END planned_delete_count
    FROM _gc_plan ORDER BY seq;
  -- EXPORT THIS RESULT before execution. Metadata deletion does NOT delete R2.
  -- Resolve bucket from original storage setup, not storage_provider (S3).
  -- Only exact keys below may be considered later; NEVER clear shared bucket-satu.
  SELECT 'DELETE_METADATA_ONLY' action,uid,storage_provider,storage_path FROM _gc_delete_files ORDER BY id;
  SELECT 'KEEP_ASSET' action,f.uid,f.storage_provider,f.storage_path
    FROM files f JOIN _gc_keep_files k ON k.id=f.id ORDER BY f.id;

  IF p_mode='PREVIEW' THEN
    ROLLBACK;
    SET v_transaction=0;
    SET SESSION SQL_SAFE_UPDATES=v_safe_updates;
    DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
    SELECT 'PREVIEW_ONLY_NO_APPLICATION_DATA_CHANGED' result;
    LEAVE main;
  END IF;

  SET SESSION SQL_SAFE_UPDATES=0;
  -- Only known FK cycle: period -> current run -> period.
  UPDATE payroll_periods SET current_run_id=NULL WHERE current_run_id IS NOT NULL;
  SELECT MAX(seq) INTO v_max FROM _gc_plan;
  SET v_i=1;
  WHILE v_i<=v_max DO
    SELECT table_name INTO v_table FROM _gc_plan WHERE seq=v_i;
    IF v_table='files' THEN
      DELETE f FROM files f JOIN _gc_delete_files d ON d.id=f.id;
    ELSE
      SET @gc_sql=CONCAT('DELETE FROM `',v_table,'`');
      PREPARE gc_stmt FROM @gc_sql; EXECUTE gc_stmt; DEALLOCATE PREPARE gc_stmt;
    END IF;
    SET @gc_sql=CONCAT('SELECT COUNT(*) INTO @gc_count FROM `',v_table,'`');
    PREPARE gc_stmt FROM @gc_sql; EXECUTE gc_stmt; DEALLOCATE PREPARE gc_stmt;
    UPDATE _gc_plan SET after_count=@gc_count WHERE seq=v_i;
    IF v_table<>'files' AND @gc_count<>0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: tabel operasional belum kosong; seluruh perubahan dibatalkan.';
    END IF;
    SET v_i=v_i+1;
  END WHILE;
  SELECT COUNT(*) INTO v_bad FROM files f JOIN _gc_delete_files d ON d.id=f.id;
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: file demo belum bersih; rollback.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM _gc_keep_files k LEFT JOIN files f ON f.id=k.id WHERE f.id IS NULL;
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: file aset yang dilindungi hilang; rollback.';
  END IF;
  SELECT COALESCE(MAX(seq),0) INTO v_max FROM _gc_preserved;
  SET v_i=1;
  WHILE v_i<=v_max DO
    SELECT table_name INTO v_table FROM _gc_preserved WHERE seq=v_i;
    SET @gc_sql=CONCAT('SELECT COUNT(*) INTO @gc_count FROM `',REPLACE(v_table,'`','``'),'`');
    PREPARE gc_stmt FROM @gc_sql; EXECUTE gc_stmt; DEALLOCATE PREPARE gc_stmt;
    UPDATE _gc_preserved SET after_count=@gc_count WHERE seq=v_i;
    SET v_i=v_i+1;
  END WHILE;
  SELECT COUNT(*) INTO v_bad FROM _gc_preserved WHERE before_count<>after_count;
  IF v_bad<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jumlah master/config berubah; seluruh perubahan dibatalkan.';
  END IF;
  INSERT INTO audit_logs(uid,module,action,table_name,description,reason,after_data)
    VALUES(UUID(),'SYSTEM','OTHER','employees',
      'Owner-run cleansing data demo seluruh site sebelum pilot Klaten.',
      'Persetujuan Owner: reset demo, pertahankan master/config/aset/sequence/audit.',
      JSON_OBJECT('scope','ALL_SITES','employeesDeleted',v_employees,'fileMetadataDeleted',v_files,'r2ObjectsDeleted',0));
  COMMIT;
  SET v_transaction=0;
  SET SESSION SQL_SAFE_UPDATES=v_safe_updates;
  DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
  SELECT 'CLEANSING_COMMITTED' result,'R2_UNCHANGED' storage_status;
  SELECT table_name,before_count,after_count FROM _gc_plan ORDER BY seq;
  SELECT table_name,before_count,after_count FROM _gc_preserved ORDER BY seq;
END$$
DELIMITER ;

CALL owner_demo_cleansing_20261122(
  @cleansing_expected_database,@cleansing_mode,
  @cleansing_backup_confirmed,@cleansing_writers_stopped,@cleansing_expected_employees
);
DROP PROCEDURE IF EXISTS owner_demo_cleansing_20261122;
