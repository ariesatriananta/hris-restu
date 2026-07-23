import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import { writeSystemAudit } from './audit.js'
import { businessDate } from './contract-lifecycle.js'

type ApplyResult =
  | { status: 'APPLIED'; uid: string }
  | { status: 'FAILED'; uid: string; employeeUid: string; employeeNumber: string; fullName: string; site: string; reason: string }
  | { status: 'SKIPPED'; uid: string }

async function failMutation(conn: PoolConnection, schedule: RowDataPacket, reason: string): Promise<ApplyResult> {
  await conn.execute("UPDATE scheduled_employee_mutations SET status='FAILED',failure_reason=?,updated_by=NULL WHERE id=?", [reason, schedule.id])
  await writeSystemAudit({ siteId: schedule.target_site_id, action: 'OTHER', table: 'scheduled_employee_mutations', recordId: schedule.id, recordUid: schedule.uid, description: `Mutasi terjadwal gagal: ${reason}` }, conn)
  return { status: 'FAILED', uid: schedule.uid, employeeUid: schedule.employeeUid, employeeNumber: schedule.employeeNumber, fullName: schedule.fullName, site: schedule.site, reason }
}

async function failUnexpectedMutation(uid: string): Promise<ApplyResult | undefined> {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(`
      SELECT sm.*,e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,s.code site
      FROM scheduled_employee_mutations sm
      JOIN employees e ON e.id=sm.employee_id
      JOIN sites s ON s.id=e.current_site_id
      WHERE sm.uid=? FOR UPDATE
    `, [uid])
    const schedule = rows[0]
    if (!schedule || schedule.status !== 'SCHEDULED') {
      await conn.rollback()
      return undefined
    }
    const result = await failMutation(
      conn,
      schedule,
      'Proses cron gagal sebelum mutasi diterapkan. Periksa log eksekusi cron.'
    )
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

async function targetIsValid(conn: PoolConnection, schedule: RowDataPacket) {
  const [rows] = await conn.query<RowDataPacket[]>(`
    SELECT
      s.is_active siteActive,
      d.is_active departmentActive,
      p.is_active positionActive,
      wg.is_active workGroupActive,
      et.is_active typeActive,
      pms.is_active mappingActive,
      pm.is_active moduleActive,
      ps.is_active sectionActive,
      pm.site_id mappingSiteId
    FROM scheduled_employee_mutations sm
    JOIN sites s ON s.id=sm.target_site_id
    LEFT JOIN departments d ON d.id=sm.target_department_id
    LEFT JOIN positions p ON p.id=sm.target_position_id
    LEFT JOIN work_groups wg ON wg.id=sm.target_work_group_id
    JOIN employee_types et ON et.id=sm.target_employee_type_id
    LEFT JOIN production_module_sections pms ON pms.id=sm.target_production_module_section_id
    LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
    LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
    WHERE sm.id=?
  `, [schedule.id])
  const target = rows[0]
  if (!target?.siteActive) return 'Site tujuan sudah nonaktif.'
  if (schedule.target_department_id && !target.departmentActive) return 'Departemen tujuan sudah nonaktif.'
  if (schedule.target_position_id && !target.positionActive) return 'Jabatan tujuan sudah nonaktif.'
  if (schedule.target_work_group_id && !target.workGroupActive) return 'Kelompok kerja tujuan sudah nonaktif.'
  if (!target.typeActive) return 'Jenis karyawan tujuan sudah nonaktif.'
  if (['BORONGAN', 'TRAINING'].includes(schedule.target_employee_type)) {
    if (!schedule.target_production_module_section_id) return 'Modul dan Bagian produksi tujuan belum dipilih.'
    if (!target.mappingActive || !target.moduleActive || !target.sectionActive || Number(target.mappingSiteId) !== Number(schedule.target_site_id)) return 'Pemetaan Modul dan Bagian tujuan sudah tidak valid atau nonaktif.'
  }
  return undefined
}

export async function applyScheduledMutation(uid: string): Promise<ApplyResult> {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(`
      SELECT sm.*,DATE_FORMAT(sm.effective_from,'%Y-%m-%d') effectiveFrom,e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,s.code site,
        et.code target_employee_type,currentType.code current_employee_type
      FROM scheduled_employee_mutations sm
      JOIN employees e ON e.id=sm.employee_id
      JOIN sites s ON s.id=e.current_site_id
      JOIN employee_types et ON et.id=sm.target_employee_type_id
      JOIN employee_types currentType ON currentType.id=e.employee_type_id
      WHERE sm.uid=? FOR UPDATE
    `, [uid])
    const schedule = rows[0]
    if (!schedule || schedule.status !== 'SCHEDULED') { await conn.rollback(); return { status: 'SKIPPED', uid } }
    const today = businessDate()
    if (schedule.effectiveFrom > today) { await conn.rollback(); return { status: 'SKIPPED', uid } }

    const invalidReason = await targetIsValid(conn, schedule)
    if (invalidReason) {
      const result = await failMutation(conn, schedule, invalidReason)
      await conn.commit()
      return result
    }

    const [baseRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM employee_employment_histories WHERE id=? AND employee_id=? AND effective_to IS NULL FOR UPDATE`, [schedule.base_history_id, schedule.employee_id])
    if (!baseRows[0]) {
      const result = await failMutation(conn, schedule, 'Histori sumber sudah berubah sejak mutasi dijadwalkan.')
      await conn.commit()
      return result
    }
    if (schedule.change_type === 'TYPE_CHANGE') {
      const [openContracts] = await conn.query<RowDataPacket[]>(
        "SELECT contract_number FROM employee_contracts WHERE employee_id=? AND status IN ('DRAFT','SCHEDULED','ACTIVE') FOR UPDATE",
        [schedule.employee_id]
      )
      if (openContracts[0]) {
        const result = await failMutation(conn, schedule, `Jenis karyawan tidak dapat diubah karena kontrak ${openContracts[0].contract_number} masih terbuka.`)
        await conn.commit()
        return result
      }
    }

    const [employees] = await conn.query<RowDataPacket[]>(`SELECT employee_status_id FROM employees WHERE id=? FOR UPDATE`, [schedule.employee_id])
    const historyUid = randomUUID()
    await conn.execute('UPDATE employee_employment_histories SET effective_to=DATE_SUB(?, INTERVAL 1 DAY),updated_by=NULL WHERE id=?', [schedule.effectiveFrom, schedule.base_history_id])
    await conn.execute(`INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,production_module_section_id,employee_type_id,employee_status_id,effective_from,change_type,reference_number,reason,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [historyUid, schedule.employee_id, schedule.target_site_id, schedule.target_department_id, schedule.target_position_id, schedule.target_work_group_id, schedule.target_production_module_section_id, schedule.target_employee_type_id, employees[0].employee_status_id, schedule.effectiveFrom, schedule.change_type, schedule.reference_number, schedule.reason, schedule.notes, null, null])
    await conn.execute('UPDATE employees SET employee_type_id=?,current_site_id=?,current_department_id=?,current_position_id=?,current_work_group_id=?,current_production_module_section_id=?,updated_by=NULL WHERE id=?', [schedule.target_employee_type_id, schedule.target_site_id, schedule.target_department_id, schedule.target_position_id, schedule.target_work_group_id, schedule.target_production_module_section_id, schedule.employee_id])
    await conn.execute("UPDATE scheduled_employee_mutations SET status='APPLIED',failure_reason=NULL,applied_at=CURRENT_TIMESTAMP(3),updated_by=NULL WHERE id=?", [schedule.id])
    await writeSystemAudit({ siteId: schedule.target_site_id, action: 'OTHER', table: 'scheduled_employee_mutations', recordId: schedule.id, recordUid: schedule.uid, description: 'Mutasi terjadwal diterapkan oleh cron.' }, conn)
    await writeSystemAudit({ siteId: schedule.target_site_id, action: 'CREATE', table: 'employee_employment_histories', recordUid: historyUid, description: `Cron menerapkan mutasi ${schedule.change_type}.` }, conn)
    await conn.commit()
    return { status: 'APPLIED', uid }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally { conn.release() }
}

export async function reconcileScheduledMutations() {
  const today = businessDate()
  const [rows] = await pool.query<RowDataPacket[]>("SELECT uid FROM scheduled_employee_mutations WHERE status='SCHEDULED' AND effective_from<=? ORDER BY effective_from,id", [today])
  let applied = 0
  let failed = 0
  let skipped = 0
  const failures: Exclude<ApplyResult, { status: 'APPLIED' } | { status: 'SKIPPED' }>[] = []
  for (const row of rows) {
    try {
      const result = await applyScheduledMutation(String(row.uid))
      if (result.status === 'APPLIED') applied++
      else if (result.status === 'FAILED') { failed++; if (failures.length < 50) failures.push(result) }
      else skipped++
    } catch {
      try {
        const result = await failUnexpectedMutation(String(row.uid))
        if (result?.status === 'FAILED') {
          failed++
          if (failures.length < 50) failures.push(result)
        } else skipped++
      } catch {
        skipped++
      }
    }
  }
  return { due: rows.length, applied, failed, skipped, failures }
}
