// Synthetic-only integration on a pinned disposable server; never reads .env/DATABASE_URL.
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const require=createRequire(path.join(root,'apps/api/package.json'))
const mysql=require('mysql2/promise')
const database='hris_klaten_import_scratch'
const c=await mysql.createConnection({host:'127.0.0.1',port:33479,user:'root',password:'hris_scratch_only',multipleStatements:true})
const hash='f5b8dd224012b1f3f439e8bbed65f15146784ef2e0ec0b7e14a8af28fdf55afc'
const count=async table=>Number((await c.query(`SELECT COUNT(*) n FROM ${table}`))[0][0].n)
const blocked=async(fn,fragment)=>{let failure;try{await fn()}catch(e){failure=e}assert.ok(failure,`Expected failure: ${fragment}`);if(fragment)assert.ok(failure.message.includes(fragment),failure.message)}
try{
 await c.query(`DROP DATABASE IF EXISTS ${database}`)
 let schema=(await fs.readFile(path.join(root,'db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql'),'utf8')).replaceAll('hris_pt_restu',database)
 await c.query(schema)
 const migration=await fs.readFile(path.join(root,'db/migrations/20261125_recruitment_legacy_candidates.sql'),'utf8')
 // Exercise upgrade from the actual pre-feature shape, then migration replay.
 await c.query(`DROP TRIGGER recruitment_candidates_legacy_immutable;
 ALTER TABLE recruitment_candidates DROP CONSTRAINT chk_recruitment_candidates_normal_required,
 DROP COLUMN legacy_import_json, MODIFY national_id_number CHAR(16) NOT NULL,
 MODIFY family_card_number CHAR(16) NOT NULL, MODIFY birth_place VARCHAR(100) NOT NULL,
 MODIFY birth_date DATE NOT NULL, MODIFY address TEXT NOT NULL, MODIFY phone VARCHAR(30) NOT NULL,
 MODIFY privacy_consent_at DATETIME(3) NOT NULL, MODIFY privacy_notice_version VARCHAR(30) NOT NULL,
 MODIFY submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
 ALTER TABLE recruitment_candidate_files DROP CONSTRAINT chk_recruitment_candidate_files_source,
 DROP FOREIGN KEY fk_recruitment_candidate_files_file;
 ALTER TABLE recruitment_candidate_files DROP COLUMN external_url, MODIFY file_id BIGINT UNSIGNED NOT NULL,
 ADD CONSTRAINT fk_recruitment_candidate_files_file FOREIGN KEY(file_id) REFERENCES files(id) ON UPDATE CASCADE ON DELETE RESTRICT;`)
 // Upgrade is replay-safe, including restrictive FK/source CHECK and trigger.
 await c.query(migration);await c.query(migration)
 const [[site]]=await c.query("SELECT id FROM sites WHERE code='KLATEN'")
 await c.query("INSERT IGNORE INTO employee_types(uid,code,name,payroll_basis,pay_frequency,is_active) VALUES(UUID(),'LEGACY_UNKNOWN','-','TIME_BASED','WEEKLY',0)")
 const [types]=await c.query('SELECT id,code FROM employee_types');const tm=Object.fromEntries(types.map(x=>[x.code,x.id]))
 const [statuses]=await c.query('SELECT id,code FROM employee_statuses');const sm=Object.fromEntries(statuses.map(x=>[x.code,x.id]))
 const uid=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`
 const rows=[]
 for(let i=1;i<=722;i++)rows.push([uid(i),`SYNTH-KLT-${i}`,i<=621?tm.LEGACY_UNKNOWN:tm.TRAINING,sm.INACTIVE,site.id,`Synthetic candidate ${i}`,i%7===0?null:String(1000000000000000+i),i%11===0?'invalid':String(2000000000000000+i),i%2?'MALE':'PEREMPUAN',i%5===0?null:'Synthetic place',i%4===0?null:'2000-01-01',i%3===0?null:'Synthetic address',i%3===0?null:'081234567890',JSON.stringify({legacyImport:{sourceHash:hash,raw:{'12:STATUS (Aktif/Tidak Aktif)':'NON AKTIF',nationalIDRaw:'unchanged original'},sourceRow:i},operationalNotes:'Preserve me'})])
 await c.query('INSERT INTO employees(uid,employee_number,employee_type_id,employee_status_id,current_site_id,full_name,national_id_number,family_card_number,gender,birth_place,birth_date,address,phone,notes) VALUES ?',[rows])
 await c.query("INSERT INTO employees(uid,employee_number,employee_type_id,employee_status_id,current_site_id,full_name,gender,join_date) VALUES (?, 'SYNTH-ACTIVE',?,?,?,'Synthetic active','MALE','2026-01-01'),(?,'SYNTH-RESIGNED',?,?,?,'Synthetic resigned','FEMALE','2025-01-01')",[uid(723),tm.BORONGAN,sm.ACTIVE,site.id,uid(724),tm.TRAINING,sm.RESIGNED,site.id])
 const [employees]=await c.query('SELECT id,uid FROM employees WHERE employee_number LIKE \'SYNTH-KLT-%\' ORDER BY id')
 const docs=[]
 for(const [i,e]of employees.entries())if(i<718)for(const kind of ['KTP','KK'])docs.push([uid(10000+i*2+(kind==='KK'?1:0)),e.id,kind,kind,`https://drive.google.com/file/d/syntheticDriveFile${i}${kind}/view${i===0?'?resourcekey=abc_123':''}`])
 await c.query('INSERT INTO employee_documents(uid,employee_id,document_type,name,external_url) VALUES ?',[docs])
 await c.query("INSERT INTO employee_number_sequences(site_id,join_date,last_sequence) VALUES (?,'2026-11-25',99)",[site.id])
 // Normal candidates still cannot omit identity/consent/submission.
 await blocked(()=>c.query("INSERT INTO recruitment_candidates(uid,application_number,idempotency_key,site_id,full_name,gender) VALUES(UUID(),'BAD','BAD',?,'Synthetic incomplete','MALE')",[site.id]),'')
 const raw=await fs.readFile(path.join(root,'db/maintenance/20261125_klaten_inactive_to_recruitment.sql'),'utf8')
 const procedure=raw.split('DELIMITER $$')[1].split('DELIMITER ;')[0]
 const install=async fail=>{for(let stmt of procedure.split('$$').map(s=>s.trim()).filter(Boolean)){
  if(fail)stmt=stmt.replace(' INSERT INTO audit_logs(uid,site_id,module'," SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_LATE_FAILURE';\n INSERT INTO audit_logs(uid,site_id,module")
  await c.query(stmt)
 }}
 const call=(mode='PREVIEW',db=database,backup=0,stopped=0)=>c.query('CALL owner_klaten_candidates_20261125(?,?,?,?)',[db,mode,backup,stopped])
 await install(false)
 await c.query("SET SESSION SQL_SAFE_UPDATES=1; SET SESSION time_zone='+07:00'")
 await blocked(()=>call('EXECUTE','wrong',1,1),'database')
 await blocked(()=>call('EXECUTE'),'backup')
 await call();assert.equal(await count('employees'),724);assert.equal(await count('recruitment_candidates'),0)
 let [[session]]=await c.query('SELECT @@SQL_SAFE_UPDATES safe,@@SESSION.time_zone zone');assert.equal(session.safe,1);assert.equal(session.zone,'+07:00')
 console.log('PASS schema upgrade replay, normal strictness, preview and session restoration')
 await c.query("SET SESSION SQL_SAFE_UPDATES=0; UPDATE employees SET notes=JSON_SET(notes,'$.legacyImport.raw.\"12:STATUS (Aktif/Tidak Aktif)\"','RESIGN') WHERE uid=?",[uid(1)])
 await blocked(()=>call(),'722')
 await c.query("UPDATE employees SET notes=JSON_SET(notes,'$.legacyImport.raw.\"12:STATUS (Aktif/Tidak Aktif)\"','NON AKTIF') WHERE uid=?",[uid(1)])
 // A newly added logical employee-id reference must also block, even without an FK.
 await c.query('CREATE TABLE synthetic_dependency(employee_id BIGINT UNSIGNED); INSERT INTO synthetic_dependency VALUES (?)',[employees[0].id])
 await blocked(()=>call(),'synthetic_dependency')
 await c.query('DROP TABLE synthetic_dependency')
 await install(true);await blocked(()=>call('EXECUTE',database,1,1),'SYNTHETIC_LATE_FAILURE')
 assert.equal(await count('employees'),724);assert.equal(await count('employee_documents'),1436)
 for(const t of ['recruitment_candidates','recruitment_candidate_files','recruitment_status_events','audit_logs'])assert.equal(await count(t),0,t)
 console.log('PASS scope/dependency blockers and rollback after source deletion')
 const [[original]]=await c.query('SELECT notes FROM employees WHERE uid=?',[uid(1)])
 await install(false);await call('EXECUTE',database,1,1)
 assert.equal(await count('employees'),2);assert.equal(await count('employee_documents'),0)
 assert.equal(await count('recruitment_candidates'),722);assert.equal(await count('recruitment_candidate_files'),1436)
 assert.equal(await count('recruitment_status_events'),722);assert.equal(await count('audit_logs'),1)
 const [[migrated]]=await c.query('SELECT legacy_import_json,submitted_at,privacy_consent_at FROM recruitment_candidates WHERE uid=?',[uid(1)])
 const parsed=JSON.parse(migrated.legacy_import_json);assert.equal(parsed.sourceEmployee.notes,original.notes);assert.equal(parsed.sourceDocuments.length,2);assert.equal(parsed.sourceEmployee.barcode,'SYNTH-KLT-1')
 assert.equal(migrated.submitted_at,null);assert.equal(migrated.privacy_consent_at,null)
 await c.query('UPDATE recruitment_candidates SET legacy_import_json=NULL WHERE uid=?',[uid(1)])
 const [[kept]]=await c.query('SELECT legacy_import_json FROM recruitment_candidates WHERE uid=?',[uid(1)]);assert.deepEqual(JSON.parse(kept.legacy_import_json),parsed)
 const [[candidate]]=await c.query('SELECT id FROM recruitment_candidates WHERE uid=?',[uid(722)])
 await blocked(()=>c.query("INSERT INTO recruitment_candidate_files(uid,candidate_id,file_id,external_url,file_kind) VALUES(UUID(),?,NULL,NULL,'PHOTO')",[candidate.id]),'')
 await blocked(()=>c.query("INSERT INTO recruitment_candidate_files(uid,candidate_id,file_id,external_url,file_kind) VALUES(UUID(),?,NULL,'https://evil.example/file','PHOTO')",[candidate.id]),'')
 assert.equal(Number((await c.query('SELECT last_sequence FROM employee_number_sequences'))[0][0].last_sequence),99)
 await call('EXECUTE',database,1,1);assert.equal(await count('recruitment_candidates'),722);assert.equal(await count('audit_logs'),1)
 console.log('PASS exact snapshots, 722 moves/1436 Drive links, immutable provenance, source checks, sequence preservation and replay')
 const down=await fs.readFile(path.join(root,'db/migrations/20261125_recruitment_legacy_candidates.down.sql'),'utf8')
 for(const stmt of down.split('DELIMITER $$')[1].split('DELIMITER ;')[0].split('$$').map(x=>x.trim()).filter(Boolean))await c.query(stmt)
 await blocked(()=>c.query('CALL owner_recruitment_legacy_schema_down()'),'Do not discard snapshots')
 await c.query('DELETE FROM recruitment_status_events;DELETE FROM recruitment_candidate_files;DELETE FROM recruitment_candidates;DELETE FROM audit_logs')
 await c.query('CALL owner_recruitment_legacy_schema_down()')
 assert.equal(Number((await c.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='recruitment_candidates' AND COLUMN_NAME='legacy_import_json'"))[0][0].n),0)
 await c.query(migration)
 console.log('PASS DOWN refuses migrated snapshots, succeeds on empty synthetic fixture and upgrade restores schema')

}finally{await c.end()}

