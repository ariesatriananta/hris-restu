-- Seed master demo Payroll M5E untuk development/staging.
--
-- Scope:
--   - melengkapi tarif harian HARIAN/TRAINING yang belum memiliki histori;
--   - melengkapi gaji pokok BULANAN yang belum memiliki histori;
--   - tidak membuat Attendance, transaksi Produksi, periode, run, approval,
--     closing, komponen manual, maupun rekening.
--
-- Seed tidak menimpa histori existing. Jika ada histori aktif bertumpang-tindih,
-- data tersebut dipertahankan dan hasil verifikasi akan menunjukkannya.
-- Jalankan HANYA pada environment development/staging.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @confirm_non_production = 'NO'; -- ubah menjadi YES-I-UNDERSTAND
SET @uat_site_code = 'KLATEN';
SET @weekly_start = DATE('2026-08-17'); -- wajib Senin
SET @weekly_end = DATE_ADD(@weekly_start,INTERVAL 6 DAY);
SET @monthly_start = DATE('2026-08-01'); -- wajib tanggal 1
SET @monthly_end = LAST_DAY(@monthly_start);
SET @uat_harian_rate = 150000.00;
SET @uat_training_rate = 100000.00;
SET @uat_monthly_salary = 5000000.00;
SET @seed_version = 'payroll-operational-uat-v1';

