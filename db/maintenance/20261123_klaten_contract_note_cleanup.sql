-- OWNER-RUN ONLY. Backup first. Does not change dates/status/files/terms_json.
-- Only the exact old generated note from the approved Excel source is replaced.
-- Keep technical provenance in terms_json. Safe to rerun; custom notes preserved.
SET @old_contract_note='Rekonstruksi import disetujui Owner: kontrak 12 bulan berantai dari join date. Bukan bukti dokumen bertanda tangan.';
SET @new_contract_note='Masa kontrak 12 bulan, dengan perpanjangan mengikuti periode kontrak sebelumnya.';
SET @klaten_source_hash='f5b8dd224012b1f3f439e8bbed65f15146784ef2e0ec0b7e14a8af28fdf55afc';

-- READ ONLY preview: review target database and count before running transaction.
SELECT DATABASE() target_database,COUNT(*) notes_to_update
FROM employee_contracts c
JOIN employees e ON e.id=c.employee_id
JOIN sites s ON s.id=e.current_site_id
WHERE s.code='KLATEN' AND BINARY c.notes=BINARY @old_contract_note
  AND JSON_UNQUOTE(JSON_EXTRACT(c.terms_json,'$.legacyImport.sourceHash'))=@klaten_source_hash;

START TRANSACTION;
UPDATE employee_contracts c
JOIN employees e ON e.id=c.employee_id
JOIN sites s ON s.id=e.current_site_id
SET c.notes=@new_contract_note
WHERE s.code='KLATEN' AND BINARY c.notes=BINARY @old_contract_note
  AND JSON_UNQUOTE(JSON_EXTRACT(c.terms_json,'$.legacyImport.sourceHash'))=@klaten_source_hash;
SELECT ROW_COUNT() updated_contract_notes;
COMMIT;
