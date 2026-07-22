import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import { writeAudit, writeSystemAudit } from './audit.js'
import { ApiError } from './errors.js'
import {
  cronConflict,
  assertContractStartDate,
  lifecycleNextStatus,
  type ContractTransitionAction,
} from './contract-lifecycle-policy.js'
import type { AuthContext } from '../middleware/authenticate.js'

const endDateRequired = ['PKWT', 'TRAINING', 'PROJECT', 'RETAIN']
export const businessDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export async function assertContractRules(conn: PoolConnection, employeeId: number, type: string, startDate: string, endDate?: string, exceptId?: number, joinDate?: string) {
  if (endDateRequired.includes(type) && !endDate) throw new ApiError(422, 'Tanggal berakhir wajib untuk jenis kontrak ini.')
  if (endDate && endDate < startDate) throw new ApiError(422, 'Tanggal kontrak tidak valid.')
  assertContractStartDate(startDate, joinDate)
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.contract_number FROM employee_contracts c WHERE c.employee_id=? AND c.status IN ('DRAFT','SCHEDULED','ACTIVE') AND (? IS NULL OR c.id<>?) AND c.start_date<=COALESCE(?, '9999-12-31') AND COALESCE(c.end_date,'9999-12-31')>=? LIMIT 1`, [employeeId, exceptId ?? null, exceptId ?? 0, endDate ?? null, startDate])
  if (rows[0]) throw new ApiError(409, `Periode kontrak bertumpang tindih dengan ${rows[0].contract_number}.`)
}

async function validActiveContracts(conn: PoolConnection, employeeId: number, date: string, exceptId?: number) {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT id FROM employee_contracts WHERE employee_id=? AND status='ACTIVE' AND start_date<=? AND (end_date IS NULL OR end_date>=?) AND (? IS NULL OR id<>?) FOR UPDATE`, [employeeId, date, date, exceptId ?? null, exceptId ?? 0])
  return rows
}

async function employeeStatus(conn: PoolConnection, employeeId: number, next: 'ACTIVE' | 'INACTIVE' | 'RESIGNED', effectiveDate: string, source: 'MANUAL' | 'CRON', reason?: string, actor?: AuthContext) {
  const [employees] = await conn.query<RowDataPacket[]>(`SELECT e.id,s.code currentStatus,e.current_site_id,e.current_department_id,e.current_position_id,e.current_work_group_id,e.current_production_module_section_id,e.employee_type_id FROM employees e JOIN employee_statuses s ON s.id=e.employee_status_id WHERE e.id=? FOR UPDATE`, [employeeId])
  const employee = employees[0]
  if (!employee) throw new ApiError(404, 'Karyawan tidak ditemukan.')
  if (next === 'ACTIVE' && employee.currentStatus === 'RESIGNED') throw new ApiError(422, 'Karyawan resign tidak dapat diaktifkan lewat kontrak.')
  if (employee.currentStatus === next) return false
  const [target] = await conn.query<RowDataPacket[]>('SELECT id FROM employee_statuses WHERE code=?', [next])
  const [later] = await conn.query<RowDataPacket[]>('SELECT id FROM employee_employment_histories WHERE employee_id=? AND effective_from>? LIMIT 1', [employeeId, effectiveDate])
  if (later[0]) throw new ApiError(422, 'Tanggal efektif memiliki histori penempatan yang lebih baru.')
  const [active] = await conn.query<RowDataPacket[]>(`SELECT id,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom FROM employee_employment_histories WHERE employee_id=? AND effective_to IS NULL FOR UPDATE`, [employeeId])
  if (active[0]?.effectiveFrom < effectiveDate) {
    await conn.execute('UPDATE employee_employment_histories SET effective_to=DATE_SUB(?,INTERVAL 1 DAY),updated_by=? WHERE id=?', [effectiveDate, actor?.id ?? null, active[0].id])
    await conn.execute(`INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,production_module_section_id,employee_type_id,employee_status_id,effective_from,change_type,reason,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,'STATUS_CHANGE',?,?,?,?)`, [randomUUID(),employeeId,employee.current_site_id,employee.current_department_id,employee.current_position_id,employee.current_work_group_id,employee.current_production_module_section_id,employee.employee_type_id,target[0].id,effectiveDate,reason ?? null,`Perubahan otomatis dari lifecycle kontrak (${source}).`,actor?.id ?? null,actor?.id ?? null])
  } else if (active[0]) {
    await conn.execute('UPDATE employee_employment_histories SET employee_status_id=?,updated_by=? WHERE id=?', [target[0].id, actor?.id ?? null, active[0].id])
  }
  await conn.execute('UPDATE employees SET employee_status_id=?,resign_date=?,resign_reason=?,updated_by=? WHERE id=?', [target[0].id,next === 'RESIGNED' ? effectiveDate : null,next === 'RESIGNED' ? reason ?? null : null,actor?.id ?? null,employeeId])
  return true
}

