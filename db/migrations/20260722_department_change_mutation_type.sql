-- Menambah jenis mutasi eksplisit untuk perpindahan departemen.
-- OTHER dan GROUP_CHANGE dipertahankan untuk histori legacy, tetapi tidak
-- ditawarkan pada UI mutasi baru.

START TRANSACTION;

ALTER TABLE employee_employment_histories
  DROP CONSTRAINT chk_employment_history_change;

ALTER TABLE employee_employment_histories
  ADD CONSTRAINT chk_employment_history_change
  CHECK (change_type IN ('INITIAL', 'TRANSFER', 'PROMOTION', 'DEMOTION', 'STATUS_CHANGE', 'TYPE_CHANGE', 'DEPARTMENT_CHANGE', 'GROUP_CHANGE', 'PRODUCTION_ASSIGNMENT_CHANGE', 'OTHER'));

ALTER TABLE scheduled_employee_mutations
  DROP CONSTRAINT chk_scheduled_employee_mutations_change;

ALTER TABLE scheduled_employee_mutations
  ADD CONSTRAINT chk_scheduled_employee_mutations_change
  CHECK (change_type IN ('TRANSFER', 'PROMOTION', 'DEMOTION', 'TYPE_CHANGE', 'DEPARTMENT_CHANGE', 'GROUP_CHANGE', 'PRODUCTION_ASSIGNMENT_CHANGE', 'OTHER'));

COMMIT;
