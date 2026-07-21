-- Aktivasi kontrak awal hasil migrasi employee per 14 Juli 2026.
-- Cakupan yang dikunci:
--   BORONGAN -> PKWT     : 1.180 karyawan
--   TRAINING -> TRAINING :   165 karyawan
-- Total                  : 1.345 karyawan
--
-- Tidak membuat file/lampiran kontrak fiktif. issued_file_id tetap NULL.
-- Jalankan pada database hasil backup. Script akan berhenti sebelum write
-- apabila preflight tidak cocok dengan kondisi migrasi yang dikunci di atas.

SET @migration_anchor_date = DATE('2026-07-14');

-- Preview: semua angka harus cocok sebelum CALL di bawah dijalankan.
SELECT
  COUNT(*) AS total_employees,
  SUM(employee_type = 'BORONGAN') AS borongan_employees,
  SUM(employee_type = 'TRAINING') AS training_employees,
  SUM(employee_status <> 'INACTIVE') AS non_inactive_employees,
  SUM(existing_contracts > 0) AS employees_with_contracts,
  SUM(initial_histories <> 1 OR open_initial_histories <> 1 OR initial_effective_from <> join_date) AS invalid_initial_histories,
  SUM(join_date > @migration_anchor_date) AS joins_after_anchor
FROM (
  SELECT
    e.id,
    et.code AS employee_type,
    es.code AS employee_status,
    e.join_date,
    (SELECT COUNT(*) FROM employee_contracts c WHERE c.employee_id = e.id) AS existing_contracts,
    (SELECT COUNT(*) FROM employee_employment_histories h WHERE h.employee_id = e.id AND h.change_type = 'INITIAL') AS initial_histories,
    (SELECT COUNT(*) FROM employee_employment_histories h WHERE h.employee_id = e.id AND h.change_type = 'INITIAL' AND h.effective_to IS NULL) AS open_initial_histories,
    (SELECT MIN(h.effective_from) FROM employee_employment_histories h WHERE h.employee_id = e.id AND h.change_type = 'INITIAL') AS initial_effective_from
  FROM employees e
  JOIN employee_types et ON et.id = e.employee_type_id
  JOIN employee_statuses es ON es.id = e.employee_status_id
) migration_preview;

DELIMITER //

DROP PROCEDURE IF EXISTS activate_initial_migrated_contracts_20260714//

