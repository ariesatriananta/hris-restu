-- Menyederhanakan konfigurasi Payroll menjadi kondisi terkini.
-- Cakupan: policy Payroll, tarif harian, gaji pokok, dan kepesertaan BPJS.
--
-- Migration ini aman dijalankan setelah:
--   1. 20260914_payroll_bpjs_borongan.sql
--   2. 20260915_payroll_bpjs_global_jkk.sql
--
-- Cutover ini ditujukan untuk environment pra-live. Baris terbaru dipertahankan
-- sebagai kondisi saat ini. Duplikat dan detail demo yang masih menunjuk master
-- lama dibuang; revision/audit pada baris yang dipertahankan tetap tersedia.
-- Pemeriksaan information_schema membuat script dapat dijalankan ulang apabila
-- eksekusi sebelumnya berhenti setelah sebagian DDL berhasil diterapkan.

DROP PROCEDURE IF EXISTS migrate_bpjs_enrollment_current_state;
DELIMITER $$
CREATE PROCEDURE migrate_bpjs_enrollment_current_state()
BEGIN
  DECLARE enrollment_table_exists BIGINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_bpjs_current_enrollments;
    RESIGNAL;
  END;

  SELECT COUNT(*) INTO enrollment_table_exists
  FROM information_schema.tables
  WHERE table_schema=DATABASE()
    AND table_name='employee_bpjs_enrollments';

  IF enrollment_table_exists<>1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migration dibatalkan: tabel employee_bpjs_enrollments tidak ditemukan.';
  END IF;

  -- Konsolidasi harus selesai dalam satu transaksi sebelum constraint unik
  -- ditambahkan. Baris dengan id terbesar adalah kondisi terakhir yang selama
  -- ini juga dibaca aplikasi.
  START TRANSACTION;

  DROP TEMPORARY TABLE IF EXISTS tmp_bpjs_current_enrollments;
  CREATE TEMPORARY TABLE tmp_bpjs_current_enrollments (
    employee_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    enrollment_id BIGINT UNSIGNED NOT NULL UNIQUE
  ) ENGINE=InnoDB;

  INSERT INTO tmp_bpjs_current_enrollments(employee_id,enrollment_id)
  SELECT employee_id,MAX(id)
  FROM employee_bpjs_enrollments
  GROUP BY employee_id;

  UPDATE employee_bpjs_enrollment_revisions revision
  JOIN employee_bpjs_enrollments old_enrollment
    ON old_enrollment.id=revision.employee_bpjs_enrollment_id
  JOIN tmp_bpjs_current_enrollments current_enrollment
    ON current_enrollment.employee_id=old_enrollment.employee_id
  SET revision.employee_bpjs_enrollment_id=current_enrollment.enrollment_id
  WHERE revision.employee_bpjs_enrollment_id<>current_enrollment.enrollment_id;

  UPDATE payroll_employee_bpjs_details detail
  JOIN employee_bpjs_enrollments old_enrollment
    ON old_enrollment.id=detail.employee_bpjs_enrollment_id
  JOIN tmp_bpjs_current_enrollments current_enrollment
    ON current_enrollment.employee_id=old_enrollment.employee_id
  SET detail.employee_bpjs_enrollment_id=current_enrollment.enrollment_id
  WHERE detail.employee_bpjs_enrollment_id<>current_enrollment.enrollment_id;

  DELETE enrollment
  FROM employee_bpjs_enrollments enrollment
  JOIN tmp_bpjs_current_enrollments current_enrollment
    ON current_enrollment.employee_id=enrollment.employee_id
  WHERE enrollment.id<>current_enrollment.enrollment_id;

  COMMIT;
  DROP TEMPORARY TABLE tmp_bpjs_current_enrollments;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema=DATABASE()
      AND table_name='employee_bpjs_enrollments'
      AND constraint_name='chk_employee_bpjs_enrollment_dates'
  ) THEN
    SET @drop_bpjs_date_check=CONCAT(
      'ALTER TABLE employee_bpjs_enrollments ',
      IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT ','DROP CHECK '),
      'chk_employee_bpjs_enrollment_dates'
    );
    PREPARE drop_bpjs_date_check_statement FROM @drop_bpjs_date_check;
    EXECUTE drop_bpjs_date_check_statement;
    DEALLOCATE PREPARE drop_bpjs_date_check_statement;
  END IF;

  -- Tambahkan index current-state lebih dulu. Selain menjaga keunikan satu
  -- baris per karyawan, employee_id tetap memiliki index pendukung untuk FK
  -- ketika index tanggal lama dilepas.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema=DATABASE()
      AND table_name='employee_bpjs_enrollments'
      AND index_name='uq_employee_bpjs_enrollments_employee'
  ) THEN
    ALTER TABLE employee_bpjs_enrollments
      ADD UNIQUE KEY uq_employee_bpjs_enrollments_employee(employee_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema=DATABASE()
      AND table_name='employee_bpjs_enrollments'
      AND index_name='uq_employee_bpjs_enrollments_start'
  ) THEN
    ALTER TABLE employee_bpjs_enrollments
      DROP INDEX uq_employee_bpjs_enrollments_start;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema=DATABASE()
      AND table_name='employee_bpjs_enrollments'
      AND index_name='idx_employee_bpjs_enrollments_dates'
  ) THEN
    ALTER TABLE employee_bpjs_enrollments
      DROP INDEX idx_employee_bpjs_enrollments_dates;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE()
      AND table_name='employee_bpjs_enrollments'
      AND column_name='effective_to'
  ) THEN
    ALTER TABLE employee_bpjs_enrollments DROP COLUMN effective_to;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE()
      AND table_name='employee_bpjs_enrollments'
      AND column_name='effective_from'
  ) THEN
    ALTER TABLE employee_bpjs_enrollments DROP COLUMN effective_from;
  END IF;

  IF EXISTS (
    SELECT employee_id
    FROM employee_bpjs_enrollments
    GROUP BY employee_id
    HAVING COUNT(*)>1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migration gagal: masih ada lebih dari satu kepesertaan untuk satu karyawan.';
  END IF;
END$$
DELIMITER ;

CALL migrate_bpjs_enrollment_current_state();
DROP PROCEDURE migrate_bpjs_enrollment_current_state;

SELECT column_name,column_type,is_nullable
FROM information_schema.columns
WHERE table_schema=DATABASE()
  AND table_name='employee_bpjs_enrollments'
ORDER BY ordinal_position;

SELECT COUNT(*) enrollment_rows,COUNT(DISTINCT employee_id) employees
FROM employee_bpjs_enrollments;

DROP PROCEDURE IF EXISTS migrate_payroll_master_current_state;
DELIMITER $$
CREATE PROCEDURE migrate_payroll_master_current_state()
BEGIN
  DECLARE required_tables BIGINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_current_policies;
    DROP TEMPORARY TABLE IF EXISTS tmp_current_daily_rates;
    DROP TEMPORARY TABLE IF EXISTS tmp_current_salaries;
    RESIGNAL;
  END;

  SELECT COUNT(*) INTO required_tables
  FROM information_schema.tables
  WHERE table_schema=DATABASE()
    AND table_name IN (
      'payroll_policy_versions',
      'employee_daily_rate_histories',
      'employee_salary_histories'
    );

  IF required_tables<>3 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migration dibatalkan: tabel master Payroll belum lengkap.';
  END IF;

  -- Karena modul belum live, baris terbaru menjadi konfigurasi saat ini.
  -- Detail/snapshot demo yang menunjuk versi lama dibuang agar tidak menyisakan
  -- referensi setengah valid saat master lama dihapus.
  START TRANSACTION;

  CREATE TEMPORARY TABLE tmp_current_policies AS
  SELECT site_id,employee_type_code,MAX(id) policy_id
  FROM payroll_policy_versions
  GROUP BY site_id,employee_type_code;
  ALTER TABLE tmp_current_policies
    ADD PRIMARY KEY(site_id,employee_type_code),
    ADD UNIQUE KEY uq_tmp_current_policy(policy_id);

  DELETE revision FROM payroll_policy_revisions revision
  JOIN payroll_policy_versions policy ON policy.id=revision.payroll_policy_version_id
  JOIN tmp_current_policies current_policy
    ON current_policy.site_id=policy.site_id
   AND current_policy.employee_type_code=policy.employee_type_code
  WHERE policy.id<>current_policy.policy_id;

  DELETE snapshot FROM payroll_period_policy_snapshots snapshot
  JOIN payroll_policy_versions policy ON policy.id=snapshot.payroll_policy_version_id
  JOIN tmp_current_policies current_policy
    ON current_policy.site_id=policy.site_id
   AND current_policy.employee_type_code=policy.employee_type_code
  WHERE policy.id<>current_policy.policy_id;

  DELETE policy FROM payroll_policy_versions policy
  JOIN tmp_current_policies current_policy
    ON current_policy.site_id=policy.site_id
   AND current_policy.employee_type_code=policy.employee_type_code
  WHERE policy.id<>current_policy.policy_id;

  CREATE TEMPORARY TABLE tmp_current_daily_rates AS
  SELECT employee_id,MAX(id) rate_id
  FROM employee_daily_rate_histories
  GROUP BY employee_id;
  ALTER TABLE tmp_current_daily_rates
    ADD PRIMARY KEY(employee_id),
    ADD UNIQUE KEY uq_tmp_current_daily_rate(rate_id);

  DELETE revision FROM employee_daily_rate_revisions revision
  JOIN employee_daily_rate_histories rate
    ON rate.id=revision.employee_daily_rate_history_id
  JOIN tmp_current_daily_rates current_rate ON current_rate.employee_id=rate.employee_id
  WHERE rate.id<>current_rate.rate_id;

  DELETE detail FROM payroll_time_details detail
  JOIN employee_daily_rate_histories rate
    ON rate.id=detail.employee_daily_rate_history_id
  JOIN tmp_current_daily_rates current_rate ON current_rate.employee_id=rate.employee_id
  WHERE rate.id<>current_rate.rate_id;

  DELETE rate FROM employee_daily_rate_histories rate
  JOIN tmp_current_daily_rates current_rate ON current_rate.employee_id=rate.employee_id
  WHERE rate.id<>current_rate.rate_id;

  CREATE TEMPORARY TABLE tmp_current_salaries AS
  SELECT employee_id,MAX(id) salary_id
  FROM employee_salary_histories
  GROUP BY employee_id;
  ALTER TABLE tmp_current_salaries
    ADD PRIMARY KEY(employee_id),
    ADD UNIQUE KEY uq_tmp_current_salary(salary_id);

  DELETE revision FROM employee_salary_history_revisions revision
  JOIN employee_salary_histories salary
    ON salary.id=revision.employee_salary_history_id
  JOIN tmp_current_salaries current_salary ON current_salary.employee_id=salary.employee_id
  WHERE salary.id<>current_salary.salary_id;

  DELETE detail FROM payroll_monthly_daily_details detail
  JOIN employee_salary_histories salary ON salary.id=detail.employee_salary_history_id
  JOIN tmp_current_salaries current_salary ON current_salary.employee_id=salary.employee_id
  WHERE salary.id<>current_salary.salary_id;

  DELETE summary FROM payroll_monthly_summaries summary
  JOIN employee_salary_histories salary ON salary.id=summary.employee_salary_history_id
  JOIN tmp_current_salaries current_salary ON current_salary.employee_id=salary.employee_id
  WHERE salary.id<>current_salary.salary_id;

  DELETE salary FROM employee_salary_histories salary
  JOIN tmp_current_salaries current_salary ON current_salary.employee_id=salary.employee_id
  WHERE salary.id<>current_salary.salary_id;

  COMMIT;

  DROP TEMPORARY TABLE tmp_current_policies;
  DROP TEMPORARY TABLE tmp_current_daily_rates;
  DROP TEMPORARY TABLE tmp_current_salaries;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='payroll_policy_versions' AND constraint_name='chk_payroll_policy_dates') THEN
    SET @ddl=CONCAT('ALTER TABLE payroll_policy_versions ',IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT ','DROP CHECK '),'chk_payroll_policy_dates'); PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
  -- Unique current-state juga menjadi index pendukung FK site_id sebelum
  -- index tanggal lama dihapus.
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='payroll_policy_versions' AND index_name='uq_payroll_policy_scope') THEN ALTER TABLE payroll_policy_versions ADD UNIQUE KEY uq_payroll_policy_scope(site_id,employee_type_code); END IF;
  IF EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='payroll_policy_versions' AND index_name='idx_payroll_policy_scope_dates') THEN ALTER TABLE payroll_policy_versions DROP INDEX idx_payroll_policy_scope_dates; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='payroll_policy_versions' AND column_name='effective_to') THEN ALTER TABLE payroll_policy_versions DROP COLUMN effective_to; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='payroll_policy_versions' AND column_name='effective_from') THEN ALTER TABLE payroll_policy_versions DROP COLUMN effective_from; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='employee_daily_rate_histories' AND constraint_name='chk_employee_daily_rate_dates') THEN
    SET @ddl=CONCAT('ALTER TABLE employee_daily_rate_histories ',IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT ','DROP CHECK '),'chk_employee_daily_rate_dates'); PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employee_daily_rate_histories' AND index_name='uq_employee_daily_rate_employee') THEN ALTER TABLE employee_daily_rate_histories ADD UNIQUE KEY uq_employee_daily_rate_employee(employee_id); END IF;
  IF EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employee_daily_rate_histories' AND index_name='idx_employee_daily_rate_employee_dates') THEN ALTER TABLE employee_daily_rate_histories DROP INDEX idx_employee_daily_rate_employee_dates; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employee_daily_rate_histories' AND column_name='effective_to') THEN ALTER TABLE employee_daily_rate_histories DROP COLUMN effective_to; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employee_daily_rate_histories' AND column_name='effective_from') THEN ALTER TABLE employee_daily_rate_histories DROP COLUMN effective_from; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='employee_salary_histories' AND constraint_name='chk_employee_salary_dates') THEN
    SET @ddl=CONCAT('ALTER TABLE employee_salary_histories ',IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT ','DROP CHECK '),'chk_employee_salary_dates'); PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employee_salary_histories' AND index_name='uq_employee_salary_employee') THEN ALTER TABLE employee_salary_histories ADD UNIQUE KEY uq_employee_salary_employee(employee_id); END IF;
  IF EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employee_salary_histories' AND index_name='idx_employee_salary_history_dates') THEN ALTER TABLE employee_salary_histories DROP INDEX idx_employee_salary_history_dates; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='employee_salary_histories' AND index_name='idx_employee_salary_status') THEN ALTER TABLE employee_salary_histories DROP INDEX idx_employee_salary_status; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employee_salary_histories' AND column_name='effective_to') THEN ALTER TABLE employee_salary_histories DROP COLUMN effective_to; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='employee_salary_histories' AND column_name='effective_from') THEN ALTER TABLE employee_salary_histories DROP COLUMN effective_from; END IF;

  -- Semua master sekarang dapat diperbarui/diaktifkan ulang pada baris yang sama.
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='payroll_policy_revisions' AND constraint_name='chk_payroll_policy_revision_type') THEN
    SET @ddl=CONCAT('ALTER TABLE payroll_policy_revisions ',IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT ','DROP CHECK '),'chk_payroll_policy_revision_type'); PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
  ALTER TABLE payroll_policy_revisions ADD CONSTRAINT chk_payroll_policy_revision_type CHECK (revision_type IN ('CREATE','CORRECTION','CANCELLATION','REACTIVATION'));
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='employee_daily_rate_revisions' AND constraint_name='chk_employee_daily_rate_revision_type') THEN
    SET @ddl=CONCAT('ALTER TABLE employee_daily_rate_revisions ',IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT ','DROP CHECK '),'chk_employee_daily_rate_revision_type'); PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
  ALTER TABLE employee_daily_rate_revisions ADD CONSTRAINT chk_employee_daily_rate_revision_type CHECK (revision_type IN ('CREATE','CORRECTION','CANCELLATION','REACTIVATION'));
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='employee_salary_history_revisions' AND constraint_name='chk_employee_salary_revision_type') THEN
    SET @ddl=CONCAT('ALTER TABLE employee_salary_history_revisions ',IF(LOCATE('MariaDB',VERSION())>0,'DROP CONSTRAINT ','DROP CHECK '),'chk_employee_salary_revision_type'); PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
  ALTER TABLE employee_salary_history_revisions ADD CONSTRAINT chk_employee_salary_revision_type CHECK (revision_type IN ('CREATE','CORRECTION','CANCELLATION','REACTIVATION'));

  IF EXISTS (SELECT site_id,employee_type_code FROM payroll_policy_versions GROUP BY site_id,employee_type_code HAVING COUNT(*)>1)
     OR EXISTS (SELECT employee_id FROM employee_daily_rate_histories GROUP BY employee_id HAVING COUNT(*)>1)
     OR EXISTS (SELECT employee_id FROM employee_salary_histories GROUP BY employee_id HAVING COUNT(*)>1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Migration gagal: master current state masih duplikat.';
  END IF;
END$$
DELIMITER ;

CALL migrate_payroll_master_current_state();
DROP PROCEDURE migrate_payroll_master_current_state;

SELECT table_name,column_name
FROM information_schema.columns
WHERE table_schema=DATABASE()
  AND table_name IN ('payroll_policy_versions','employee_daily_rate_histories','employee_salary_histories','employee_bpjs_enrollments')
  AND column_name IN ('effective_from','effective_to');
