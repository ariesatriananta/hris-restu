import { randomUUID } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import type { RowDataPacket } from 'mysql2'
import { pool } from '../db.js'
import { ApiError } from './errors.js'
import type { AuthContext } from '../middleware/authenticate.js'

const endDateRequired = ['PKWT', 'TRAINING', 'PROJECT', 'RETAIN']
export const businessDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export async function assertContractRules(conn: PoolConnection, employeeId: number, type: string, startDate: string, endDate?: string, exceptId?: number) {
  if (endDateRequired.includes(type) && !endDate) throw new ApiError(422, 'Tanggal berakhir wajib untuk jenis kontrak ini.')
  if (endDate && endDate < startDate) throw new ApiError(422, 'Tanggal kontrak tidak valid.')
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.contract_number FROM employee_contracts c WHERE c.employee_id=? AND c.status IN ('DRAFT','SCHEDULED','ACTIVE') AND (? IS NULL OR c.id<>?) AND c.start_date<=COALESCE(?, '9999-12-31') AND COALESCE(c.end_date,'9999-12-31')>=? LIMIT 1`, [employeeId, exceptId ?? null, exceptId ?? 0, endDate ?? null, startDate])
  if (rows[0]) throw new ApiError(409, `Periode kontrak bertumpang tindih dengan ${rows[0].contract_number}.`)
}

async function employeeStatus(conn: PoolConnection, employeeId: number, next: 'ACTIVE' | 'INACTIVE' | 'RESIGNED', effectiveDate: string, source: 'MANUAL' | 'CRON', reason?: string, actor?: AuthContext) {
  const [employees] = await conn.query<RowDataPacket[]>(`SELECT e.id,e.employee_status_id currentStatusId,s.code currentStatus,e.current_site_id,e.current_department_id,e.current_position_id,e.current_work_group_id,e.employee_type_id FROM employees e JOIN employee_statuses s ON s.id=e.employee_status_id WHERE e.id=? FOR UPDATE`, [employeeId])
  const employee = employees[0]
  if (!employee) throw new ApiError(404, 'Karyawan tidak ditemukan.')
  if (next === 'ACTIVE' && employee.currentStatus === 'RESIGNED') throw new ApiError(422, 'Karyawan resign tidak dapat diaktifkan lewat kontrak.')
  if (employee.currentStatus === next) return
  const [target] = await conn.query<RowDataPacket[]>('SELECT id FROM employee_statuses WHERE code=?', [next])
  const [later] = await conn.query<RowDataPacket[]>('SELECT id FROM employee_employment_histories WHERE employee_id=? AND effective_from>? LIMIT 1', [employeeId, effectiveDate])
  if (later[0]) throw new ApiError(422, 'Tanggal efektif memiliki histori penempatan yang lebih baru.')
  const [active] = await conn.query<RowDataPacket[]>(`SELECT id,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom FROM employee_employment_histories WHERE employee_id=? AND effective_to IS NULL FOR UPDATE`, [employeeId])
  if (active[0]?.effectiveFrom < effectiveDate) {
    await conn.execute('UPDATE employee_employment_histories SET effective_to=DATE_SUB(?,INTERVAL 1 DAY),updated_by=? WHERE id=?', [effectiveDate, actor?.id ?? null, active[0].id])
    await conn.execute(`INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,employee_type_id,employee_status_id,effective_from,change_type,reason,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,'STATUS_CHANGE',?,?,?,?)`, [randomUUID(),employeeId,employee.current_site_id,employee.current_department_id,employee.current_position_id,employee.current_work_group_id,employee.employee_type_id,target[0].id,effectiveDate,reason ?? null,`Perubahan otomatis dari lifecycle kontrak (${source}).`,actor?.id ?? null,actor?.id ?? null])
  } else if (active[0]) await conn.execute('UPDATE employee_employment_histories SET employee_status_id=?,updated_by=? WHERE id=?', [target[0].id, actor?.id ?? null, active[0].id])
  await conn.execute('UPDATE employees SET employee_status_id=?,resign_date=?,resign_reason=?,updated_by=? WHERE id=?', [target[0].id,next === 'RESIGNED' ? effectiveDate : null,next === 'RESIGNED' ? reason ?? null : null,actor?.id ?? null,employeeId])
}

export async function synchronizeActiveContractAfterEdit(
  conn: PoolConnection,
  contract: {
    id: number
    employeeId: number
    startDate: string
    endDate?: string
    status: string
  },
  auth: AuthContext
) {
  if (contract.status !== 'ACTIVE') return

  const today = businessDate()
  if (contract.startDate > today) {
    throw new ApiError(422, 'Kontrak aktif tidak boleh memiliki tanggal mulai di masa depan. Jadwalkan kontrak tersebut.')
  }

  if (contract.endDate && contract.endDate < today) {
    await employeeStatus(conn, contract.employeeId, 'INACTIVE', today, 'MANUAL', 'Kontrak kedaluwarsa saat data kontrak diperbarui.', auth)
    await conn.execute("UPDATE employee_contracts SET status='EXPIRED',updated_by=? WHERE id=?", [auth.id, contract.id])
    await conn.execute("INSERT INTO employee_contract_lifecycle_events(uid,contract_id,from_status,to_status,effective_date,reason,source,actor_user_id) VALUES(?,?, 'ACTIVE','EXPIRED',?,'Kontrak kedaluwarsa saat data kontrak diperbarui.','MANUAL',?)", [randomUUID(), contract.id, today, auth.id])
    return
  }

  await employeeStatus(conn, contract.employeeId, 'ACTIVE', today, 'MANUAL', 'Sinkronisasi setelah perubahan kontrak aktif.', auth)
}

export async function transitionContract(contractUid: string, action: 'schedule' | 'activate' | 'terminate' | 'resign' | 'cancel', input: { effectiveDate?: string; reason?: string }, auth?: AuthContext) {
  const conn = await pool.getConnection(); const today = businessDate()
  try { await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.*,ct.code typeCode,e.uid employeeUid,e.current_site_id,s.code site FROM employee_contracts c JOIN contract_types ct ON ct.id=c.contract_type_id JOIN employees e ON e.id=c.employee_id JOIN sites s ON s.id=e.current_site_id WHERE c.uid=? FOR UPDATE`, [contractUid]); const c=rows[0]
    if (!c) throw new ApiError(404,'Kontrak tidak ditemukan.')
    if (auth && !auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(c.site)) throw new ApiError(403,'Akses site ditolak.')
    const effectiveDate=input.effectiveDate ?? today; let next:string
    if (action==='schedule') { if (c.status!=='DRAFT'||c.start_date<=today) throw new ApiError(422,'Hanya draft bertanggal masa depan yang dapat dijadwalkan.'); next='SCHEDULED' }
    else if (action==='activate') { if (!['DRAFT','SCHEDULED'].includes(c.status)||c.start_date>today) throw new ApiError(422,'Kontrak belum dapat diaktifkan.'); next='ACTIVE' }
    else if (action==='terminate' || action==='resign') { if (c.status!=='ACTIVE'||!input.reason?.trim()||effectiveDate>today||effectiveDate<c.start_date) throw new ApiError(422,`Data ${action === 'resign' ? 'resign' : 'terminasi'} tidak valid.`); next='TERMINATED' }
    else { if (!['DRAFT','SCHEDULED'].includes(c.status)) throw new ApiError(422,'Kontrak ini tidak dapat dibatalkan.'); next='CANCELLED' }
    if (next==='ACTIVE') await employeeStatus(conn,c.employee_id,'ACTIVE',today,'MANUAL',undefined,auth)
    if (next==='TERMINATED') await employeeStatus(conn,c.employee_id,action === 'resign' ? 'RESIGNED' : 'INACTIVE',effectiveDate,'MANUAL',input.reason,auth)
    await conn.execute('UPDATE employee_contracts SET status=?,terminated_at=?,termination_reason=?,updated_by=? WHERE id=?',[next,next==='TERMINATED'?effectiveDate:null,next==='TERMINATED'?input.reason?.trim()??null:null,auth?.id??null,c.id])
    await conn.execute('INSERT INTO employee_contract_lifecycle_events(uid,contract_id,from_status,to_status,effective_date,reason,source,actor_user_id) VALUES(?,?,?,?,?,?,?,?)',[randomUUID(),c.id,c.status,next,effectiveDate,input.reason?.trim()??null,'MANUAL',auth?.id??null])
    await conn.commit(); return { uid: contractUid, status: next }
  } catch(e){await conn.rollback();throw e} finally{conn.release()}
}

