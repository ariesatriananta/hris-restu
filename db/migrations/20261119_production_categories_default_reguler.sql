-- Owner-run follow-up AFTER 20261119_production_categories.sql. Do not auto-run.
-- Backup first. DDL below autocommits; data/history updates below use one transaction.
-- Existing mapped categories (including Premium) are never overwritten.
-- Safe to rerun: histories are added only when the master has no history at all.
SET time_zone='+07:00';

-- EDIT THIS DATE ONLY IF the Reguler baseline is known to apply in the past.
-- Default is today; dates before this baseline remain unknown for historical reports.
SET @category_effective_from=CURDATE();

-- Read-only preview. If these numbers are not expected, stop before ALTER/START TRANSACTION.
SELECT @category_effective_from effective_from;
SELECT 'MODULE' master_kind,COUNT(*) eligible_unmapped FROM production_modules m
WHERE production_category IS NULL AND NOT EXISTS(SELECT 1 FROM production_module_category_histories h WHERE h.module_id=m.id)
UNION ALL
SELECT 'BRAND',COUNT(*) FROM production_brands m
WHERE production_category IS NULL AND NOT EXISTS(SELECT 1 FROM production_brand_category_histories h WHERE h.brand_id=m.id);

ALTER TABLE production_modules ALTER COLUMN production_category SET DEFAULT 'REGULER';
ALTER TABLE production_brands ALTER COLUMN production_category SET DEFAULT 'REGULER';

START TRANSACTION;
-- Only fill unmapped masters with no prior category history. Preserve all mapped Premium/Reguler.
INSERT INTO production_module_category_histories(uid,module_id,category,effective_from,created_by,updated_by)
SELECT UUID(),m.id,'REGULER',@category_effective_from,NULL,NULL
FROM production_modules m
WHERE m.production_category IS NULL
  AND @category_effective_from BETWEEN '1000-01-01' AND CURDATE()
  AND NOT EXISTS (SELECT 1 FROM production_module_category_histories h WHERE h.module_id=m.id);

UPDATE production_modules m
JOIN production_module_category_histories h ON h.module_id=m.id
  AND h.category='REGULER' AND h.effective_to IS NULL AND h.effective_from=@category_effective_from
SET m.production_category='REGULER',m.updated_by=NULL
WHERE m.production_category IS NULL;

-- Only fill unmapped masters with no prior category history. Preserve all mapped Premium/Reguler.
INSERT INTO production_brand_category_histories(uid,brand_id,category,effective_from,created_by,updated_by)
SELECT UUID(),m.id,'REGULER',@category_effective_from,NULL,NULL
FROM production_brands m
WHERE m.production_category IS NULL
  AND @category_effective_from BETWEEN '1000-01-01' AND CURDATE()
  AND NOT EXISTS (SELECT 1 FROM production_brand_category_histories h WHERE h.brand_id=m.id);

UPDATE production_brands m
JOIN production_brand_category_histories h ON h.brand_id=m.id
  AND h.category='REGULER' AND h.effective_to IS NULL AND h.effective_from=@category_effective_from
SET m.production_category='REGULER',m.updated_by=NULL
WHERE m.production_category IS NULL;

-- Verification before commit. Mapping/history must agree; unmapped inconsistencies are left untouched.
SELECT 'MODULE' master_kind,production_category,COUNT(*) total FROM production_modules GROUP BY production_category
UNION ALL
SELECT 'BRAND',production_category,COUNT(*) FROM production_brands GROUP BY production_category;
COMMIT;

-- Read-only: any remaining NULL category should be reviewed, never silently overwritten.
SELECT 'MODULE' master_kind,m.uid,m.code FROM production_modules m WHERE m.production_category IS NULL
UNION ALL
SELECT 'BRAND',m.uid,m.code FROM production_brands m WHERE m.production_category IS NULL;
