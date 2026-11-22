-- Generated OWNER-RUN import. Contains personal data; keep outside version control.
-- Target: MariaDB 10.4+ existing HRIS schema. SQL client must support DELIMITER.
-- Source SHA256: __SOURCE_HASH__
-- Baseline: 2026-11-23. ALL 3725 rows; only 395 ACTIVE get operational assignments.
-- 1) Backup; deploy accompanying date/number fixes; run prerequisite migrations.
-- 2) Fill exact DB name below. Run entire file as SCRIPT in PREVIEW mode first.
-- 3) Stop app writers/public recruitment/workers/cron, set both confirmations=1,
--    mode EXECUTE, then run entire file. Success COMMITs; error rolls back.
-- No R2 downloads/uploads/deletes. No Attendance, Production or Payroll facts.
-- Replay of the SAME file returns ALREADY_IMPORTED; never overwrites employees.
-- Reconstructed contracts are metadata, not signed documents. See runbook.
SET NAMES utf8mb4;
SET time_zone='+07:00';
SET @klt_expected_database='ISI_NAMA_DATABASE_TARGET';
SET @klt_mode='PREVIEW';
SET @klt_backup_confirmed=0;
SET @klt_writers_stopped=0;

DROP TEMPORARY TABLE IF EXISTS _klt_source;
DROP TEMPORARY TABLE IF EXISTS _klt_contract_source;
DROP TEMPORARY TABLE IF EXISTS _klt_number_source;
CREATE TEMPORARY TABLE _klt_source (
  source_row INT PRIMARY KEY,uid CHAR(36) NOT NULL UNIQUE,
  employee_number VARCHAR(50) NOT NULL UNIQUE,type_code VARCHAR(30) NOT NULL,
  status_code VARCHAR(20) NOT NULL,module_code VARCHAR(30),section_code VARCHAR(30),
  full_name VARCHAR(150) NOT NULL,nickname VARCHAR(100),national_id_number VARCHAR(30) UNIQUE,
  family_card_number VARCHAR(30),gender VARCHAR(10) NOT NULL,birth_place VARCHAR(100),birth_date DATE,
  address TEXT,rtrw VARCHAR(7),kelurahan VARCHAR(100),kecamatan VARCHAR(100),city VARCHAR(100),
  education_level VARCHAR(30),religion VARCHAR(30),marital_status VARCHAR(20),phone VARCHAR(30),email VARCHAR(191) UNIQUE,
  bpjs_health_number VARCHAR(30),bpjs_employment_number VARCHAR(30),
  join_date DATE,join_date_training DATE,join_date_borong DATE,resign_date DATE,resign_reason VARCHAR(255),notes TEXT NOT NULL
) ENGINE=InnoDB;
CREATE TEMPORARY TABLE _klt_contract_source (
  uid CHAR(36) PRIMARY KEY,employee_uid CHAR(36) NOT NULL,contract_number VARCHAR(100) NOT NULL UNIQUE,
  type_code VARCHAR(30) NOT NULL,sequence_number INT NOT NULL,start_date DATE NOT NULL,end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL
) ENGINE=InnoDB;
CREATE TEMPORARY TABLE _klt_number_source (
  prefix CHAR(3) NOT NULL,join_date DATE NOT NULL,last_sequence INT NOT NULL,PRIMARY KEY(prefix,join_date)
) ENGINE=InnoDB;
-- __PAYLOAD__

