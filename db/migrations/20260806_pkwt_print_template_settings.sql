-- Pengaturan template cetak PKWT produksi versi 2.
-- Tidak mengubah struktur tabel. Setting target dibuat per site dan bagian
-- produksi supaya nilainya dapat disesuaikan tanpa mengubah kontrak lama.

START TRANSACTION;

INSERT INTO system_settings
  (uid, site_id, setting_key, setting_value, description, is_secret)
VALUES
  (
    UUID(),
    NULL,
    'contract.pkwt.first_party',
    JSON_OBJECT(
      'companyName', 'PT Restu Sejati Inti Abadi',
      'directorName', 'Budi Wicaksono Yuwono',
      'directorTitle', 'Direktur',
      'headOfficeAddress', 'Jl. Industri Terboyo Blok F, Desa/Kelurahan Trimulyo, Kec. Genuk, Kota Semarang, Jawa Tengah'
    ),
    'Identitas pihak pertama pada template cetak PKWT.',
    0
  )
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value),
  description = VALUES(description),
  is_secret = VALUES(is_secret);

INSERT INTO system_settings
  (uid, site_id, setting_key, setting_value, description, is_secret)
SELECT
  UUID(),
  available.site_id,
  CONCAT('contract.pkwt.target.', available.section_code),
  JSON_OBJECT(
    'value', 300 + MOD(CRC32(CONCAT(available.site_code, ':', available.section_code)), 401),
    'unit', CASE
      WHEN UPPER(available.section_name) LIKE '%LINTING%'
        OR UPPER(available.section_name) LIKE '%GILING%'
        THEN 'batang per-jam kerja'
      WHEN UPPER(available.section_name) LIKE '%PACK%'
        OR UPPER(available.section_name) LIKE '%KEMAS%'
        THEN 'pak per-jam kerja'
      ELSE 'unit per-jam kerja'
    END
  ),
  CONCAT('Target dummy PKWT untuk bagian ', available.section_name, ' di site ', available.site_name, '.'),
  0
FROM (
  SELECT DISTINCT
    s.id AS site_id,
    s.code AS site_code,
    s.name AS site_name,
    ps.code AS section_code,
    ps.name AS section_name
  FROM production_module_sections pms
  JOIN production_modules pm ON pm.id = pms.production_module_id
  JOIN sites s ON s.id = pm.site_id
  JOIN production_sections ps ON ps.id = pms.production_section_id
  WHERE pms.is_active = 1
    AND pm.is_active = 1
    AND ps.is_active = 1
    AND s.is_active = 1
) available
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  is_secret = VALUES(is_secret);

COMMIT;

SELECT
  COALESCE(s.code, 'GLOBAL') AS setting_scope,
  ss.setting_key,
  ss.setting_value
FROM system_settings ss
LEFT JOIN sites s ON s.id = ss.site_id
WHERE ss.setting_key = 'contract.pkwt.first_party'
   OR ss.setting_key LIKE 'contract.pkwt.target.%'
ORDER BY setting_scope, ss.setting_key;
