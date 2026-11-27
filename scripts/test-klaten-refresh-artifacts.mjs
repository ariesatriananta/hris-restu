// Full generated payload rehearsal in a pinned disposable local database only.
// Reads private ignored artifacts. Never loads .env or prints SQL/parameters/PII.
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { recruitmentLegacy } from '../apps/api/src/lib/recruitment-legacy.ts'
const mysql=createRequire(new URL('../apps/api/package.json',import.meta.url))('mysql2/promise')
const database='hris_klaten_refresh_artifacts_scratch'
const c=await mysql.createConnection({host:'127.0.0.1',port:33479,user:'root',password:'hris_scratch_only',timezone:'Z',multipleStatements:true,connectTimeout:3000})
const read=path=>fs.readFile(new URL(path,import.meta.url),'utf8')
const count=async table=>Number((await c.query(`SELECT COUNT(*) n FROM ${table}`))[0][0].n)
let stage='schema'
async function installArtifact(path) {
  const sql=await read(path)
  assert.ok(!/__[A-Z_]+__/.test(sql),'Unresolved payload placeholder')
  const [setup,rest]=sql.split('DELIMITER $$')
  await c.query(setup)
  for(const q of rest.split('DELIMITER ;')[0].split('$$').map(q=>q.trim()).filter(Boolean)) await c.query(q)
}
try {
  // Only this hard-coded scratch namespace can be reset; no external connection input.
  await c.query(`DROP DATABASE IF EXISTS ${database}`)
  await c.query((await read('../db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql')).replaceAll('hris_pt_restu',database))
  stage='prerequisite'
  // Canonical schema already has phase CHECKs; only install the historical marker master.
  const prerequisite=await read('../db/migrations/20261123_employee_legacy_import_prerequisites.sql')
  await c.query(prerequisite.slice(prerequisite.indexOf('-- Internal archive marker')))
  stage='masters'
  const [[site]]=await c.query("SELECT id FROM sites WHERE code='KLATEN'")
  await c.query("INSERT INTO departments(uid,site_id,code,name) VALUES(UUID(),?,'PROD','Produksi')",[site.id])
  await c.query("INSERT INTO positions(uid,code,name,category) VALUES(UUID(),'OPERATOR','Operator Produksi','PRODUCTION')")
  for(const letter of ['A','B','C','D','E']) await c.query("INSERT INTO production_modules(uid,site_id,code,name) VALUES(UUID(),?,?,?)",[site.id,`SLO-MOD-${letter}`,`Modul ${letter}`])
  for(const section of ['LINTING','BATIL','PACKING','SLOP','KEMAS1','KEMAS2']) {
    await c.query('INSERT INTO production_sections(uid,code,name) VALUES(UUID(),?,?)',[section,section])
    await c.query("INSERT INTO production_jobs(uid,code,name,position_id,default_unit_id) SELECT UUID(),?,?,p.id,u.id FROM positions p CROSS JOIN work_units u WHERE p.code='OPERATOR' AND u.code='PCS'",[`BORONGAN-${section}`,section])
  }
  await c.query('INSERT INTO production_module_sections(uid,production_module_id,production_section_id) SELECT UUID(),m.id,s.id FROM production_modules m CROSS JOIN production_sections s')
  await c.query("INSERT INTO production_job_rates(uid,site_id,production_job_id,unit_id,effective_from,rate_amount) SELECT UUID(),?,id,default_unit_id,'2026-01-01',1 FROM production_jobs",[site.id])
  // A higher historical sequence must survive reconciliation.
  await c.query("INSERT INTO employee_number_sequences(site_id,join_date,last_sequence) VALUES(?,'2026-11-26',999)",[site.id])
  await installArtifact('../artifacts/klaten-refresh/20261127_klaten_employee_import.sql')
  stage='employee_import'
  await c.query('CALL owner_klaten_refresh_import_20261127(?,?,?,?)',[database,'PREVIEW',0,0])
  assert.equal(await count('employees'),0)
  assert.equal(await count('employee_documents'),0)
  await c.query('CALL owner_klaten_refresh_import_20261127(?,?,?,?)',[database,'EXECUTE',1,1])
  assert.equal(await count('employees'),3095)
  assert.equal(await count('employee_contracts'),760)
  assert.equal(await count('employee_shift_assignments'),543)
  assert.equal(await count('employee_job_assignments'),518)
  assert.equal(await count('employee_documents'),5443)
  const [[override]]=await c.query("SELECT gender,notes FROM employees WHERE JSON_EXTRACT(notes,'$.legacyImport.sourceRow')=3096")
  assert.equal(override.gender,'FEMALE')
  const provenance=JSON.parse(override.notes).legacyImport
  assert.equal(provenance.raw['22:JENIS KELAMIN'],'')
  assert.equal(provenance.approvedOverrides.gender.value,'FEMALE')
  const [[sequence]]=await c.query("SELECT last_sequence FROM employee_number_sequences WHERE site_id=? AND join_date='2026-11-26'",[site.id])
  assert.equal(sequence.last_sequence,999)
  const [[staff]]=await c.query("SELECT COUNT(*) n FROM employees e JOIN employee_types t ON t.id=e.employee_type_id JOIN employee_statuses s ON s.id=e.employee_status_id WHERE s.code='ACTIVE' AND t.code IN ('HARIAN','BULANAN') AND e.current_production_module_section_id IS NULL AND e.current_position_id IS NOT NULL AND e.current_department_id IS NOT NULL")
  assert.equal(staff.n,25)
  await c.query('CALL owner_klaten_refresh_import_20261127(?,?,?,?)',[database,'EXECUTE',1,1])
  await installArtifact('../artifacts/klaten-refresh/20261127_klaten_recruitment_import.sql')
  stage='recruitment_import'
  await c.query('CALL owner_klaten_recruitment_refresh_20261127(?,?,?,?)',[database,'PREVIEW',0,0])
  assert.equal(await count('recruitment_candidates'),0)
  await c.query('CALL owner_klaten_recruitment_refresh_20261127(?,?,?,?)',[database,'EXECUTE',1,1])
  assert.equal(await count('recruitment_candidates'),678)
  assert.equal(await count('recruitment_candidate_files'),1224)
  assert.equal(await count('recruitment_status_events'),678)
  const [candidates]=await c.query('SELECT legacy_import_json FROM recruitment_candidates')
  assert.ok(candidates.every(row=>Boolean(recruitmentLegacy(row.legacy_import_json))))
  await c.query('CALL owner_klaten_recruitment_refresh_20261127(?,?,?,?)',[database,'EXECUTE',1,1])
  assert.equal(await count('audit_logs'),2)
  const [[expires]]=await c.query("SELECT COUNT(*) n FROM employee_contracts WHERE status='ACTIVE' AND end_date<'2026-11-27'")
  console.log(JSON.stringify({result:'PASS_FULL_ARTIFACT_REHEARSAL',employees:3095,active:543,contracts:760,employeeDocuments:5443,candidates:678,candidateDocuments:1224,contractsExpiringBefore27November:expires.n,sourceOverridePreserved:true,sequenceNotLowered:true,replay:true,productionDatabaseUntouched:true}))
} catch(e) {
  console.error('ARTIFACT_REHEARSAL_FAILED',stage,e.code??e.name,stage==='schema'||stage==='prerequisite'?e.sqlMessage:'')
  // Generated statements can contain PII. Do not print errors with SQL/parameters.
  process.exitCode=1
} finally {
  // Dispose the private rehearsal dataset, including staging on connection close.
  await c.query(`DROP DATABASE IF EXISTS ${database}`).catch(()=>{})
  await c.end()
}
