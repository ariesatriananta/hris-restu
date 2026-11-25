-- OWNER-RUN rollback ONLY BEFORE transfer/conversion of any legacy candidates.
-- Back up and stop all writers first. DDL commits implicitly. Never erase snapshots.
-- After transfer, use a separately reviewed restore plan/backup, NOT this script.
DELIMITER $$
DROP PROCEDURE IF EXISTS owner_recruitment_legacy_schema_down$$
CREATE PROCEDURE owner_recruitment_legacy_schema_down()
BEGIN
 IF (SELECT COUNT(*) FROM recruitment_candidates WHERE legacy_import_json IS NOT NULL
   OR national_id_number IS NULL OR family_card_number IS NULL OR birth_place IS NULL
   OR birth_date IS NULL OR address IS NULL OR phone IS NULL OR privacy_consent_at IS NULL
   OR privacy_notice_version IS NULL OR submitted_at IS NULL)>0 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: legacy/incomplete candidates exist. Do not discard snapshots.';
 END IF;
 IF (SELECT COUNT(*) FROM recruitment_candidate_files WHERE external_url IS NOT NULL OR file_id IS NULL)>0 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='STOP: external documents exist. Do not discard their URLs.';
 END IF;
 DROP TRIGGER IF EXISTS recruitment_candidates_legacy_immutable;
 ALTER TABLE recruitment_candidates DROP CONSTRAINT chk_recruitment_candidates_normal_required,
  DROP COLUMN legacy_import_json,
  MODIFY national_id_number CHAR(16) NOT NULL, MODIFY family_card_number CHAR(16) NOT NULL,
  MODIFY birth_place VARCHAR(100) NOT NULL, MODIFY birth_date DATE NOT NULL,
  MODIFY address TEXT NOT NULL, MODIFY phone VARCHAR(30) NOT NULL,
  MODIFY privacy_consent_at DATETIME(3) NOT NULL, MODIFY privacy_notice_version VARCHAR(30) NOT NULL,
  MODIFY submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
 ALTER TABLE recruitment_candidate_files DROP CONSTRAINT chk_recruitment_candidate_files_source,
  DROP FOREIGN KEY fk_recruitment_candidate_files_file;
 ALTER TABLE recruitment_candidate_files DROP COLUMN external_url, MODIFY file_id BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_recruitment_candidate_files_file FOREIGN KEY(file_id) REFERENCES files(id) ON UPDATE CASCADE ON DELETE RESTRICT;
END$$
DELIMITER ;
CALL owner_recruitment_legacy_schema_down();
DROP PROCEDURE IF EXISTS owner_recruitment_legacy_schema_down;