async function auditLifecycle(connection: PoolConnection, input: { auth?: AuthContext; siteId: number; contractId: number; contractUid: string; description: string }) {
  const audit = { siteId: input.siteId, action: 'OTHER' as const, table: 'employee_contracts', recordId: input.contractId, recordUid: input.contractUid, description: input.description }
  if (input.auth) await writeAudit({ ...audit, auth: input.auth }, connection)
  else await writeSystemAudit(audit, connection)
}

export async function synchronizeActiveContractAfterEdit(conn: PoolConnection, contract: { id: number; uid: string; employeeId: number; siteId: number; startDate: string; endDate?: string; status: string }, auth: AuthContext) {
  if (contract.status !== 'ACTIVE') return
  const today = businessDate()
  if (contract.startDate > today) throw new ApiError(422, 'Kontrak aktif tidak boleh memiliki tanggal mulai di masa depan. Jadwalkan kontrak tersebut.')
  if ((await validActiveContracts(conn, contract.employeeId, today, contract.id)).length) throw new ApiError(409, 'Ditemukan kontrak aktif lain yang masih berlaku. Selesaikan konflik kontrak terlebih dahulu.')
  if (contract.endDate && contract.endDate < today) {
    await employeeStatus(conn, contract.employeeId, 'INACTIVE', today, 'MANUAL', 'Kontrak kedaluwarsa saat data kontrak diperbarui.', auth)
    await conn.execute("UPDATE employee_contracts SET status='EXPIRED',updated_by=? WHERE id=?", [auth.id, contract.id])
    await conn.execute("INSERT INTO employee_contract_lifecycle_events(uid,contract_id,from_status,to_status,effective_date,reason,source,actor_user_id) VALUES(?,?, 'ACTIVE','EXPIRED',?,'Kontrak kedaluwarsa saat data kontrak diperbarui.','MANUAL',?)", [randomUUID(), contract.id, today, auth.id])
    await auditLifecycle(conn, { auth, siteId: contract.siteId, contractId: contract.id, contractUid: contract.uid, description: 'Kontrak aktif kedaluwarsa saat disimpan dan status karyawan disinkronkan.' })
    return
  }
  await employeeStatus(conn, contract.employeeId, 'ACTIVE', today, 'MANUAL', 'Sinkronisasi setelah perubahan kontrak aktif.', auth)
  await auditLifecycle(conn, { auth, siteId: contract.siteId, contractId: contract.id, contractUid: contract.uid, description: 'Status karyawan disinkronkan setelah perubahan kontrak aktif.' })
}

