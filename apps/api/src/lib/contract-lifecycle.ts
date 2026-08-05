import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import { writeAudit, writeSystemAudit } from './audit.js'
import { ApiError } from './errors.js'
import {
  activeCancellationBlockReason,
  addBusinessDays,
  assertContractActivationPeriod,
  assertActiveConflictRecovery,
  canRepairContractControlledStatus,
  contractReconciliationDecision,
  cronConflict,
  assertContractStartDate,
  lifecycleNextStatus,
  type ContractTransitionAction,
} from './contract-lifecycle-policy.js'
import type { AuthContext } from '../middleware/authenticate.js'

const endDateRequired = ['PKWT', 'TRAINING']
export const businessDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export async function assertContractRules(conn: PoolConnection, employeeId: number, type: string, startDate: string, endDate?: string, exceptId?: number, joinDate?: string) {
  if (endDateRequired.includes(type) && !endDate) throw new ApiError(422, 'Tanggal berakhir wajib untuk jenis kontrak ini.')
  if (endDate && endDate < startDate) throw new ApiError(422, 'Tanggal kontrak tidak valid.')
  assertContractStartDate(startDate, joinDate)
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.contract_number FROM employee_contracts c WHERE c.employee_id=? AND c.status<>'CANCELLED' AND (? IS NULL OR c.id<>?) AND c.start_date<=COALESCE(?, '9999-12-31') AND COALESCE(CASE WHEN c.status='TERMINATED' THEN COALESCE(c.terminated_at,c.end_date) ELSE c.end_date END,'9999-12-31')>=? LIMIT 1`, [employeeId, exceptId ?? null, exceptId ?? 0, endDate ?? null, startDate])
  if (rows[0]) throw new ApiError(409, `Periode kontrak bertumpang tindih dengan ${rows[0].contract_number}.`)
}

async function validActiveContracts(conn: PoolConnection, employeeId: number, date: string, exceptId?: number) {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT id,contract_number contractNumber FROM employee_contracts WHERE employee_id=? AND status='ACTIVE' AND start_date<=? AND (end_date IS NULL OR end_date>=?) AND (? IS NULL OR id<>?) FOR UPDATE`, [employeeId, date, date, exceptId ?? null, exceptId ?? 0])
  return rows
}

