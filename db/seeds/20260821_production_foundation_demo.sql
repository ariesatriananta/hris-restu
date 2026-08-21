-- Dataset demo Fondasi Produksi Borongan.
--
-- Scope:
--   - memastikan master pekerjaan dan tarif demo tersedia;
--   - membuat tepat satu penugasan pekerjaan utama untuk pekerja Produksi yang
--     eligible pada @seed_as_of berdasarkan Bagian Produksi efektif;
--   - TIDAK membuat transaksi Produksi.
--
-- Script aman dijalankan ulang dan tidak menghapus/mengubah assignment manual.
-- Jalankan hanya pada environment development/uji.

-- Database hasil restore/hosting dapat memakai default utf8mb4_general_ci,
-- sedangkan tabel aplikasi memakai utf8mb4_unicode_ci. Kunci collation koneksi
-- dan temporary table agar perbandingan kode tidak menghasilkan error 1267.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @seed_as_of = DATE('2026-08-01');
SET @seed_version = 'production-foundation-demo-v1';

DROP PROCEDURE IF EXISTS seed_production_foundation_demo;
DELIMITER $$
CREATE PROCEDURE seed_production_foundation_demo()
BEGIN
  DECLARE seed_user_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE operator_position_id BIGINT UNSIGNED DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_production_seed_job_map;
    DROP TEMPORARY TABLE IF EXISTS tmp_production_seed_candidates;
    RESIGNAL;
  END;

  IF @seed_as_of IS NULL OR @seed_version IS NULL OR TRIM(@seed_version)='' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: @seed_as_of dan @seed_version wajib diisi.';
  END IF;

  IF EXISTS (SELECT 1 FROM production_transactions LIMIT 1)
     OR EXISTS (SELECT 1 FROM payroll_production_details LIMIT 1) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: Produksi sudah memiliki transaksi atau snapshot Payroll.';
  END IF;

  SELECT MIN(u.id) INTO seed_user_id
  FROM users u
  JOIN user_roles ur ON ur.user_id=u.id
  JOIN roles r ON r.id=ur.role_id AND r.code='SUPER_ADMIN'
  WHERE u.status='ACTIVE';

  IF seed_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: Super Admin aktif tidak ditemukan.';
  END IF;

  SELECT MIN(id) INTO operator_position_id
  FROM positions
  WHERE code='OPERATOR' AND category='PRODUCTION' AND is_active=1;

  IF operator_position_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: Jabatan Produksi OPERATOR aktif tidak ditemukan.';
  END IF;

  START TRANSACTION;

  -- Training mengikuti keputusan Fase Produksi: dicatat berdasarkan hasil.
  UPDATE employee_types
  SET
    name='Pekerja Training',
    payroll_basis='PIECE_RATE',
    description='Pekerja dalam masa pelatihan produksi yang dicatat berdasarkan hasil kerja.',
    updated_by=seed_user_id
  WHERE code='TRAINING';

  INSERT INTO work_units(
    uid,code,name,decimal_precision,is_active,created_by,updated_by
  ) VALUES
    (UUID(),'PCS','Pcs / Batang',0,1,seed_user_id,seed_user_id),
    (UUID(),'PACK','Pak',0,1,seed_user_id,seed_user_id),
    (UUID(),'BOX','Box',0,1,seed_user_id,seed_user_id),
    (UUID(),'KG','Kilogram',2,1,seed_user_id,seed_user_id),
    (UUID(),'UNIT','Unit',2,1,seed_user_id,seed_user_id)
  ON DUPLICATE KEY UPDATE uid=work_units.uid;

  DROP TEMPORARY TABLE IF EXISTS tmp_production_seed_job_map;
  CREATE TEMPORARY TABLE tmp_production_seed_job_map(
    section_code VARCHAR(30) NOT NULL PRIMARY KEY,
    job_code VARCHAR(50) NOT NULL,
    job_name VARCHAR(150) NOT NULL
  ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;

  INSERT INTO tmp_production_seed_job_map(section_code,job_code,job_name)
  VALUES
    ('BATIL','BORONGAN-BATIL','Batil'),
    ('KEMAS1','BORONGAN-KEMAS1','Kemas 1'),
    ('KEMAS2','BORONGAN-KEMAS2','Kemas 2'),
    ('LINTING','BORONGAN-LINTING','Linting'),
    ('PACKING','BORONGAN-PACKING','Packing'),
    ('SLOP','BORONGAN-SLOP','Slop');

  INSERT INTO production_jobs(
    uid,code,name,description,default_unit_id,position_id,category,is_active,
    created_by,updated_by
  )
  SELECT
    UUID(),mapping.job_code,mapping.job_name,
    CONCAT('Pekerjaan demo Produksi untuk Bagian ',mapping.job_name,'.'),
    unit.id,operator_position_id,'BORONGAN',1,seed_user_id,seed_user_id
  FROM tmp_production_seed_job_map mapping
  JOIN work_units unit ON unit.code='PCS'
  LEFT JOIN production_jobs existing ON existing.code=mapping.job_code
  WHERE existing.id IS NULL;

  -- Tarif referensi hanya dibuat bila natural key belum tersedia. Nilai existing
  -- tidak ditimpa agar histori/rate yang disiapkan user tetap utuh.
  INSERT INTO production_job_rates(
    uid,site_id,production_job_id,unit_id,effective_from,effective_to,
    rate_amount,currency,status,reference_number,notes,created_by,updated_by
  )
  SELECT UUID(),s.id,j.id,u.id,'2026-01-01',NULL,rate.rate_amount,'IDR','ACTIVE',
         'DEMO-PRODUCTION-2026','Tarif referensi dataset demo Produksi.',
         seed_user_id,seed_user_id
  FROM (
    SELECT 'JEPARA' site_code,'BORONGAN-LINTING' job_code,1175.0000 rate_amount UNION ALL
    SELECT 'JEPARA','BORONGAN-PACKING',1200.0000 UNION ALL
    SELECT 'JEPARA','BORONGAN-SLOP',1450.0000 UNION ALL
    SELECT 'SEMARANG','BORONGAN-LINTING',1025.0000 UNION ALL
    SELECT 'SEMARANG','BORONGAN-PACKING',1100.0000 UNION ALL
    SELECT 'SEMARANG','BORONGAN-SLOP',1250.0000 UNION ALL
    SELECT 'KLATEN','BORONGAN-BATIL',1075.0000 UNION ALL
    SELECT 'KLATEN','BORONGAN-KEMAS1',1400.0000 UNION ALL
    SELECT 'KLATEN','BORONGAN-KEMAS2',1425.0000 UNION ALL
    SELECT 'KLATEN','BORONGAN-LINTING',925.0000 UNION ALL
    SELECT 'KLATEN','BORONGAN-PACKING',1000.0000 UNION ALL
    SELECT 'KLATEN','BORONGAN-SLOP',1150.0000
  ) rate
  JOIN sites s ON s.code=rate.site_code AND s.is_active=1
  JOIN production_jobs j ON j.code=rate.job_code AND j.is_active=1
  JOIN work_units u ON u.id=j.default_unit_id AND u.is_active=1
  LEFT JOIN production_job_rates existing
    ON existing.site_id=s.id
   AND existing.production_job_id=j.id
   AND existing.effective_from='2026-01-01'
  WHERE existing.id IS NULL;

  IF EXISTS (
    SELECT 1
    FROM production_job_rates first_rate
    JOIN production_job_rates second_rate
      ON second_rate.site_id=first_rate.site_id
     AND second_rate.production_job_id=first_rate.production_job_id
     AND second_rate.id>first_rate.id
     AND second_rate.status='ACTIVE'
     AND first_rate.status='ACTIVE'
     AND second_rate.effective_from<=COALESCE(first_rate.effective_to,'9999-12-31')
     AND first_rate.effective_from<=COALESCE(second_rate.effective_to,'9999-12-31')
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: ditemukan tarif Aktif yang bertumpang-tindih.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_production_seed_candidates;
  CREATE TEMPORARY TABLE tmp_production_seed_candidates AS
  SELECT
    e.id employee_id,
    e.uid employee_uid,
    eh.site_id,
    j.id job_id,
    GREATEST(@seed_as_of,eh.effective_from) effective_from,
    eh.effective_to
  FROM employees e
  JOIN employee_employment_histories eh
    ON eh.employee_id=e.id
   AND eh.effective_from<=@seed_as_of
   AND (eh.effective_to IS NULL OR eh.effective_to>=@seed_as_of)
  JOIN employee_statuses es
    ON es.id=eh.employee_status_id AND es.allows_production=1
  JOIN employee_types et
    ON et.id=eh.employee_type_id AND et.payroll_basis='PIECE_RATE'
  JOIN production_module_sections pms
    ON pms.id=eh.production_module_section_id AND pms.is_active=1
  JOIN production_sections ps
    ON ps.id=pms.production_section_id AND ps.is_active=1
  JOIN tmp_production_seed_job_map mapping
    ON mapping.section_code=ps.code COLLATE utf8mb4_unicode_ci
  JOIN production_jobs j ON j.code=mapping.job_code AND j.is_active=1
  WHERE (
    SELECT COUNT(*)
    FROM employee_employment_histories active_history
    WHERE active_history.employee_id=e.id
      AND active_history.effective_from<=@seed_as_of
      AND (active_history.effective_to IS NULL OR active_history.effective_to>=@seed_as_of)
  )=1
    AND EXISTS (
      SELECT 1
      FROM production_job_rates active_rate
      WHERE active_rate.site_id=eh.site_id
        AND active_rate.production_job_id=j.id
        AND active_rate.status='ACTIVE'
        AND active_rate.effective_from<=@seed_as_of
        AND (active_rate.effective_to IS NULL OR active_rate.effective_to>=@seed_as_of)
    );

  ALTER TABLE tmp_production_seed_candidates
    ADD PRIMARY KEY(employee_id),
    ADD KEY idx_tmp_production_seed_candidate_site(site_id),
    ADD KEY idx_tmp_production_seed_candidate_job(job_id);

  IF EXISTS (
    SELECT 1
    FROM tmp_production_seed_candidates candidate
    JOIN employee_job_assignments assignment
      ON assignment.employee_id=candidate.employee_id
     AND assignment.status='ACTIVE'
     AND assignment.site_id=candidate.site_id
     AND assignment.effective_from<=COALESCE(candidate.effective_to,'9999-12-31')
     AND (assignment.effective_to IS NULL OR assignment.effective_to>=candidate.effective_from)
    WHERE NOT (
      assignment.production_job_id=candidate.job_id
      AND assignment.effective_from=candidate.effective_from
      AND assignment.is_primary=1
    )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: ada assignment manual yang bertumpang-tindih dengan kandidat demo.';
  END IF;

  INSERT INTO employee_job_assignments(
    uid,employee_id,production_job_id,site_id,effective_from,effective_to,
    is_primary,created_by,updated_by
  )
  SELECT
    UUID(),candidate.employee_id,candidate.job_id,candidate.site_id,
    candidate.effective_from,candidate.effective_to,1,seed_user_id,seed_user_id
  FROM tmp_production_seed_candidates candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM employee_job_assignments assignment
    WHERE assignment.employee_id=candidate.employee_id
      AND assignment.status='ACTIVE'
      AND assignment.production_job_id=candidate.job_id
      AND assignment.site_id=candidate.site_id
      AND assignment.effective_from=candidate.effective_from
  );

  IF EXISTS (
    SELECT 1
    FROM tmp_production_seed_candidates candidate
    WHERE NOT EXISTS (
      SELECT 1
      FROM employee_job_assignments assignment
      WHERE assignment.employee_id=candidate.employee_id
        AND assignment.status='ACTIVE'
        AND assignment.site_id=candidate.site_id
        AND assignment.is_primary=1
        AND assignment.effective_from<=@seed_as_of
        AND (assignment.effective_to IS NULL OR assignment.effective_to>=@seed_as_of)
    )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: ada kandidat tanpa pekerjaan utama setelah insert.';
  END IF;

  COMMIT;

  SELECT 'eligible_candidates' metric,COUNT(*) total
  FROM tmp_production_seed_candidates
  UNION ALL
  SELECT 'production_jobs',COUNT(*) FROM production_jobs
  UNION ALL
  SELECT 'production_rates',COUNT(*) FROM production_job_rates
  UNION ALL
  SELECT 'job_assignments',COUNT(*) FROM employee_job_assignments;

  SELECT
    s.code site,
    COUNT(*) active_primary_assignments,
    COUNT(DISTINCT assignment.production_job_id) assigned_jobs
  FROM employee_job_assignments assignment
  JOIN sites s ON s.id=assignment.site_id
  WHERE assignment.is_primary=1
    AND assignment.status='ACTIVE'
    AND assignment.effective_from<=@seed_as_of
    AND (assignment.effective_to IS NULL OR assignment.effective_to>=@seed_as_of)
  GROUP BY s.code
  ORDER BY s.code;

  DROP TEMPORARY TABLE IF EXISTS tmp_production_seed_candidates;
  DROP TEMPORARY TABLE IF EXISTS tmp_production_seed_job_map;
END$$
DELIMITER ;

CALL seed_production_foundation_demo();
DROP PROCEDURE seed_production_foundation_demo;