export async function transitionContract(contractUid: string, action: ContractTransitionAction, input: { effectiveDate?: string; reason?: string }, auth?: AuthContext) {
  const conn = await pool.getConnection()
  const today = businessDate()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.*,e.current_site_id siteId,s.code site FROM employee_contracts c JOIN employees e ON e.id=c.employee_id JOIN sites s ON s.id=e.current_site_id WHERE c.uid=? FOR UPDATE`, [contractUid])
    const contract = rows[0]
    if (!contract) throw new ApiError(404, 'Kontrak tidak ditemukan.')
    if (auth && !auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(contract.site)) throw new ApiError(403, 'Akses site ditolak.')
    const effectiveDate = input.effectiveDate ?? today
    const next = lifecycleNextStatus({ action, status: contract.status, startDate: contract.start_date, today, effectiveDate, hasReason: Boolean(input.reason?.trim()) })
    if (next === 'ACTIVE') {
      if ((await validActiveContracts(conn, contract.employee_id, today, contract.id)).length) throw new ApiError(409, 'Ditemukan kontrak aktif lain yang masih berlaku. Selesaikan konflik kontrak terlebih dahulu.')
    }
    if (next === 'TERMINATED') {
      if ((await validActiveContracts(conn, contract.employee_id, effectiveDate, contract.id)).length) throw new ApiError(409, 'Ditemukan kontrak aktif lain yang masih berlaku. Selesaikan konflik kontrak terlebih dahulu.')
    }
    if (next === 'ACTIVE') await employeeStatus(conn, contract.employee_id, 'ACTIVE', today, 'MANUAL', undefined, auth)
    if (next === 'TERMINATED') await employeeStatus(conn, contract.employee_id, action === 'resign' ? 'RESIGNED' : 'INACTIVE', effectiveDate, 'MANUAL', input.reason, auth)
    await conn.execute('UPDATE employee_contracts SET status=?,terminated_at=?,termination_reason=?,updated_by=? WHERE id=?', [next,next === 'TERMINATED' ? effectiveDate : null,next === 'TERMINATED' ? input.reason?.trim() ?? null : null,auth?.id ?? null,contract.id])
    await conn.execute('INSERT INTO employee_contract_lifecycle_events(uid,contract_id,from_status,to_status,effective_date,reason,source,actor_user_id) VALUES(?,?,?,?,?,?,?,?)', [randomUUID(),contract.id,contract.status,next,effectiveDate,input.reason?.trim() ?? null,auth ? 'MANUAL' : 'CRON',auth?.id ?? null])
    await auditLifecycle(conn, { auth, siteId: contract.siteId, contractId: contract.id, contractUid, description: `Lifecycle kontrak: ${contract.status} menjadi ${next}.` })
    await conn.commit()
    return { uid: contractUid, status: next }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

async function expireContract(contractUid: string, today: string) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.id,c.uid,c.employee_id,e.current_site_id siteId,c.status FROM employee_contracts c JOIN employees e ON e.id=c.employee_id WHERE c.uid=? FOR UPDATE`, [contractUid])
    const contract = rows[0]
    if (!contract || contract.status !== 'ACTIVE') { await conn.rollback(); return false }
    const hasOtherActive = (await validActiveContracts(conn, contract.employee_id, today, contract.id)).length > 0
    if (!hasOtherActive) await employeeStatus(conn, contract.employee_id, 'INACTIVE', today, 'CRON')
    await conn.execute("UPDATE employee_contracts SET status='EXPIRED' WHERE id=?", [contract.id])
    await conn.execute("INSERT INTO employee_contract_lifecycle_events(uid,contract_id,from_status,to_status,effective_date,source) VALUES(?,?, 'ACTIVE','EXPIRED',?,'CRON')", [randomUUID(), contract.id, today])
    await auditLifecycle(conn, { siteId: contract.siteId, contractId: contract.id, contractUid: contract.uid, description: 'Kontrak kedaluwarsa diproses oleh cron.' })
    await conn.commit()
    return true
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