export async function employeeStatus(conn: PoolConnection, employeeId: number, next: 'ACTIVE' | 'INACTIVE' | 'RESIGNED', effectiveDate: string, source: 'MANUAL' | 'CRON', reason?: string, actor?: AuthContext) {
  const [employees] = await conn.query<RowDataPacket[]>(`SELECT e.id,s.code currentStatus,e.current_site_id,e.current_department_id,e.current_position_id,e.current_work_group_id,e.current_production_module_section_id,e.employee_type_id FROM employees e JOIN employee_statuses s ON s.id=e.employee_status_id WHERE e.id=? FOR UPDATE`, [employeeId])
  const employee = employees[0]
  if (!employee) throw new ApiError(404, 'Karyawan tidak ditemukan.')
  if (next === 'ACTIVE' && ['RESIGNED', 'LEAVE'].includes(employee.currentStatus)) throw new ApiError(422, 'Karyawan dengan status terminal tidak dapat diaktifkan lewat kontrak.')
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

async function repairEmployeeStatusTimeline(
  conn: PoolConnection,
  employeeId: number,
  targetStatus: 'ACTIVE' | 'INACTIVE',
  effectiveDate: string
) {
  const [boundaryRows] = await conn.query<RowDataPacket[]>(
    `SELECT h.id,h.site_id siteId,h.department_id departmentId,h.position_id positionId,
            h.work_group_id workGroupId,h.production_module_section_id productionModuleSectionId,
            h.employee_type_id employeeTypeId,es.code status,
            DATE_FORMAT(h.effective_from,'%Y-%m-%d') effectiveFrom,
            DATE_FORMAT(h.effective_to,'%Y-%m-%d') effectiveTo
       FROM employee_employment_histories h
       JOIN employee_statuses es ON es.id=h.employee_status_id
      WHERE h.employee_id=?
        AND h.effective_from<=?
        AND (h.effective_to IS NULL OR h.effective_to>=?)
      ORDER BY h.effective_from DESC,h.id DESC
      LIMIT 1 FOR UPDATE`,
    [employeeId, effectiveDate, effectiveDate]
  )
  const [laterRows] = await conn.query<RowDataPacket[]>(
    `SELECT h.id,es.code status
       FROM employee_employment_histories h
       JOIN employee_statuses es ON es.id=h.employee_status_id
      WHERE h.employee_id=? AND h.effective_from>?
      ORDER BY h.effective_from,h.id
      FOR UPDATE`,
    [employeeId, effectiveDate]
  )
  const boundary = boundaryRows[0]
  if (!canRepairContractControlledStatus({
    boundaryStatus: boundary?.status,
    laterStatuses: laterRows.map((row) => String(row.status)),
  })) return undefined

  const [targetRows] = await conn.query<RowDataPacket[]>(
    'SELECT id FROM employee_statuses WHERE code=?',
    [targetStatus]
  )
  const targetId = targetRows[0]?.id
  if (!targetId) throw new ApiError(500, 'Referensi status karyawan tidak ditemukan.')

  if (String(boundary.status) !== targetStatus) {
    if (String(boundary.effectiveFrom) < effectiveDate) {
      await conn.execute(
        'UPDATE employee_employment_histories SET effective_to=DATE_SUB(?,INTERVAL 1 DAY),updated_by=NULL WHERE id=?',
        [effectiveDate, boundary.id]
      )
      await conn.execute(
        `INSERT INTO employee_employment_histories(
           uid,employee_id,site_id,department_id,position_id,work_group_id,
           production_module_section_id,employee_type_id,employee_status_id,
           effective_from,effective_to,change_type,reason,notes
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,'STATUS_CHANGE',?,?)`,
        [
          randomUUID(), employeeId, boundary.siteId, boundary.departmentId,
          boundary.positionId, boundary.workGroupId,
          boundary.productionModuleSectionId, boundary.employeeTypeId, targetId,
          effectiveDate, boundary.effectiveTo,
          'Sinkronisasi cron: kontrak terakhir telah berakhir.',
          'Koreksi timeline otomatis dari lifecycle kontrak.',
        ]
      )
    } else {
      await conn.execute(
        'UPDATE employee_employment_histories SET employee_status_id=?,updated_by=NULL WHERE id=?',
        [targetId, boundary.id]
      )
    }
  }
  await conn.execute(
    `UPDATE employee_employment_histories
        SET employee_status_id=?,updated_by=NULL
      WHERE employee_id=? AND effective_from>? AND employee_status_id<>?`,
    [targetId, employeeId, effectiveDate, targetId]
  )
  const [result] = await conn.execute(
    `UPDATE employees
        SET employee_status_id=?,resign_date=NULL,resign_reason=NULL,updated_by=NULL
      WHERE id=? AND employee_status_id<>?`,
    [targetId, employeeId, targetId]
  )
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0 ||
    String(boundary.status) !== targetStatus ||
    laterRows.some((row) => String(row.status) !== targetStatus)
}

export async function auditLifecycle(connection: PoolConnection, input: { auth?: AuthContext; siteId: number; contractId: number; contractUid: string; description: string }) {
  const audit = { siteId: input.siteId, action: 'OTHER' as const, table: 'employee_contracts', recordId: input.contractId, recordUid: input.contractUid, description: input.description }
  if (input.auth) await writeAudit({ ...audit, auth: input.auth }, connection)
  else await writeSystemAudit(audit, connection)
}

export async function assertNoOpenScheduledStatusChange(
  conn: PoolConnection,
  employeeId: number,
  allowedSourceContractId?: number
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM scheduled_employee_status_changes
     WHERE employee_id=? AND status IN ('SCHEDULED','FAILED')
       AND (? IS NULL OR contract_id IS NULL OR contract_id<>?)
     FOR UPDATE`,
    [employeeId, allowedSourceContractId ?? null, allowedSourceContractId ?? 0]
  )
  if (rows[0]) {
    throw new ApiError(
      409,
      'Karyawan memiliki status kerja terjadwal yang belum diselesaikan. Batalkan jadwal tersebut terlebih dahulu.'
    )
  }
}

export async function synchronizeActiveContractAfterEdit(conn: PoolConnection, contract: { id: number; uid: string; employeeId: number; siteId: number; startDate: string; endDate?: string; status: string }, auth: AuthContext) {
  if (contract.status !== 'ACTIVE') return
  const today = businessDate()
  if (contract.startDate > today) throw new ApiError(422, 'Kontrak aktif tidak boleh memiliki tanggal mulai di masa depan. Jadwalkan kontrak tersebut.')
  if ((await validActiveContracts(conn, contract.employeeId, today, contract.id)).length) throw new ApiError(409, 'Ditemukan kontrak aktif lain yang masih berlaku. Selesaikan konflik kontrak terlebih dahulu.')
  if (contract.endDate && contract.endDate < today) {
    await conn.execute("UPDATE employee_contracts SET status='EXPIRED',updated_by=? WHERE id=?", [auth.id, contract.id])
    await conn.execute("INSERT INTO employee_contract_lifecycle_events(uid,contract_id,from_status,to_status,effective_date,reason,source,actor_user_id) VALUES(?,?, 'ACTIVE','EXPIRED',?,'Kontrak kedaluwarsa saat data kontrak diperbarui.','MANUAL',?)", [randomUUID(), contract.id, today, auth.id])
    await auditLifecycle(conn, { auth, siteId: contract.siteId, contractId: contract.id, contractUid: contract.uid, description: 'Kontrak aktif kedaluwarsa saat disimpan. Status karyawan tidak diubah.' })
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
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.*,ct.code contractType,et.code employeeType,e.current_site_id siteId,s.code site FROM employee_contracts c JOIN contract_types ct ON ct.id=c.contract_type_id JOIN employees e ON e.id=c.employee_id JOIN employee_types et ON et.id=e.employee_type_id JOIN sites s ON s.id=e.current_site_id WHERE c.uid=? FOR UPDATE`, [contractUid])
    const contract = rows[0]
    if (!contract) throw new ApiError(404, 'Kontrak tidak ditemukan.')
    if (auth && !auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(contract.site)) throw new ApiError(403, 'Akses site ditolak.')
    const source = auth ? 'MANUAL' : 'CRON'
    const effectiveDate = input.effectiveDate ?? (!auth && action === 'activate' ? contract.start_date : today)
    if (['schedule', 'activate'].includes(action)) {
      await assertNoOpenScheduledStatusChange(conn, contract.employee_id)
    }
    if (action === 'activate') assertContractActivationPeriod(contract.end_date, today)
    const next = lifecycleNextStatus({ action, status: contract.status, startDate: contract.start_date, endDate: contract.end_date, today, effectiveDate, hasReason: Boolean(input.reason?.trim()) })
    if (auth && (action === 'terminate' || action === 'resign')) {
      await assertNoOpenScheduledStatusChange(conn, contract.employee_id)
    }
    if (next === 'ACTIVE') {
      if ((await validActiveContracts(conn, contract.employee_id, today, contract.id)).length) throw new ApiError(409, 'Ditemukan kontrak aktif lain yang masih berlaku. Selesaikan konflik kontrak terlebih dahulu.')
    }
    if (next === 'TERMINATED') {
      if ((await validActiveContracts(conn, contract.employee_id, effectiveDate, contract.id)).length) throw new ApiError(409, 'Ditemukan kontrak aktif lain yang masih berlaku. Selesaikan konflik kontrak terlebih dahulu.')
    }
    if (next === 'ACTIVE') await employeeStatus(conn, contract.employee_id, 'ACTIVE', auth ? today : contract.start_date, source, undefined, auth)
    if (next === 'TERMINATED') await employeeStatus(conn, contract.employee_id, action === 'resign' ? 'RESIGNED' : 'INACTIVE', effectiveDate, source, input.reason, auth)
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

export async function resolveActiveContractConflict(
  contractUid: string,
  input: { effectiveDate?: string; reason?: string },
  auth: AuthContext
) {
  if (!auth.roles.includes('SUPER_ADMIN')) {
    throw new ApiError(
      403,
      'Pemulihan konflik kontrak aktif hanya dapat dilakukan oleh Super Admin.'
    )
  }

  const conn = await pool.getConnection()
  const today = businessDate()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT c.id,c.uid,c.employee_id,c.contract_number,c.status,
              DATE_FORMAT(c.start_date,'%Y-%m-%d') startDate,
              DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,
              e.uid employeeUid,e.current_site_id siteId,es.code employeeStatus
       FROM employee_contracts c
       JOIN employees e ON e.id=c.employee_id
       JOIN employee_statuses es ON es.id=e.employee_status_id
       WHERE c.uid=? FOR UPDATE`,
      [contractUid]
    )
    const contract = rows[0]
    if (!contract) throw new ApiError(404, 'Kontrak tidak ditemukan.')

    const effectiveDate = input.effectiveDate
    const otherActiveToday = await validActiveContracts(
      conn,
      contract.employee_id,
      today,
      contract.id
    )
    const otherActiveAtEffectiveDate = effectiveDate
      ? await validActiveContracts(
          conn,
          contract.employee_id,
          effectiveDate,
          contract.id
        )
      : []

    assertActiveConflictRecovery({
      contractStatus: String(contract.status),
      employeeStatus: String(contract.employeeStatus),
      startDate: String(contract.startDate),
      endDate: contract.endDate ? String(contract.endDate) : undefined,
      today,
      effectiveDate,
      reason: input.reason,
      otherActiveAtEffectiveDate: otherActiveAtEffectiveDate.length,
      otherActiveToday: otherActiveToday.length,
    })
    await assertNoOpenScheduledStatusChange(conn, contract.employee_id)

    const reason = input.reason!.trim()
    await conn.execute(
      `UPDATE employee_contracts
          SET status='TERMINATED',terminated_at=?,termination_reason=?,updated_by=?
        WHERE id=?`,
      [effectiveDate, reason, auth.id, contract.id]
    )
    await conn.execute(
      `INSERT INTO employee_contract_lifecycle_events(
         uid,contract_id,from_status,to_status,effective_date,reason,source,actor_user_id
       ) VALUES(?,?,'ACTIVE','TERMINATED',?,?,'MANUAL',?)`,
      [randomUUID(), contract.id, effectiveDate, reason, auth.id]
    )
    await auditLifecycle(conn, {
      auth,
      siteId: contract.siteId,
      contractId: contract.id,
      contractUid: contract.uid,
      description: `Pemulihan konflik kontrak aktif: ${contract.contract_number} dihentikan pada ${effectiveDate}; status karyawan tetap ACTIVE karena masih dilindungi kontrak aktif lain.`,
    })
    await conn.commit()
    return {
      uid: contractUid,
      status: 'TERMINATED' as const,
      employeeStatus: 'ACTIVE' as const,
      remainingContractNumbers: otherActiveToday.map((row) =>
        String(row.contractNumber)
      ),
    }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export async function closeExpiredContractEmployeeStatus(
  contractUid: string,
  action: 'close_expired_terminate' | 'close_expired_resign',
  input: { effectiveDate?: string; reason?: string },
  auth: AuthContext
) {
  const conn = await pool.getConnection()
  const today = businessDate()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT c.id,c.uid,c.employee_id,c.start_date,c.end_date,c.status,
              e.uid employeeUid,e.current_site_id siteId,s.code site,es.code employeeStatus
       FROM employee_contracts c
       JOIN employees e ON e.id=c.employee_id
       JOIN employee_statuses es ON es.id=e.employee_status_id
       JOIN sites s ON s.id=e.current_site_id
       WHERE c.uid=? FOR UPDATE`,
      [contractUid]
    )
    const contract = rows[0]
    if (!contract) throw new ApiError(404, 'Kontrak tidak ditemukan.')
    if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(contract.site)) {
      throw new ApiError(403, 'Akses site ditolak.')
    }
    if (contract.status !== 'EXPIRED' || !contract.end_date) {
      throw new ApiError(422, 'Aksi ini hanya tersedia untuk kontrak Expired.')
    }
    const effectiveDate = input.effectiveDate ?? today
    if (!input.reason?.trim() || effectiveDate < contract.end_date || effectiveDate > today) {
      throw new ApiError(422, 'Tanggal efektif harus berada antara tanggal akhir kontrak dan hari ini, serta alasan wajib diisi.')
    }
    if (contract.employeeStatus !== 'ACTIVE') {
      throw new ApiError(409, 'Status karyawan sudah tidak Aktif.')
    }
    await assertNoOpenScheduledStatusChange(conn, contract.employee_id)
    const [newerContracts] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM employee_contracts
       WHERE employee_id=?
         AND (start_date>? OR (start_date=? AND id>?))
       LIMIT 1 FOR UPDATE`,
      [contract.employee_id, contract.start_date, contract.start_date, contract.id]
    )
    if (newerContracts[0]) {
      throw new ApiError(409, 'Aksi ini hanya tersedia untuk kontrak terakhir karyawan.')
    }
    if ((await validActiveContracts(conn, contract.employee_id, effectiveDate)).length) {
      throw new ApiError(409, 'Masih ada kontrak aktif yang berlaku pada tanggal efektif tersebut.')
    }

    const nextStatus = action === 'close_expired_resign' ? 'RESIGNED' : 'INACTIVE'
    await employeeStatus(conn, contract.employee_id, nextStatus, effectiveDate, 'MANUAL', input.reason.trim(), auth)
    await writeAudit({
      auth,
      siteId: contract.siteId,
      action: 'OTHER',
      table: 'employees',
      recordId: contract.employee_id,
      recordUid: contract.employeeUid,
      description: `Status karyawan diubah menjadi ${nextStatus} berdasarkan kontrak Expired ${contract.uid}.`,
    }, conn)
    await auditLifecycle(conn, {
      auth,
      siteId: contract.siteId,
      contractId: contract.id,
      contractUid: contract.uid,
      description: `Kontrak tetap Expired; status karyawan diubah menjadi ${nextStatus} pada ${effectiveDate}.`,
    })
    await conn.commit()
    return { uid: contractUid, status: 'EXPIRED', employeeStatus: nextStatus }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export async function cancelActiveContractActivation(
  contractUid: string,
  input: { reason?: string },
  auth: AuthContext,
  request?: { ip?: string | null; userAgent?: string | null }
) {
  const reason = input.reason?.trim() ?? ''
  if (reason.length < 5) {
    throw new ApiError(422, 'Alasan pembatalan aktivasi minimal 5 karakter.')
  }

  const conn = await pool.getConnection()
  const today = businessDate()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT c.id,c.uid,c.employee_id,c.contract_number,c.status,
              c.signed_date,c.issued_file_id,e.uid employeeUid,
              es.code employeeStatus,e.current_site_id siteId,s.code site
       FROM employee_contracts c
       JOIN employees e ON e.id=c.employee_id
       JOIN employee_statuses es ON es.id=e.employee_status_id
       JOIN sites s ON s.id=e.current_site_id
       WHERE c.uid=? FOR UPDATE`,
      [contractUid]
    )
    const contract = rows[0]
    if (!contract) throw new ApiError(404, 'Kontrak tidak ditemukan.')
    if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(contract.site)) {
      throw new ApiError(403, 'Akses site ditolak.')
    }
    if (contract.status !== 'ACTIVE') {
      throw new ApiError(409, 'Batalkan aktivasi hanya tersedia untuk kontrak Aktif.')
    }
    if (contract.employeeStatus !== 'ACTIVE') {
      throw new ApiError(409, 'Status karyawan tidak konsisten dengan kontrak Aktif. Jalankan rekonsiliasi terlebih dahulu.')
    }

    const [activationEvents] = await conn.query<RowDataPacket[]>(
      `SELECT id,DATE_FORMAT(effective_date,'%Y-%m-%d') activationDate
       FROM employee_contract_lifecycle_events
       WHERE contract_id=? AND to_status='ACTIVE'
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [contract.id]
    )
    const activation = activationEvents[0]
    if (!activation) {
      throw new ApiError(409, 'Event aktivasi kontrak tidak ditemukan. Kontrak legacy ini tidak dapat dibatalkan otomatis.')
    }

    const [usageRows] = await conn.query<RowDataPacket[]>(
      `SELECT
        EXISTS(SELECT 1 FROM attendance_records ar WHERE ar.employee_id=? AND ar.business_date>=?)
          OR EXISTS(SELECT 1 FROM attendance_scan_events ase WHERE ase.employee_id=? AND DATE(ase.scanned_at)>=?) hasAttendance,
        EXISTS(SELECT 1 FROM production_transactions pt WHERE pt.employee_id=? AND pt.business_date>=?) hasProduction,
        EXISTS(
          SELECT 1 FROM payroll_employee_results per
          JOIN payroll_periods pp ON pp.id=per.payroll_period_id
          WHERE per.employee_id=? AND pp.period_end>=?
        ) hasPayroll,
        EXISTS(SELECT 1 FROM employee_employment_histories h WHERE h.employee_id=? AND h.effective_from>?) hasLaterHistory,
        EXISTS(SELECT 1 FROM employee_contract_lifecycle_events ev WHERE ev.contract_id=? AND ev.id>?) hasLaterLifecycle,
        EXISTS(
          SELECT 1 FROM scheduled_employee_status_changes sc
          WHERE sc.employee_id=? AND sc.status IN ('SCHEDULED','FAILED')
        ) hasOpenScheduledStatusChange`,
      [
        contract.employee_id,
        activation.activationDate,
        contract.employee_id,
        activation.activationDate,
        contract.employee_id,
        activation.activationDate,
        contract.employee_id,
        activation.activationDate,
        contract.employee_id,
        activation.activationDate,
        contract.id,
        activation.id,
        contract.employee_id,
      ]
    )
    const usage = usageRows[0]
    const blocked = activeCancellationBlockReason({
      hasSignedContract: Boolean(contract.signed_date || contract.issued_file_id),
      hasAttendance: Number(usage.hasAttendance) === 1,
      hasProduction: Number(usage.hasProduction) === 1,
      hasPayroll: Number(usage.hasPayroll) === 1,
      hasLaterHistory: Number(usage.hasLaterHistory) === 1,
      hasLaterLifecycle: Number(usage.hasLaterLifecycle) === 1,
      hasOpenScheduledStatusChange:
        Number(usage.hasOpenScheduledStatusChange) === 1,
    })
    if (blocked) throw new ApiError(409, blocked)

    const otherActive = await validActiveContracts(
      conn,
      contract.employee_id,
      today,
      contract.id
    )
    const nextEmployeeStatus = otherActive.length ? 'ACTIVE' : 'INACTIVE'

    await conn.execute(
      "UPDATE employee_contracts SET status='CANCELLED',terminated_at=NULL,termination_reason=NULL,updated_by=? WHERE id=?",
      [auth.id, contract.id]
    )
    await employeeStatus(
      conn,
      contract.employee_id,
      nextEmployeeStatus,
      nextEmployeeStatus === 'INACTIVE' ? activation.activationDate : today,
      'MANUAL',
      `Pembatalan aktivasi kontrak: ${reason}`,
      auth
    )
    await conn.execute(
      `INSERT INTO employee_contract_lifecycle_events(
         uid,contract_id,from_status,to_status,effective_date,reason,source,actor_user_id
       ) VALUES(?,?,'ACTIVE','CANCELLED',?,?,'MANUAL',?)`,
      [randomUUID(), contract.id, today, reason, auth.id]
    )
    await conn.execute(
      `INSERT INTO audit_logs(
         uid,user_id,site_id,module,action,table_name,record_id,record_uid,
         description,reason,before_data,after_data,ip_address,user_agent,
         created_by,updated_by
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        auth.id,
        contract.siteId,
        'EMPLOYEES',
        'UPDATE',
        'employee_contracts',
        contract.id,
        contractUid,
        `Membatalkan aktivasi kontrak ${contract.contract_number}.`,
        reason,
        JSON.stringify({ contractStatus: 'ACTIVE', employeeStatus: contract.employeeStatus }),
        JSON.stringify({ contractStatus: 'CANCELLED', employeeStatus: nextEmployeeStatus }),
        request?.ip ?? null,
        request?.userAgent ?? null,
        auth.id,
        auth.id,
      ]
    )
    await conn.commit()
    return {
      uid: contractUid,
      status: 'CANCELLED' as const,
      employeeStatus: nextEmployeeStatus,
    }
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
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.id,c.uid,c.employee_id,e.current_site_id siteId,c.status,DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,ct.code contractType,et.code employeeType FROM employee_contracts c JOIN contract_types ct ON ct.id=c.contract_type_id JOIN employees e ON e.id=c.employee_id JOIN employee_types et ON et.id=e.employee_type_id WHERE c.uid=? FOR UPDATE`, [contractUid])
    const contract = rows[0]
    if (!contract || contract.status !== 'ACTIVE' || !contract.endDate || contract.endDate >= today) { await conn.rollback(); return false }
    const effectiveDate = addBusinessDays(contract.endDate, 1)
    await conn.execute("UPDATE employee_contracts SET status='EXPIRED',updated_by=NULL WHERE id=?", [contract.id])
    await conn.execute("INSERT INTO employee_contract_lifecycle_events(uid,contract_id,from_status,to_status,effective_date,reason,source) VALUES(?,?, 'ACTIVE','EXPIRED',?,'Periode kontrak berakhir.','CRON')", [randomUUID(), contract.id, effectiveDate])
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

async function expireLapsedScheduledContract(contractUid: string, today: string) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT c.id,c.uid,c.status,DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,
              e.current_site_id siteId
       FROM employee_contracts c
       JOIN employees e ON e.id=c.employee_id
       WHERE c.uid=? FOR UPDATE`,
      [contractUid]
    )
    const contract = rows[0]
    if (!contract || contract.status !== 'SCHEDULED' || !contract.endDate || contract.endDate >= today) {
      await conn.rollback()
      return false
    }
    const effectiveDate = addBusinessDays(contract.endDate, 1)
    await conn.execute(
      "UPDATE employee_contracts SET status='EXPIRED',updated_by=NULL WHERE id=?",
      [contract.id]
    )
    await conn.execute(
      `INSERT INTO employee_contract_lifecycle_events(
         uid,contract_id,from_status,to_status,effective_date,reason,source
       ) VALUES(?,?,'SCHEDULED','EXPIRED',?,'Periode kontrak terjadwal terlewat tanpa aktivasi.','CRON')`,
      [randomUUID(), contract.id, effectiveDate]
    )
    await auditLifecycle(conn, {
      siteId: contract.siteId,
      contractId: contract.id,
      contractUid: contract.uid,
      description: 'Kontrak terjadwal yang seluruh periodenya terlewat difinalkan menjadi Expired oleh cron.',
    })
    await conn.commit()
    return true
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

