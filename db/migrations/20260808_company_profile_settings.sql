-- Membentuk source of truth global Profil Perusahaan dari identitas PKWT lama.
-- Aman dijalankan ulang dan tidak mengubah snapshot kontrak yang sudah dibuat.

START TRANSACTION;

INSERT INTO system_settings (
  uid,site_id,setting_key,setting_value,description,is_secret,
  created_by,updated_by
)
SELECT
  UUID(),NULL,'company.profile',
  JSON_OBJECT(
    'companyName',JSON_UNQUOTE(JSON_EXTRACT(setting_value,'$.companyName')),
    'legalAddress',JSON_UNQUOTE(JSON_EXTRACT(setting_value,'$.headOfficeAddress')),
    'phone','',
    'email','',
    'website','',
    'taxNumber','',
    'logoFileUid',NULL
  ),
  'Profil global perusahaan.',0,created_by,updated_by
FROM system_settings
WHERE site_id IS NULL
  AND setting_key='contract.pkwt.first_party'
LIMIT 1
ON DUPLICATE KEY UPDATE setting_key=VALUES(setting_key);

COMMIT;

SELECT
  setting_key,
  JSON_UNQUOTE(JSON_EXTRACT(setting_value,'$.companyName')) company_name,
  JSON_UNQUOTE(JSON_EXTRACT(setting_value,'$.legalAddress')) legal_address,
  updated_at
FROM system_settings
WHERE site_id IS NULL
  AND setting_key='company.profile';
