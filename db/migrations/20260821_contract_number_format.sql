-- Renumber seluruh kontrak demo ke format operasional per site dan bulan:
--   {JENIS}/{KODE-SITE-HR}/{URUTAN-BULANAN-SITE}/{BULAN-ROMAWI}/{TAHUN}
--
-- Mapping:
--   SEMARANG -> RSIASMG-HR
--   KLATEN   -> RSIASLO-HR
--   JEPARA   -> RSIAKDS-HR
--
-- Urutan dibuat deterministik berdasarkan tanggal mulai, waktu pembuatan, lalu
-- ID kontrak. sequence_number (urutan kontrak milik karyawan) tidak diubah.
-- Snapshot cetak yang dihasilkan aplikasi dihapus supaya dapat dibuat ulang
-- memakai nomor baru. issued_file_id (scan/file kontrak asli) tetap utuh.
--
-- Jalankan hanya pada database demo setelah backup. Script ini tidak mengubah
-- schema dan TIDAK dijalankan otomatis oleh aplikasi.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS migrate_contract_number_format_20260821;
DELIMITER $$
CREATE PROCEDURE migrate_contract_number_format_20260821()
BEGIN
  DECLARE contract_total BIGINT DEFAULT 0;
  DECLARE mapped_total BIGINT DEFAULT 0;
  DECLARE placeholder_total BIGINT DEFAULT 0;
  DECLARE renumbered_total BIGINT DEFAULT 0;
  DECLARE print_snapshot_total BIGINT DEFAULT 0;
  DECLARE allocation_lock_acquired TINYINT DEFAULT 0;
  DECLARE allocation_lock_released TINYINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_contract_number_20260821;
    IF allocation_lock_acquired=1 THEN
      DO RELEASE_LOCK('hris:employee-contract-number');
    END IF;
    RESIGNAL;
  END;

  SELECT GET_LOCK('hris:employee-contract-number',10)
    INTO allocation_lock_acquired;
  IF allocation_lock_acquired<>1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi dibatalkan: alokasi nomor kontrak sedang diproses aplikasi.';
  END IF;

  START TRANSACTION;

  IF EXISTS (
    SELECT 1
    FROM employee_contracts
    WHERE contract_number LIKE '__CONTRACT_RENUMBER__/%'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi dibatalkan: ditemukan nomor placeholder dari proses lain.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM employee_contracts c
    JOIN contract_types ct ON ct.id=c.contract_type_id
    WHERE UPPER(ct.code) NOT REGEXP '^[A-Z0-9-]+$'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi dibatalkan: ada jenis kontrak tanpa format yang didukung.';
  END IF;

  SELECT COUNT(*) INTO contract_total FROM employee_contracts;

  SELECT COUNT(*) INTO print_snapshot_total
  FROM employee_contracts
  WHERE JSON_CONTAINS_PATH(COALESCE(terms_json,JSON_OBJECT()),'one','$.contractPrintV1')=1
     OR JSON_CONTAINS_PATH(COALESCE(terms_json,JSON_OBJECT()),'one','$.contractPrintV2')=1;

  DROP TEMPORARY TABLE IF EXISTS tmp_contract_number_20260821;
  CREATE TEMPORARY TABLE tmp_contract_number_20260821 (
    contract_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    old_contract_number VARCHAR(100) NOT NULL,
    old_issued_file_id BIGINT UNSIGNED NULL,
    historical_site_code VARCHAR(30) NULL,
    snapshot_site_code VARCHAR(30) NULL,
    history_site_code VARCHAR(30) NULL,
    effective_history_count BIGINT NOT NULL,
    contract_year SMALLINT UNSIGNED NOT NULL,
    contract_month TINYINT UNSIGNED NOT NULL,
    new_contract_number VARCHAR(100) NULL,
    UNIQUE KEY uq_tmp_contract_number_20260821_new (new_contract_number)
  ) ENGINE=InnoDB
    DEFAULT CHARSET=utf8mb4
    COLLATE=utf8mb4_unicode_ci;

  INSERT INTO tmp_contract_number_20260821(
    contract_id,old_contract_number,old_issued_file_id,historical_site_code,
    snapshot_site_code,history_site_code,effective_history_count,
    contract_year,contract_month,new_contract_number
  )
  SELECT
    ranked.id,
    ranked.contract_number,
    ranked.issued_file_id,
    ranked.site_code,
    ranked.snapshot_site_code,
    ranked.history_site_code,
    ranked.effective_history_count,
    ranked.contract_year,
    ranked.contract_month,
    CONCAT(
      ranked.contract_type,'/',ranked.site_segment,'/',
      LPAD(
        ranked.monthly_sequence,
        GREATEST(3,CHAR_LENGTH(CAST(ranked.monthly_sequence AS CHAR))),
        '0'
      ),'/',
      ELT(
        ranked.contract_month,
        'I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'
      ),'/',ranked.contract_year
    )
  FROM (
    SELECT
      c.id,
      c.contract_number,
      c.issued_file_id,
      UPPER(ct.code) contract_type,
      resolved.site_code,
      resolved.snapshot_site_code,
      resolved.history_site_code,
      resolved.effective_history_count,
      CASE resolved.site_code
        WHEN 'SEMARANG' THEN 'RSIASMG-HR'
        WHEN 'KLATEN' THEN 'RSIASLO-HR'
        WHEN 'JEPARA' THEN 'RSIAKDS-HR'
      END site_segment,
      MONTH(c.start_date) contract_month,
      YEAR(c.start_date) contract_year,
      ROW_NUMBER() OVER (
        PARTITION BY resolved.site_code,YEAR(c.start_date),MONTH(c.start_date)
        ORDER BY c.start_date,c.created_at,c.id
      ) monthly_sequence
    FROM employee_contracts c
    JOIN contract_types ct ON ct.id=c.contract_type_id
    JOIN (
      SELECT
        source.id contract_id,
        source.snapshot_site_code,
        source.history_site_code,
        source.effective_history_count,
        COALESCE(source.snapshot_site_code,source.history_site_code) site_code
      FROM (
        SELECT
          contract.id,
          CASE UPPER(TRIM(contract.site_name_snapshot))
            WHEN 'SITE SEMARANG' THEN 'SEMARANG'
            WHEN 'SEMARANG' THEN 'SEMARANG'
            WHEN 'RSIASMG-HR' THEN 'SEMARANG'
            WHEN 'SITE KLATEN' THEN 'KLATEN'
            WHEN 'KLATEN' THEN 'KLATEN'
            WHEN 'RSIASLO-HR' THEN 'KLATEN'
            WHEN 'SITE JEPARA' THEN 'JEPARA'
            WHEN 'JEPARA' THEN 'JEPARA'
            WHEN 'RSIAKDS-HR' THEN 'JEPARA'
          END snapshot_site_code,
          (
            SELECT historical_site.code
            FROM employee_employment_histories history
            JOIN sites historical_site ON historical_site.id=history.site_id
            WHERE history.employee_id=contract.employee_id
              AND history.effective_from<=contract.start_date
              AND (history.effective_to IS NULL OR history.effective_to>=contract.start_date)
            ORDER BY history.id
            LIMIT 1
          ) history_site_code,
          (
            SELECT COUNT(*)
            FROM employee_employment_histories history
            WHERE history.employee_id=contract.employee_id
              AND history.effective_from<=contract.start_date
              AND (history.effective_to IS NULL OR history.effective_to>=contract.start_date)
          ) effective_history_count
        FROM employee_contracts contract
      ) source
    ) resolved ON resolved.contract_id=c.id
  ) ranked;

  SELECT COUNT(*) INTO mapped_total FROM tmp_contract_number_20260821;
  IF mapped_total<>contract_total THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi dibatalkan: jumlah hasil pemetaan tidak sama dengan jumlah kontrak.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_contract_number_20260821
    WHERE historical_site_code IS NULL
       OR historical_site_code NOT IN ('SEMARANG','KLATEN','JEPARA')
       OR (
         snapshot_site_code IS NULL
         AND effective_history_count<>1
       )
       OR effective_history_count>1
       OR (
         snapshot_site_code IS NOT NULL
         AND effective_history_count=1
         AND history_site_code<>snapshot_site_code
       )
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi dibatalkan: site snapshot/historis kontrak tidak valid atau tidak konsisten.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_contract_number_20260821
    WHERE new_contract_number NOT REGEXP
      '^[A-Z0-9-]+/(RSIASMG-HR|RSIASLO-HR|RSIAKDS-HR)/[0-9]{3,}/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)/[0-9]{4}$'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi dibatalkan: hasil nomor kontrak tidak sesuai format target.';
  END IF;

  -- Lewati unique key nomor lama dengan placeholder unik dan berumur pendek.
  UPDATE employee_contracts c
  JOIN tmp_contract_number_20260821 mapping ON mapping.contract_id=c.id
  SET c.contract_number=CONCAT(
    '__CONTRACT_RENUMBER__/',c.id,'/',REPLACE(UUID(),'-','')
  );
  SET placeholder_total=ROW_COUNT();

  IF placeholder_total<>contract_total THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi dibatalkan: tidak semua kontrak berhasil masuk tahap placeholder.';
  END IF;

  UPDATE employee_contracts c
  JOIN tmp_contract_number_20260821 mapping ON mapping.contract_id=c.id
  SET
    c.contract_number=mapping.new_contract_number,
    c.terms_json=CASE
      WHEN c.terms_json IS NULL THEN NULL
      ELSE JSON_REMOVE(c.terms_json,'$.contractPrintV1','$.contractPrintV2')
    END;
  SET renumbered_total=ROW_COUNT();

  IF renumbered_total<>contract_total THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi dibatalkan: tidak semua kontrak berhasil diberi nomor baru.';
  END IF;

  IF EXISTS (
    SELECT contract_number
    FROM employee_contracts
    GROUP BY contract_number
    HAVING COUNT(*)<>1
  ) OR EXISTS (
    SELECT 1
    FROM employee_contracts c
    JOIN tmp_contract_number_20260821 mapping ON mapping.contract_id=c.id
    WHERE c.contract_number<>mapping.new_contract_number
       OR NOT (c.issued_file_id<=>mapping.old_issued_file_id)
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi dibatalkan: validasi keunikan atau rekonsiliasi nomor gagal.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM employee_contracts
    WHERE JSON_CONTAINS_PATH(COALESCE(terms_json,JSON_OBJECT()),'one','$.contractPrintV1')=1
       OR JSON_CONTAINS_PATH(COALESCE(terms_json,JSON_OBJECT()),'one','$.contractPrintV2')=1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi dibatalkan: snapshot cetak lama masih tersisa.';
  END IF;

  COMMIT;

  SELECT RELEASE_LOCK('hris:employee-contract-number')
    INTO allocation_lock_released;
  IF allocation_lock_released<>1 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Migrasi selesai tetapi lock alokasi nomor kontrak gagal dilepas.';
  END IF;
  SET allocation_lock_acquired=0;

  SELECT
    contract_total contracts,
    renumbered_total renumbered,
    print_snapshot_total print_snapshots_cleared,
    'issued_file_id tetap dipertahankan' uploaded_files;

  SELECT
    mapping.historical_site_code site,
    mapping.contract_year,
    mapping.contract_month,
    COUNT(*) contracts,
    MIN(c.contract_number) first_contract_number,
    MAX(c.contract_number) last_contract_number
  FROM employee_contracts c
  JOIN tmp_contract_number_20260821 mapping ON mapping.contract_id=c.id
  GROUP BY mapping.historical_site_code,mapping.contract_year,mapping.contract_month
  ORDER BY mapping.contract_year,mapping.contract_month,mapping.historical_site_code;

  DROP TEMPORARY TABLE tmp_contract_number_20260821;
END$$
DELIMITER ;

CALL migrate_contract_number_format_20260821();
DROP PROCEDURE migrate_contract_number_format_20260821;
