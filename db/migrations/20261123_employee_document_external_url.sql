-- OWNER-RUN. Backup first; DDL implicitly commits. Do not auto-run.
-- Deploy before the API/frontend supporting external employee documents.
-- Existing R2 file references remain unchanged. No R2 object is moved/copied.
-- Recovery/replay safe for the original failed ALTER and the prior successful version.
-- MariaDB rejects CHECK(file_id) with its old ON UPDATE CASCADE foreign key.
-- files.id is an immutable internal identifier; RESTRICT preserves the FK while
-- prohibiting primary-key renumbering. No file/data is renumbered by this script.
-- STOP application writers/cron until the whole script succeeds. The two DDL
-- statements are separate because MariaDB can reject drop/re-add of one FK name
-- in the same ALTER (errno 121). If interrupted, rerun this entire file.
ALTER TABLE employee_documents
  DROP CONSTRAINT IF EXISTS chk_employee_documents_source,
  DROP FOREIGN KEY IF EXISTS fk_employee_documents_file;

ALTER TABLE employee_documents
  MODIFY COLUMN file_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS external_url VARCHAR(1000) NULL AFTER file_id,
  ADD CONSTRAINT fk_employee_documents_file FOREIGN KEY (file_id)
    REFERENCES files(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT chk_employee_documents_source CHECK (
    (file_id IS NOT NULL AND external_url IS NULL)
    OR (file_id IS NULL AND external_url IS NOT NULL AND external_url LIKE 'https://drive.google.com/file/d/%')
  );

SELECT COUNT(*) total,
  SUM(file_id IS NOT NULL AND external_url IS NULL) uploaded_documents,
  SUM(file_id IS NULL AND external_url IS NOT NULL) external_documents
FROM employee_documents;

-- Must show UPDATE_RULE=RESTRICT and DELETE_RULE=RESTRICT.
SELECT CONSTRAINT_NAME,UPDATE_RULE,DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='employee_documents'
  AND CONSTRAINT_NAME='fk_employee_documents_file';