async function recordCronContractFailure(contractUid: string, stage: 'activation' | 'expiry') {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id,c.uid,e.current_site_id siteId
     FROM employee_contracts c
     JOIN employees e ON e.id=c.employee_id
     WHERE c.uid=?`,
    [contractUid]
  )
  const contract = rows[0]
  if (!contract) return undefined
  const reason =
    stage === 'activation'
      ? 'Cron tidak dapat mengaktifkan kontrak. Periksa audit trail.'
      : 'Cron tidak dapat mengakhiri kontrak. Periksa audit trail.'
  await writeSystemAudit({
    siteId: contract.siteId,
    action: 'OTHER',
    table: 'employee_contracts',
    recordId: contract.id,
    recordUid: contract.uid,
    description: reason,
  })
  return { contractUid, stage, reason }
}

export async function reconcileContracts() {
  const today = businessDate()
  const [scheduled] = await pool.query<RowDataPacket[]>("SELECT uid FROM employee_contracts WHERE status='SCHEDULED' AND start_date<=? AND (end_date IS NULL OR end_date>=?)", [today, today])
  const [expired] = await pool.query<RowDataPacket[]>("SELECT uid FROM employee_contracts WHERE status='ACTIVE' AND end_date<?", [today])
  let activated = 0
  let expiredCount = 0
  let skippedConflicts = 0
  const failures: { contractUid: string; stage: 'activation' | 'expiry'; reason: string }[] = []
  for (const row of scheduled) {
    try {
      await transitionContract(row.uid, 'activate', {}, undefined)
      activated++
    } catch {
      skippedConflicts++
      try {
        const failure = await recordCronContractFailure(row.uid, 'activation')
        if (failure && failures.length < 50) failures.push(failure)
      } catch {
        // Cron tidak boleh berhenti hanya karena audit failure.
      }
    }
  }
  for (const row of expired) {
    try {
      if (await expireContract(row.uid, today)) expiredCount++
    } catch {
      skippedConflicts++
      try {
        const failure = await recordCronContractFailure(row.uid, 'expiry')
        if (failure && failures.length < 50) failures.push(failure)
      } catch {
        // Cron tidak boleh berhenti hanya karena audit failure.
      }
    }
  }

  const [employees] = await pool.query<RowDataPacket[]>(`SELECT e.id,e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,s.code site,e.current_site_id siteId,es.code currentStatus,COUNT(c.id) activeContracts,GROUP_CONCAT(c.contract_number ORDER BY c.start_date SEPARATOR ', ') activeContractNumbers FROM employees e JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN employee_contracts c ON c.employee_id=e.id AND c.status='ACTIVE' AND c.start_date<=? AND (c.end_date IS NULL OR c.end_date>=?) GROUP BY e.id,e.uid,e.employee_number,e.full_name,s.code,e.current_site_id,es.code`, [today, today])
  let activatedEmployees = 0
  let inactivatedEmployees = 0
  let legacyConflicts = 0
  const conflicts: { employeeUid: string; employeeNumber: string; fullName: string; site: string; reason: string; contractNumbers: string[] }[] = []
  for (const employee of employees) {
    const activeContracts = Number(employee.activeContracts)
    if (activeContracts > 1 || ((employee.currentStatus === 'RESIGNED' || employee.currentStatus === 'LEAVE') && activeContracts)) {
      legacyConflicts++
      if (conflicts.length < 50) {
        conflicts.push(cronConflict({
          employeeUid: employee.employeeUid,
          employeeNumber: employee.employeeNumber,
          fullName: employee.fullName,
          site: employee.site,
          currentStatus: employee.currentStatus,
          activeContracts,
          activeContractNumbers: employee.activeContractNumbers,
        }))
      }
      continue
    }
    const next = activeContracts === 1 ? 'ACTIVE' : 'INACTIVE'
    if (employee.currentStatus === next || employee.currentStatus === 'RESIGNED' || employee.currentStatus === 'LEAVE') continue
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const changed = await employeeStatus(conn, employee.id, next, today, 'CRON', next === 'ACTIVE' ? 'Sinkronisasi cron: ditemukan kontrak aktif yang berlaku.' : 'Sinkronisasi cron: tidak ada kontrak aktif yang berlaku.')
      if (changed) await writeSystemAudit({ siteId: employee.siteId, action: 'OTHER', table: 'employees', recordId: employee.id, description: `Sinkronisasi cron mengubah status karyawan menjadi ${next}.` }, conn)
      await conn.commit()
      if (changed && next === 'ACTIVE') activatedEmployees++
      if (changed && next === 'INACTIVE') inactivatedEmployees++
    } catch { await conn.rollback(); skippedConflicts++ } finally { conn.release() }
  }
  return { businessDate: today, activated, expired: expiredCount, activatedEmployees, inactivatedEmployees, legacyConflicts, skippedConflicts, conflicts, failures }
}
