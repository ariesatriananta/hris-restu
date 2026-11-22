-- Owner-run ONLY, approved 22 November 2026 for legacy employee archive import.
-- Do not auto-run. Back up first; MySQL/MariaDB DDL implicitly commits.
-- No employee data, history, ID, sequence, status or master is inserted/changed.
-- NULL means the client's historical join date is UNKNOWN, not the import date.
-- Normal UI/API registration, edits and import validation still require a date.
-- This only enables the separately reviewed owner-run legacy SQL import.
ALTER TABLE employees
  MODIFY COLUMN join_date DATE NULL DEFAULT NULL
    COMMENT 'NULL only for owner-imported legacy archives with unknown join date; normal registration requires a date.';

-- Read-only verification: IS_NULLABLE must be YES.
SELECT TABLE_NAME,COLUMN_NAME,IS_NULLABLE,DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='join_date';
