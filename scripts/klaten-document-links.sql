-- OWNER-RUN ONLY after 20261123_employee_document_external_url.sql.
-- Contains private Drive links in generated output: do not commit/share it.
-- No download, R2 upload or employee master change. No existing document replaced.
-- Fill exact DB name. Run WHOLE FILE as script, PREVIEW first.
-- EXECUTE requires backup and stopped application writers/cron confirmations.
-- Fresh connection/autocommit=1; data changes are atomic. DDL for routine only.
SET @klt_docs_database='ISI_NAMA_DATABASE_TARGET';
SET @klt_docs_mode='PREVIEW';
SET @klt_docs_backup=0;
SET @klt_docs_stopped=0;
DROP TEMPORARY TABLE IF EXISTS _klt_doc_source;
CREATE TEMPORARY TABLE _klt_doc_source (
  uid CHAR(36) NOT NULL PRIMARY KEY,
  employee_uid CHAR(36) NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  external_url VARCHAR(1000) NOT NULL,
  UNIQUE KEY(employee_uid,document_type)
) ENGINE=InnoDB;
-- __PAYLOAD__

DELIMITER $$
DROP PROCEDURE IF EXISTS owner_klaten_document_links_20261123$$
CREATE PROCEDURE owner_klaten_document_links_20261123(IN p_database VARCHAR(64),IN p_mode VARCHAR(10),IN p_backup INT,IN p_stopped INT)
SQL SECURITY INVOKER
main: BEGIN
  DECLARE v_hash CHAR(64) DEFAULT '__SOURCE_HASH__';
  DECLARE v_site BIGINT UNSIGNED;
  DECLARE v_bad BIGINT DEFAULT 0;
  DECLARE v_inserted BIGINT DEFAULT 0;
  DECLARE v_expected BIGINT DEFAULT 0;
  DECLARE v_safe INT DEFAULT 0;
  DECLARE v_tx INT DEFAULT 0;
  DECLARE v_locked INT DEFAULT 0;
  DECLARE v_lock_name VARCHAR(64);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_tx=1 THEN ROLLBACK; END IF;
    SET SESSION SQL_SAFE_UPDATES=v_safe;
    IF v_locked=1 THEN DO RELEASE_LOCK(v_lock_name); END IF;
    RESIGNAL;
  END;
  SET v_safe=@@SESSION.SQL_SAFE_UPDATES;
  IF p_database IS NULL OR DATABASE() IS NULL OR BINARY p_database<>BINARY DATABASE() OR p_database='ISI_NAMA_DATABASE_TARGET' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: isi nama database target yang tepat.';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('PREVIEW','EXECUTE') OR @@AUTOCOMMIT<>1 OR @@FOREIGN_KEY_CHECKS<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: mode/koneksi tidak sesuai; koneksi baru autocommit=1 dan FK aktif wajib.';
  END IF;
  IF p_mode='EXECUTE' AND (COALESCE(p_backup,0)<>1 OR COALESCE(p_stopped,0)<>1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: backup dan penghentian writer/cron wajib dikonfirmasi.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME IN ('employee_documents','audit_logs') AND ENGINE='InnoDB';
  IF v_bad<>2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: tabel dokumen/audit wajib InnoDB.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
    AND TABLE_NAME='employee_documents'
    AND ((COLUMN_NAME='file_id' AND IS_NULLABLE='YES') OR COLUMN_NAME='external_url');
  IF v_bad<>2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jalankan migration external_url terlebih dahulu.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM audit_logs WHERE record_uid='__IMPORT_UID__' AND module='EMPLOYEES'
    AND action='OTHER' AND JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.sourceHash'))=v_hash;
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: marker import sumber tidak cocok.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM sites WHERE code='KLATEN' AND is_active=1;
  IF v_bad<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: site Klaten tidak sesuai.'; END IF;
  SELECT id INTO v_site FROM sites WHERE code='KLATEN';
  SET v_lock_name=CONCAT('klt-import:',LEFT(SHA2(DATABASE(),256),40));
  SELECT GET_LOCK(v_lock_name,0) INTO v_locked;
  IF COALESCE(v_locked,0)<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: import/perapian lain sedang berjalan.'; END IF;
  START TRANSACTION; SET v_tx=1;
  IF (SELECT COUNT(*) FROM _klt_doc_source)<>__DOCUMENT_COUNT__ THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: payload link tidak lengkap.';
  END IF;
  SELECT COUNT(*) INTO v_bad FROM _klt_doc_source s LEFT JOIN employees e ON e.uid=s.employee_uid
    WHERE e.id IS NULL OR e.current_site_id<>v_site
      OR NOT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(e.notes),e.notes,'{}'),'$.legacyImport.sourceHash')),'')=v_hash);
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: pemetaan UID karyawan/site/sumber tidak cocok.'; END IF;
  SELECT COUNT(*) INTO v_bad FROM _klt_doc_source s JOIN employee_documents d ON d.uid=s.uid
    JOIN employees e ON e.uid=s.employee_uid WHERE d.employee_id<>e.id OR d.document_type<>s.document_type;
  IF v_bad<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: UID dokumen bertabrakan dengan pemilik/tipe lain.'; END IF;
  IF p_mode='EXECUTE' AND (SELECT COUNT(*) FROM cron_runs WHERE status='RUNNING')>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: masih ada cron RUNNING.';
  END IF;
  -- Keep manual uploads and any edited/archived previously imported documents.
  DROP TEMPORARY TABLE IF EXISTS _klt_doc_pending;
  CREATE TEMPORARY TABLE _klt_doc_pending ENGINE=InnoDB AS
    SELECT s.*,e.id employee_id FROM _klt_doc_source s JOIN employees e ON e.uid=s.employee_uid
    WHERE NOT EXISTS(SELECT 1 FROM employee_documents d WHERE d.uid=s.uid)
      AND NOT EXISTS(SELECT 1 FROM employee_documents d WHERE d.employee_id=e.id AND d.document_type=s.document_type AND d.status='ACTIVE');
  SELECT COUNT(*) INTO v_expected FROM _klt_doc_pending;
  SELECT DATABASE() target_database,p_mode mode,
    (SELECT COUNT(*) FROM _klt_doc_source) source_links,v_expected documents_to_insert,
    __DOCUMENT_COUNT__-v_expected existing_documents_preserved;
  SELECT p.document_type,es.code employee_status,COUNT(*) documents_to_insert
    FROM _klt_doc_pending p JOIN employees e ON e.id=p.employee_id
    JOIN employee_statuses es ON es.id=e.employee_status_id GROUP BY p.document_type,es.code;
  IF p_mode='PREVIEW' THEN
    ROLLBACK; SET v_tx=0;
    DO RELEASE_LOCK(v_lock_name); SET v_locked=0;
    SELECT 'PREVIEW_ONLY_NO_APPLICATION_DATA_CHANGED' result;
    LEAVE main;
  END IF;
  SET SESSION SQL_SAFE_UPDATES=0;
  INSERT INTO employee_documents(uid,employee_id,document_type,name,file_id,external_url,status,notes)
    SELECT uid,employee_id,document_type,CASE WHEN document_type='KTP' THEN 'Foto KTP' ELSE 'Foto Kartu Keluarga' END,
      NULL,external_url,'ACTIVE',CONCAT('Import tautan Drive legacy Klaten; sourceHash=',v_hash)
    FROM _klt_doc_pending;
  SET v_inserted=ROW_COUNT();
  IF v_inserted<>v_expected THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: jumlah insert berbeda; rollback.'; END IF;
  IF v_inserted>0 THEN
    INSERT INTO audit_logs(uid,site_id,module,action,table_name,description,reason,after_data)
    VALUES(UUID(),v_site,'EMPLOYEES','OTHER','employee_documents','Owner-run import tautan dokumen legacy Klaten.',
      'Tautan Drive dari Excel asli; tidak memindahkan file ke R2 dan tidak menimpa dokumen existing.',
      JSON_OBJECT('sourceHash',v_hash,'insertedDocuments',v_inserted));
  END IF;
  COMMIT; SET v_tx=0;
  SET SESSION SQL_SAFE_UPDATES=v_safe;
  DO RELEASE_LOCK(v_lock_name); SET v_locked=0;
  SELECT IF(v_inserted=0,'ALREADY_IMPORTED_NO_CHANGES','KLATEN_DOCUMENT_LINKS_COMMITTED') result,v_inserted inserted_documents;
END$$
DELIMITER ;
CALL owner_klaten_document_links_20261123(@klt_docs_database,@klt_docs_mode,@klt_docs_backup,@klt_docs_stopped);
DROP PROCEDURE IF EXISTS owner_klaten_document_links_20261123;
DROP TEMPORARY TABLE IF EXISTS _klt_doc_pending;
DROP TEMPORARY TABLE IF EXISTS _klt_doc_source;