export async function reconcileContracts() {
  const today = businessDate()
  const [scheduled] = await pool.query<RowDataPacket[]>(
    "SELECT uid FROM employee_contracts WHERE status='SCHEDULED' AND start_date<=? AND (end_date IS NULL OR end_date>=?)",
    [today, today]
  )
  const [expired] = await pool.query<RowDataPacket[]>(
    "SELECT uid FROM employee_contracts WHERE status='ACTIVE' AND end_date<?",
    [today]
  )

  let activated = 0
  let expiredCount = 0
  let skippedConflicts = 0
  for (const row of scheduled) {
    try {
      await transitionContract(row.uid, 'activate', {}, undefined)
      activated++
    } catch {
      skippedConflicts++
    }
  }
  for (const row of expired) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT c.id,c.employee_id,c.status FROM employee_contracts c WHERE c.uid=? FOR UPDATE',
        [row.uid]
      )
      const contract = rows[0]
      if (!contract || contract.status !== 'ACTIVE') {
        await conn.rollback()
        continue
      }
      await employeeStatus(conn, contract.employee_id, 'INACTIVE', today, 'CRON')
      await conn.execute("UPDATE employee_contracts SET status='EXPIRED' WHERE id=?", [contract.id])
      await conn.execute(
        "INSERT INTO employee_contract_lifecycle_events(uid,contract_id,from_status,to_status,effective_date,source) VALUES(?,?, 'ACTIVE','EXPIRED',?,'CRON')",
        [randomUUID(), contract.id, today]
      )
      await conn.commit()
      expiredCount++
    } catch {
      await conn.rollback()
      skippedConflicts++
    } finally {
      conn.release()
    }
  }

  const [employees] = await pool.query<RowDataPacket[]>(
    `SELECT e.id,es.code currentStatus,
      EXISTS(
        SELECT 1 FROM employee_contracts c
        WHERE c.employee_id=e.id
          AND c.status='ACTIVE'
          AND c.start_date<=?
          AND (c.end_date IS NULL OR c.end_date>=?)
      ) hasActiveContract
    FROM employees e
    JOIN employee_statuses es ON es.id=e.employee_status_id`,
    [today, today]
  )

  let activatedEmployees = 0
  let inactivatedEmployees = 0
  let legacyConflicts = 0
  for (const employee of employees) {
    const hasActiveContract = Boolean(employee.hasActiveContract)
    if (employee.currentStatus === 'RESIGNED' || employee.currentStatus === 'LEAVE') {
      if (hasActiveContract) legacyConflicts++
      continue
    }
    const next = hasActiveContract ? 'ACTIVE' : 'INACTIVE'
    if (employee.currentStatus === next) continue

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await employeeStatus(
        conn,
        employee.id,
        next,
        today,
        'CRON',
        hasActiveContract
          ? 'Sinkronisasi cron: ditemukan kontrak aktif yang berlaku.'
          : 'Sinkronisasi cron: tidak ada kontrak aktif yang berlaku.'
      )
      await conn.commit()
      if (next === 'ACTIVE') activatedEmployees++
      else inactivatedEmployees++
    } catch {
      await conn.rollback()
      skippedConflicts++
    } finally {
      conn.release()
    }
  }

  return {
    businessDate: today,
    activated,
    expired: expiredCount,
    activatedEmployees,
    inactivatedEmployees,
    legacyConflicts,
    skippedConflicts,
  }
}