DROP PROCEDURE IF EXISTS seed_payroll_operational_uat;
DELIMITER $$
CREATE PROCEDURE seed_payroll_operational_uat()
BEGIN
  DECLARE seed_user_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE target_site_id BIGINT UNSIGNED DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_payroll_uat_candidates;
    RESIGNAL;
  END;

  IF @confirm_non_production<>'YES-I-UNDERSTAND' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: konfirmasi environment non-production belum diisi.';
  END IF;

  IF @uat_site_code IS NULL OR TRIM(@uat_site_code)=''
     OR @weekly_start IS NULL OR @monthly_start IS NULL
     OR DAYOFWEEK(@weekly_start)<>2
     OR DAY(@monthly_start)<>1
     OR @uat_harian_rate<=0 OR @uat_training_rate<=0
     OR @uat_monthly_salary<=0
     OR @seed_version IS NULL OR TRIM(@seed_version)='' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: site, periode, nominal, atau versi seed tidak valid.';
  END IF;

  SELECT MIN(id) INTO target_site_id
  FROM sites
  WHERE code=@uat_site_code AND is_active=1;

  IF target_site_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: site target aktif tidak ditemukan.';
  END IF;

  SELECT MIN(u.id) INTO seed_user_id
  FROM users u
  JOIN user_roles ur ON ur.user_id=u.id
  JOIN roles r ON r.id=ur.role_id AND r.code='SUPER_ADMIN'
  WHERE u.status='ACTIVE';

  IF seed_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: Super Admin aktif untuk audit seed tidak ditemukan.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM payroll_periods pp
    WHERE pp.site_id=target_site_id
      AND pp.employee_type_code IN ('HARIAN','TRAINING')
      AND pp.period_start<=@weekly_end AND pp.period_end>=@weekly_start
      AND (pp.current_run_id IS NOT NULL OR pp.status NOT IN ('DRAFT','CANCELLED'))
  ) OR EXISTS (
    SELECT 1
    FROM payroll_periods pp
    WHERE pp.site_id=target_site_id
      AND pp.employee_type_code='BULANAN'
      AND pp.period_start<=@monthly_end AND pp.period_end>=@monthly_start
      AND (pp.current_run_id IS NOT NULL OR pp.status NOT IN ('DRAFT','CANCELLED'))
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: periode target sudah memiliki run atau workflow Payroll.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM employee_employment_histories first_history
    JOIN employee_employment_histories second_history
      ON second_history.employee_id=first_history.employee_id
     AND second_history.id>first_history.id
     AND second_history.effective_from<=COALESCE(first_history.effective_to,'9999-12-31')
     AND first_history.effective_from<=COALESCE(second_history.effective_to,'9999-12-31')
    WHERE (first_history.site_id=target_site_id OR second_history.site_id=target_site_id)
      AND first_history.effective_from<=GREATEST(@weekly_end,@monthly_end)
      AND COALESCE(first_history.effective_to,'9999-12-31')<= '9999-12-31'
      AND COALESCE(first_history.effective_to,'9999-12-31')>=LEAST(@weekly_start,@monthly_start)
      AND second_history.effective_from<=GREATEST(@weekly_end,@monthly_end)
      AND COALESCE(second_history.effective_to,'9999-12-31')>=LEAST(@weekly_start,@monthly_start)
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: ada histori employment bertumpang-tindih pada periode UAT.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT 'HARIAN' employee_type_code,@weekly_start effective_date
      UNION ALL SELECT 'TRAINING',@weekly_start
      UNION ALL SELECT 'BULANAN',@monthly_start
    ) required
    WHERE (
      SELECT COUNT(*)
      FROM payroll_policy_versions policy
      WHERE policy.site_id=target_site_id
        AND policy.employee_type_code=required.employee_type_code
        AND policy.status='ACTIVE'
        AND policy.effective_from<=required.effective_date
        AND (policy.effective_to IS NULL OR policy.effective_to>=required.effective_date)
    )<>1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: policy HARIAN/TRAINING/BULANAN tidak tunggal pada tanggal UAT.';
  END IF;

  START TRANSACTION;

  DROP TEMPORARY TABLE IF EXISTS tmp_payroll_uat_candidates;
  CREATE TEMPORARY TABLE tmp_payroll_uat_candidates AS
  SELECT
    eh.employee_id,
    eh.site_id,
    et.code employee_type_code,
    GREATEST(
      MIN(eh.effective_from),
      CASE WHEN et.code='BULANAN' THEN @monthly_start ELSE @weekly_start END
    ) effective_from,
    CASE
      WHEN SUM(eh.effective_to IS NULL)>0 THEN NULL
      ELSE MAX(eh.effective_to)
    END effective_to
  FROM employee_employment_histories eh
  JOIN employee_types et ON et.id=eh.employee_type_id
  JOIN employee_statuses es
    ON es.id=eh.employee_status_id AND es.allows_attendance=1
  WHERE eh.site_id=target_site_id
    AND et.code IN ('HARIAN','TRAINING','BULANAN')
    AND eh.effective_from<=CASE
      WHEN et.code='BULANAN' THEN @monthly_end ELSE @weekly_end END
    AND (eh.effective_to IS NULL OR eh.effective_to>=CASE
      WHEN et.code='BULANAN' THEN @monthly_start ELSE @weekly_start END)
  GROUP BY eh.employee_id,eh.site_id,et.code;

  ALTER TABLE tmp_payroll_uat_candidates
    ADD KEY idx_tmp_payroll_uat_candidate_employee(employee_id),
    ADD KEY idx_tmp_payroll_uat_candidate_type(employee_type_code);

  INSERT INTO employee_daily_rate_histories(
    uid,employee_id,site_id,employee_type_code,daily_rate,currency,
    effective_from,effective_to,status,notes,created_by,updated_by
  )
  SELECT
    UUID(),candidate.employee_id,candidate.site_id,candidate.employee_type_code,
    CASE WHEN candidate.employee_type_code='HARIAN'
      THEN @uat_harian_rate ELSE @uat_training_rate END,
    'IDR',candidate.effective_from,candidate.effective_to,'ACTIVE',
    CONCAT('Seed UAT M5E: ',@seed_version),seed_user_id,seed_user_id
  FROM tmp_payroll_uat_candidates candidate
  WHERE candidate.employee_type_code IN ('HARIAN','TRAINING')
    AND NOT EXISTS (
      SELECT 1 FROM employee_daily_rate_histories existing
      WHERE existing.employee_id=candidate.employee_id
        AND existing.status='ACTIVE'
        AND existing.effective_from<=COALESCE(candidate.effective_to,'9999-12-31')
        AND (existing.effective_to IS NULL OR existing.effective_to>=candidate.effective_from)
    );

  INSERT INTO employee_daily_rate_revisions(
    uid,employee_daily_rate_history_id,revision_type,idempotency_key,
    before_data,after_data,reason,revised_by
  )
  SELECT
    UUID(),rate.id,'CREATE',CONCAT('SEED-PAYROLL-UAT-RATE-',rate.id),NULL,
    JSON_OBJECT(
      'employeeId',rate.employee_id,'siteId',rate.site_id,
      'employeeType',rate.employee_type_code,'dailyRate',rate.daily_rate,
      'currency',rate.currency,'effectiveFrom',rate.effective_from,
      'effectiveTo',rate.effective_to,'status',rate.status
    ),
    'Membuat tarif harian khusus dataset UAT Payroll.',seed_user_id
  FROM employee_daily_rate_histories rate
  WHERE rate.notes=CONCAT('Seed UAT M5E: ',@seed_version)
    AND NOT EXISTS (
      SELECT 1 FROM employee_daily_rate_revisions revision
      WHERE revision.employee_daily_rate_history_id=rate.id
        AND revision.revision_type='CREATE'
    );

  INSERT INTO employee_salary_histories(
    uid,employee_id,effective_from,effective_to,basic_salary,currency,
    reason,status,created_by,updated_by
  )
  SELECT
    UUID(),candidate.employee_id,candidate.effective_from,candidate.effective_to,
    @uat_monthly_salary,'IDR',CONCAT('Seed UAT M5E: ',@seed_version),
    'ACTIVE',seed_user_id,seed_user_id
  FROM tmp_payroll_uat_candidates candidate
  WHERE candidate.employee_type_code='BULANAN'
    AND NOT EXISTS (
      SELECT 1 FROM employee_salary_histories existing
      WHERE existing.employee_id=candidate.employee_id
        AND COALESCE(existing.status,'ACTIVE')='ACTIVE'
        AND existing.effective_from<=COALESCE(candidate.effective_to,'9999-12-31')
        AND (existing.effective_to IS NULL OR existing.effective_to>=candidate.effective_from)
    );

  INSERT INTO employee_salary_history_revisions(
    uid,employee_salary_history_id,revision_type,idempotency_key,
    before_data,after_data,reason,revised_by
  )
  SELECT
    UUID(),salary.id,'CREATE',CONCAT('SEED-PAYROLL-UAT-SALARY-',salary.id),NULL,
    JSON_OBJECT(
      'employeeId',salary.employee_id,'basicSalary',salary.basic_salary,
      'currency',salary.currency,'effectiveFrom',salary.effective_from,
      'effectiveTo',salary.effective_to,'status',salary.status
    ),
    'Membuat gaji pokok khusus dataset UAT Payroll.',seed_user_id
  FROM employee_salary_histories salary
  WHERE salary.reason=CONCAT('Seed UAT M5E: ',@seed_version)
    AND NOT EXISTS (
      SELECT 1 FROM employee_salary_history_revisions revision
      WHERE revision.employee_salary_history_id=salary.id
        AND revision.revision_type='CREATE'
    );

  COMMIT;

  SELECT
    candidate.employee_type_code,
    COUNT(DISTINCT candidate.employee_id) eligible_employees,
    CASE
      WHEN candidate.employee_type_code='BULANAN' THEN (
        SELECT COUNT(DISTINCT salary.employee_id)
        FROM employee_salary_histories salary
        JOIN tmp_payroll_uat_candidates scoped
          ON scoped.employee_id=salary.employee_id
         AND scoped.employee_type_code='BULANAN'
        WHERE COALESCE(salary.status,'ACTIVE')='ACTIVE'
          AND salary.effective_from<=@monthly_end
          AND (salary.effective_to IS NULL OR salary.effective_to>=@monthly_start)
      )
      ELSE (
        SELECT COUNT(DISTINCT rate.employee_id)
        FROM employee_daily_rate_histories rate
        JOIN tmp_payroll_uat_candidates scoped
          ON scoped.employee_id=rate.employee_id
         AND scoped.employee_type_code=candidate.employee_type_code
        WHERE rate.status='ACTIVE'
          AND rate.effective_from<=@weekly_end
          AND (rate.effective_to IS NULL OR rate.effective_to>=@weekly_start)
      )
    END employees_with_master_nominal
  FROM tmp_payroll_uat_candidates candidate
  GROUP BY candidate.employee_type_code
  ORDER BY FIELD(candidate.employee_type_code,'HARIAN','TRAINING','BULANAN');

  SELECT
    'Seed selesai. Jalankan db/checks/20260829_payroll_operational_uat.sql sebelum membuat periode.' instruction;

  DROP TEMPORARY TABLE IF EXISTS tmp_payroll_uat_candidates;
END$$
DELIMITER ;

CALL seed_payroll_operational_uat();
DROP PROCEDURE seed_payroll_operational_uat;
