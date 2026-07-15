import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import { pool } from '../db.js'
import { reserveEmployeeNumber } from '../lib/employee-number.js'

const departments = [
  ['JEPARA', 'PROD', 'Produksi'],
  ['SEMARANG', 'PROD', 'Produksi'],
  ['KLATEN', 'OPS', 'Operasional'],
  ['SEMARANG', 'HR', 'HR'],
]
const positions = [
  ['OPERATOR', 'Operator Produksi', 'PRODUCTION'],
  ['PACK', 'Operator Pengemasan', 'PRODUCTION'],
  ['QC', 'Quality Control', 'PRODUCTION'],
  ['SUP', 'Supervisor Produksi', 'MANAGEMENT'],
  ['ADMIN_HR', 'Admin HR', 'STAFF'],
]
const groups = [
  ['JEPARA', 'A', 'Kelompok A'],
  ['JEPARA', 'B', 'Kelompok B'],
  ['SEMARANG', 'QC', 'Kelompok QC'],
]
const employees = [
  ['Adi Pratama', 'Adi', 'JEPARA', 'Produksi', 'Operator Produksi', 'Kelompok A', 'BORONGAN', 'INACTIVE', '2024-02-12', 'MALE', 'Jepara', '1998-06-14'],
  ['Sari Wulandari', 'Sari', 'SEMARANG', 'Produksi', 'Quality Control', 'Kelompok QC', 'BORONGAN', 'INACTIVE', '2023-08-21', 'FEMALE', 'Semarang', '1997-09-22'],
  ['Bima Kurniawan', 'Bima', 'KLATEN', 'Operasional', 'Supervisor Produksi', null, 'BULANAN', 'INACTIVE', '2022-01-10', 'MALE', 'Klaten', '1992-03-08'],
  ['Rina Lestari', null, 'JEPARA', 'Produksi', 'Operator Pengemasan', 'Kelompok B', 'BORONGAN', 'INACTIVE', '2025-01-06', 'FEMALE', 'Pati', '2000-11-11'],
  ['Dian Permata', null, 'SEMARANG', 'HR', 'Admin HR', null, 'BULANAN', 'INACTIVE', '2023-04-03', 'FEMALE', 'Kendal', '1996-01-18'],
] as const

for (const [site, code, name] of departments) {
  await pool.execute(
    `INSERT INTO departments(uid,site_id,code,name)
     SELECT ?,id,?,? FROM sites WHERE code=?
     ON DUPLICATE KEY UPDATE name=VALUES(name)`,
    [randomUUID(), code, name, site]
  )
}
for (const [code, name, category] of positions) {
  await pool.execute(
    `INSERT INTO positions(uid,code,name,category) VALUES(?,?,?,?)
     ON DUPLICATE KEY UPDATE name=VALUES(name)`,
    [randomUUID(), code, name, category]
  )
}
for (const [site, code, name] of groups) {
  await pool.execute(
    `INSERT INTO work_groups(uid,site_id,code,name)
     SELECT ?,id,?,? FROM sites WHERE code=?
     ON DUPLICATE KEY UPDATE name=VALUES(name)`,
    [randomUUID(), code, name, site]
  )
}

for (const employee of employees) {
  const [fullName, nickname, site, department, position, workGroup, employeeType, employeeStatus, joinDate, gender, birthPlace, birthDate] = employee
  const [found] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM employees WHERE full_name=? AND join_date=?',
    [fullName, joinDate]
  )
  if (found[0]) continue

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [sites] = await connection.query<RowDataPacket[]>(
      `SELECT id,employee_number_prefix employeeNumberPrefix
       FROM sites WHERE code=? FOR UPDATE`,
      [site]
    )
    const siteRow = sites[0]
    if (!siteRow) throw new Error(`Site seed ${site} tidak ditemukan.`)
    const employeeNumber = await reserveEmployeeNumber(connection, {
      siteId: Number(siteRow.id),
      prefix: String(siteRow.employeeNumberPrefix),
      joinDate,
    })
    const uid = randomUUID()
    await connection.execute(
      `INSERT INTO employees(uid,employee_number,employee_type_id,employee_status_id,current_site_id,current_department_id,current_position_id,current_work_group_id,full_name,nickname,gender,birth_place,birth_date,join_date,city,province)
       SELECT ?,?,et.id,es.id,s.id,d.id,p.id,w.id,?,?,?,?,?,?,?,?
       FROM sites s
       JOIN employee_types et ON et.code=?
       JOIN employee_statuses es ON es.code=?
       LEFT JOIN departments d ON d.site_id=s.id AND d.name=?
       LEFT JOIN positions p ON p.name=?
       LEFT JOIN work_groups w ON w.site_id=s.id AND w.name=?
       WHERE s.code=?`,
      [uid, employeeNumber, fullName, nickname, gender, birthPlace, birthDate, joinDate, birthPlace, 'Jawa Tengah', employeeType, employeeStatus, department, position, workGroup, site]
    )
    const [created] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM employees WHERE uid=?',
      [uid]
    )
    const [refs] = await connection.query<RowDataPacket[]>(
      `SELECT s.id siteId,d.id departmentId,p.id positionId,w.id groupId,et.id typeId,es.id statusId
       FROM sites s
       JOIN employee_types et ON et.code=?
       JOIN employee_statuses es ON es.code=?
       LEFT JOIN departments d ON d.site_id=s.id AND d.name=?
       LEFT JOIN positions p ON p.name=?
       LEFT JOIN work_groups w ON w.site_id=s.id AND w.name=?
       WHERE s.code=?`,
      [employeeType, employeeStatus, department, position, workGroup, site]
    )
    const ref = refs[0]
    await connection.execute(
      `INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,employee_type_id,employee_status_id,effective_from,change_type,notes)
       VALUES(?,?,?,?,?,?,?,?,?,'INITIAL','Seed fiktif Eksekusi 4')`,
      [randomUUID(), created[0].id, ref.siteId, ref.departmentId, ref.positionId, ref.groupId, ref.typeId, ref.statusId, joinDate]
    )
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

// eslint-disable-next-line no-console
console.log('Seed referensi dan 5 karyawan fiktif selesai.')
await pool.end()
