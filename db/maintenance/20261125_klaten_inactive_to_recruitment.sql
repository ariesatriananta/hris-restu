-- OWNER-RUN ONLY. Approved scope: original Klaten NON AKTIF = 722 candidates.
-- Back up first; deploy supporting code and prerequisite schema; stop ALL API/cron writers.
-- PREVIEW first (transaction rolled back), then EXECUTE with confirmations. Run WHOLE file.
-- No R2/files, employee-number sequence, ACTIVE or RESIGNED employee is modified.
-- Requires MariaDB 10.4+, CREATE ROUTINE, temporary tables. Foreign keys stay ON.
SET @klt_move_database='ISI_NAMA_DATABASE_TARGET';
SET @klt_move_mode='PREVIEW';
SET @klt_move_backup_confirmed=0;
SET @klt_move_writers_stopped=0;

DELIMITER $$
DROP PROCEDURE IF EXISTS owner_klaten_candidates_20261125$$
CREATE PROCEDURE owner_klaten_candidates_20261125(
 IN p_database VARCHAR(64),IN p_mode VARCHAR(10),IN p_backup INT,IN p_stopped INT
)
SQL SECURITY INVOKER
main: BEGIN
 DECLARE v_hash CHAR(64) DEFAULT 'f5b8dd224012b1f3f439e8bbed65f15146784ef2e0ec0b7e14a8af28fdf55afc';
 DECLARE v_marker CHAR(36) DEFAULT '76867708-9582-5b96-99fb-746fc588b6ca';
 DECLARE v_site BIGINT UNSIGNED;
 DECLARE v_bad BIGINT DEFAULT 0;
 DECLARE v_count BIGINT DEFAULT 0;
 DECLARE v_done INT DEFAULT 0;
 DECLARE v_tx INT DEFAULT 0;
 DECLARE v_lock INT DEFAULT 0;
 DECLARE v_safe INT;
 DECLARE v_concat BIGINT UNSIGNED;
 DECLARE v_zone VARCHAR(64);
 DECLARE v_lock_name VARCHAR(64);
 DECLARE v_table VARCHAR(64);
 DECLARE v_column VARCHAR(64);
 DECLARE v_json LONGTEXT;
 DECLARE v_now DATETIME(3);
 -- Catch every physical FK, including SET NULL/CASCADE, plus logical employee-id columns.
 DECLARE dependencies CURSOR FOR
 SELECT DISTINCT c.TABLE_NAME,c.COLUMN_NAME FROM information_schema.COLUMNS c
 WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME NOT IN ('employees','employee_documents')
 AND (c.COLUMN_NAME REGEXP '(^|_)employee_id$' OR EXISTS(
   SELECT 1 FROM information_schema.KEY_COLUMN_USAGE k
   WHERE k.TABLE_SCHEMA=c.TABLE_SCHEMA AND k.TABLE_NAME=c.TABLE_NAME AND k.COLUMN_NAME=c.COLUMN_NAME
    AND k.REFERENCED_TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME='employees'
    AND k.REFERENCED_COLUMN_NAME='id'));
 DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done=1;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION
 BEGIN
  IF v_tx=1 THEN ROLLBACK; END IF;
  SET SESSION SQL_SAFE_UPDATES=v_safe;
  SET SESSION group_concat_max_len=v_concat;
  SET SESSION time_zone=v_zone;
  IF v_lock=1 THEN DO RELEASE_LOCK(v_lock_name); END IF;
  RESIGNAL;
 END;
 SET v_safe=@@SESSION.SQL_SAFE_UPDATES,v_concat=@@SESSION.group_concat_max_len,v_zone=@@SESSION.time_zone;
 IF p_database IS NULL OR DATABASE() IS NULL OR BINARY p_database<>BINARY DATABASE()
  OR p_database='ISI_NAMA_DATABASE_TARGET' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: nama database target tidak tepat.';
 END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('PREVIEW','EXECUTE') OR @@AUTOCOMMIT<>1 OR @@FOREIGN_KEY_CHECKS<>1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: gunakan PREVIEW/EXECUTE, koneksi baru autocommit=1 dan FK aktif.';
 END IF;
 IF p_mode='EXECUTE' AND (COALESCE(p_backup,0)<>1 OR COALESCE(p_stopped,0)<>1) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: backup dan penghentian semua writer wajib dikonfirmasi.';
 END IF;
 SET v_lock_name=CONCAT('klt-import:',LEFT(SHA2(DATABASE(),256),40));
 SELECT GET_LOCK(v_lock_name,0) INTO v_lock;
 IF COALESCE(v_lock,0)<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: import/perapian lain sedang berjalan.'; END IF;
 SET SESSION SQL_SAFE_UPDATES=0;
 SET SESSION group_concat_max_len=16777216;
 SET SESSION time_zone='+00:00';
 SET v_now=UTC_TIMESTAMP(3);
 SELECT COUNT(*) INTO v_bad FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='recruitment_candidates' AND COLUMN_NAME='legacy_import_json')
 OR (TABLE_NAME='recruitment_candidate_files' AND COLUMN_NAME='external_url'));
 IF v_bad<>2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jalankan migration recruitment legacy dahulu.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME='recruitment_candidates_legacy_immutable';
 IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: trigger perlindungan snapshot belum terpasang.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
  AND ENGINE='InnoDB' AND TABLE_NAME IN ('employees','employee_documents','recruitment_candidates','recruitment_candidate_files','recruitment_status_events','audit_logs');
 IF v_bad<>6 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: semua tabel yang diubah wajib InnoDB.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM sites WHERE code='KLATEN' AND is_active=1;
 IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: site Klaten tidak sesuai.'; END IF;
 SELECT id INTO v_site FROM sites WHERE code='KLATEN' AND is_active=1;
 START TRANSACTION; SET v_tx=1;
 DROP TEMPORARY TABLE IF EXISTS _klt_candidate_source;
 DROP TEMPORARY TABLE IF EXISTS _klt_candidate_docs;
 CREATE TEMPORARY TABLE _klt_candidate_source(
  id BIGINT UNSIGNED PRIMARY KEY,uid CHAR(36) NOT NULL UNIQUE, employee_number VARCHAR(50) NOT NULL,
  snapshot JSON NULL, docs JSON NULL
 ) ENGINE=InnoDB;
 INSERT INTO _klt_candidate_source(id,uid,employee_number)
 SELECT e.id,e.uid,e.employee_number FROM employees e
 JOIN employee_statuses es ON es.id=e.employee_status_id
 WHERE e.current_site_id=v_site AND es.code='INACTIVE'
  AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(e.notes),e.notes,'{}'),'$.legacyImport.sourceHash'))=v_hash
  AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(e.notes),e.notes,'{}'),'$.legacyImport.raw."12:STATUS (Aktif/Tidak Aktif)"'))='NON AKTIF';
 SELECT COUNT(*) INTO v_count FROM _klt_candidate_source;
 IF v_count=0 THEN
  -- A replay is safe only for the completed migration with intact immutable snapshots.
  SELECT COUNT(*) INTO v_bad FROM audit_logs WHERE record_uid=v_marker AND module='RECRUITMENT'
   AND JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.sourceHash'))=v_hash;
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: sumber kosong tanpa marker migrasi selesai.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM recruitment_candidates
   WHERE JSON_UNQUOTE(JSON_EXTRACT(legacy_import_json,'$.sourceHash'))=v_hash;
  IF v_bad<>722 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: replay tidak cocok dengan 722 snapshot kandidat.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM recruitment_candidates c JOIN employees e
   ON e.uid=JSON_UNQUOTE(JSON_EXTRACT(c.legacy_import_json,'$.sourceEmployee.uid'))
   WHERE JSON_UNQUOTE(JSON_EXTRACT(c.legacy_import_json,'$.sourceHash'))=v_hash
     AND c.status<>'CONVERTED';
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: karyawan sumber muncul kembali tanpa konversi kandidat.'; END IF;
  ROLLBACK; SET v_tx=0;
  SET SESSION SQL_SAFE_UPDATES=v_safe; SET SESSION group_concat_max_len=v_concat; SET SESSION time_zone=v_zone;
  DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
  SELECT 'ALREADY_MOVED_NO_CHANGES' result; LEAVE main;
 END IF;
 IF v_count<>722 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: scope sumber tidak tepat 722. Review ulang data.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM employees e JOIN _klt_candidate_source s ON s.id=e.id
 JOIN employee_types et ON et.id=e.employee_type_id
 WHERE et.code NOT IN ('LEGACY_UNKNOWN','TRAINING') OR e.photo_file_id IS NOT NULL
 OR e.gender NOT IN ('MALE','FEMALE','LAKI-LAKI','PEREMPUAN');
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jenis/foto sumber berubah, perlu review.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM employees e JOIN _klt_candidate_source s ON s.id=e.id
 JOIN employee_types et ON et.id=e.employee_type_id WHERE et.code='LEGACY_UNKNOWN';
 IF v_bad<>621 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: komposisi 621 unknown + 101 training berubah.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM recruitment_candidates c JOIN _klt_candidate_source s
  ON c.uid=s.uid OR c.idempotency_key=CONCAT('legacy-klt:',s.uid) OR c.application_number=CONCAT('LEG-KLT-',s.id)
  OR (c.active_national_id_number IS NOT NULL AND c.active_national_id_number=(SELECT e.national_id_number FROM employees e WHERE e.id=s.id));
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: kandidat sumber sudah ada/identitas berbenturan. Tidak menimpa.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM audit_logs a JOIN _klt_candidate_source s
 ON (a.table_name='employees' AND a.record_id=s.id) OR a.record_uid=s.uid;
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: audit per karyawan sudah ada; perlu review histori.'; END IF;
 -- Full physical/logical dependency scan before deleting any source data.
 OPEN dependencies;
 dep_loop: LOOP
  FETCH dependencies INTO v_table,v_column;
  IF v_done=1 THEN LEAVE dep_loop; END IF;
  SET @klt_dependency_count=0;
  SET @klt_move_sql=CONCAT('SELECT COUNT(*) INTO @klt_dependency_count FROM `',REPLACE(v_table,'`','``'),
   '` d JOIN _klt_candidate_source s ON d.`',REPLACE(v_column,'`','``'),'`=s.id');
  PREPARE klt_move_stmt FROM @klt_move_sql; EXECUTE klt_move_stmt; DEALLOCATE PREPARE klt_move_stmt;
  IF @klt_dependency_count<>0 THEN
   SET @klt_dependency_message=CONCAT('STOP: relasi ',v_table,'.',v_column,' sudah digunakan.');
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=@klt_dependency_message;
  END IF;
 END LOOP;
 CLOSE dependencies;
 SELECT COUNT(*) INTO v_bad FROM attendance_scan_events a JOIN _klt_candidate_source s ON a.barcode_value=s.employee_number;
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: barcode sumber sudah dipakai scan.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM payroll_employee_results p JOIN _klt_candidate_source s ON p.employee_number_snapshot=s.employee_number;
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: nomor sumber ada di snapshot payroll.'; END IF;
 IF p_mode='EXECUTE' AND (SELECT COUNT(*) FROM cron_runs WHERE status='RUNNING')<>0 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: cron masih RUNNING.';
 END IF;
 CREATE TEMPORARY TABLE _klt_candidate_docs ENGINE=InnoDB AS
 SELECT d.id,d.uid,d.employee_id,d.document_type,d.external_url FROM employee_documents d JOIN _klt_candidate_source s ON s.id=d.employee_id;
 SELECT COUNT(*) INTO v_bad FROM recruitment_status_events ev JOIN _klt_candidate_source s
  ON ev.idempotency_key=CONCAT('legacy-klt:',s.uid);
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: event migrasi sudah ada tanpa kandidat sumber yang tepat.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM recruitment_candidate_files f JOIN _klt_candidate_docs d ON f.uid=d.uid;
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: UID dokumen kandidat berbenturan dengan sumber.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM audit_logs a JOIN _klt_candidate_docs d
  ON (a.table_name='employee_documents' AND a.record_id=d.id) OR a.record_uid=d.uid;
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: audit per dokumen sudah ada; review histori dahulu.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='employee_documents';
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: ada FK baru menuju dokumen sumber; review sebelum pemindahan.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM generated_documents g JOIN _klt_candidate_source s ON g.reference_id=s.id
  WHERE UPPER(g.reference_type) IN ('EMPLOYEE','EMPLOYEES');
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: ada dokumen hasil generate yang mereferensikan karyawan sumber.'; END IF;
 IF (SELECT COUNT(*) FROM _klt_candidate_docs)<>1436 OR (SELECT COUNT(DISTINCT employee_id) FROM _klt_candidate_docs)<>718 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: sumber dokumen bukan 1436 milik 718 calon.';
 END IF;
 SELECT COUNT(*) INTO v_bad FROM employee_documents d JOIN _klt_candidate_source s ON s.id=d.employee_id
 WHERE d.file_id IS NOT NULL OR d.external_url IS NULL OR d.external_url NOT REGEXP '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{10,200}/view([?]resourcekey=[A-Za-z0-9_-]{1,200})?$'
 OR d.document_type NOT IN ('KTP','KK') OR d.status<>'ACTIVE';
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: ada dokumen non-Drive/nonaktif/jenis selain KTP KK.'; END IF;
 IF (SELECT COUNT(*) FROM _klt_candidate_docs WHERE document_type='KTP')<>718 OR
    (SELECT COUNT(*) FROM _klt_candidate_docs WHERE document_type='KK')<>718 OR
    (SELECT COUNT(*) FROM (SELECT employee_id,document_type FROM _klt_candidate_docs GROUP BY employee_id,document_type HAVING COUNT(*)<>1) duplicate_docs)<>0 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: komposisi atau duplikasi dokumen berubah.';
 END IF;
 -- Build JSON from ALL actual columns, including original raw notes and generated barcode.
 -- JSON_OBJECT preserves SQL NULL and keeps original notes as its original JSON string.
 SELECT GROUP_CONCAT(CONCAT(QUOTE(COLUMN_NAME),',e.`',REPLACE(COLUMN_NAME,'`','``'),'`') ORDER BY ORDINAL_POSITION SEPARATOR ',') INTO v_json
 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees';
 SET @klt_move_sql=CONCAT('UPDATE _klt_candidate_source s JOIN employees e ON e.id=s.id SET s.snapshot=JSON_OBJECT(',v_json,')');
 PREPARE klt_move_stmt FROM @klt_move_sql; EXECUTE klt_move_stmt; DEALLOCATE PREPARE klt_move_stmt;
 SELECT GROUP_CONCAT(CONCAT(QUOTE(COLUMN_NAME),',d.`',REPLACE(COLUMN_NAME,'`','``'),'`') ORDER BY ORDINAL_POSITION SEPARATOR ',') INTO v_json
 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employee_documents';
 SET @klt_move_sql=CONCAT('UPDATE _klt_candidate_source s SET s.docs=COALESCE((SELECT CONCAT(''['',GROUP_CONCAT(JSON_OBJECT(',
  v_json,') ORDER BY d.id SEPARATOR '',''),'']'') FROM employee_documents d WHERE d.employee_id=s.id),''[]'')');
 PREPARE klt_move_stmt FROM @klt_move_sql; EXECUTE klt_move_stmt; DEALLOCATE PREPARE klt_move_stmt;
 SELECT COUNT(*) INTO v_bad FROM _klt_candidate_source s WHERE NOT JSON_VALID(s.snapshot) OR NOT JSON_VALID(s.docs)
 OR JSON_LENGTH(s.docs)<>(SELECT COUNT(*) FROM _klt_candidate_docs d WHERE d.employee_id=s.id);
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: snapshot JSON tidak lengkap.'; END IF;
 SELECT DATABASE() target_database,p_mode mode,722 candidates_to_insert,1436 drive_documents_to_insert,
  (SELECT COUNT(*) FROM employees e JOIN employee_statuses es ON es.id=e.employee_status_id WHERE es.code='ACTIVE') active_employees_preserved,
  (SELECT COUNT(*) FROM employees e JOIN employee_statuses es ON es.id=e.employee_status_id WHERE es.code='RESIGNED') resigned_employees_preserved;
 IF p_mode='PREVIEW' THEN
  ROLLBACK; SET v_tx=0;
  SET SESSION SQL_SAFE_UPDATES=v_safe; SET SESSION group_concat_max_len=v_concat; SET SESSION time_zone=v_zone;
  DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
  SELECT 'PREVIEW_ONLY_NO_APPLICATION_DATA_CHANGED' result; LEAVE main;
 END IF;
 INSERT INTO recruitment_candidates(uid,application_number,idempotency_key,site_id,full_name,national_id_number,family_card_number,
  gender,birth_place,birth_date,education_level,address,phone,email,privacy_consent_at,privacy_notice_version,status,
  internal_notes,submitted_at,status_changed_at,legacy_import_json,created_at,updated_at)
 SELECT e.uid,CONCAT('LEG-KLT-',e.id),CONCAT('legacy-klt:',e.uid),v_site,e.full_name,
  CASE WHEN TRIM(e.national_id_number) REGEXP '^[0-9]{16}$' THEN TRIM(e.national_id_number) ELSE NULL END,
  CASE WHEN TRIM(e.family_card_number) REGEXP '^[0-9]{16}$' THEN TRIM(e.family_card_number) ELSE NULL END,
  CASE WHEN e.gender IN ('MALE','LAKI-LAKI') THEN 'MALE' ELSE 'FEMALE' END,
  NULLIF(TRIM(e.birth_place),''),e.birth_date,e.education_level,NULLIF(TRIM(e.address),''),
  CASE WHEN CHAR_LENGTH(TRIM(e.phone))>=8 THEN TRIM(e.phone) ELSE NULL END,e.email,NULL,NULL,'NEW',
  'Data calon karyawan dari arsip Klaten. Lengkapi data dan dokumen sebelum konversi.',NULL,v_now,
  JSON_OBJECT('sourceHash',v_hash,'sourceEmployee',JSON_EXTRACT(s.snapshot,'$'),'sourceDocuments',JSON_EXTRACT(s.docs,'$')),v_now,v_now
 FROM employees e JOIN _klt_candidate_source s ON s.id=e.id;
 INSERT INTO recruitment_candidate_files(uid,candidate_id,file_id,external_url,file_kind,created_at,updated_at)
 SELECT d.uid,c.id,NULL,d.external_url,d.document_type,v_now,v_now
 FROM _klt_candidate_docs d JOIN _klt_candidate_source s ON s.id=d.employee_id JOIN recruitment_candidates c ON c.uid=s.uid;
 INSERT INTO recruitment_status_events(uid,candidate_id,from_status,to_status,event_source,internal_notes,idempotency_key,occurred_at,created_at)
 SELECT UUID(),c.id,NULL,'NEW','SYSTEM','Pemindahan arsip calon karyawan Klaten.',CONCAT('legacy-klt:',s.uid),v_now,v_now
 FROM _klt_candidate_source s JOIN recruitment_candidates c ON c.uid=s.uid;
 SELECT COUNT(*) INTO v_bad FROM recruitment_candidates c JOIN _klt_candidate_source s ON s.uid=c.uid
 WHERE c.status='NEW' AND c.employee_id IS NULL AND c.submitted_at IS NULL AND c.privacy_consent_at IS NULL
 AND c.privacy_notice_version IS NULL AND c.idempotency_key=CONCAT('legacy-klt:',s.uid)
 AND BINARY JSON_EXTRACT(c.legacy_import_json,'$.sourceEmployee')=BINARY JSON_EXTRACT(s.snapshot,'$')
 AND BINARY JSON_EXTRACT(c.legacy_import_json,'$.sourceDocuments')=BINARY JSON_EXTRACT(s.docs,'$');
 IF v_bad<>722 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: verifikasi 722 snapshot kandidat gagal; rollback.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM recruitment_candidate_files f JOIN recruitment_candidates c ON c.id=f.candidate_id
 JOIN _klt_candidate_source s ON s.uid=c.uid JOIN _klt_candidate_docs d ON d.uid=f.uid AND d.employee_id=s.id
 WHERE f.file_id IS NULL AND BINARY f.external_url=BINARY d.external_url AND f.file_kind=d.document_type;
 IF v_bad<>1436 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: verifikasi dokumen gagal; rollback.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM recruitment_status_events ev JOIN recruitment_candidates c ON c.id=ev.candidate_id
 JOIN _klt_candidate_source s ON s.uid=c.uid WHERE ev.event_source='SYSTEM' AND ev.to_status='NEW' AND ev.from_status IS NULL;
 IF v_bad<>722 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: verifikasi event gagal; rollback.'; END IF;
 DELETE d FROM employee_documents d JOIN _klt_candidate_docs t ON t.id=d.id;
 IF ROW_COUNT()<>1436 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jumlah dokumen dihapus berubah; rollback.'; END IF;
 DELETE e FROM employees e JOIN _klt_candidate_source s ON s.id=e.id;
 IF ROW_COUNT()<>722 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jumlah karyawan dihapus berubah; rollback.'; END IF;
 INSERT INTO audit_logs(uid,site_id,module,action,table_name,record_uid,description,reason,after_data,occurred_at,created_at,updated_at)
 VALUES(UUID(),v_site,'RECRUITMENT','OTHER','recruitment_candidates',v_marker,
  'Pemindahan 722 calon karyawan Klaten dari arsip Nonaktif ke Rekrutmen.',
  'Koreksi klasifikasi sumber oleh client: Nonaktif belum pernah bekerja; Aktif dan Resign dipertahankan.',
  JSON_OBJECT('sourceHash',v_hash,'candidatesMoved',722,'driveDocumentsMoved',1436),v_now,v_now,v_now);
 COMMIT; SET v_tx=0;
 SET SESSION SQL_SAFE_UPDATES=v_safe; SET SESSION group_concat_max_len=v_concat; SET SESSION time_zone=v_zone;
 DO RELEASE_LOCK(v_lock_name); SET v_lock=0;
 SELECT 'KLATEN_INACTIVE_MOVED_TO_RECRUITMENT_COMMITTED' result;
END$$
DELIMITER ;
CALL owner_klaten_candidates_20261125(@klt_move_database,@klt_move_mode,@klt_move_backup_confirmed,@klt_move_writers_stopped);
DROP PROCEDURE IF EXISTS owner_klaten_candidates_20261125;
