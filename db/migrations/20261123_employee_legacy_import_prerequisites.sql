-- OWNER-RUN ONCE, MariaDB 10.4+, AFTER nullable join_date migration.
-- Backup first. DDL commits implicitly. No employee data is changed.
-- If ALTER succeeds but INSERT fails, resume from INSERT; do not repeat ALTER.
-- Keep the normal UI/API join_date required validation.
ALTER TABLE employees
  DROP CONSTRAINT chk_employees_training_join_date,
  ADD CONSTRAINT chk_employees_training_join_date CHECK (
    join_date_training IS NULL OR join_date_training>=join_date
    OR (join_date_borong IS NOT NULL AND join_date_borong=join_date)
  ),
  ADD CONSTRAINT chk_employees_join_phase_order CHECK (
    join_date_training IS NULL OR join_date_borong IS NULL
    OR join_date_training<=join_date_borong
  );

-- Internal archive marker, NOT an operational employee type.
-- is_active=0 keeps dynamic active-only lookups hidden; UI/API choices stay
-- restricted to BORONGAN/HARIAN/BULANAN/TRAINING. Never activate this master.
INSERT INTO employee_types(uid,code,name,payroll_basis,pay_frequency,is_active,description)
SELECT UUID(),'LEGACY_UNKNOWN','-','TIME_BASED','WEEKLY',0,
  'Khusus arsip legacy import Owner; jenis sumber kosong. Bukan pilihan operasional.'
WHERE NOT EXISTS(SELECT 1 FROM employee_types WHERE code='LEGACY_UNKNOWN');

SELECT code,name,is_active FROM employee_types WHERE code='LEGACY_UNKNOWN';
SELECT CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='employees'
  AND CONSTRAINT_NAME IN ('chk_employees_training_join_date','chk_employees_join_phase_order');
