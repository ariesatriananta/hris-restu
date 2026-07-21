-- Koreksi 24 kontrak migrasi yang aktif pada anchor 2026-07-14,
-- tetapi sudah berakhir sebelum tanggal bisnis 2026-07-21.
--
-- Kontrak dipindahkan ke anniversary tahun 2026 agar tetap ACTIVE hari ini.
-- Hanya menyasar kontrak yang dibuat oleh migrasi awal dan sudah memiliki
-- lifecycle event "Aktivasi kontrak awal hasil migrasi.".

DELIMITER //

DROP PROCEDURE IF EXISTS correct_initial_contracts_current_period_20260721//

CREATE PROCEDURE correct_initial_contracts_current_period_20260721()
BEGIN
  DECLARE v_target INT DEFAULT 0;
  DECLARE v_invalid INT DEFAULT 0;
  DECLARE v_stage_total INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_contract_period_correction;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT COUNT(*) INTO v_target
  FROM employee_contracts c
  JOIN employee_contract_lifecycle_events l ON l.contract_id = c.id
  WHERE c.status = 'ACTIVE'
    AND c.end_date < DATE('2026-07-21')
    AND l.reason = 'Aktivasi kontrak awal hasil migrasi.';

  SELECT COUNT(*) INTO v_invalid
  FROM employee_contracts c
  JOIN employee_contract_lifecycle_events l ON l.contract_id = c.id
  WHERE c.status = 'ACTIVE'
    AND c.end_date < DATE('2026-07-21')
    AND l.reason = 'Aktivasi kontrak awal hasil migrasi.'
    AND EXISTS (
      SELECT 1
      FROM employee_contracts other_contract
      WHERE other_contract.employee_id = c.employee_id
        AND other_contract.id <> c.id
    );

  IF v_target <> 24 OR v_invalid <> 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Preflight koreksi gagal: target bukan tepat 24 kontrak migrasi atau ditemukan kontrak lain pada employee terkait.';
  END IF;

  CREATE TEMPORARY TABLE tmp_contract_period_correction (
    employee_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    employee_uid CHAR(36) NOT NULL,
    site_id BIGINT UNSIGNED NOT NULL,
    contract_id BIGINT UNSIGNED NOT NULL,
    contract_uid CHAR(36) NOT NULL,
    history_uid CHAR(36) NOT NULL,
    new_start_date DATE NOT NULL,
    new_end_date DATE NOT NULL,
    UNIQUE KEY uq_tmp_correction_contract (contract_id)
  ) ENGINE = MEMORY;

  INSERT INTO tmp_contract_period_correction (
    employee_id, employee_uid, site_id, contract_id, contract_uid,
    history_uid, new_start_date, new_end_date
  )
  SELECT
    e.id,
    e.uid,
    e.current_site_id,
    c.id,
    c.uid,
    UUID(),
    DATE_ADD(
      e.join_date,
      INTERVAL (
        YEAR(DATE('2026-07-21')) - YEAR(e.join_date)
        - (DATE_FORMAT(e.join_date, '%m-%d') > DATE_FORMAT(DATE('2026-07-21'), '%m-%d'))
      ) YEAR
    ),
    DATE_SUB(
      DATE_ADD(
        DATE_ADD(
          e.join_date,
          INTERVAL (
            YEAR(DATE('2026-07-21')) - YEAR(e.join_date)
            - (DATE_FORMAT(e.join_date, '%m-%d') > DATE_FORMAT(DATE('2026-07-21'), '%m-%d'))
          ) YEAR
        ),
        INTERVAL 1 YEAR
      ),
      INTERVAL 1 DAY
    )
  FROM employee_contracts c
  JOIN employees e ON e.id = c.employee_id
  JOIN employee_contract_lifecycle_events l ON l.contract_id = c.id
  WHERE c.status = 'ACTIVE'
    AND c.end_date < DATE('2026-07-21')
    AND l.reason = 'Aktivasi kontrak awal hasil migrasi.';

  SELECT COUNT(*) INTO v_stage_total FROM tmp_contract_period_correction;
  IF v_stage_total <> 24 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Staging koreksi tidak berisi tepat 24 kontrak. Transaksi dibatalkan.';
  END IF;

  -- Hilangkan STATUS_CHANGE migrasi lama jika ada; seluruh target akan
  -- menerima satu STATUS_CHANGE ACTIVE pada periode kontrak yang dikoreksi.
  DELETE h
  FROM employee_employment_histories h
  JOIN tmp_contract_period_correction m ON m.employee_id = h.employee_id
  WHERE h.change_type = 'STATUS_CHANGE'
    AND h.reference_number = 'MIGRASI-20260714';

  UPDATE employee_employment_histories h
  JOIN tmp_contract_period_correction m ON m.employee_id = h.employee_id
  JOIN employee_statuses inactive_status ON inactive_status.code = 'INACTIVE'
  SET h.employee_status_id = inactive_status.id,
      h.effective_to = DATE_SUB(m.new_start_date, INTERVAL 1 DAY),
      h.reason = 'Migrasi data awal karyawan',
      h.notes = 'Status awal INACTIVE sebelum kontrak hasil migrasi diaktifkan.',
      h.updated_by = NULL
  WHERE h.change_type = 'INITIAL';

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
    m.new_start_date,
    NULL,
    'STATUS_CHANGE',
    'MIGRASI-20260721',
    'Koreksi periode kontrak awal hasil migrasi.',
    'Status aktif diselaraskan dengan periode kontrak hasil koreksi migrasi.',
    NULL,
    NULL
  FROM tmp_contract_period_correction m
  JOIN employees e ON e.id = m.employee_id
  JOIN employee_statuses active_status ON active_status.code = 'ACTIVE';

  UPDATE employee_contracts c
  JOIN tmp_contract_period_correction m ON m.contract_id = c.id
  SET c.start_date = m.new_start_date,
      c.end_date = m.new_end_date,
      c.notes = CONCAT(
        'Migrasi kontrak awal aktif; periode dikoreksi pada 2026-07-21 agar tetap aktif. ',
        'Lampiran dokumen fisik akan diunggah oleh HR.'
      ),
      c.updated_by = NULL;

  UPDATE employee_contract_lifecycle_events l
  JOIN tmp_contract_period_correction m ON m.contract_id = l.contract_id
  SET l.effective_date = m.new_start_date,
      l.reason = 'Aktivasi kontrak awal hasil migrasi; periode dikoreksi agar tetap aktif per 21 Juli 2026.'
  WHERE l.reason = 'Aktivasi kontrak awal hasil migrasi.';

  INSERT INTO audit_logs (
    uid, user_id, site_id, module, action, table_name, record_id, record_uid,
    description, reason, created_by, updated_by
  )
  SELECT
    UUID(), NULL, m.site_id, 'EMPLOYEES', 'UPDATE', 'employee_contracts', m.contract_id, m.contract_uid,
    'Mengoreksi periode kontrak migrasi agar tetap aktif pada tanggal bisnis.',
    'MIGRASI-20260721', NULL, NULL
  FROM tmp_contract_period_correction m;

  INSERT INTO audit_logs (
    uid, user_id, site_id, module, action, table_name, record_id, record_uid,
    description, reason, created_by, updated_by
  )
  SELECT
    UUID(), NULL, m.site_id, 'EMPLOYEES', 'UPDATE', 'employee_employment_histories', NULL, m.history_uid,
    'Mengoreksi histori status aktif agar sesuai periode kontrak migrasi.',
    'MIGRASI-20260721', NULL, NULL
  FROM tmp_contract_period_correction m;

  COMMIT;

  SELECT
    COUNT(*) AS contracts_corrected,
    MIN(new_start_date) AS earliest_corrected_start,
    MAX(new_end_date) AS latest_corrected_end
  FROM tmp_contract_period_correction;

  DROP TEMPORARY TABLE IF EXISTS tmp_contract_period_correction;
END//

CALL correct_initial_contracts_current_period_20260721()//
DROP PROCEDURE IF EXISTS correct_initial_contracts_current_period_20260721//

DELIMITER ;
