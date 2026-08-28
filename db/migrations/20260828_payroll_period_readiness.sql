-- Payroll Milestone 1 - Periode & Readiness.
-- Jalankan setelah 20260828_payroll_integrity.sql.
-- Readiness dihitung live oleh API; migration ini hanya menambah histori
-- pembatalan periode yang diperlukan untuk audit operasional.

START TRANSACTION;

ALTER TABLE payroll_periods
  ADD COLUMN cancelled_at DATETIME(3) NULL AFTER closed_by,
  ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancelled_at,
  ADD COLUMN cancellation_reason VARCHAR(500) NULL AFTER cancelled_by,
  ADD KEY idx_payroll_periods_cancelled_by (cancelled_by),
  ADD CONSTRAINT fk_payroll_period_cancelled_by
    FOREIGN KEY (cancelled_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

-- Rekonsiliasi periode CANCELLED lama sebelum constraint baru diaktifkan.
UPDATE payroll_periods
SET cancelled_at=COALESCE(cancelled_at,updated_at,created_at),
    cancelled_by=COALESCE(cancelled_by,updated_by,created_by),
    cancellation_reason=COALESCE(NULLIF(TRIM(cancellation_reason),''),'Migrasi histori pembatalan periode Payroll.')
WHERE status='CANCELLED';

ALTER TABLE payroll_periods
  ADD CONSTRAINT chk_payroll_period_cancellation
    CHECK (
      (status='CANCELLED' AND cancelled_at IS NOT NULL
        AND cancellation_reason IS NOT NULL
        AND CHAR_LENGTH(TRIM(cancellation_reason))>=5)
      OR
      (status<>'CANCELLED' AND cancelled_at IS NULL
        AND cancelled_by IS NULL AND cancellation_reason IS NULL)
    );

COMMIT;

-- Verifikasi: ketiga kolom pembatalan dan constraint harus tersedia.
SELECT
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema=DATABASE()
  AND table_name='payroll_periods'
  AND column_name IN ('cancelled_at','cancelled_by','cancellation_reason')
ORDER BY ordinal_position;

SELECT constraint_name,constraint_type
FROM information_schema.table_constraints
WHERE table_schema=DATABASE()
  AND table_name='payroll_periods'
  AND constraint_name IN (
    'fk_payroll_period_cancelled_by',
    'chk_payroll_period_cancellation'
  )
ORDER BY constraint_name;
