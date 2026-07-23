import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import { writeSystemAudit } from './audit.js'
import { auditLifecycle, businessDate, employeeStatus } from './contract-lifecycle.js'

type ApplyResult =
  | { status: 'APPLIED'; uid: string }
  | { status: 'FAILED'; uid: string; employeeUid: string; employeeNumber: string; fullName: string; site: string; reason: string }
  | { status: 'SKIPPED'; uid: string }

async function fail(
  conn: PoolConnection,
  schedule: RowDataPacket,
  reason: string
): Promise<ApplyResult> {
  await conn.execute(
    "UPDATE scheduled_employee_status_changes SET status='FAILED',failure_reason=?,updated_by=NULL WHERE id=?",
    [reason, schedule.id]
  )
  await writeSystemAudit({
    siteId: schedule.siteId,
    action: 'OTHER',
    table: 'scheduled_employee_status_changes',
    recordId: schedule.id,
    recordUid: schedule.uid,
    description: `Status kerja terjadwal gagal: ${reason}`,
  }, conn)
  return { status: 'FAILED', uid: schedule.uid, employeeUid: schedule.employeeUid, employeeNumber: schedule.employeeNumber, fullName: schedule.fullName, site: schedule.site, reason }
}

async function failUnexpected(uid: string): Promise<ApplyResult | undefined> {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(`
      SELECT sc.*,e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,s.id siteId,s.code site
      FROM scheduled_employee_status_changes sc
      JOIN employees e ON e.id=sc.employee_id
      JOIN sites s ON s.id=e.current_site_id
      WHERE sc.uid=? FOR UPDATE
    `, [uid])
    const schedule = rows[0]
    if (!schedule || schedule.status !== 'SCHEDULED') { await conn.rollback(); return undefined }
    const result = await fail(conn, schedule, 'Proses cron gagal sebelum status kerja diterapkan. Periksa audit trail.')
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally { conn.release() }
}

export async function applyScheduledStatusChange(uid: string): Promise<ApplyResult> {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(`
      SELECT sc.*,DATE_FORMAT(sc.effective_date,'%Y-%m-%d') effectiveDate,
        e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,
        es.code employeeStatus,s.id siteId,s.code site
      FROM scheduled_employee_status_changes sc
      JOIN employees e ON e.id=sc.employee_id
      JOIN employee_statuses es ON es.id=e.employee_status_id
      JOIN sites s ON s.id=e.current_site_id
      WHERE sc.uid=? FOR UPDATE
    `, [uid])
    const schedule = rows[0]
    if (!schedule || schedule.status !== 'SCHEDULED') {
      await conn.rollback()
      return { status: 'SKIPPED', uid }
    }
    if (schedule.effectiveDate > businessDate()) {
      await conn.rollback()
      return { status: 'SKIPPED', uid }
    }
    if (schedule.employeeStatus !== 'ACTIVE') {
      const result = await fail(conn, schedule, 'Status karyawan sudah tidak Aktif saat jadwal diproses.')
      await conn.commit()
      return result
    }

    const [contracts] = await conn.query<RowDataPacket[]>(`
      SELECT c.id,c.uid,c.status
      FROM employee_contracts c
      WHERE c.employee_id=? AND c.status='ACTIVE'
      FOR UPDATE
    `, [schedule.employee_id])
    for (const contract of contracts) {
      await conn.execute(
        "UPDATE employee_contracts SET status='TERMINATED',terminated_at=?,termination_reason=?,updated_by=NULL WHERE id=?",
        [schedule.effectiveDate, schedule.reason, contract.id]
      )
      await conn.execute(
        `INSERT INTO employee_contract_lifecycle_events(uid,contract_id,from_status,to_status,effective_date,reason,source,actor_user_id)
         VALUES(?,?,'ACTIVE','TERMINATED',? ,?,'CRON',NULL)`,
        [randomUUID(), contract.id, schedule.effectiveDate, schedule.reason]
      )
      await auditLifecycle(conn, {
        siteId: schedule.siteId,
        contractId: contract.id,
        contractUid: contract.uid,
        description: `Kontrak dihentikan oleh status kerja terjadwal ${schedule.action}.`,
      })
    }
    const target = schedule.action === 'RESIGN' ? 'RESIGNED' : 'INACTIVE'
    await employeeStatus(conn, schedule.employee_id, target, schedule.effectiveDate, 'CRON', schedule.reason)
    await conn.execute(
      "UPDATE scheduled_employee_status_changes SET status='APPLIED',failure_reason=NULL,applied_at=CURRENT_TIMESTAMP(3),updated_by=NULL WHERE id=?",
      [schedule.id]
    )
    await writeSystemAudit({
      siteId: schedule.siteId,
      action: 'OTHER',
      table: 'scheduled_employee_status_changes',
      recordId: schedule.id,
      recordUid: schedule.uid,
      description: `Status kerja terjadwal ${schedule.action} diterapkan oleh cron.`,
    }, conn)
    await conn.commit()
    return { status: 'APPLIED', uid }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export async function reconcileScheduledStatusChanges() {
  const today = businessDate()
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT uid FROM scheduled_employee_status_changes WHERE status='SCHEDULED' AND effective_date<=? ORDER BY effective_date,id",
    [today]
  )
  let applied = 0
  let failed = 0
  let skipped = 0
  const failures: Exclude<ApplyResult, { status: 'APPLIED' } | { status: 'SKIPPED' }>[] = []
  for (const row of rows) {
    try {
      const result = await applyScheduledStatusChange(String(row.uid))
      if (result.status === 'APPLIED') applied++
      else if (result.status === 'FAILED') { failed++; if (failures.length < 50) failures.push(result) }
      else skipped++
    } catch {
      try {
        const result = await failUnexpected(String(row.uid))
        if (result?.status === 'FAILED') { failed++; if (failures.length < 50) failures.push(result) }
        else skipped++
      } catch { skipped++ }
    }
  }
  return { due: rows.length, applied, failed, skipped, failures }
}
