-- GENERATED OWNER-RUN ONLY, MariaDB 10.4+. Contains personal information: do not commit generated SQL.
-- Run AFTER refresh cleansing and employee import, with approved legacy schema/API deployed.
-- Backup first; stop all writers/cron/public recruitment. PREVIEW does not insert application data.
-- Source SHA256 __SOURCE_HASH__, REKRUTMEN: 690 source, 12 held, 678 imported NEW.
-- Unknown consent and submission dates stay NULL. Attachments remain on Drive; R2 unchanged.
SET NAMES utf8mb4;
SET time_zone='+00:00';
SET @klt_rec_database='ISI_NAMA_DATABASE_TARGET';
SET @klt_rec_mode='PREVIEW';
SET @klt_rec_backup_confirmed=0;
SET @klt_rec_writers_stopped=0;
DROP TEMPORARY TABLE IF EXISTS _klt_rec_source;
CREATE TEMPORARY TABLE _klt_rec_source (
 source_row INT PRIMARY KEY,uid CHAR(36) UNIQUE,application_number VARCHAR(40) UNIQUE,idempotency_key VARCHAR(100) UNIQUE,
 full_name VARCHAR(150),national_id_number CHAR(16),family_card_number CHAR(16),gender VARCHAR(10),birth_place VARCHAR(100),birth_date DATE,
 education_level VARCHAR(30),address TEXT,phone VARCHAR(30),email VARCHAR(191),meta LONGTEXT,ktp VARCHAR(1000),kk VARCHAR(1000)
) ENGINE=InnoDB;
INSERT INTO _klt_rec_source VALUES
__SOURCE_INSERTS__;
DELIMITER $$
DROP PROCEDURE IF EXISTS owner_klaten_recruitment_refresh_20261127$$
CREATE PROCEDURE owner_klaten_recruitment_refresh_20261127(IN p_db VARCHAR(64),IN p_mode VARCHAR(10),IN p_backup INT,IN p_stopped INT)
SQL SECURITY INVOKER
main: BEGIN
 DECLARE v_site BIGINT UNSIGNED;
 DECLARE v_bad BIGINT DEFAULT 0;
 DECLARE v_tx INT DEFAULT 0;
 DECLARE v_lock INT DEFAULT 0;
 DECLARE v_lock_name VARCHAR(64);
 DECLARE v_marker CHAR(36) DEFAULT '539f1858-9eb8-5abb-8df6-7dfe1c334d23';
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN
   IF v_tx=1 THEN ROLLBACK; END IF;
   IF v_lock=1 THEN DO RELEASE_LOCK(v_lock_name); END IF;
   RESIGNAL;
 END;
 IF p_db IS NULL OR DATABASE() IS NULL OR BINARY p_db<>BINARY DATABASE() OR p_db='ISI_NAMA_DATABASE_TARGET' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: isi database target yang tepat.'; END IF;
 IF p_mode IS NULL OR BINARY p_mode NOT IN ('PREVIEW','EXECUTE') OR @@autocommit<>1 OR @@foreign_key_checks<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: koneksi baru autocommit=1 FK aktif; mode PREVIEW/EXECUTE.'; END IF;
 IF p_mode='EXECUTE' AND (COALESCE(p_backup,0)<>1 OR COALESCE(p_stopped,0)<>1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: backup dan penghentian writers wajib dikonfirmasi.'; END IF;
 SET v_lock_name=CONCAT('klt-import:',LEFT(SHA2(DATABASE(),256),40));
 SELECT GET_LOCK(v_lock_name,0) INTO v_lock;
 IF COALESCE(v_lock,0)<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: proses import lain sedang berjalan.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND ENGINE='InnoDB' AND TABLE_NAME IN ('recruitment_candidates','recruitment_candidate_files','recruitment_status_events','audit_logs');
 IF v_bad<>4 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: tabel target wajib InnoDB.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM sites WHERE code='KLATEN' AND is_active=1;
 IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: site Klaten tidak sesuai.'; END IF;
 SELECT id INTO v_site FROM sites WHERE code='KLATEN' AND is_active=1;
 IF (SELECT COUNT(*) FROM _klt_rec_source)<>678 OR (SELECT SUM((ktp IS NOT NULL)+(kk IS NOT NULL)) FROM _klt_rec_source)<>__DOC_COUNT__ THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: scope kandidat/dokumen tidak sesuai.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM _klt_rec_source WHERE NOT JSON_VALID(meta) OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta,'$.sourceHash')),'')<>'__SOURCE_HASH__' OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(meta,'$.sourceSheet')),'')<>'REKRUTMEN' OR COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(meta,'$.sourceRow')) AS UNSIGNED),0)<>source_row OR JSON_TYPE(JSON_EXTRACT(meta,'$.sourceRow'))<>'INTEGER' OR source_row IN (4,10,11,86,179,298,317,348,402,498,499,643);
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: provenance/scope sumber berbeda.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM employees WHERE current_site_id=v_site AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(notes),notes,'{}'),'$.legacyImport.sourceHash'))='__SOURCE_HASH__';
 IF v_bad<>3095 OR (SELECT COUNT(*) FROM employees)<>3095 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jalankan import 3095 karyawan refresh dahulu.'; END IF;
 IF p_mode='EXECUTE' AND (SELECT COUNT(*) FROM cron_runs WHERE status='RUNNING')>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: cron masih berjalan.'; END IF;
 START TRANSACTION;SET v_tx=1;
 SELECT COUNT(*) INTO v_bad FROM audit_logs WHERE record_uid=v_marker AND module='RECRUITMENT' AND action='OTHER' AND JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.sourceHash'))='__SOURCE_HASH__';
 IF v_bad=1 THEN
   IF (SELECT COUNT(*) FROM recruitment_candidates)<>678 OR (SELECT COUNT(*) FROM recruitment_candidates c JOIN _klt_rec_source s ON s.uid=c.uid WHERE c.site_id=v_site AND BINARY c.legacy_import_json=BINARY s.meta AND c.status='NEW' AND c.employee_id IS NULL AND c.submitted_at IS NULL AND c.privacy_consent_at IS NULL AND c.privacy_notice_version IS NULL
     AND BINARY c.application_number=BINARY s.application_number AND BINARY c.idempotency_key=BINARY s.idempotency_key AND BINARY c.full_name=BINARY s.full_name
     AND (BINARY c.national_id_number<=>BINARY s.national_id_number) AND (BINARY c.family_card_number<=>BINARY s.family_card_number) AND BINARY c.gender=BINARY s.gender
     AND (BINARY c.birth_place<=>BINARY s.birth_place) AND (c.birth_date<=>s.birth_date) AND (BINARY c.education_level<=>BINARY s.education_level)
     AND (BINARY c.address<=>BINARY s.address) AND (BINARY c.phone<=>BINARY s.phone) AND (BINARY c.email<=>BINARY s.email))<>678 OR (SELECT COUNT(*) FROM recruitment_candidate_files)<>__DOC_COUNT__ OR (SELECT COUNT(*) FROM recruitment_status_events)<>678 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: marker ada tetapi data berubah/parsial; review manual.'; END IF;
   SELECT COUNT(*) INTO v_bad FROM recruitment_candidate_files f JOIN recruitment_candidates c ON c.id=f.candidate_id JOIN _klt_rec_source s ON s.uid=c.uid WHERE f.file_id IS NULL AND ((f.file_kind='KTP' AND BINARY f.external_url=BINARY s.ktp) OR (f.file_kind='KK' AND BINARY f.external_url=BINARY s.kk));
   IF v_bad<>__DOC_COUNT__ THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: dokumen replay berbeda.'; END IF;
   SELECT COUNT(*) INTO v_bad FROM recruitment_status_events ev JOIN recruitment_candidates c ON c.id=ev.candidate_id JOIN _klt_rec_source s ON s.uid=c.uid WHERE ev.from_status IS NULL AND ev.to_status='NEW' AND ev.event_source='SYSTEM' AND ev.actor_user_id IS NULL AND BINARY ev.idempotency_key=BINARY CONCAT('klt261126:event:',s.source_row);
   IF v_bad<>678 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: status event replay berbeda.'; END IF;
   ROLLBACK;SET v_tx=0;DO RELEASE_LOCK(v_lock_name);SET v_lock=0;SELECT 'ALREADY_IMPORTED_NO_CHANGES' result;LEAVE main;
 END IF;
 IF v_bad<>0 OR (SELECT COUNT(*) FROM recruitment_candidates)<>0 OR (SELECT COUNT(*) FROM recruitment_candidate_files)<>0 OR (SELECT COUNT(*) FROM recruitment_status_events)<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: target rekrutmen belum kosong atau import parsial.'; END IF;
 SELECT COUNT(*) INTO v_bad FROM _klt_rec_source s JOIN employees e ON e.national_id_number=s.national_id_number JOIN employee_statuses st ON st.id=e.employee_status_id WHERE st.code='ACTIVE';
 IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: kandidat masih berbenturan NIK karyawan aktif.'; END IF;
 SELECT p_mode mode,678 candidates_to_import,__DOC_COUNT__ drive_documents_to_import,12 held_source_rows;
 IF p_mode='PREVIEW' THEN ROLLBACK;SET v_tx=0;DO RELEASE_LOCK(v_lock_name);SET v_lock=0;SELECT 'PREVIEW_ONLY_NO_APPLICATION_DATA_CHANGED' result;LEAVE main;END IF;
 INSERT INTO recruitment_candidates(uid,application_number,idempotency_key,site_id,full_name,national_id_number,family_card_number,gender,birth_place,birth_date,education_level,address,phone,email,privacy_consent_at,privacy_notice_version,status,submitted_at,legacy_import_json,internal_notes)
 SELECT uid,application_number,idempotency_key,v_site,full_name,national_id_number,family_card_number,gender,birth_place,birth_date,education_level,address,phone,email,NULL,NULL,'NEW',NULL,meta,'Data kandidat dari migrasi database Klaten per 26 November 2026.' FROM _klt_rec_source ORDER BY source_row;
 INSERT INTO recruitment_candidate_files(uid,candidate_id,file_id,external_url,file_kind)
 SELECT UUID(),c.id,NULL,s.ktp,'KTP' FROM _klt_rec_source s JOIN recruitment_candidates c ON c.uid=s.uid WHERE s.ktp IS NOT NULL
 UNION ALL SELECT UUID(),c.id,NULL,s.kk,'KK' FROM _klt_rec_source s JOIN recruitment_candidates c ON c.uid=s.uid WHERE s.kk IS NOT NULL;
 INSERT INTO recruitment_status_events(uid,candidate_id,from_status,to_status,event_source,internal_notes,idempotency_key)
 SELECT UUID(),c.id,NULL,'NEW','SYSTEM','Migrasi kandidat dari database Klaten per 26 November 2026.',CONCAT('klt261126:event:',s.source_row) FROM _klt_rec_source s JOIN recruitment_candidates c ON c.uid=s.uid;
 IF (SELECT COUNT(*) FROM recruitment_candidates)<>678 OR (SELECT COUNT(*) FROM recruitment_candidate_files)<>__DOC_COUNT__ OR (SELECT COUNT(*) FROM recruitment_status_events)<>678 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: verifikasi jumlah gagal; rollback.'; END IF;
 INSERT INTO audit_logs(uid,site_id,module,action,table_name,record_uid,description,reason,after_data) VALUES(UUID(),v_site,'RECRUITMENT','OTHER','recruitment_candidates',v_marker,'Owner-run refresh kandidat Klaten per 26 November 2026.','Refresh sesuai sumber dan keputusan Owner.',JSON_OBJECT('sourceHash','__SOURCE_HASH__','sourceSheet','REKRUTMEN','imported',678,'held',12,'documents',__DOC_COUNT__));
 COMMIT;SET v_tx=0;DO RELEASE_LOCK(v_lock_name);SET v_lock=0;
 SELECT 'KLATEN_RECRUITMENT_REFRESH_COMMITTED' result;
END$$
DELIMITER ;
CALL owner_klaten_recruitment_refresh_20261127(@klt_rec_database,@klt_rec_mode,@klt_rec_backup_confirmed,@klt_rec_writers_stopped);
DROP PROCEDURE IF EXISTS owner_klaten_recruitment_refresh_20261127;
