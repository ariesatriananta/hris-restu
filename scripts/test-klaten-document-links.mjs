// Disposable local MariaDB ONLY. Never reads DATABASE_URL; synthetic links only.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { stableUid, sqlValue } from './klaten-legacy-import-core.mjs'
execFileSync(process.execPath, ['scripts/test-klaten-legacy-import.mjs'], { stdio: 'inherit' })
const mysql = createRequire(new URL('../apps/api/package.json', import.meta.url))('mysql2/promise')
const database = 'hris_klaten_import_scratch'
const c = await mysql.createConnection({ host: '127.0.0.1', port: 33479, user: 'root', password: 'hris_scratch_only', database, multipleStatements: true })
try {
  // Exercise the actual migration over the old shape, with an existing R2 file.
  await c.query('ALTER TABLE employee_documents DROP CONSTRAINT chk_employee_documents_source, DROP FOREIGN KEY fk_employee_documents_file, DROP COLUMN external_url, MODIFY COLUMN file_id BIGINT UNSIGNED NOT NULL')
  await c.query('ALTER TABLE employee_documents ADD CONSTRAINT fk_employee_documents_file FOREIGN KEY(file_id) REFERENCES files(id) ON UPDATE CASCADE ON DELETE RESTRICT')
  await c.query("INSERT INTO files(uid,storage_provider,storage_path,original_name,stored_name,mime_type,size_bytes) VALUES(UUID(),'S3','synthetic/keep.pdf','keep.pdf','keep.pdf','application/pdf',4)")
  await c.query("INSERT INTO employee_documents(uid,employee_id,document_type,name,file_id,status) SELECT UUID(),e.id,'KTP','Keep upload',f.id,'ACTIVE' FROM employees e CROSS JOIN files f WHERE e.uid=?", [stableUid('synthetic:2')])
  const [beforeFiles] = await c.query('SELECT * FROM files')
  await c.query(await fs.readFile(new URL('../db/migrations/20261123_employee_document_external_url.sql', import.meta.url), 'utf8'))
  // Exercise replay/partial recovery (column already exists) without duplicate DDL.
  await c.query(await fs.readFile(new URL('../db/migrations/20261123_employee_document_external_url.sql', import.meta.url), 'utf8'))
  const [rules] = await c.query("SELECT UPDATE_RULE,DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='employee_documents' AND CONSTRAINT_NAME='fk_employee_documents_file'")
  assert.equal(rules[0].UPDATE_RULE,'RESTRICT')
  assert.equal(rules[0].DELETE_RULE,'RESTRICT')
  assert.deepEqual((await c.query('SELECT * FROM files'))[0], beforeFiles)
  await c.query("UPDATE employees SET notes=JSON_OBJECT('legacyImport',JSON_OBJECT('sourceHash',REPEAT('0',64)))")
  const payload = [2,4].flatMap(row => ['KTP','KK'].map(type => `INSERT INTO _klt_doc_source VALUES(${[stableUid(`synthetic-document:${row}:${type}`),stableUid(`synthetic:${row}`),type,`https://drive.google.com/file/d/synthetic_${row}_${type}_123456/view`].map(sqlValue).join(',')});`)).join('\n')
  let sql = await fs.readFile(new URL('./klaten-document-links.sql', import.meta.url), 'utf8')
  for (const [key,value] of Object.entries({ SOURCE_HASH: '0'.repeat(64), IMPORT_UID: stableUid('synthetic:marker'), DOCUMENT_COUNT: 4 })) sql = sql.replaceAll(`__${key}__`, String(value))
  sql = sql.replace('-- __PAYLOAD__', payload)
  await c.query(sql.split('DELIMITER $$')[0])
  const install = async (fail = false) => {
    let body = sql.split('DELIMITER $$')[1].split('DELIMITER ;')[0]
    if (fail) body = body.replace('    INSERT INTO audit_logs', "    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_LATE_FAILURE';\n    INSERT INTO audit_logs")
    for (const s of body.split('$$').map(x => x.trim()).filter(Boolean)) await c.query(s)
  }
  const call = (mode = 'PREVIEW', db = database, backup = 0, stopped = 0) => c.query('CALL owner_klaten_document_links_20261123(?,?,?,?)', [db,mode,backup,stopped])
  const count = async () => Number((await c.query('SELECT COUNT(*) n FROM employee_documents'))[0][0].n)
  await install()
  await c.query('SET SESSION SQL_SAFE_UPDATES=1')
  const [preview] = await call()
  assert.equal(Number(preview[0][0].documents_to_insert), 3)
  assert.equal(await count(), 1)
  await assert.rejects(() => call('EXECUTE','wrong'), e => e.sqlMessage.includes('database'))
  await assert.rejects(() => call('EXECUTE'), e => e.sqlMessage.includes('backup'))
  await install(true)
  await assert.rejects(() => call('EXECUTE',database,1,1), e => e.sqlMessage.includes('SYNTHETIC_LATE_FAILURE'))
  assert.equal(await count(), 1)
  await install()
  await call('EXECUTE',database,1,1)
  assert.equal(await count(), 4)
  const [rows] = await c.query('SELECT employee_id,document_type,file_id,external_url,status FROM employee_documents ORDER BY id')
  assert.equal(rows.filter(x => x.external_url).length, 3)
  assert.equal(rows.filter(x => x.file_id).length, 1)
  assert.deepEqual((await c.query('SELECT * FROM files'))[0], beforeFiles)
  await call('EXECUTE',database,1,1)
  assert.equal(await count(), 4)
  // Owner edits must survive replay, including archive/replacement decisions.
  await c.query("UPDATE employee_documents SET status='ARCHIVED' WHERE uid=?", [stableUid('synthetic-document:2:KK')])
  await call('EXECUTE',database,1,1)
  assert.equal(await count(), 4)
  assert.equal((await c.query('SELECT status FROM employee_documents WHERE uid=?',[stableUid('synthetic-document:2:KK')]))[0][0].status,'ARCHIVED')
  assert.equal((await c.query('SELECT @@SQL_SAFE_UPDATES n'))[0][0].n,1)
  await assert.rejects(() => c.query("INSERT INTO employee_documents(uid,employee_id,document_type,name,status) SELECT UUID(),id,'KK','No source','ACTIVE' FROM employees LIMIT 1"))
  console.log('PASS document migration, preview, guards, rollback, active/archive import, R2 preservation, source constraint and replay after manual changes')
} catch (e) {
  console.error('DOCUMENT_LINK_TEST_FAILED', e.code ?? e.name, e instanceof assert.AssertionError ? e.message : e.sqlMessage)
  process.exitCode = 1
} finally { await c.end() }
