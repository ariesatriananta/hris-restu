-- Owner-run additive migration before deploying Linting/Batil pairing.
-- No seeds, backfill, or changes to historical transactions. Do not auto-run.
-- RESTRICT preserves immutable transaction IDs and avoids CHECK/CASCADE error 1901.
CREATE TABLE production_transaction_pairs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  linting_transaction_id BIGINT UNSIGNED NOT NULL,
  batil_transaction_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_pair_uid (uid),
  UNIQUE KEY uq_production_pair_linting (linting_transaction_id),
  UNIQUE KEY uq_production_pair_batil (batil_transaction_id),
  CONSTRAINT chk_production_pair_distinct CHECK (linting_transaction_id <> batil_transaction_id),
  CONSTRAINT fk_production_pair_linting FOREIGN KEY (linting_transaction_id) REFERENCES production_transactions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_production_pair_batil FOREIGN KEY (batil_transaction_id) REFERENCES production_transactions(id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
