-- Menambahkan outcome historis untuk pembatalan klasifikasi Attendance
-- yang sebelumnya sudah diterapkan. Tidak mengubah data existing.

DROP PROCEDURE IF EXISTS migrate_attendance_classification_reversal;
DELIMITER $$
CREATE PROCEDURE migrate_attendance_classification_reversal()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND TABLE_NAME='attendance_classification_details'
      AND CONSTRAINT_NAME='chk_attendance_classification_outcome'
  ) THEN
    ALTER TABLE attendance_classification_details
      DROP CONSTRAINT chk_attendance_classification_outcome;
  END IF;

  ALTER TABLE attendance_classification_details
    ADD CONSTRAINT chk_attendance_classification_outcome
    CHECK (outcome IN (
      'PENDING','APPLIED','REVERSED',
      'SKIPPED_NON_WORKDAY','SKIPPED_HOLIDAY'
    ));
END$$
DELIMITER ;

CALL migrate_attendance_classification_reversal();
DROP PROCEDURE migrate_attendance_classification_reversal;

SELECT outcome,COUNT(*) total
FROM attendance_classification_details
GROUP BY outcome
ORDER BY outcome;