CREATE PROCEDURE activate_initial_migrated_contracts_20260714()
BEGIN
  DECLARE v_total INT DEFAULT 0;
  DECLARE v_borongan INT DEFAULT 0;
  DECLARE v_training INT DEFAULT 0;
  DECLARE v_invalid INT DEFAULT 0;
  DECLARE v_contract_types INT DEFAULT 0;
  DECLARE v_stage_total INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_initial_contract_migration;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT
    COUNT(*),
    SUM(et.code = 'BORONGAN'),
    SUM(et.code = 'TRAINING'),
    SUM(
      es.code <> 'INACTIVE'
      OR EXISTS (SELECT 1 FROM employee_contracts c WHERE c.employee_id = e.id)
      OR (SELECT COUNT(*) FROM employee_employment_histories h WHERE h.employee_id = e.id AND h.change_type = 'INITIAL') <> 1
      OR (SELECT COUNT(*) FROM employee_employment_histories h WHERE h.employee_id = e.id AND h.change_type = 'INITIAL' AND h.effective_to IS NULL) <> 1
      OR (SELECT MIN(h.effective_from) FROM employee_employment_histories h WHERE h.employee_id = e.id AND h.change_type = 'INITIAL') <> e.join_date
      OR e.join_date > DATE('2026-07-14')
      OR et.code NOT IN ('BORONGAN', 'TRAINING')
    )
  INTO v_total, v_borongan, v_training, v_invalid
  FROM employees e
  JOIN employee_types et ON et.id = e.employee_type_id
  JOIN employee_statuses es ON es.id = e.employee_status_id;

  SELECT COUNT(*) INTO v_contract_types
  FROM contract_types
  WHERE is_active = 1 AND code IN ('PKWT', 'TRAINING');

  IF v_total <> 1345 OR v_borongan <> 1180 OR v_training <> 165 OR v_invalid <> 0 OR v_contract_types <> 2 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Preflight gagal: total/type/status/riwayat/kontrak awal tidak sesuai data migrasi yang dikunci.';
  END IF;

  CREATE TEMPORARY TABLE tmp_initial_contract_migration (
    employee_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    employee_uid CHAR(36) NOT NULL,
    site_id BIGINT UNSIGNED NOT NULL,
    employee_number VARCHAR(50) NOT NULL,
    position_name_snapshot VARCHAR(150) NULL,
    site_name_snapshot VARCHAR(150) NOT NULL,
    contract_uid CHAR(36) NOT NULL,
    lifecycle_uid CHAR(36) NOT NULL,
    history_uid CHAR(36) NOT NULL,
    contract_type_id BIGINT UNSIGNED NOT NULL,
    contract_type_code VARCHAR(30) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    contract_number VARCHAR(100) NOT NULL,
    UNIQUE KEY uq_tmp_contract_uid (contract_uid),
    UNIQUE KEY uq_tmp_contract_number (contract_number)
  ) ENGINE = MEMORY;

  INSERT INTO tmp_initial_contract_migration (
    employee_id,
    employee_uid,
    site_id,
    employee_number,
    position_name_snapshot,
    site_name_snapshot,
    contract_uid,
    lifecycle_uid,
    history_uid,
    contract_type_id,
    contract_type_code,
    start_date,
    end_date,
    contract_number
  )
  SELECT
    e.id,
    e.uid,
    e.current_site_id,
    e.employee_number,
    p.name,
    s.name,
    UUID(),
    UUID(),
    UUID(),
    ct.id,
    ct.code,
    DATE_ADD(
      e.join_date,
      INTERVAL (
        YEAR(DATE('2026-07-14')) - YEAR(e.join_date)
        - (DATE_FORMAT(e.join_date, '%m-%d') > DATE_FORMAT(DATE('2026-07-14'), '%m-%d'))
      ) YEAR
    ) AS start_date,
    DATE_SUB(
      DATE_ADD(
        DATE_ADD(
          e.join_date,
          INTERVAL (
            YEAR(DATE('2026-07-14')) - YEAR(e.join_date)
            - (DATE_FORMAT(e.join_date, '%m-%d') > DATE_FORMAT(DATE('2026-07-14'), '%m-%d'))
          ) YEAR
        ),
        INTERVAL 1 YEAR
      ),
      INTERVAL 1 DAY
    ) AS end_date,
    CONCAT(ct.code, '-', e.employee_number, '-01') AS contract_number
  FROM employees e
  JOIN employee_types et ON et.id = e.employee_type_id
  JOIN contract_types ct
    ON ct.code = CASE et.code WHEN 'BORONGAN' THEN 'PKWT' WHEN 'TRAINING' THEN 'TRAINING' END
   AND ct.is_active = 1
  JOIN sites s ON s.id = e.current_site_id
  LEFT JOIN positions p ON p.id = e.current_position_id;

  SELECT COUNT(*) INTO v_stage_total FROM tmp_initial_contract_migration;
  IF v_stage_total <> 1345 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Staging kontrak tidak berisi 1.345 karyawan. Transaksi dibatalkan.';
  END IF;

  INSERT INTO employee_contracts (
    uid, employee_id, contract_number, contract_type_id, sequence_number,
    start_date, end_date, signed_date, status,
    position_name_snapshot, site_name_snapshot, issued_file_id, notes,
    created_by, updated_by
  )
  SELECT
    contract_uid, employee_id, contract_number, contract_type_id, 1,
    start_date, end_date, NULL, 'ACTIVE',
    position_name_snapshot, site_name_snapshot, NULL,
    'Migrasi kontrak awal aktif per 14 Juli 2026. Lampiran dokumen fisik akan diunggah oleh HR.',
    NULL, NULL
  FROM tmp_initial_contract_migration;

  -- Jika kontrak mulai tepat pada join_date, histori INITIAL tidak boleh
  -- ditutup sehari sebelumnya. Lifecycle aplikasi juga menyelaraskan status
  -- pada histori hari yang sama tanpa membuat interval tanggal tidak valid.
  UPDATE employee_employment_histories h
  JOIN tmp_initial_contract_migration m ON m.employee_id = h.employee_id
  JOIN employee_statuses active_status ON active_status.code = 'ACTIVE'
  SET h.effective_to = CASE
        WHEN h.effective_from < m.start_date THEN DATE_SUB(m.start_date, INTERVAL 1 DAY)
        ELSE h.effective_to
      END,
      h.employee_status_id = CASE
        WHEN h.effective_from = m.start_date THEN active_status.id
        ELSE h.employee_status_id
      END,
      h.reason = CASE
        WHEN h.effective_from = m.start_date THEN 'Aktivasi kontrak awal hasil migrasi.'
        ELSE h.reason
      END,
      h.notes = CASE
        WHEN h.effective_from = m.start_date THEN 'Status awal diselaraskan menjadi aktif karena kontrak mulai pada tanggal join.'
        ELSE h.notes
      END,
      h.updated_by = NULL
  WHERE h.change_type = 'INITIAL' AND h.effective_to IS NULL;

  INSERT INTO employee_employment_histories (
    uid, employee_id, site_id, department_id, position_id, work_group_id,
    production_module_section_id, employee_type_id, employee_status_id,
    effective_from, effective_to, change_type, reference_number, reason, notes,
    created_by, updated_by
  )
  SELECT
    m.history_uid,
    e.id,
    e.current_site_id,
    e.current_department_id,
    e.current_position_id,
    e.current_work_group_id,
    e.current_production_module_section_id,
    e.employee_type_id,
    active_status.id,
    m.start_date,
    NULL,
    'STATUS_CHANGE',
    'MIGRASI-20260714',
    'Aktivasi kontrak awal hasil migrasi.',
    'Status aktif ditetapkan dari kontrak aktif hasil migrasi awal.',
    NULL,
    NULL
  FROM tmp_initial_contract_migration m
  JOIN employees e ON e.id = m.employee_id
  JOIN employee_statuses active_status ON active_status.code = 'ACTIVE'
  JOIN employee_employment_histories initial_history
    ON initial_history.employee_id = e.id
   AND initial_history.change_type = 'INITIAL'
  WHERE initial_history.effective_from < m.start_date;

  UPDATE employees e
  JOIN tmp_initial_contract_migration m ON m.employee_id = e.id
  JOIN employee_statuses active_status ON active_status.code = 'ACTIVE'
  SET e.employee_status_id = active_status.id,
      e.updated_by = NULL;

  INSERT INTO employee_contract_lifecycle_events (
    uid, contract_id, from_status, to_status, effective_date, reason, source, actor_user_id
  )
  SELECT
    m.lifecycle_uid,
    c.id,
    NULL,
    'ACTIVE',
    m.start_date,
    'Aktivasi kontrak awal hasil migrasi.',
    'MANUAL',
    NULL
  FROM tmp_initial_contract_migration m
  JOIN employee_contracts c ON c.uid = m.contract_uid;

  INSERT INTO audit_logs (
    uid, user_id, site_id, module, action, table_name, record_id, record_uid,
    description, reason, created_by, updated_by
  )
  SELECT
    UUID(), NULL, m.site_id, 'EMPLOYEES', 'OTHER', 'employee_contracts', c.id, c.uid,
    CONCAT('Migrasi awal mengaktifkan kontrak ', m.contract_number, '.'),
    'MIGRASI-20260714', NULL, NULL
  FROM tmp_initial_contract_migration m
  JOIN employee_contracts c ON c.uid = m.contract_uid;

  INSERT INTO audit_logs (
    uid, user_id, site_id, module, action, table_name, record_id, record_uid,
    description, reason, created_by, updated_by
  )
  SELECT
    UUID(), NULL, m.site_id, 'EMPLOYEES', 'OTHER', 'employees', m.employee_id, m.employee_uid,
    'Migrasi awal menyinkronkan status karyawan menjadi ACTIVE dari kontrak aktif.',
    'MIGRASI-20260714', NULL, NULL
  FROM tmp_initial_contract_migration m;

  COMMIT;

  SELECT
    COUNT(*) AS contracts_created,
    SUM(contract_type_code = 'PKWT') AS pkwt_created,
    SUM(contract_type_code = 'TRAINING') AS training_created,
    MIN(start_date) AS earliest_start_date,
    MAX(end_date) AS latest_end_date
  FROM tmp_initial_contract_migration;

  DROP TEMPORARY TABLE IF EXISTS tmp_initial_contract_migration;
END//

CALL activate_initial_migrated_contracts_20260714()//
DROP PROCEDURE IF EXISTS activate_initial_migrated_contracts_20260714//

DELIMITER ;

-- Verifikasi akhir. Hasil yang diharapkan: 1.345 kontrak ACTIVE,
-- 1.180 PKWT, 165 TRAINING, dan 1.345 employee ACTIVE.
SELECT
  COUNT(*) AS active_contracts,
  SUM(ct.code = 'PKWT') AS active_pkwt,
  SUM(ct.code = 'TRAINING') AS active_training
FROM employee_contracts c
JOIN contract_types ct ON ct.id = c.contract_type_id
WHERE c.status = 'ACTIVE';

SELECT es.code AS employee_status, COUNT(*) AS total
FROM employees e
JOIN employee_statuses es ON es.id = e.employee_status_id
GROUP BY es.code
ORDER BY es.code;
