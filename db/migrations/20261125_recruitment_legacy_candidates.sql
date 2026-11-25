-- OWNER-RUN ONLY. Back up and stop API writers/cron first. MariaDB DDL implicitly commits.
-- Deploy API/frontend AFTER this migration. No employee/candidate data is migrated here.
-- Replay-safe column/FK changes. Keep writers stopped until triggers also exist.
ALTER TABLE recruitment_candidates
  MODIFY national_id_number CHAR(16) NULL,
  MODIFY family_card_number CHAR(16) NULL,
  MODIFY birth_place VARCHAR(100) NULL,
  MODIFY birth_date DATE NULL,
  MODIFY address TEXT NULL,
  MODIFY phone VARCHAR(30) NULL,
  MODIFY privacy_consent_at DATETIME(3) NULL,
  MODIFY privacy_notice_version VARCHAR(30) NULL,
  MODIFY submitted_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS legacy_import_json JSON NULL COMMENT 'Immutable owner-import snapshot; never accepted from public/HR payloads.',
  DROP CONSTRAINT IF EXISTS chk_recruitment_candidates_normal_required;
ALTER TABLE recruitment_candidates
  ADD CONSTRAINT chk_recruitment_candidates_normal_required CHECK (legacy_import_json IS NOT NULL OR (
    national_id_number IS NOT NULL AND family_card_number IS NOT NULL AND birth_place IS NOT NULL
    AND birth_date IS NOT NULL AND address IS NOT NULL AND phone IS NOT NULL
    AND privacy_consent_at IS NOT NULL AND privacy_notice_version IS NOT NULL AND submitted_at IS NOT NULL));

-- MariaDB 1901: source CHECK(file_id) requires its FK ON UPDATE RESTRICT.
ALTER TABLE recruitment_candidate_files
  DROP CONSTRAINT IF EXISTS chk_recruitment_candidate_files_source,
  DROP FOREIGN KEY IF EXISTS fk_recruitment_candidate_files_file;
ALTER TABLE recruitment_candidate_files
  MODIFY file_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS external_url VARCHAR(1000) NULL AFTER file_id,
  ADD CONSTRAINT fk_recruitment_candidate_files_file FOREIGN KEY (file_id)
    REFERENCES files(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT chk_recruitment_candidate_files_source CHECK (
    (file_id IS NOT NULL AND external_url IS NULL) OR
    (file_id IS NULL AND external_url IS NOT NULL AND external_url REGEXP '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{10,200}/view([?]resourcekey=[A-Za-z0-9_-]{1,200})?$'));

DROP TRIGGER IF EXISTS recruitment_candidates_legacy_immutable;
CREATE TRIGGER recruitment_candidates_legacy_immutable BEFORE UPDATE ON recruitment_candidates
FOR EACH ROW SET NEW.legacy_import_json=OLD.legacy_import_json;
SELECT COLUMN_NAME,IS_NULLABLE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='recruitment_candidates'
 AND COLUMN_NAME IN ('national_id_number','submitted_at','legacy_import_json');
-- DOWN (only before any legacy candidate exists; OWNER must verify first):
-- Drop trigger recruitment_candidates_legacy_immutable, source CHECK and external_url;
-- restore file_id NOT NULL ONLY after no external documents remain; restore candidate
-- NOT NULL fields ONLY after all rows have complete identity/consent/submission data.
-- Never manufacture missing values to force a rollback; restore the pre-migration backup instead.
