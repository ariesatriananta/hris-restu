-- Fase Produksi 2B: hubungan koreksi dan idempotensi aksi revisi.
--
-- Jalankan satu kali setelah schema dasar production_transaction_revisions
-- tersedia. Kolom replacement_transaction_id hanya diisi untuk CORRECTION;
-- VOID langsung tidak memiliki transaksi pengganti.

ALTER TABLE production_transaction_revisions
  ADD COLUMN replacement_transaction_id BIGINT UNSIGNED NULL
    AFTER production_transaction_id,
  ADD COLUMN idempotency_key VARCHAR(100) NULL
    AFTER revision_type,
  ADD UNIQUE KEY uq_production_revisions_replacement
    (replacement_transaction_id),
  ADD UNIQUE KEY uq_production_revisions_idempotency
    (idempotency_key),
  ADD CONSTRAINT fk_production_revision_replacement
    FOREIGN KEY (replacement_transaction_id)
    REFERENCES production_transactions (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

SELECT
  column_name,
  is_nullable,
  column_type
FROM information_schema.columns
WHERE table_schema=DATABASE()
  AND table_name='production_transaction_revisions'
  AND column_name IN ('replacement_transaction_id','idempotency_key')
ORDER BY ordinal_position;
