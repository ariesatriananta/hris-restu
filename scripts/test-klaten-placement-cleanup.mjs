// Synthetic integration test. Uses ONLY the pinned disposable server/database.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { stableUid } from './klaten-legacy-import-core.mjs'
execFileSync(process.execPath, ['scripts/test-klaten-legacy-import.mjs'], { stdio: 'inherit' })
const mysql = createRequire(new URL('../apps/api/package.json', import.meta.url))('mysql2/promise')
const database = 'hris_klaten_import_scratch'
const c = await mysql.createConnection({ host: '127.0.0.1', port: 33479, user: 'root', password: 'hris_scratch_only', database, multipleStatements: true })
try {
  await c.query("INSERT INTO positions(uid,code,name) VALUES(UUID(),'OPERATOR','Operator Produksi')")
  await c.query("INSERT INTO departments(uid,site_id,code,name) SELECT UUID(),id,'PROD','Produksi' FROM sites WHERE code='KLATEN' AND NOT EXISTS(SELECT 1 FROM departments WHERE code='PROD' AND site_id=sites.id)")
  await c.query("UPDATE employees SET notes=JSON_OBJECT('legacyImport',JSON_OBJECT('sourceHash',REPEAT('0',64))),current_department_id=(SELECT d.id FROM departments d JOIN sites s ON s.id=d.site_id WHERE s.code='KLATEN' AND d.code='PROD'),current_position_id=(SELECT id FROM positions WHERE code='OPERATOR')")
  let sql = await fs.readFile(new URL('../db/maintenance/20261123_klaten_import_placement_cleanup.sql', import.meta.url), 'utf8')
  sql = sql.replaceAll('f5b8dd224012b1f3f439e8bbed65f15146784ef2e0ec0b7e14a8af28fdf55afc', '0'.repeat(64))
    .replaceAll('939e1c2b-dda6-56c2-8558-dcf5409bad6e', stableUid('synthetic:marker'))
    .replaceAll('<>3725', '<>4').replaceAll('<>395', '<>2').replaceAll('<>3330', '<>2').replaceAll('<>585', '<>3')
  const install = async (fail = false) => {
    let body = sql.split('DELIMITER $$')[1].split('DELIMITER ;')[0]
    if (fail) body = body.replace('    INSERT INTO audit_logs', "    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_LATE_FAILURE';\n    INSERT INTO audit_logs")
    for (const s of body.split('$$').map(x => x.trim()).filter(Boolean)) await c.query(s)
  }
  const call = (mode = 'PREVIEW', db = database, backup = 0, stopped = 0) => c.query('CALL owner_klaten_placement_cleanup_20261123(?,?,?,?)', [db, mode, backup, stopped])
  const blocked = async (fn, message) => {
    await assert.rejects(fn, e => Boolean(e.sqlMessage?.includes(message)))
  }
  const snapshot = async () => {
    const data = []
    for (const t of ['employees','employee_employment_histories','employee_contracts','employee_shift_assignments','employee_job_assignments','employee_number_sequences','audit_logs']) {
      const [rows] = await c.query(`SELECT * FROM ${t} ORDER BY ${t === 'employee_number_sequences' ? 'site_id,join_date' : 'id'}`)
      data.push(rows)
    }
    return JSON.stringify(data)
  }
  await install()
  await c.query('SET SESSION SQL_SAFE_UPDATES=1')
  const before = await snapshot()
  await call()
  assert.equal(await snapshot(), before)
  await blocked(() => call('EXECUTE', 'wrong'), 'database')
  await blocked(() => call('EXECUTE'), 'backup')
  console.log('PASS cleanup preview leaves all rows unchanged; database/confirmation guards')
  const [[contract]] = await c.query('SELECT MIN(id) id FROM employee_contracts')
  await c.query("UPDATE employee_contracts SET position_name_snapshot='Other role' WHERE id=?", [contract.id])
  await blocked(() => call(), 'snapshot jabatan berbeda')
  await c.query('UPDATE employee_contracts SET position_name_snapshot=NULL WHERE id=?', [contract.id])
  const rollbackBefore = await snapshot()
  await install(true)
  await blocked(() => call('EXECUTE', database, 1, 1), 'SYNTHETIC_LATE_FAILURE')
  assert.equal(await snapshot(), rollbackBefore)
  console.log('PASS conflicting snapshot blocked; late failure rolls back profiles, histories and contracts')
  await install()
  const [result] = await call('EXECUTE', database, 1, 1)
  assert.equal(result[1][0].result, 'KLATEN_PLACEMENT_CLEANUP_COMMITTED')
  const [[check]] = await c.query(`SELECT
    (SELECT COUNT(*) FROM employees e JOIN employee_statuses s ON s.id=e.employee_status_id WHERE s.code='ACTIVE' AND e.current_department_id IS NOT NULL AND e.current_position_id IS NOT NULL) active_ready,
    (SELECT COUNT(*) FROM employees e JOIN employee_statuses s ON s.id=e.employee_status_id WHERE s.code<>'ACTIVE' AND e.current_department_id IS NULL AND e.current_position_id IS NULL) archives_ready,
    (SELECT COUNT(*) FROM employee_employment_histories WHERE department_id IS NOT NULL AND position_id IS NOT NULL) histories_ready,
    (SELECT COUNT(*) FROM employee_contracts WHERE position_name_snapshot='Operator Produksi') contracts_ready`)
  assert.deepEqual(Object.values(check).map(Number), [2,2,2,3])
  const after = await snapshot()
  const [again] = await call('EXECUTE', database, 1, 1)
  assert.equal(again[1][0].result, 'ALREADY_TIDY_NO_CHANGES')
  assert.equal(await snapshot(), after)
  const [[safe]] = await c.query('SELECT @@SQL_SAFE_UPDATES n')
  assert.equal(safe.n, 1)
  console.log('PASS cleanup commit, exact placement/snapshot targets, replay without changes, session restoration')
} catch (e) {
  console.error('CLEANUP_TEST_FAILED', e.code ?? e.name, e instanceof assert.AssertionError ? e.message : e.sqlMessage)
  process.exitCode = 1
} finally { await c.end() }
