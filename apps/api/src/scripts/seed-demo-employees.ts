import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import { pool } from '../db.js'

const departments = [['JEPARA','PROD','Produksi'],['SEMARANG','PROD','Produksi'],['KLATEN','OPS','Operasional'],['SEMARANG','HR','HR']]
const positions = [['OPERATOR','Operator Produksi','PRODUCTION'],['PACK','Operator Pengemasan','PRODUCTION'],['QC','Quality Control','PRODUCTION'],['SUP','Supervisor Produksi','MANAGEMENT'],['ADMIN_HR','Admin HR','STAFF']]
const groups = [['JEPARA','A','Kelompok A'],['JEPARA','B','Kelompok B'],['SEMARANG','QC','Kelompok QC']]
const employees = [
  ['RST-JPR-001','RSTJPR001','Adi Pratama','Adi','JEPARA','Produksi','Operator Produksi','Kelompok A','BORONGAN','ACTIVE','2024-02-12','MALE','Jepara','1998-06-14'],
  ['RST-SMG-014','RSTSMG014','Sari Wulandari','Sari','SEMARANG','Produksi','Quality Control','Kelompok QC','BORONGAN','ACTIVE','2023-08-21','FEMALE','Semarang','1997-09-22'],
  ['RST-KLT-009','RSTKLT009','Bima Kurniawan','Bima','KLATEN','Operasional','Supervisor Produksi',null,'BULANAN','ACTIVE','2022-01-10','MALE','Klaten','1992-03-08'],
  ['RST-JPR-027','RSTJPR027','Rina Lestari',null,'JEPARA','Produksi','Operator Pengemasan','Kelompok B','BORONGAN','LEAVE','2025-01-06','FEMALE','Pati','2000-11-11'],
  ['RST-SMG-022','RSTSMG022','Dian Permata',null,'SEMARANG','HR','Admin HR',null,'BULANAN','ACTIVE','2023-04-03','FEMALE','Kendal','1996-01-18'],
] as const
for (const [site, code, name] of departments) await pool.execute(`INSERT INTO departments(uid,site_id,code,name) SELECT ?,id,?,? FROM sites WHERE code=? ON DUPLICATE KEY UPDATE name=VALUES(name)`,[randomUUID(),code,name,site])
for (const [code,name,category] of positions) await pool.execute(`INSERT INTO positions(uid,code,name,category) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name)`,[randomUUID(),code,name,category])
for (const [site,code,name] of groups) await pool.execute(`INSERT INTO work_groups(uid,site_id,code,name) SELECT ?,id,?,? FROM sites WHERE code=? ON DUPLICATE KEY UPDATE name=VALUES(name)`,[randomUUID(),code,name,site])
for (const e of employees) { const [number,barcode,fullName,nickname,site,department,position,group,type,status,joinDate,gender,birthPlace,birthDate]=e; const [found]=await pool.query<RowDataPacket[]>(`SELECT id FROM employees WHERE employee_number=?`,[number]); if(found[0]) continue; const uid=randomUUID(); await pool.execute(`INSERT INTO employees(uid,employee_number,barcode,employee_type_id,employee_status_id,current_site_id,current_department_id,current_position_id,current_work_group_id,full_name,nickname,gender,birth_place,birth_date,join_date,city,province) SELECT ?,?,?,et.id,es.id,s.id,d.id,p.id,w.id,?,?,?,?,?,?,?,? FROM sites s JOIN employee_types et ON et.code=? JOIN employee_statuses es ON es.code=? LEFT JOIN departments d ON d.site_id=s.id AND d.name=? LEFT JOIN positions p ON p.name=? LEFT JOIN work_groups w ON w.site_id=s.id AND w.name=? WHERE s.code=?`,[uid,number,barcode,fullName,nickname,gender,birthPlace,birthDate,joinDate,birthPlace,'Jawa Tengah',type,status,department,position,group,site]); const [created]=await pool.query<RowDataPacket[]>('SELECT id FROM employees WHERE uid=?',[uid]); const [refs]=await pool.query<RowDataPacket[]>(`SELECT s.id siteId,d.id departmentId,p.id positionId,w.id groupId,et.id typeId,es.id statusId FROM sites s JOIN employee_types et ON et.code=? JOIN employee_statuses es ON es.code=? LEFT JOIN departments d ON d.site_id=s.id AND d.name=? LEFT JOIN positions p ON p.name=? LEFT JOIN work_groups w ON w.site_id=s.id AND w.name=? WHERE s.code=?`,[type,status,department,position,group,site]); const r=refs[0]; await pool.execute(`INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,employee_type_id,employee_status_id,effective_from,change_type,notes) VALUES(?,?,?,?,?,?,?,?,?,'INITIAL','Seed fiktif Eksekusi 4')`,[randomUUID(),created[0].id,r.siteId,r.departmentId,r.positionId,r.groupId,r.typeId,r.statusId,joinDate]) }
// eslint-disable-next-line no-console
console.log('Seed referensi dan 5 karyawan fiktif selesai.')
await pool.end()
