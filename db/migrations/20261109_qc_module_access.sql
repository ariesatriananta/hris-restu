-- Owner-run migration before deploying QC module access. Do not auto-run.
-- Additive schema + narrowly deterministic history backfill. No current-placement fallback.
-- MySQL/MariaDB DDL is not transactional. Back up before running once.
-- Prerequisite: employee_employment_histories has status/cancelled_at/cancelled_by/cancellation_reason.
-- If execution already stopped at eh.status after the CREATE/ALTER above succeeded,
-- use 20261109_qc_module_access_resume.sql instead of rerunning this file.
CREATE TABLE user_production_module_access (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  production_module_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_production_module_access_uid (uid),
  UNIQUE KEY uq_user_production_module_access_user_module (user_id,production_module_id),
  KEY idx_user_production_module_access_module (production_module_id),
  CONSTRAINT fk_user_production_module_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_user_production_module_access_module FOREIGN KEY (production_module_id) REFERENCES production_modules(id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE production_transactions
  ADD COLUMN production_module_id BIGINT UNSIGNED NULL AFTER production_section_id,
  ADD KEY idx_production_module_date (production_module_id,business_date),
  ADD CONSTRAINT fk_production_transaction_module FOREIGN KEY (production_module_id) REFERENCES production_modules(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

-- Freeze only facts with exactly one ACTIVE employment history matching site/date,
-- and an existing module belonging to that site. Ambiguous/missing facts remain NULL,
-- visible to existing roles but unavailable to QC. Never infer from current placement.
UPDATE production_transactions pt
JOIN (
  SELECT fact.id,MIN(pms.production_module_id) module_id
  FROM production_transactions fact
  JOIN employee_employment_histories eh ON eh.employee_id=fact.employee_id
    AND eh.site_id=fact.site_id AND eh.status='ACTIVE'
    AND eh.effective_from<=fact.business_date
    AND (eh.effective_to IS NULL OR eh.effective_to>=fact.business_date)
  LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
  LEFT JOIN production_modules pm ON pm.id=pms.production_module_id AND pm.site_id=fact.site_id
  GROUP BY fact.id HAVING COUNT(*)=1 AND COUNT(pm.id)=1
) history ON history.id=pt.id
SET pt.production_module_id=history.module_id
WHERE pt.production_module_id IS NULL;

INSERT INTO roles(uid,code,name,description,is_system,is_active)
SELECT UUID(),'QC','QC Produksi','Scan, lihat, koreksi dan void Produksi berdasarkan akses site dan modul.',1,1
WHERE NOT EXISTS(SELECT 1 FROM roles WHERE code='QC');
INSERT INTO role_permissions (uid,role_id,permission_id)
SELECT UUID(),r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('production.view','production.scan','production.correct') WHERE r.code='QC' AND NOT EXISTS (
  SELECT 1 FROM role_permissions existing WHERE existing.role_id=r.id AND existing.permission_id=p.id
);

-- Verification (read only): NULL module snapshots stay hidden from QC.
SELECT COUNT(*) total,SUM(production_module_id IS NULL) unresolved_module_snapshots FROM production_transactions;
