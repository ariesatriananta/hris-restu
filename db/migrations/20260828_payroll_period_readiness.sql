-- Payroll Milestone 1 - Periode & Readiness.
-- Jalankan setelah 20260828_payroll_integrity.sql.
-- Readiness dihitung live oleh API; migration ini hanya menambah histori
-- pembatalan periode yang diperlukan untuk audit operasional.

-- DDL dibuat dapat dilanjutkan setelah eksekusi parsial. MySQL/MariaDB
-- melakukan implicit commit pada ALTER TABLE, sehingga ROLLBACK tidak dapat
-- menghapus kolom yang sudah terbuat ketika statement berikutnya gagal.
DROP PROCEDURE IF EXISTS ensure_payroll_period_readiness_columns;
DELIMITER $$
CREATE PROCEDURE ensure_payroll_period_readiness_columns()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='payroll_periods'
      AND column_name='cancelled_at'
  ) THEN
    ALTER TABLE payroll_periods
      ADD COLUMN cancelled_at DATETIME(3) NULL AFTER closed_by;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='payroll_periods'
      AND column_name='cancelled_by'
  ) THEN
    ALTER TABLE payroll_periods
      ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancelled_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='payroll_periods'
      AND column_name='cancellation_reason'
  ) THEN
    ALTER TABLE payroll_periods
      ADD COLUMN cancellation_reason VARCHAR(500) NULL AFTER cancelled_by;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema=DATABASE() AND table_name='payroll_periods'
      AND index_name='idx_payroll_periods_cancelled_by'
  ) THEN
    ALTER TABLE payroll_periods
      ADD KEY idx_payroll_periods_cancelled_by (cancelled_by);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema=DATABASE() AND table_name='payroll_periods'
      AND constraint_name='fk_payroll_period_cancelled_by'
  ) THEN
    ALTER TABLE payroll_periods
      ADD CONSTRAINT fk_payroll_period_cancelled_by
      FOREIGN KEY (cancelled_by) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$
DELIMITER ;

CALL ensure_payroll_period_readiness_columns();
DROP PROCEDURE ensure_payroll_period_readiness_columns;

-- Rekonsiliasi periode CANCELLED lama sebelum constraint baru diaktifkan.
START TRANSACTION;

UPDATE payroll_periods
SET cancelled_at=COALESCE(cancelled_at,updated_at,created_at),
    cancelled_by=COALESCE(cancelled_by,updated_by,created_by),
    cancellation_reason=COALESCE(NULLIF(TRIM(cancellation_reason),''),'Migrasi histori pembatalan periode Payroll.')
WHERE status='CANCELLED';

COMMIT;

-- MariaDB menolak CHECK yang membaca cancelled_by karena kolom tersebut dapat
-- berubah otomatis melalui FK ON UPDATE CASCADE / ON DELETE SET NULL (error
-- 1901). Identitas pembatal tetap dijaga oleh FK dan API; CHECK berfokus pada
-- status, waktu, dan alasan pembatalan yang tidak berubah akibat aksi FK.
DROP PROCEDURE IF EXISTS ensure_payroll_period_cancellation_constraint;
DELIMITER $$
CREATE PROCEDURE ensure_payroll_period_cancellation_constraint()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema=DATABASE() AND table_name='payroll_periods'
      AND constraint_name='chk_payroll_period_cancellation'
  ) THEN
    ALTER TABLE payroll_periods
      ADD CONSTRAINT chk_payroll_period_cancellation
      CHECK (
        (status='CANCELLED' AND cancelled_at IS NOT NULL
          AND cancellation_reason IS NOT NULL
          AND CHAR_LENGTH(TRIM(cancellation_reason))>=5)
        OR
        (status<>'CANCELLED' AND cancelled_at IS NULL
          AND cancellation_reason IS NULL)
      );
  END IF;
END$$
DELIMITER ;

CALL ensure_payroll_period_cancellation_constraint();
DROP PROCEDURE ensure_payroll_period_cancellation_constraint;

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
