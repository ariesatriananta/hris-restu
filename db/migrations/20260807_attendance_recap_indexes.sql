-- Milestone 8: indeks pembacaan Rekap Attendance berdasarkan site dan periode.
-- Migration ini tidak mengubah atau melakukan backfill data operasional.

DROP PROCEDURE IF EXISTS migrate_attendance_recap_indexes;
DELIMITER $$
CREATE PROCEDURE migrate_attendance_recap_indexes()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE()
       AND TABLE_NAME='employee_employment_histories'
       AND INDEX_NAME='idx_employment_history_site_dates_employee'
  ) THEN
    CREATE INDEX idx_employment_history_site_dates_employee
      ON employee_employment_histories
        (site_id,effective_from,effective_to,employee_id);
  END IF;
END$$
DELIMITER ;

CALL migrate_attendance_recap_indexes();
DROP PROCEDURE migrate_attendance_recap_indexes;

SELECT INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA=DATABASE()
  AND TABLE_NAME='employee_employment_histories'
  AND INDEX_NAME='idx_employment_history_site_dates_employee'
ORDER BY SEQ_IN_INDEX;