DELIMITER $$
DROP PROCEDURE IF EXISTS owner_klaten_import_20261123$$
CREATE PROCEDURE owner_klaten_import_20261123(IN p_database VARCHAR(64),IN p_mode VARCHAR(10),IN p_backup INT,IN p_stopped INT)
SQL SECURITY INVOKER
main: BEGIN
  DECLARE v_bad BIGINT DEFAULT 0;
  DECLARE v_site BIGINT UNSIGNED;
  DECLARE v_shift BIGINT UNSIGNED;
  DECLARE v_safe INT DEFAULT 0;
  DECLARE v_tx INT DEFAULT 0;
  DECLARE v_lock INT DEFAULT 0;
  DECLARE v_contract_lock INT DEFAULT 0;
  DECLARE v_lock_name VARCHAR(64);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_tx=1 THEN ROLLBACK; END IF;
    SET SESSION SQL_SAFE_UPDATES=v_safe;
    IF v_contract_lock=1 THEN DO RELEASE_LOCK('hris:employee-contract-number'); END IF;
    IF v_lock=1 THEN DO RELEASE_LOCK(v_lock_name); END IF;
    RESIGNAL;
  END;
  SET v_safe=@@SESSION.SQL_SAFE_UPDATES;
  IF p_database IS NULL OR DATABASE() IS NULL OR BINARY p_database<>BINARY DATABASE()
    OR p_database='ISI_NAMA_DATABASE_TARGET' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: nama database target belum diisi/tidak cocok.';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('PREVIEW','EXECUTE') OR @@FOREIGN_KEY_CHECKS<>1 OR @@AUTOCOMMIT<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: mode PREVIEW/EXECUTE, FK aktif, koneksi baru autocommit=1 wajib.';
  END IF;
  IF p_mode='EXECUTE' AND (COALESCE(p_backup,0)<>1 OR COALESCE(p_stopped,0)<>1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: backup dan penghentian writer/cron wajib dikonfirmasi.';
  END IF;
  SET v_lock_name=CONCAT('klt-import:',LEFT(SHA2(DATABASE(),256),40));
  SELECT GET_LOCK(v_lock_name,0) INTO v_lock;
  IF COALESCE(v_lock,0)<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: import lain sedang berjalan.'; END IF;
  SELECT GET_LOCK('hris:employee-contract-number',0) INTO v_contract_lock;
  IF COALESCE(v_contract_lock,0)<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: generator nomor kontrak sedang dipakai.'; END IF;
  SET SESSION SQL_SAFE_UPDATES=0;
  SELECT COUNT(*) INTO v_bad FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='join_date' AND IS_NULLABLE='YES';
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jalankan migration nullable join_date dahulu.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM information_schema.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND
      (CONSTRAINT_NAME='chk_employees_join_phase_order'
       OR (CONSTRAINT_NAME='chk_employees_training_join_date' AND LOCATE('join_date_borong',CHECK_CLAUSE)>0));
  IF v_bad<>2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jalankan migration prasyarat fase join dan master legacy.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND ENGINE='InnoDB'
    AND TABLE_NAME IN ('employees','employee_types','employee_employment_histories','employee_contracts',
      'employee_contract_lifecycle_events','employee_shift_assignments','employee_job_assignments','employee_number_sequences','audit_logs');
  IF v_bad<>9 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: semua tabel import harus tersedia dan InnoDB.'; END IF;
  IF (SELECT COUNT(*) FROM _klt_source)<>__EMPLOYEE_COUNT__
    OR (SELECT COUNT(*) FROM _klt_source WHERE status_code='ACTIVE')<>__ACTIVE_COUNT__
    OR (SELECT COUNT(*) FROM _klt_contract_source)<>__CONTRACT_COUNT__ THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: staging tidak lengkap. Jalankan SELURUH file SQL.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM employee_types WHERE code='LEGACY_UNKNOWN' AND name='-' AND is_active=0;
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: master LEGACY_UNKNOWN harus label - dan nonaktif.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM sites WHERE code='KLATEN' AND employee_number_prefix='SLO' AND is_active=1;
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: site Klaten/prefix SLO tidak sesuai.'; END IF;
  SELECT id INTO v_site FROM sites WHERE code='KLATEN';
  SELECT COUNT(*) INTO v_bad FROM shifts WHERE site_id=v_site AND code='BORONGAN_DEFAULT' AND is_active=1
    AND start_time='06:00:00' AND end_time='15:00:00' AND crosses_midnight=0;
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: Shift Borongan Klaten 06:00-15:00 tidak tersedia/sesuai.'; END IF;
  SELECT id INTO v_shift FROM shifts WHERE site_id=v_site AND code='BORONGAN_DEFAULT';

  START TRANSACTION;
  SET v_tx=1;
  -- Audit marker is source-specific. A replay never updates imported data.
  SELECT COUNT(*) INTO v_bad FROM audit_logs WHERE record_uid='__IMPORT_UID__' AND action='OTHER' AND module='EMPLOYEES';
  IF v_bad>0 THEN
    IF (SELECT COUNT(*) FROM employees e JOIN _klt_source x ON x.uid=e.uid)<>__EMPLOYEE_COUNT__
      OR (SELECT COUNT(*) FROM employee_contracts c JOIN _klt_contract_source x ON x.uid=c.uid)<>__CONTRACT_COUNT__ THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: marker import ada tetapi data tidak lengkap. Jangan auto-repair/overwrite.';
    END IF;
    SELECT COUNT(*) INTO v_bad FROM _klt_source x JOIN employees e ON e.uid=x.uid
      WHERE x.status_code='ACTIVE' AND (
        NOT EXISTS(SELECT 1 FROM employee_shift_assignments a WHERE a.employee_id=e.id AND a.effective_from='2026-11-23')
        OR NOT EXISTS(SELECT 1 FROM employee_job_assignments a WHERE a.employee_id=e.id AND a.effective_from='2026-11-23')
        OR NOT EXISTS(SELECT 1 FROM employee_employment_histories h WHERE h.employee_id=e.id AND h.effective_from='2026-11-23')
      );
    IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: assignment baseline import sudah berubah/hilang. Review manual, tanpa overwrite.'; END IF;
    ROLLBACK; SET v_tx=0;
    SET SESSION SQL_SAFE_UPDATES=v_safe;
    DO RELEASE_LOCK('hris:employee-contract-number'); SET v_contract_lock=0;
    DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
    SELECT 'ALREADY_IMPORTED_NO_CHANGES' result;
    LEAVE main;
  END IF;
  IF (SELECT COUNT(*) FROM employees)<>0 OR (SELECT COUNT(*) FROM employee_employment_histories)<>0
    OR (SELECT COUNT(*) FROM employee_contracts)<>0 OR (SELECT COUNT(*) FROM employee_shift_assignments)<>0
    OR (SELECT COUNT(*) FROM employee_job_assignments)<>0 OR (SELECT COUNT(*) FROM attendance_records)<>0
    OR (SELECT COUNT(*) FROM production_transactions)<>0 OR (SELECT COUNT(*) FROM payroll_periods)<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: database operasional belum kosong. Import ini bukan merge/overwrite.';
  END IF;
  IF p_mode='EXECUTE' AND (
    (SELECT COUNT(*) FROM cron_runs WHERE status='RUNNING')>0 OR
    (SELECT COUNT(*) FROM attendance_daily_finalization_runs WHERE status='RUNNING')>0 OR
    (SELECT COUNT(*) FROM payroll_runs WHERE status='PROCESSING')>0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: proses background masih berjalan/tersangkut.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS _klt_resolved;
  CREATE TEMPORARY TABLE _klt_resolved ENGINE=InnoDB AS
    SELECT x.source_row,x.uid,et.id type_id,et.is_active type_active,es.id status_id,
      es.allows_attendance,es.allows_production,pms.id mapping_id,
      pj.id job_id,pj.position_id position_id
    FROM _klt_source x
    LEFT JOIN employee_types et ON et.code=x.type_code
    LEFT JOIN employee_statuses es ON es.code=x.status_code
    LEFT JOIN production_modules pm ON pm.site_id=v_site AND pm.code=x.module_code AND pm.is_active=1
    LEFT JOIN production_sections ps ON ps.code=x.section_code AND ps.is_active=1
    LEFT JOIN production_module_sections pms ON pms.production_module_id=pm.id AND pms.production_section_id=ps.id AND pms.is_active=1
    LEFT JOIN production_jobs pj ON pj.code=CONCAT('BORONGAN-',x.section_code) AND pj.is_active=1;
  SELECT COUNT(*) INTO v_bad FROM _klt_source x JOIN _klt_resolved r ON r.uid=x.uid
    WHERE r.type_id IS NULL OR r.status_id IS NULL
      OR (x.status_code='ACTIVE' AND (r.mapping_id IS NULL OR r.job_id IS NULL OR x.join_date IS NULL))
      OR (x.status_code='ACTIVE' AND (r.type_active<>1 OR r.allows_attendance<>1 OR r.allows_production<>1))
      OR (x.status_code<>'ACTIVE' AND (r.allows_attendance<>0 OR r.allows_production<>0))
      OR (x.type_code='LEGACY_UNKNOWN' AND x.status_code='ACTIVE');
  IF v_bad<>0 OR (SELECT COUNT(*) FROM _klt_resolved)<>__EMPLOYEE_COUNT__ THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: mapping master tidak lengkap/ambigu.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM _klt_source x JOIN _klt_resolved r ON r.uid=x.uid
    WHERE x.status_code='ACTIVE' AND (
      (SELECT COUNT(*) FROM production_job_rates rate WHERE rate.site_id=v_site AND rate.production_job_id=r.job_id
        AND rate.status='ACTIVE' AND rate.effective_from<='2026-11-23'
        AND (rate.effective_to IS NULL OR rate.effective_to>='2026-11-23'))<>1
    );
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: tarif aktif tanggal pilot hilang atau overlap.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM _klt_contract_source x LEFT JOIN contract_types ct ON ct.code=x.type_code AND ct.is_active=1
    WHERE ct.id IS NULL;
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: master jenis kontrak tidak tersedia.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM _klt_number_source n
    LEFT JOIN sites s ON s.employee_number_prefix=n.prefix WHERE s.id IS NULL;
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: prefix ID lama tidak dikenali master site.'; END IF;

  SELECT DATABASE() target_database,p_mode mode,'2026-11-23' baseline,
    __EMPLOYEE_COUNT__ employees,__ACTIVE_COUNT__ active_employees,__CONTRACT_COUNT__ contracts,
    __ACTIVE_COUNT__ shifts,__ACTIVE_COUNT__ primary_jobs;
  SELECT type_code,status_code,COUNT(*) total FROM _klt_source GROUP BY type_code,status_code;
  SELECT module_code,section_code,COUNT(*) total FROM _klt_source WHERE status_code='ACTIVE' GROUP BY module_code,section_code;
  SELECT status,COUNT(*) total,MIN(start_date) earliest_start,MAX(end_date) latest_end
    FROM _klt_contract_source GROUP BY status;
  SELECT COUNT(*) unknown_join_dates FROM _klt_source WHERE join_date IS NULL;
  IF p_mode='PREVIEW' THEN
    ROLLBACK; SET v_tx=0;
    SET SESSION SQL_SAFE_UPDATES=v_safe;
    DO RELEASE_LOCK('hris:employee-contract-number'); SET v_contract_lock=0;
    DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
    SELECT 'PREVIEW_ONLY_NO_APPLICATION_DATA_CHANGED' result;
    LEAVE main;
  END IF;

  INSERT INTO employees(uid,employee_number,employee_type_id,employee_status_id,current_site_id,
    current_production_module_section_id,full_name,nickname,national_id_number,family_card_number,gender,
    birth_place,birth_date,address,rtrw,kelurahan,kecamatan,city,education_level,religion,marital_status,phone,email,
    bpjs_health_number,bpjs_employment_number,join_date,join_date_training,join_date_borong,resign_date,resign_reason,notes)
  SELECT x.uid,x.employee_number,r.type_id,r.status_id,v_site,r.mapping_id,x.full_name,x.nickname,
    x.national_id_number,x.family_card_number,x.gender,x.birth_place,x.birth_date,x.address,x.rtrw,x.kelurahan,
    x.kecamatan,x.city,x.education_level,x.religion,x.marital_status,x.phone,x.email,x.bpjs_health_number,
    x.bpjs_employment_number,x.join_date,x.join_date_training,x.join_date_borong,x.resign_date,x.resign_reason,x.notes
  FROM _klt_source x JOIN _klt_resolved r ON r.uid=x.uid ORDER BY x.source_row;

  -- Current placement is known at pilot baseline only. Never invent earlier modules.
  INSERT INTO employee_employment_histories(uid,employee_id,site_id,production_module_section_id,
    employee_type_id,employee_status_id,effective_from,change_type,reason,notes)
  SELECT UUID(),e.id,v_site,r.mapping_id,r.type_id,r.status_id,'2026-11-23','INITIAL',
    'Baseline import Klaten, bukan rekonstruksi histori penempatan sejak join date.',
    'Import __SOURCE_HASH__: snapshot aktif per 23 November 2026.'
  FROM _klt_source x JOIN employees e ON e.uid=x.uid JOIN _klt_resolved r ON r.uid=x.uid WHERE x.status_code='ACTIVE';

  INSERT INTO employee_contracts(uid,employee_id,contract_number,contract_type_id,sequence_number,
    start_date,end_date,status,site_name_snapshot,terms_json,notes)
  SELECT x.uid,e.id,x.contract_number,ct.id,x.sequence_number,x.start_date,x.end_date,x.status,s.name,
    JSON_OBJECT('legacyImport',JSON_OBJECT('sourceHash','__SOURCE_HASH__','reconstructed',true,'signedDocument',false)),
    'Rekonstruksi import disetujui Owner: kontrak 12 bulan berantai dari join date. Bukan bukti dokumen bertanda tangan.'
  FROM _klt_contract_source x JOIN employees e ON e.uid=x.employee_uid
    JOIN contract_types ct ON ct.code=x.type_code JOIN sites s ON s.id=v_site;
  INSERT INTO employee_contract_lifecycle_events(uid,contract_id,from_status,to_status,effective_date,reason,source)
  SELECT UUID(),c.id,NULL,c.status,
    CASE WHEN c.status='EXPIRED' THEN DATE_ADD(c.end_date,INTERVAL 1 DAY) ELSE c.start_date END,
    'Snapshot lifecycle hasil rekonstruksi import Owner, bukan event historis yang direkam saat kejadian.','MANUAL'
  FROM employee_contracts c JOIN _klt_contract_source x ON x.uid=c.uid;

  INSERT INTO employee_shift_assignments(uid,employee_id,shift_id,effective_from,work_days_json)
  SELECT UUID(),e.id,v_shift,'2026-11-23',JSON_ARRAY(1,2,3,4,5)
    FROM employees e JOIN _klt_source x ON x.uid=e.uid WHERE x.status_code='ACTIVE';
  INSERT INTO employee_job_assignments(uid,employee_id,production_job_id,site_id,effective_from,is_primary,status)
  SELECT UUID(),e.id,r.job_id,v_site,'2026-11-23',1,'ACTIVE'
    FROM employees e JOIN _klt_source x ON x.uid=e.uid JOIN _klt_resolved r ON r.uid=x.uid WHERE x.status_code='ACTIVE';
  INSERT INTO employee_number_sequences(site_id,join_date,last_sequence)
  SELECT s.id,n.join_date,n.last_sequence FROM _klt_number_source n JOIN sites s ON s.employee_number_prefix=n.prefix
  ON DUPLICATE KEY UPDATE last_sequence=GREATEST(employee_number_sequences.last_sequence,VALUES(last_sequence));

  IF (SELECT COUNT(*) FROM employees)<>__EMPLOYEE_COUNT__
    OR (SELECT COUNT(*) FROM employees e JOIN employee_statuses es ON es.id=e.employee_status_id WHERE es.code='ACTIVE')<>__ACTIVE_COUNT__
    OR (SELECT COUNT(*) FROM employee_contracts)<>__CONTRACT_COUNT__
    OR (SELECT COUNT(*) FROM employee_contract_lifecycle_events)<>__CONTRACT_COUNT__
    OR (SELECT COUNT(*) FROM employee_shift_assignments)<>__ACTIVE_COUNT__
    OR (SELECT COUNT(*) FROM employee_job_assignments)<>__ACTIVE_COUNT__
    OR (SELECT COUNT(*) FROM employee_employment_histories)<>__ACTIVE_COUNT__ THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jumlah hasil import tidak sesuai; rollback.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM employees e JOIN _klt_source x ON x.uid=e.uid
    WHERE x.status_code='ACTIVE' AND (
      (SELECT COUNT(*) FROM employee_contracts c WHERE c.employee_id=e.id AND c.status='ACTIVE'
        AND c.start_date<='2026-11-23' AND c.end_date>='2026-11-23')<>1
      OR e.join_date IS NULL OR e.national_id_number IS NULL
    );
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: kelengkapan kontrak/barcode/NIK aktif tidak sesuai; rollback.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM employees e JOIN _klt_source x ON x.uid=e.uid
    WHERE NOT(e.barcode<=>x.employee_number);
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: barcode kosong/berbeda dari ID sumber; periksa generated column/trigger.'; END IF;
  INSERT INTO audit_logs(uid,module,action,table_name,record_uid,description,reason,after_data)
  VALUES(UUID(),'EMPLOYEES','OTHER','employees','__IMPORT_UID__','Owner-run import legacy Klaten per cutoff 22 November 2026.',
    'Seluruh data diarsipkan; 395 aktif disiapkan untuk pilot 23 November 2026.',
    JSON_OBJECT('sourceHash','__SOURCE_HASH__','employees',__EMPLOYEE_COUNT__,'active',__ACTIVE_COUNT__,
      'contracts',__CONTRACT_COUNT__,'baseline','2026-11-23','reconstructedContracts',true));
  COMMIT; SET v_tx=0;
  SET SESSION SQL_SAFE_UPDATES=v_safe;
  DO RELEASE_LOCK('hris:employee-contract-number'); SET v_contract_lock=0;
  DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
  SELECT 'KLATEN_IMPORT_COMMITTED' result;
END$$
DELIMITER ;
CALL owner_klaten_import_20261123(@klt_expected_database,@klt_mode,@klt_backup_confirmed,@klt_writers_stopped);
DROP PROCEDURE IF EXISTS owner_klaten_import_20261123;
