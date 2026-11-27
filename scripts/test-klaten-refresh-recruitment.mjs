// Synthetic-only tests. Never loads .env or production URLs; pinned disposable DB only.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import ExcelJS from 'exceljs'
import { normalizeRecruitment, sourceHash } from './generate-klaten-refresh-recruitment.mjs'
import { stableUid, sqlValue } from './klaten-legacy-import-core.mjs'
import { recruitmentLegacy } from '../apps/api/src/lib/recruitment-legacy.ts'
const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('REKRUTMEN')
for(const [c,v] of Object.entries({1:'SITE',2:'ID',3:'NAMA LENGKAP (SESUAI KTP)',15:'NIK',16:'NOMOR KK',36:'UPLOAD FOTO KTP',37:'UPLOAD FOTO KK'}))sheet.getCell(1,+c).value=v
for(let i=2;i<=5;i++) {
 for(const [c,v] of Object.entries({1:'KLATEN',3:`Synthetic candidate ${i}`,15:i<4?'1000000000000001':i===4?'invalid':'1000000000000005',16:'2000000000000000',20:'PEREMPUAN',27:'SMA',30:i===2?'123':'081234567890'}))sheet.getCell(i,+c).value=v
 sheet.getCell(i,36).value='https://drive.google.com/open?id=syntheticDocument01&resourcekey=abc_123'
}
sheet.getCell(9000,3).style={font:{bold:true}}
const unit=normalizeRecruitment(sheet,[5]);assert.equal(unit.sourceCount,4);assert.equal(unit.rows.length,3)
assert.equal(unit.rows[0].national_id_number,null);assert.equal(unit.rows[1].national_id_number,null);assert.equal(unit.rows[2].national_id_number,null)
assert.equal(unit.rows[0].phone,null);assert.equal(unit.documentCount,3)
assert.equal(unit.rows[0].ktp,'https://drive.google.com/file/d/syntheticDocument01/view?resourcekey=abc_123')
const meta=JSON.parse(unit.rows[0].meta);assert.equal(meta.sourceRow,2);assert.equal(meta.sourceEmployee.employee_number,null)
assert.ok(recruitmentLegacy(meta));assert.equal(JSON.parse(meta.sourceEmployee.notes).legacyImport.raw['15:NIK'],'1000000000000001')
sheet.getCell(2,36).value='https://evil.example/file';assert.throws(()=>normalizeRecruitment(sheet,[5]),/Unsupported/)
console.log('PASS offline normalization: formatted tail, held rows, duplicate/invalid NIK, Drive canonicalization, immutable source shape')