async function closeHistoricalGapBeforeActivation(contractUid: string) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT c.id,c.employee_id,DATE_FORMAT(c.start_date,'%Y-%m-%d') startDate,
              e.uid employeeUid,e.current_site_id siteId,es.code employeeStatus
       FROM employee_contracts c
       JOIN employees e ON e.id=c.employee_id
       JOIN employee_statuses es ON es.id=e.employee_status_id
       WHERE c.uid=?
       FOR UPDATE`,
      [contractUid]
    )
    const contract = rows[0]
    if (!contract || contract.employeeStatus !== 'ACTIVE') {
      await conn.rollback()
      return false
    }
    const [previousRows] = await conn.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(COALESCE(
         CASE WHEN status='TERMINATED' THEN terminated_at ELSE end_date END,
         end_date
       ),'%Y-%m-%d') previousEnd
       FROM employee_contracts
       WHERE employee_id=? AND id<>?
         AND status IN ('EXPIRED','TERMINATED')
         AND COALESCE(CASE WHEN status='TERMINATED' THEN terminated_at ELSE end_date END,end_date)<?
       ORDER BY COALESCE(CASE WHEN status='TERMINATED' THEN terminated_at ELSE end_date END,end_date) DESC,id DESC
       LIMIT 1
       FOR UPDATE`,
      [contract.employee_id, contract.id, contract.startDate]
    )
    const previousEnd = previousRows[0]?.previousEnd
    if (!previousEnd) {
      await conn.rollback()
      return false
    }
    const gapStart = addBusinessDays(String(previousEnd), 1)
    if (gapStart >= contract.startDate) {
      await conn.rollback()
      return false
    }
    const [coverage] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM employee_contracts
       WHERE employee_id=? AND status='ACTIVE'
         AND start_date<=? AND (end_date IS NULL OR end_date>=?)
       LIMIT 1 FOR UPDATE`,
      [contract.employee_id, gapStart, gapStart]
    )
    if (coverage[0]) {
      await conn.rollback()
      return false
    }
    const changed = await employeeStatus(
      conn,
      contract.employee_id,
      'INACTIVE',
      gapStart,
      'CRON',
      'Sinkronisasi cron: terdapat jeda setelah kontrak sebelumnya berakhir.'
    )
    if (changed) {
      await writeSystemAudit({
        siteId: contract.siteId,
        action: 'OTHER',
        table: 'employees',
        recordId: contract.employee_id,
        recordUid: contract.employeeUid,
        description: `Status karyawan menjadi INACTIVE pada ${gapStart} karena terdapat jeda kontrak.`,
      }, conn)
    }
    await conn.commit()
    return changed
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
  const [expired] = await pool.query<RowDataPacket[]>("SELECT uid FROM employee_contracts WHERE status='ACTIVE' AND end_date<?", [today])
  const [lapsedScheduled] = await pool.query<RowDataPacket[]>("SELECT uid FROM employee_contracts WHERE status='SCHEDULED' AND end_date<? ORDER BY end_date,id", [today])
  const [scheduled] = await pool.query<RowDataPacket[]>("SELECT uid FROM employee_contracts WHERE status='SCHEDULED' AND start_date<=? AND (end_date IS NULL OR end_date>=?) ORDER BY start_date,id", [today, today])
  let activated = 0
  let expiredCount = 0
  let lapsedScheduledExpired = 0
  let skippedConflicts = 0
  const failures: { contractUid: string; stage: 'activation' | 'expiry'; reason: string }[] = []
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
  for (const row of lapsedScheduled) {
    try {
      if (await expireLapsedScheduledContract(row.uid, today)) lapsedScheduledExpired++
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
  for (const row of scheduled) {
    try {
      await closeHistoricalGapBeforeActivation(String(row.uid))
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

  const [employees] = await pool.query<RowDataPacket[]>(
    `SELECT
      e.id,
      e.uid employeeUid,
      e.employee_number employeeNumber,
      e.full_name fullName,
      s.code site,
      e.current_site_id siteId,
      es.code currentStatus,
      e.resign_date resignDate,
      COUNT(DISTINCT active_contract.id) activeContracts,
      COUNT(DISTINCT any_contract.id) nonCancelledContracts,
      COUNT(DISTINCT ended_contract.id) endedContracts,
      DATE_FORMAT(MAX(COALESCE(
        CASE WHEN ended_contract.status='TERMINATED' THEN ended_contract.terminated_at ELSE ended_contract.end_date END,
        ended_contract.end_date
      )),'%Y-%m-%d') latestCoverageEnd,
      DATE_FORMAT(MIN(active_contract.start_date),'%Y-%m-%d') activeContractStart,
      GROUP_CONCAT(DISTINCT active_contract.contract_number ORDER BY active_contract.contract_number SEPARATOR ', ') activeContractNumbers
     FROM employees e
     JOIN employee_statuses es ON es.id=e.employee_status_id
     JOIN sites s ON s.id=e.current_site_id
     LEFT JOIN employee_contracts active_contract
       ON active_contract.employee_id=e.id
      AND active_contract.status='ACTIVE'
      AND active_contract.start_date<=?
      AND (active_contract.end_date IS NULL OR active_contract.end_date>=?)
     LEFT JOIN employee_contracts any_contract
       ON any_contract.employee_id=e.id
      AND any_contract.status<>'CANCELLED'
     LEFT JOIN employee_contracts ended_contract
       ON ended_contract.employee_id=e.id
      AND ended_contract.status IN ('EXPIRED','TERMINATED')
     GROUP BY e.id,e.uid,e.employee_number,e.full_name,s.code,e.current_site_id,es.code,e.resign_date`,
    [today, today]
  )
  let activatedEmployees = 0
  let inactivatedEmployees = 0
  let legacyConflicts = 0
  const conflicts: { employeeUid: string; employeeNumber: string; fullName: string; site: string; reason: string; contractNumbers: string[] }[] = []
  for (const employee of employees) {
    const activeContracts = Number(employee.activeContracts)
    const nonCancelledContracts = Number(employee.nonCancelledContracts)
    const endedContracts = Number(employee.endedContracts)
    const decision = contractReconciliationDecision({
      currentStatus: String(employee.currentStatus),
      activeContracts,
      nonCancelledContracts,
      endedContracts,
    })
    if (decision === 'CONFLICT') {
      legacyConflicts++
      if (conflicts.length < 50) {
        conflicts.push(cronConflict({
          employeeUid: employee.employeeUid,
          employeeNumber: employee.employeeNumber,
          fullName: employee.fullName,
          site: employee.site,
          currentStatus: employee.currentStatus,
          activeContracts,
          nonCancelledContracts,
          activeContractNumbers: employee.activeContractNumbers,
        }))
      }
      continue
    }
    if (decision === 'PRESERVE_TERMINAL' || employee.currentStatus === decision) continue
    const next = decision
    const effectiveDate = next === 'ACTIVE'
      ? String(employee.activeContractStart ?? today)
      : employee.latestCoverageEnd
        ? addBusinessDays(String(employee.latestCoverageEnd), 1)
        : today
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const repaired = next === 'INACTIVE'
        ? await repairEmployeeStatusTimeline(conn, employee.id, next, effectiveDate)
        : undefined
      const changed = repaired ?? await employeeStatus(conn, employee.id, next, effectiveDate, 'CRON', next === 'ACTIVE' ? 'Sinkronisasi cron: ditemukan kontrak aktif yang berlaku.' : 'Sinkronisasi cron: kontrak terakhir telah berakhir.')
      if (changed) await writeSystemAudit({ siteId: employee.siteId, action: 'OTHER', table: 'employees', recordId: employee.id, description: `Sinkronisasi cron mengubah status karyawan menjadi ${next}.` }, conn)
      await conn.commit()
      if (changed && next === 'ACTIVE') activatedEmployees++
      if (changed && next === 'INACTIVE') inactivatedEmployees++
    } catch {
      await conn.rollback()
      skippedConflicts++
      legacyConflicts++
      if (conflicts.length < 50) {
        conflicts.push(cronConflict({
          employeeUid: employee.employeeUid,
          employeeNumber: employee.employeeNumber,
          fullName: employee.fullName,
          site: employee.site,
          currentStatus: employee.currentStatus,
          activeContracts,
          nonCancelledContracts,
          activeContractNumbers: employee.activeContractNumbers,
        }))
      }
      try {
        await writeSystemAudit({
          siteId: employee.siteId,
          action: 'OTHER',
          table: 'employees',
          recordId: employee.id,
          recordUid: employee.employeeUid,
          description: `Sinkronisasi status kontrak gagal pada tanggal efektif ${effectiveDate}; histori yang lebih baru dipertahankan.`,
        })
      } catch {
        // Audit failure tidak boleh menghentikan rekonsiliasi karyawan lain.
      }
    } finally { conn.release() }
  }
  return { businessDate: today, activated, expired: expiredCount, lapsedScheduledExpired, activatedEmployees, inactivatedEmployees, legacyConflicts, skippedConflicts, conflicts, failures }
}
