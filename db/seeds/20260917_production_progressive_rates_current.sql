-- Tarif client saat ini: Linting, Batil, Packing, dan Slop (tertulis
-- BATHIL/SLOF pada lembar referensi). Hanya untuk development/uji/staging.
-- Jalankan setelah 20260917_production_progressive_rates.sql.
-- Tidak mengubah transaksi lama; tanggal mulai harus bersih dari setoran.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Untuk replay data demo historis, tanggal mulai harus mendahului tanggal
-- setoran pertama. Reset 10 tarif lama dan setoran terkait terlebih dahulu.
SET @effective_from = DATE('2026-01-01');

DROP PROCEDURE IF EXISTS seed_production_progressive_rates;
DELIMITER $$
CREATE PROCEDURE seed_production_progressive_rates()
BEGIN
  DECLARE seed_user_id BIGINT UNSIGNED;
  DECLARE expected_rates INT DEFAULT 0;
  DECLARE inserted_rates INT DEFAULT 0;
  DECLARE inserted_tiers INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_progressive_rate_targets;
    RESIGNAL;
  END;

  IF @effective_from IS NULL OR @effective_from>CURRENT_DATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: @effective_from wajib diisi dan tidak boleh di masa depan.';
  END IF;

  SELECT MIN(u.id) INTO seed_user_id
  FROM users u JOIN user_roles ur ON ur.user_id=u.id
  JOIN roles r ON r.id=ur.role_id AND r.code='SUPER_ADMIN'
  WHERE u.status='ACTIVE';
  IF seed_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: Super Admin aktif tidak ditemukan.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_progressive_rate_targets;
  CREATE TEMPORARY TABLE tmp_progressive_rate_targets (
    site_code VARCHAR(30) NOT NULL,
    job_code VARCHAR(50) NOT NULL,
    threshold_quantity DECIMAL(18,4) NULL,
    base_amount DECIMAL(18,4) NOT NULL,
    upper_amount DECIMAL(18,4) NULL,
    site_id BIGINT UNSIGNED NULL,
    job_id BIGINT UNSIGNED NULL,
    unit_id BIGINT UNSIGNED NULL,
    PRIMARY KEY(site_code,job_code)
  ) ENGINE=InnoDB;

  INSERT INTO tmp_progressive_rate_targets
    (site_code,job_code,threshold_quantity,base_amount,upper_amount)
  VALUES
    ('SEMARANG','BORONGAN-LINTING',3200,45,47),
    ('JEPARA','BORONGAN-LINTING',3200,35,37),
    ('KLATEN','BORONGAN-LINTING',3200,31,33),
    ('KLATEN','BORONGAN-BATIL',NULL,6,NULL),
    ('SEMARANG','BORONGAN-PACKING',500,122,167),
    ('JEPARA','BORONGAN-PACKING',500,121,158),
    ('KLATEN','BORONGAN-PACKING',500,102,130),
    ('SEMARANG','BORONGAN-SLOP',500,96,111),
    ('JEPARA','BORONGAN-SLOP',500,84,99),
    ('KLATEN','BORONGAN-SLOP',500,69,84);

  UPDATE tmp_progressive_rate_targets target
  JOIN sites site ON site.code=target.site_code AND site.is_active=1
  JOIN production_jobs job ON job.code=target.job_code AND job.is_active=1
  JOIN work_units unit ON unit.id=job.default_unit_id
    AND unit.code='PCS' AND unit.is_active=1
  SET target.site_id=site.id,target.job_id=job.id,target.unit_id=unit.id;

  SELECT COUNT(*) INTO expected_rates FROM tmp_progressive_rate_targets;
  IF expected_rates<>10 OR EXISTS (
    SELECT 1 FROM tmp_progressive_rate_targets
    WHERE site_id IS NULL OR job_id IS NULL OR unit_id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: site, pekerjaan, atau satuan PCS belum siap.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM production_transactions pt
    JOIN tmp_progressive_rate_targets target
      ON target.site_id=pt.site_id AND target.job_id=pt.production_job_id
    WHERE pt.business_date>=@effective_from
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: sudah ada setoran pada atau setelah tanggal mulai tarif.';
  END IF;

  -- Tarif lain yang dimulai tepat/pasca tanggal ini harus ditangani manual;
  -- jangan memotong histori master milik user tanpa kepastian.
  IF EXISTS (
    SELECT 1 FROM production_job_rates rate
    JOIN tmp_progressive_rate_targets target
      ON target.site_id=rate.site_id AND target.job_id=rate.production_job_id
    WHERE rate.status='ACTIVE' AND rate.effective_from>=@effective_from
      AND NOT (rate.reference_number <=> 'CLIENT-PROGRESSIVE-2026')
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tarif aktif lain dimulai pada/setelah tanggal target.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM production_job_rates rate
    JOIN tmp_progressive_rate_targets target
      ON target.site_id=rate.site_id AND target.job_id=rate.production_job_id
    WHERE rate.status='ACTIVE'
      AND rate.reference_number='CLIENT-PROGRESSIVE-2026'
      AND rate.effective_from>@effective_from
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: sudah ada versi tarif client setelah tanggal target.';
  END IF;

  START TRANSACTION;

  -- Tutup tarif aktif lama pada H-1 hanya untuk sepuluh pasangan site-pekerjaan.
  UPDATE production_job_rates rate
  JOIN tmp_progressive_rate_targets target
    ON target.site_id=rate.site_id AND target.job_id=rate.production_job_id
  SET rate.effective_to=DATE_SUB(@effective_from,INTERVAL 1 DAY),
      rate.updated_by=seed_user_id
  WHERE rate.status='ACTIVE' AND rate.effective_from<@effective_from
    AND (rate.effective_to IS NULL OR rate.effective_to>=@effective_from);

  INSERT INTO production_job_rates
    (uid,site_id,production_job_id,unit_id,effective_from,effective_to,
     rate_amount,currency,status,reference_number,notes,created_by,updated_by)
  SELECT UUID(),target.site_id,target.job_id,target.unit_id,@effective_from,NULL,
         target.base_amount,'IDR','ACTIVE','CLIENT-PROGRESSIVE-2026',
         'Tarif bertingkat sesuai lembar tarif client.',seed_user_id,seed_user_id
  FROM tmp_progressive_rate_targets target
  WHERE NOT EXISTS (
    SELECT 1 FROM production_job_rates rate
    WHERE rate.site_id=target.site_id AND rate.production_job_id=target.job_id
      AND rate.effective_from=@effective_from
  );
  SET inserted_rates=ROW_COUNT();

  IF EXISTS (
    SELECT 1 FROM tmp_progressive_rate_targets target
    JOIN production_job_rates rate
      ON rate.site_id=target.site_id AND rate.production_job_id=target.job_id
     AND rate.effective_from=@effective_from
    WHERE rate.status<>'ACTIVE' OR rate.effective_to IS NOT NULL
       OR NOT (rate.reference_number <=> 'CLIENT-PROGRESSIVE-2026')
       OR rate.unit_id<>target.unit_id OR rate.rate_amount<>target.base_amount
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tarif tanggal target sudah ada dengan isi berbeda.';
  END IF;

  INSERT INTO production_job_rate_tiers
    (uid,job_rate_id,min_quantity,rate_amount,created_by,updated_by)
  SELECT UUID(),rate.id,1,target.base_amount,seed_user_id,seed_user_id
  FROM tmp_progressive_rate_targets target
  JOIN production_job_rates rate
    ON rate.site_id=target.site_id AND rate.production_job_id=target.job_id
   AND rate.effective_from=@effective_from
  WHERE NOT EXISTS (
    SELECT 1 FROM production_job_rate_tiers tier
    WHERE tier.job_rate_id=rate.id AND tier.min_quantity=1
  );
  SET inserted_tiers=ROW_COUNT();

  INSERT INTO production_job_rate_tiers
    (uid,job_rate_id,min_quantity,rate_amount,created_by,updated_by)
  SELECT UUID(),rate.id,target.threshold_quantity+1,target.upper_amount,
         seed_user_id,seed_user_id
  FROM tmp_progressive_rate_targets target
  JOIN production_job_rates rate
    ON rate.site_id=target.site_id AND rate.production_job_id=target.job_id
   AND rate.effective_from=@effective_from
  WHERE target.threshold_quantity IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM production_job_rate_tiers tier
      WHERE tier.job_rate_id=rate.id
        AND tier.min_quantity=target.threshold_quantity+1
    );
  SET inserted_tiers=inserted_tiers+ROW_COUNT();

  IF EXISTS (
    SELECT 1 FROM tmp_progressive_rate_targets target
    JOIN production_job_rates rate
      ON rate.site_id=target.site_id AND rate.production_job_id=target.job_id
     AND rate.effective_from=@effective_from
    WHERE (SELECT COUNT(*) FROM production_job_rate_tiers tier
           WHERE tier.job_rate_id=rate.id)
          <>IF(target.threshold_quantity IS NULL,1,2)
       OR NOT EXISTS (
         SELECT 1 FROM production_job_rate_tiers tier
         WHERE tier.job_rate_id=rate.id AND tier.min_quantity=1
           AND tier.rate_amount=target.base_amount
       )
       OR (target.threshold_quantity IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM production_job_rate_tiers tier
         WHERE tier.job_rate_id=rate.id
           AND tier.min_quantity=target.threshold_quantity+1
           AND tier.rate_amount=target.upper_amount
       ))
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tingkat tarif tanggal target berbeda dari lembar client.';
  END IF;

  COMMIT;
  SELECT @effective_from effective_from,expected_rates rate_pairs,
         inserted_rates rates_inserted,inserted_tiers tiers_inserted;
  SELECT site_code site,job_code pekerjaan,
         threshold_quantity batas_tingkat_pertama,
         base_amount tarif_dasar,
         upper_amount tarif_di_atas_batas
  FROM tmp_progressive_rate_targets
  ORDER BY site_code,job_code;
  DROP TEMPORARY TABLE tmp_progressive_rate_targets;
END$$
DELIMITER ;

CALL seed_production_progressive_rates();
DROP PROCEDURE seed_production_progressive_rates;