const mysql=createRequire(new URL('../apps/api/package.json',import.meta.url))('mysql2/promise')
const database='hris_klaten_refresh_recruitment_scratch'
const c=await mysql.createConnection({host:'127.0.0.1',port:33479,user:'root',password:'hris_scratch_only',multipleStatements:true,connectTimeout:3000})
const template=await fs.readFile(new URL('./klaten-refresh-recruitment.sql',import.meta.url),'utf8')
const docCount=1244
let raw=template.replaceAll('__SOURCE_HASH__',sourceHash).replaceAll('__DOC_COUNT__',String(docCount))
const blocked=async(fn,message)=>assert.rejects(fn,e=>Boolean(e.sqlMessage?.includes(message)))
const count=async table=>Number((await c.query(`SELECT COUNT(*) n FROM ${table}`))[0][0].n)
const procedure=raw.split('DELIMITER $$')[1].split('DELIMITER ;')[0]
const install=async(fail=false)=>{
 let body=procedure
 if(fail)body=body.replace(' INSERT INTO audit_logs('," SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_LATE_FAILURE';\n INSERT INTO audit_logs(")
 for(const q of body.split('$$').map(s=>s.trim()).filter(Boolean))await c.query(q)
}
const call=(mode='PREVIEW',db=database,backup=0,stopped=0)=>c.query('CALL owner_klaten_recruitment_refresh_20261127(?,?,?,?)',[db,mode,backup,stopped])
try {
 await c.query(`DROP DATABASE IF EXISTS ${database}`)
 const schema=(await fs.readFile(new URL('../db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql',import.meta.url),'utf8')).replaceAll('hris_pt_restu',database)
 await c.query(schema)
 const [[site]]=await c.query("SELECT id FROM sites WHERE code='KLATEN'")
 const [[type]]=await c.query("SELECT id FROM employee_types WHERE code='BORONGAN'")
 const [[status]]=await c.query("SELECT id FROM employee_statuses WHERE code='ACTIVE'")
 const employees=Array.from({length:3095},(_,i)=>[stableUid(`synthetic-rec-employee:${i}`),`SYNTH-${i}`,type.id,status.id,site.id,`Synthetic employee ${i}`,'MALE','2026-01-01',JSON.stringify({legacyImport:{sourceHash}})])
 await c.query('INSERT INTO employees(uid,employee_number,employee_type_id,employee_status_id,current_site_id,full_name,gender,join_date,notes) VALUES ?',[employees])
 await c.query(raw.slice(raw.indexOf('DROP TEMPORARY TABLE'),raw.indexOf('INSERT INTO _klt_rec_source VALUES')))
 const rows=[]
 for(let i=0;i<678;i++) {
  const row=700+i,meta=JSON.stringify({sourceHash,sourceSheet:'REKRUTMEN',sourceRow:row,sourceEmployee:{employee_number:null,notes:JSON.stringify({legacyImport:{sourceHash,sourceSheet:'REKRUTMEN',sourceRow:row,raw:{synthetic:true}}})}})
  rows.push([row,stableUid(`synthetic-rec:${i}`),`SYNTH-REC-${i}`,`synthetic-rec:${i}`,`Synthetic candidate ${i}`,i%3?String(1000000000000000+i):null,i%5?String(2000000000000000+i):null,'FEMALE',null,null,null,null,null,null,meta,i<622?`https://drive.google.com/file/d/syntheticKtp${i}File/view`:null,i<622?`https://drive.google.com/file/d/syntheticKk${i}File/view`:null])
 }
 await c.query('INSERT INTO _klt_rec_source VALUES ?',[rows])
 await install();await c.query("SET time_zone='+00:00'")
 await blocked(()=>call('EXECUTE','wrong',1,1),'database');await blocked(()=>call('EXECUTE'),'backup')
 await call();assert.equal(await count('recruitment_candidates'),0)
 await c.query("INSERT INTO cron_runs(uid,job_code,business_date,status) VALUES(UUID(),'SYNTH-BLOCK','2026-11-27','RUNNING')")
 await blocked(()=>call('EXECUTE',database,1,1),'cron');await c.query("DELETE FROM cron_runs WHERE job_code='SYNTH-BLOCK'")
 await install(true);await blocked(()=>call('EXECUTE',database,1,1),'SYNTHETIC_LATE_FAILURE')
 for(const t of ['recruitment_candidates','recruitment_candidate_files','recruitment_status_events','audit_logs'])assert.equal(await count(t),0)
 await install();await call('EXECUTE',database,1,1)
 assert.equal(await count('recruitment_candidates'),678);assert.equal(await count('recruitment_candidate_files'),docCount);assert.equal(await count('recruitment_status_events'),678)
 assert.equal(await count('audit_logs'),1);assert.equal(await count('employees'),3095)
 const [[candidate]]=await c.query('SELECT legacy_import_json,submitted_at,privacy_consent_at,privacy_notice_version FROM recruitment_candidates LIMIT 1')
 assert.equal(candidate.submitted_at,null);assert.equal(candidate.privacy_consent_at,null);assert.equal(candidate.privacy_notice_version,null);assert.ok(recruitmentLegacy(candidate.legacy_import_json))
 await call('EXECUTE',database,1,1);assert.equal(await count('audit_logs'),1)
 await c.query("UPDATE recruitment_candidates SET status='IN_PROGRESS' WHERE application_number='SYNTH-REC-0'")
 await blocked(()=>call(),'data berubah/parsial')
 console.log('PASS isolated MariaDB: scope guards, preview, cron block, late rollback, 678 candidates/1244 links/SYSTEM events, NULL historical dates, replay and drift block')
} finally {await c.end()}
