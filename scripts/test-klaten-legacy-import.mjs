// Explicitly isolated local MariaDB test server, not DATABASE_URL. Synthetic only.
// Start a disposable MariaDB on 127.0.0.1:33479, root password hris_scratch_only.
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { contractChain, stableUid, sqlValue } from './klaten-legacy-import-core.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'apps/api/package.json'))
const mysql = require('mysql2/promise')
const database = 'hris_klaten_import_scratch'
const c = await mysql.createConnection({ host: '127.0.0.1', port: 33479, user: 'root', password: 'hris_scratch_only', multipleStatements: true })
try {
  await c.query(`DROP DATABASE IF EXISTS ${database}`)
  let schema = (await fs.readFile(path.join(root, 'db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql'), 'utf8')).replaceAll('hris_pt_restu', database)
  // Exercise the prerequisite upgrade starting from the old phase CHECK.
  schema = schema.replace(/  CONSTRAINT chk_employees_training_join_date CHECK \([^\n]+\),/, '  CONSTRAINT chk_employees_training_join_date CHECK (join_date_training IS NULL OR join_date_training >= join_date),')
    .replace(/  CONSTRAINT chk_employees_join_phase_order[^\n]+\n/, '')
  const triggerBarcode = process.argv.includes('--trigger-barcode')
  if (triggerBarcode) schema = schema.replace('barcode VARCHAR(100) GENERATED ALWAYS AS (employee_number) STORED', 'barcode VARCHAR(100) NULL')
  await c.query(schema)
  if (triggerBarcode) {
    await c.query('CREATE TRIGGER trg_employees_barcode_bi BEFORE INSERT ON employees FOR EACH ROW SET NEW.barcode=NEW.employee_number')
    await c.query('CREATE TRIGGER trg_employees_barcode_bu BEFORE UPDATE ON employees FOR EACH ROW SET NEW.barcode=NEW.employee_number')
  }
  await c.query(await fs.readFile(path.join(root, 'db/migrations/20261123_employee_legacy_import_prerequisites.sql'), 'utf8'))
  const [[site]] = await c.query("SELECT id FROM sites WHERE code='KLATEN'")
  await c.query("INSERT INTO production_modules(uid,code,site_id,name) VALUES(UUID(),'SLO-MOD-A',?,'Modul A')", [site.id])
  await c.query("INSERT INTO production_sections(uid,code,name) VALUES(UUID(),'LINTING','Linting')")
  await c.query('INSERT INTO production_module_sections(uid,production_module_id,production_section_id) SELECT UUID(),m.id,s.id FROM production_modules m CROSS JOIN production_sections s')
  await c.query("INSERT INTO production_jobs(uid,code,name,default_unit_id) SELECT UUID(),'BORONGAN-LINTING','Linting',id FROM work_units WHERE code='PCS'")
  await c.query("INSERT INTO production_job_rates(uid,site_id,production_job_id,unit_id,effective_from,rate_amount) SELECT UUID(),?,id,default_unit_id,'2026-07-01',1 FROM production_jobs", [site.id])
  const uid = i => stableUid(`synthetic:${i}`)
  const rows = [
    { source_row: 2, uid: uid(2), employee_number: 'PSLO-2501-01001', type_code: 'BORONGAN', status_code: 'ACTIVE', module_code: 'SLO-MOD-A', section_code: 'LINTING', full_name: 'Synthetic active A', national_id_number: '0000000000000001', gender: 'MALE', join_date: '2025-02-05', join_date_training: '2025-01-01', join_date_borong: '2025-02-05', notes: '{}' },
    { source_row: 3, uid: uid(3), employee_number: 'PSLO-2512-01001', type_code: 'BORONGAN', status_code: 'ACTIVE', module_code: 'SLO-MOD-A', section_code: 'LINTING', full_name: 'Synthetic active B', national_id_number: '0000000000000002', gender: 'FEMALE', join_date: '2026-01-05', join_date_training: '2025-12-01', join_date_borong: '2026-01-05', notes: '{}' },
    { source_row: 4, uid: uid(4), employee_number: 'PSLO-2401-01001', type_code: 'TRAINING', status_code: 'RESIGNED', full_name: 'Synthetic resigned', gender: 'MALE', join_date: '2024-01-01', join_date_training: '2024-01-01', resign_date: '2024-03-01', notes: '{}' },
    { source_row: 5, uid: uid(5), employee_number: 'LEG-KLT-000001', type_code: 'LEGACY_UNKNOWN', status_code: 'INACTIVE', full_name: 'Synthetic unknown archive', gender: 'FEMALE', join_date: null, notes: '{}' },
  ]
  const contracts = rows.filter(r => r.status_code === 'ACTIVE').flatMap(r => contractChain(r.join_date).map(x => ({ uid: stableUid(`synthetic-contract:${r.uid}:${x.seq}`), employee_uid: r.uid, contract_number: `PKWT/RSIASLO-HR/${r.source_row}0${x.seq}/II/${x.from.slice(0, 4)}`, type_code: 'PKWT', sequence_number: x.seq, start_date: x.from, end_date: x.to, status: x.status })))
  function insert(table, r) { return `INSERT INTO ${table}(${Object.keys(r).join(',')}) VALUES(${Object.values(r).map(sqlValue).join(',')});` }
  const payload = rows.map(r => insert('_klt_source', r)).concat(contracts.map(r => insert('_klt_contract_source', r)), [
    "INSERT INTO _klt_number_source VALUES('SLO','2025-01-01',1),('SLO','2025-12-01',1),('SLO','2024-01-01',1);",
  ]).join('\n')
  let sql = await fs.readFile(path.join(root, 'scripts/klaten-legacy-import.sql'), 'utf8')
  sql = sql.replace('-- __PAYLOAD__', payload)
  for (const [k, v] of Object.entries({ SOURCE_HASH: '0'.repeat(64), IMPORT_UID: uid('marker'), EMPLOYEE_COUNT: 4, ACTIVE_COUNT: 2, CONTRACT_COUNT: 3 })) sql = sql.replaceAll(`__${k}__`, String(v))
  const [setup, body] = sql.split('DELIMITER $$')
  await c.query(setup)
  const install = async fail => {
    const proc = body.split('DELIMITER ;')[0]
    for (let statement of proc.split('$$').map(s => s.trim()).filter(Boolean)) {
      if (fail) statement = statement.replace('  INSERT INTO audit_logs(uid,module,action,table_name,record_uid,description,reason,after_data)', "  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_LATE_FAILURE';\n  INSERT INTO audit_logs(uid,module,action,table_name,record_uid,description,reason,after_data)")
      await c.query(statement)
    }
  }
  const call = (mode = 'PREVIEW', db = database, backup = 0, stopped = 0) => c.query('CALL owner_klaten_import_20261123(?,?,?,?)', [db, mode, backup, stopped])
  const count = async table => { const [[r]] = await c.query(`SELECT COUNT(*) n FROM ${table}`); return r.n }
  const blocked = async (fn, text) => {
    let failed = false
    try { await fn() } catch (e) { assert.ok(e.sqlMessage?.includes(text), e.code); failed = true }
    assert.ok(failed)
  }
  await install(false)
  await c.query('SET SESSION SQL_SAFE_UPDATES=1')
  await call()
  assert.equal(await count('employees'), 0)
  const [[safe]] = await c.query('SELECT @@SQL_SAFE_UPDATES n')
  assert.equal(safe.n, 1)
  await blocked(() => call('EXECUTE', 'wrong_database', 1, 1), 'database')
  await blocked(() => call('EXECUTE'), 'backup')
  await c.query("UPDATE production_job_rates SET status='INACTIVE' WHERE id=1")
  await blocked(() => call(), 'tarif')
  await c.query("UPDATE production_job_rates SET status='ACTIVE' WHERE id=1")
  console.log('PASS preview, session restoration, database/confirmation/rate guards')
  await install(true)
  await blocked(() => call('EXECUTE', database, 1, 1), 'SYNTHETIC_LATE_FAILURE')
  for (const t of ['employees', 'employee_contracts', 'employee_employment_histories', 'employee_contract_lifecycle_events', 'employee_shift_assignments', 'employee_job_assignments', 'employee_number_sequences']) assert.equal(await count(t), 0, t)
  console.log('PASS late failure rolls back employees/contracts/assignments/sequence')
  await install(false)
  await call('EXECUTE', database, 1, 1)
  assert.equal(await count('employees'), 4)
  assert.equal(await count('employee_contracts'), 3)
  assert.equal(await count('employee_contract_lifecycle_events'), 3)
  assert.equal(await count('employee_employment_histories'), 2)
  assert.equal(await count('employee_shift_assignments'), 2)
  assert.equal(await count('employee_job_assignments'), 2)
  const [[archive]] = await c.query("SELECT COUNT(*) n FROM employees WHERE join_date IS NULL")
  assert.equal(archive.n, 1)
  const [shifts] = await c.query('SELECT effective_from,work_days_json FROM employee_shift_assignments')
  assert.ok(shifts.every(r => JSON.stringify(JSON.parse(r.work_days_json)) === '[1,2,3,4,5]'))
  await call('EXECUTE', database, 1, 1)
  assert.equal(await count('employees'), 4)
  assert.equal(await count('audit_logs'), 1)
  // A transferred legacy ID is still in the global namespace even when its
  // current site and join_date do not match the date/site encoded in the ID.
  const { reserveEmployeeNumber } = await import('../apps/api/src/lib/employee-number.ts')
  await c.beginTransaction()
  await c.query("UPDATE employees SET current_site_id=(SELECT id FROM sites WHERE code='SEMARANG') WHERE employee_number='PSLO-2501-01001'")
  await c.query("DELETE FROM employee_number_sequences WHERE site_id=? AND join_date='2025-01-01'", [site.id])
  const reserved = await reserveEmployeeNumber(c, { siteId: site.id, prefix: 'SLO', joinDate: '2025-01-01' })
  assert.equal(reserved, 'PSLO-2501-01002')
  await c.rollback()
  console.log('PASS next employee ID avoids a transferred legacy ID with a different join_date')
  const [[v]] = await c.query('SELECT VERSION() version')
  console.log(`PASS import commit, archive isolation, phases, contract chain, weekdays, replay, ${triggerBarcode ? 'trigger' : 'generated'} barcode; MariaDB ${v.version}`)
} catch (e) {
  // Never print SQL/parameters; this script deliberately uses synthetic data only.
  console.error('TEST_FAILED', e.code ?? e.name, e instanceof assert.AssertionError ? e.message : '')
  process.exitCode = 1
} finally { await c.end() }
