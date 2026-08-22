-- Audit read-only untuk mengetahui migration terbaru yang sudah terpasang.
-- Aman dijalankan di database staging/Hostinger: hanya menjalankan SELECT.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SELECT
  '20260821_production_foundation.sql' migration_file,
  CASE WHEN EXISTS (
    SELECT 1 FROM permissions WHERE code='production.manage_master'
  ) THEN 'SUDAH' ELSE 'BELUM' END migration_status,
  'permission production.manage_master' evidence
UNION ALL
SELECT
  '20260821_production_transaction_revisions.sql',
  CASE WHEN (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema=DATABASE()
      AND table_name='production_transaction_revisions'
      AND column_name IN ('replacement_transaction_id','idempotency_key')
  )=2 THEN 'SUDAH' ELSE 'BELUM' END,
  '2 kolom revisi transaksi'
UNION ALL
SELECT
  '20260821_attendance_classification_reversal.sql',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema=DATABASE()
      AND table_name='attendance_classification_details'
      AND constraint_name='chk_attendance_classification_outcome'
      AND constraint_type='CHECK'
  ) THEN 'PERIKSA_DEFINISI' ELSE 'BELUM' END,
  'constraint outcome tersedia; definisi ditampilkan di hasil kedua'
UNION ALL
SELECT
  '20260821_production_recap_export_permission.sql',
  CASE WHEN EXISTS (
    SELECT 1 FROM permissions WHERE code='production.export'
  ) THEN 'SUDAH' ELSE 'BELUM' END,
  'permission production.export'
UNION ALL
SELECT
  '20260822_production_exception_integrity.sql',
  CASE WHEN
    (
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema=DATABASE()
        AND (
          (table_name='scan_devices' AND column_name IN (
            'production_token_hash','production_activated_at','production_activated_by'
          ))
          OR (table_name='production_transactions' AND column_name='entry_source')
          OR (table_name='employee_job_assignments' AND column_name='status')
        )
    )=5
    AND (
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema=DATABASE()
        AND table_name IN (
          'employee_job_assignment_revisions','production_job_rate_revisions'
        )
    )=2
  THEN 'SUDAH' ELSE 'BELUM/SEBAGIAN' END,
  '5 kolom dan 2 tabel integrity'
UNION ALL
SELECT
  '20260821_contract_number_format.sql',
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM employee_contracts) THEN 'TIDAK_ADA_DATA'
    WHEN NOT EXISTS (
      SELECT 1
      FROM employee_contracts
      WHERE contract_number NOT REGEXP
        '^[A-Z0-9-]+/(RSIASMG-HR|RSIASLO-HR|RSIAKDS-HR)/[0-9]{3}/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)/[0-9]{4}$'
    ) THEN 'FORMAT_SUDAH_SESUAI'
    ELSE 'PERLU_AUDIT_DATA'
  END,
  'audit pola nomor kontrak; migration ini mengubah data demo'
ORDER BY migration_file;

-- Definisi CHECK outcome Attendance untuk membedakan versi lama dan versi baru.
SELECT
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON cc.constraint_schema=tc.constraint_schema
 AND cc.constraint_name=tc.constraint_name
WHERE tc.constraint_schema=DATABASE()
  AND tc.table_name='attendance_classification_details'
  AND tc.constraint_name='chk_attendance_classification_outcome';

-- Detail objek Fase 2D bila hasil audit menunjukkan BELUM/SEBAGIAN.
SELECT 'COLUMN' object_type,table_name,column_name object_name
FROM information_schema.columns
WHERE table_schema=DATABASE()
  AND (
    (table_name='scan_devices' AND column_name IN (
      'production_token_hash','production_activated_at','production_activated_by'
    ))
    OR (table_name='production_transactions' AND column_name='entry_source')
    OR (table_name='employee_job_assignments' AND column_name='status')
  )
UNION ALL
SELECT 'TABLE',table_name,table_name
FROM information_schema.tables
WHERE table_schema=DATABASE()
  AND table_name IN (
    'employee_job_assignment_revisions','production_job_rate_revisions'
  )
ORDER BY object_type,table_name,object_name;
