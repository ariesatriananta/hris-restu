import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import {
  activationInput,
  generateDeviceToken,
  hashDeviceSecret,
} from '../lib/attendance-device-policy.js'
import { writeAudit } from '../lib/audit.js'
import { businessDate } from '../lib/contract-lifecycle.js'
import { ApiError } from '../lib/errors.js'
import {
  calculateGrossAmount,
  normalizeQuantity,
  normalizeStoredDecimal,
  productionTerminalLookupInput,
  productionTerminalPostInput,
} from '../lib/production-transaction-policy.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const allowedSites = ['JEPARA', 'SEMARANG', 'KLATEN'] as const
const routeParam = (value: string | string[]) =>
  Array.isArray(value) ? value[0] : value

function isGlobalViewer(auth: AuthContext) {
  return auth.roles.some((role) => role === 'SUPER_ADMIN' || role === 'DIRECTOR')
}

function enforceSite(auth: AuthContext, site: string) {
  if (!isGlobalViewer(auth) && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site Produksi ditolak.')
  }
}

function scopeWhere(auth: AuthContext, column = 's.code') {
  return isGlobalViewer(auth)
    ? { sql: '1=1', params: [] as string[] }
    : {
        sql: `${column} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`,
        params: auth.siteAccess,
      }
}

function csvValues(raw: unknown) {
  const value = Array.isArray(raw) ? raw.join(',') : String(raw ?? '')
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
}

function pageParams(page: unknown, pageSize: unknown) {
  const parsedPage = Number(page ?? 1)
  const parsedSize = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize:
      Number.isInteger(parsedSize) && parsedSize > 0
        ? Math.min(parsedSize, 500)
        : 50,
  }
}

function validDate(raw: unknown, fallback: string) {
  const value = String(raw ?? fallback)
  if (!z.string().date().safeParse(value).success) {
    throw new ApiError(422, 'Filter tanggal tidak valid.')
  }
  return value
}

function deviceToken(req: { get(name: string): string | undefined }) {
  const token = req.get('X-Production-Device-Token')?.trim()
  if (!token || token.length < 40 || token.length > 200) {
    throw new ApiError(401, 'Token perangkat Produksi tidak valid.')
  }
  return token
}

async function getDevice(
  conn: PoolConnection,
  token: string,
  lock = false
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT d.id,d.uid,d.code,d.name,d.device_type deviceType,
            d.site_id siteId,d.is_active isActive,d.activated_at activatedAt,
            s.code site,s.name siteName
       FROM scan_devices d
       JOIN sites s ON s.id=d.site_id
      WHERE d.device_token_hash=?
        AND d.device_type IN ('USB_SCANNER','TERMINAL')
      ${lock ? 'FOR UPDATE' : ''}`,
    [hashDeviceSecret(token)]
  )
  const device = rows[0]
  if (
    !device ||
    Number(device.isActive) !== 1 ||
    device.activatedAt === null
  ) {
    throw new ApiError(401, 'Perangkat Produksi tidak aktif atau belum terdaftar.')
  }
  return device
}

async function currentServerTime(conn: PoolConnection) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(CURDATE(),'%Y-%m-%d') businessDate,
            DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(3),'+00:00','+07:00'),'%Y-%m-%d %H:%i:%s.%f') transactionTimestamp,
            DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(3),'+00:00','+07:00'),'%Y-%m-%dT%H:%i:%s+07:00') serverTime`
  )
  const row = rows[0]
  if (row) row.businessDate = String(row.transactionTimestamp).slice(0, 10)
  return row
}

async function employeeContext(
  conn: PoolConnection,
  barcode: string,
  date: string,
  deviceSiteId: number,
  lock: boolean
) {
  const [employees] = await conn.query<RowDataPacket[]>(
    `SELECT id,uid,employee_number employeeNumber,full_name fullName,barcode
       FROM employees WHERE barcode=? ${lock ? 'FOR UPDATE' : ''}`,
    [barcode]
  )
  const employee = employees[0]
  if (!employee) throw new ApiError(422, 'Barcode karyawan tidak dikenali.')

  const [histories] = await conn.query<RowDataPacket[]>(
    `SELECT eh.id,eh.site_id siteId,eh.work_group_id workGroupId,
            es.allows_production allowsProduction,es.code employeeStatus,
            et.code employeeType,et.name employeeTypeName,et.payroll_basis payrollBasis,
            s.code site,s.name siteName,
            wg.uid workGroupUid,wg.code workGroupCode,wg.name workGroupName,
            ps.uid productionSectionUid,ps.code productionSectionCode,
            ps.name productionSectionName
       FROM employee_employment_histories eh
       JOIN employee_statuses es ON es.id=eh.employee_status_id
       JOIN employee_types et ON et.id=eh.employee_type_id
       JOIN sites s ON s.id=eh.site_id
       LEFT JOIN work_groups wg ON wg.id=eh.work_group_id
       LEFT JOIN production_module_sections pms
         ON pms.id=eh.production_module_section_id
       LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
      WHERE eh.employee_id=?
        AND eh.effective_from<=?
        AND (eh.effective_to IS NULL OR eh.effective_to>=?)
      ${lock ? 'FOR UPDATE' : ''}`,
    [employee.id, date, date]
  )
  if (histories.length !== 1) {
    throw new ApiError(
      422,
      histories.length === 0
        ? 'Karyawan tidak memiliki histori employment efektif hari ini.'
        : 'Histori employment karyawan bertumpang-tindih hari ini.'
    )
  }
  const history = histories[0]
  if (
    Number(history.allowsProduction) !== 1 ||
    history.payrollBasis !== 'PIECE_RATE'
  ) {
    throw new ApiError(422, 'Karyawan tidak eligible untuk Produksi Borongan.')
  }
  if (Number(history.siteId) !== Number(deviceSiteId)) {
    throw new ApiError(422, 'Site karyawan tidak sesuai dengan site perangkat.')
  }
  return { employee, history }
}

async function attendanceContext(
  conn: PoolConnection,
  employeeId: number,
  siteId: number,
  date: string,
  lock: boolean
) {
  const [records] = await conn.query<RowDataPacket[]>(
    `SELECT ar.id,ar.uid,ar.attendance_status attendanceStatus,
            DATE_FORMAT(ar.clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00') clockInAt
       FROM attendance_records ar
      WHERE ar.employee_id=? AND ar.site_id=? AND ar.business_date=?
      ${lock ? 'FOR UPDATE' : ''}`,
    [employeeId, siteId, date]
  )
  const attendance = records[0]
  if (!attendance || attendance.attendanceStatus !== 'PRESENT') {
    throw new ApiError(
      422,
      'Setoran ditolak: Attendance karyawan hari ini belum berstatus Hadir.'
    )
  }
  const [events] = await conn.query<RowDataPacket[]>(
    `SELECT ase.id
       FROM attendance_scan_events ase
      WHERE ase.attendance_record_id=?
        AND ase.employee_id=? AND ase.site_id=?
        AND ase.event_type='CLOCK_IN' AND ase.result_status='SUCCESS'
        AND ase.scanned_at>=TIMESTAMP(?)
        AND ase.scanned_at<DATE_ADD(TIMESTAMP(?),INTERVAL 1 DAY)
      LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [attendance.id, employeeId, siteId, date, date]
  )
  if (!events[0]) {
    throw new ApiError(
      422,
      'Setoran ditolak: scan Masuk terminal yang sukses belum ditemukan hari ini.'
    )
  }
  return attendance
}

async function availableJobs(
  conn: PoolConnection,
  employeeId: number,
  siteId: number,
  date: string
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT a.id assignmentId,a.is_primary isPrimary,
            j.id jobId,j.uid jobUid,j.code jobCode,j.name jobName,
            r.id rateId,r.uid rateUid,r.rate_amount rateAmount,r.currency,
            u.id unitId,u.uid unitUid,u.code unitCode,u.name unitName,
            u.decimal_precision decimalPrecision
       FROM employee_job_assignments a
       JOIN production_jobs j ON j.id=a.production_job_id AND j.is_active=1
       LEFT JOIN production_job_rates r
         ON r.site_id=a.site_id AND r.production_job_id=a.production_job_id
        AND r.status='ACTIVE' AND r.effective_from<=?
        AND (r.effective_to IS NULL OR r.effective_to>=?)
       LEFT JOIN work_units u ON u.id=r.unit_id AND u.is_active=1
      WHERE a.employee_id=? AND a.site_id=?
        AND a.effective_from<=?
        AND (a.effective_to IS NULL OR a.effective_to>=?)
      ORDER BY a.is_primary DESC,j.name,r.effective_from DESC,r.id DESC`,
    [date, date, employeeId, siteId, date, date]
  )
  if (!rows.length) {
    throw new ApiError(422, 'Karyawan belum memiliki penugasan pekerjaan aktif.')
  }
  const primaryAssignmentCount = new Set(
    rows
      .filter((row) => Number(row.isPrimary) === 1)
      .map((row) => String(row.assignmentId))
  ).size
  if (primaryAssignmentCount !== 1) {
    throw new ApiError(
      422,
      primaryAssignmentCount === 0
        ? 'Karyawan belum memiliki pekerjaan utama aktif.'
        : 'Karyawan memiliki lebih dari satu pekerjaan utama aktif.'
    )
  }

  const groups = new Map<string, RowDataPacket[]>()
  for (const row of rows) {
    const group = groups.get(String(row.jobUid)) ?? []
    group.push(row)
    groups.set(String(row.jobUid), group)
  }
  const jobs: Array<Record<string, unknown>> = []
  for (const group of groups.values()) {
    const assignmentCount = new Set(
      group.map((row) => String(row.assignmentId))
    ).size
    if (assignmentCount > 1) {
      throw new ApiError(
        422,
        `Penugasan aktif pekerjaan ${group[0].jobName} bertumpang-tindih.`
      )
    }
    const rates = [...new Map(
      group.filter((row) => row.rateId && row.unitId).map((row) => [String(row.rateId), row])
    ).values()]
    if (rates.length > 1) {
      throw new ApiError(422, `Tarif aktif pekerjaan ${group[0].jobName} bertumpang-tindih.`)
    }
    if (rates.length === 0) continue
    const row = rates[0]
    jobs.push({
      uid: row.jobUid,
      code: row.jobCode,
      name: row.jobName,
      isPrimary: group.some((item) => Number(item.isPrimary) === 1),
      unit: {
        uid: row.unitUid,
        code: row.unitCode,
        name: row.unitName,
        decimalPrecision: Number(row.decimalPrecision),
      },
      rate: {
        uid: row.rateUid,
        amount: normalizeStoredDecimal(row.rateAmount),
        currency: row.currency,
      },
    })
  }
  if (!jobs.length) {
    throw new ApiError(422, 'Penugasan karyawan belum memiliki tarif aktif hari ini.')
  }
  const primary = jobs.filter((job) => job.isPrimary)
  if (primary.length !== 1) {
    throw new ApiError(422, 'Pekerjaan utama belum memiliki tarif aktif hari ini.')
  }
  return { jobs, defaultJobUid: primary[0].uid }
}

async function transactionResponse(conn: PoolConnection | Pool, transactionId: number) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pt.id,pt.uid,pt.transaction_number transactionNumber,
            DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDate,
            DATE_FORMAT(pt.transaction_at,'%Y-%m-%dT%H:%i:%s+07:00') transactionAt,
            pt.quantity,pt.rate_snapshot rateSnapshot,pt.gross_amount grossAmount,
            pt.status,pt.notes,
            e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,
            s.code site,s.name siteName,
            j.uid jobUid,j.code jobCode,j.name jobName,
            u.uid unitUid,u.code unitCode,u.name unitName,
            u.decimal_precision decimalPrecision,
            d.uid deviceUid,d.code deviceCode,d.name deviceName
       FROM production_transactions pt
       JOIN employees e ON e.id=pt.employee_id
       JOIN sites s ON s.id=pt.site_id
       JOIN production_jobs j ON j.id=pt.production_job_id
       JOIN work_units u ON u.id=pt.unit_id
       LEFT JOIN scan_devices d ON d.id=pt.scan_device_id
      WHERE pt.id=?`,
    [transactionId]
  )
  const row = rows[0]
  if (!row) throw new ApiError(500, 'Transaksi Produksi tidak dapat dimuat.')
  return {
    uid: row.uid,
    transactionNumber: row.transactionNumber,
    businessDate: row.businessDate,
    transactionAt: row.transactionAt,
    status: row.status,
    quantity: normalizeStoredDecimal(row.quantity),
    rateSnapshot: normalizeStoredDecimal(row.rateSnapshot),
    grossAmount: normalizeStoredDecimal(row.grossAmount, 2),
    notes: row.notes ?? null,
    employee: {
      uid: row.employeeUid,
      employeeNumber: row.employeeNumber,
      fullName: row.fullName,
    },
    site: row.site,
    siteName: row.siteName,
    job: { uid: row.jobUid, code: row.jobCode, name: row.jobName },
    unit: {
      uid: row.unitUid,
      code: row.unitCode,
      name: row.unitName,
      decimalPrecision: Number(row.decimalPrecision),
    },
    device: row.deviceUid
      ? { uid: row.deviceUid, code: row.deviceCode, name: row.deviceName }
      : null,
  }
}

export const productionTransactionsRouter = Router()
productionTransactionsRouter.use(authenticate)

productionTransactionsRouter.post(
  '/terminal/activate',
  requirePermission('production.scan'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = activationInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT d.id,d.uid,d.code,d.name,d.device_type deviceType,d.is_active isActive,
                s.id siteId,s.code site,s.name siteName
           FROM scan_devices d
           JOIN sites s ON s.id=d.site_id
          WHERE d.activation_code_hash=?
            AND d.activation_code_expires_at>NOW(3)
            AND d.device_type IN ('USB_SCANNER','TERMINAL')
          FOR UPDATE`,
        [hashDeviceSecret(input.activationCode)]
      )
      const device = rows[0]
      if (!device) {
        throw new ApiError(
          422,
          'Kode aktivasi tidak valid, kedaluwarsa, atau bukan perangkat Produksi.'
        )
      }
      enforceSite(auth, String(device.site))
      if (Number(device.isActive) !== 1) {
        throw new ApiError(409, 'Perangkat Produksi sedang nonaktif.')
      }
      const token = generateDeviceToken()
      await conn.execute(
        `UPDATE scan_devices
            SET device_token_hash=?,activation_code_hash=NULL,
                activation_code_expires_at=NULL,activated_at=NOW(3),
                activated_by=?,last_seen_at=NOW(3),updated_by=?
          WHERE id=?`,
        [hashDeviceSecret(token), auth.id, auth.id, device.id]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(device.siteId),
          action: 'UPDATE',
          table: 'scan_devices',
          recordId: Number(device.id),
          recordUid: String(device.uid),
          description: `Mengaktifkan perangkat Produksi ${device.name}.`,
          afterData: { activated: true, usage: 'PRODUCTION' },
        },
        conn
      )
      await conn.commit()
      res.json({
        device: {
          uid: device.uid,
          code: device.code,
          name: device.name,
          site: device.site,
          siteName: device.siteName,
          deviceType: device.deviceType,
        },
        deviceToken: token,
      })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

productionTransactionsRouter.post(
  '/terminal/lookup',
  requirePermission('production.scan'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = productionTerminalLookupInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const device = await getDevice(conn, deviceToken(req), true)
      enforceSite(auth, String(device.site))
      const time = await currentServerTime(conn)
      const { employee, history } = await employeeContext(
        conn,
        input.barcode,
        String(time.businessDate),
        Number(device.siteId),
        false
      )
      const attendance = await attendanceContext(
        conn,
        Number(employee.id),
        Number(device.siteId),
        String(time.businessDate),
        false
      )
      const { jobs, defaultJobUid } = await availableJobs(
        conn,
        Number(employee.id),
        Number(device.siteId),
        String(time.businessDate)
      )
      await conn.execute(
        'UPDATE scan_devices SET last_seen_at=NOW(3),updated_by=? WHERE id=?',
        [auth.id, device.id]
      )
      await conn.commit()
      res.json({
        businessDate: time.businessDate,
        serverTime: time.serverTime,
        device: {
          uid: device.uid,
          code: device.code,
          name: device.name,
          site: device.site,
          siteName: device.siteName,
          deviceType: device.deviceType,
        },
        employee: {
          uid: employee.uid,
          employeeNumber: employee.employeeNumber,
          fullName: employee.fullName,
          site: history.site,
          employeeType: history.employeeType,
          workGroup: history.workGroupUid
            ? {
                uid: history.workGroupUid,
                code: history.workGroupCode,
                name: history.workGroupName,
              }
            : null,
          productionSection: history.productionSectionUid
            ? {
                uid: history.productionSectionUid,
                code: history.productionSectionCode,
                name: history.productionSectionName,
              }
            : null,
        },
        attendance: { uid: attendance.uid, clockInAt: attendance.clockInAt },
        jobs,
        defaultJobUid,
      })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

productionTransactionsRouter.post(
  '/terminal/post',
  requirePermission('production.scan'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = productionTerminalPostInput.parse(req.body)
      const inputQuantity = normalizeQuantity(input.quantity, 4)
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const device = await getDevice(conn, deviceToken(req), true)
      enforceSite(auth, String(device.site))
      const time = await currentServerTime(conn)

      const [existingRows] = await conn.query<RowDataPacket[]>(
        `SELECT pt.id,pt.scan_device_id deviceId,pt.quantity,
                e.barcode,j.uid jobUid
           FROM production_transactions pt
           JOIN employees e ON e.id=pt.employee_id
           JOIN production_jobs j ON j.id=pt.production_job_id
          WHERE pt.idempotency_key=? FOR UPDATE`,
        [input.idempotencyKey]
      )
      const existing = existingRows[0]
      if (existing) {
        if (
          Number(existing.deviceId) !== Number(device.id) ||
          String(existing.barcode) !== input.barcode ||
          String(existing.jobUid) !== input.jobUid ||
          normalizeStoredDecimal(existing.quantity) !== inputQuantity
        ) {
          throw new ApiError(409, 'Idempotency key sudah dipakai untuk setoran lain.')
        }
        await conn.execute(
          'UPDATE scan_devices SET last_seen_at=NOW(3),updated_by=? WHERE id=?',
          [auth.id, device.id]
        )
        await conn.commit()
        return res.json({
          duplicate: true,
          message: 'Setoran sebelumnya dikembalikan tanpa membuat transaksi baru.',
          transaction: await transactionResponse(conn, Number(existing.id)),
        })
      }

      const { employee, history } = await employeeContext(
        conn,
        input.barcode,
        String(time.businessDate),
        Number(device.siteId),
        true
      )
      const attendance = await attendanceContext(
        conn,
        Number(employee.id),
        Number(device.siteId),
        String(time.businessDate),
        true
      )

      const [assignments] = await conn.query<RowDataPacket[]>(
        `SELECT a.id assignmentId,a.is_primary isPrimary,j.is_active isJobActive,
                j.id jobId,j.uid jobUid,j.code jobCode,j.name jobName
           FROM employee_job_assignments a
           JOIN production_jobs j ON j.id=a.production_job_id
          WHERE a.employee_id=? AND a.site_id=?
            AND a.effective_from<=?
            AND (a.effective_to IS NULL OR a.effective_to>=?)
          FOR UPDATE`,
        [employee.id, device.siteId, time.businessDate, time.businessDate]
      )
      const activeAssignments = assignments.filter(
        (row) => Number(row.isJobActive) === 1
      )
      const assignmentsPerJob = new Map<string, number>()
      for (const row of activeAssignments) {
        const uid = String(row.jobUid)
        assignmentsPerJob.set(uid, (assignmentsPerJob.get(uid) ?? 0) + 1)
      }
      if ([...assignmentsPerJob.values()].some((count) => count > 1)) {
        throw new ApiError(422, 'Penugasan pekerjaan aktif karyawan bertumpang-tindih.')
      }
      const primaryAssignments = activeAssignments.filter(
        (row) => Number(row.isPrimary) === 1
      )
      if (primaryAssignments.length !== 1) {
        throw new ApiError(
          422,
          primaryAssignments.length === 0
            ? 'Karyawan belum memiliki pekerjaan utama aktif.'
            : 'Karyawan memiliki lebih dari satu pekerjaan utama aktif.'
        )
      }
      const assignment = activeAssignments.find(
        (row) => String(row.jobUid) === input.jobUid
      )
      if (!assignment) {
        throw new ApiError(422, 'Pekerjaan tidak aktif atau tidak ditugaskan kepada karyawan.')
      }

      const [rates] = await conn.query<RowDataPacket[]>(
        `SELECT r.id rateId,r.uid rateUid,r.rate_amount rateAmount,r.currency,
                u.id unitId,u.uid unitUid,u.code unitCode,u.name unitName,
                u.decimal_precision decimalPrecision
           FROM production_job_rates r
           JOIN work_units u ON u.id=r.unit_id AND u.is_active=1
          WHERE r.site_id=? AND r.production_job_id=? AND r.status='ACTIVE'
            AND r.effective_from<=?
            AND (r.effective_to IS NULL OR r.effective_to>=?)
          FOR UPDATE`,
        [device.siteId, assignment.jobId, time.businessDate, time.businessDate]
      )
      if (rates.length !== 1) {
        throw new ApiError(
          422,
          rates.length === 0
            ? 'Tarif aktif pekerjaan tidak ditemukan untuk hari ini.'
            : 'Tarif aktif pekerjaan bertumpang-tindih untuk hari ini.'
        )
      }
      const rate = rates[0]
      const quantity = normalizeQuantity(input.quantity, Number(rate.decimalPrecision))
      const rateSnapshot = normalizeStoredDecimal(rate.rateAmount)
      const grossAmount = calculateGrossAmount(quantity, rateSnapshot)
      const uid = randomUUID()
      const transactionNumber = `PRD-${String(time.businessDate).replaceAll('-', '')}-${device.site}-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
      const [insertResult] = await conn.execute(
        `INSERT INTO production_transactions(
           uid,transaction_number,employee_id,site_id,work_group_id,
           production_job_id,unit_id,job_rate_id,attendance_record_id,
           scan_device_id,business_date,transaction_at,quantity,rate_snapshot,
           gross_amount,status,idempotency_key,created_by,updated_by
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'POSTED',?,?,?)`,
        [
          uid,
          transactionNumber,
          employee.id,
          device.siteId,
          history.workGroupId ?? null,
          assignment.jobId,
          rate.unitId,
          rate.rateId,
          attendance.id,
          device.id,
          time.businessDate,
          time.transactionTimestamp,
          quantity,
          rateSnapshot,
          grossAmount,
          input.idempotencyKey,
          auth.id,
          auth.id,
        ]
      )
      const transactionId = Number(
        (insertResult as { insertId?: number }).insertId ?? 0
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(device.siteId),
          action: 'CREATE',
          table: 'production_transactions',
          recordId: transactionId,
          recordUid: uid,
          description: `Mencatat setoran Produksi ${transactionNumber}.`,
          afterData: {
            transactionNumber,
            employeeUid: employee.uid,
            jobUid: assignment.jobUid,
            businessDate: time.businessDate,
            quantity,
            rateSnapshot,
            grossAmount,
          },
        },
        conn
      )
      await conn.execute(
        'UPDATE scan_devices SET last_seen_at=NOW(3),updated_by=? WHERE id=?',
        [auth.id, device.id]
      )
      await conn.commit()
      res.status(201).json({
        duplicate: false,
        message: 'Setoran Produksi berhasil dicatat.',
        transaction: await transactionResponse(conn, transactionId),
      })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

productionTransactionsRouter.get(
  '/transactions',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const today = businessDate()
      const dateFrom = validDate(req.query.dateFrom, today)
      const dateTo = validDate(req.query.dateTo, today)
      if (dateTo < dateFrom) {
        throw new ApiError(422, 'Tanggal akhir tidak boleh mendahului tanggal awal.')
      }
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const where = ['pt.business_date BETWEEN ? AND ?']
      const values: unknown[] = [dateFrom, dateTo]
      const scope = scopeWhere(auth)
      where.push(scope.sql)
      values.push(...scope.params)
      const sites = csvValues(req.query.site)
      if (sites.length) {
        if (sites.some((site) => !allowedSites.includes(site as never))) {
          throw new ApiError(422, 'Filter site tidak valid.')
        }
        sites.forEach((site) => enforceSite(auth, site))
        where.push(`s.code IN (${sites.map(() => '?').join(',')})`)
        values.push(...sites)
      }
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push(
          '(pt.transaction_number LIKE ? OR e.employee_number LIKE ? OR e.full_name LIKE ?)'
        )
        values.push(`%${query}%`, `%${query}%`, `%${query}%`)
      }
      const jobUids = csvValues(req.query.jobUid)
      if (jobUids.length) {
        if (jobUids.some((uid) => !z.string().uuid().safeParse(uid).success)) {
          throw new ApiError(422, 'Filter pekerjaan tidak valid.')
        }
        where.push(`j.uid IN (${jobUids.map(() => '?').join(',')})`)
        values.push(...jobUids)
      }
      const statuses = csvValues(req.query.status)
      if (statuses.length) {
        if (statuses.some((status) => status !== 'POSTED' && status !== 'VOID')) {
          throw new ApiError(422, 'Filter status tidak valid.')
        }
        where.push(`pt.status IN (${statuses.map(() => '?').join(',')})`)
        values.push(...statuses)
      }
      const clause = where.join(' AND ')
      const from = `FROM production_transactions pt
        JOIN employees e ON e.id=pt.employee_id
        JOIN sites s ON s.id=pt.site_id
        JOIN production_jobs j ON j.id=pt.production_job_id
        JOIN work_units u ON u.id=pt.unit_id
        LEFT JOIN scan_devices d ON d.id=pt.scan_device_id`
      const [summaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) transactionCount,COUNT(DISTINCT pt.employee_id) employeeCount,
                COALESCE(SUM(CASE WHEN pt.status='POSTED' THEN pt.quantity ELSE 0 END),0) totalQuantity,
                COALESCE(SUM(CASE WHEN pt.status='POSTED' THEN pt.gross_amount ELSE 0 END),0) totalGrossAmount
           ${from} WHERE ${clause}`,
        values
      )
      const summary = summaryRows[0] ?? {}
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT pt.uid,pt.transaction_number transactionNumber,
                DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDate,
                DATE_FORMAT(pt.transaction_at,'%Y-%m-%dT%H:%i:%s+07:00') transactionAt,
                pt.quantity,pt.rate_snapshot rateSnapshot,pt.gross_amount grossAmount,
                pt.status,e.uid employeeUid,e.employee_number employeeNumber,
                e.full_name fullName,s.code site,s.name siteName,
                j.uid jobUid,j.code jobCode,j.name jobName,
                u.uid unitUid,u.code unitCode,u.name unitName,
                u.decimal_precision decimalPrecision,
                d.uid deviceUid,d.code deviceCode,d.name deviceName
           ${from} WHERE ${clause}
          ORDER BY pt.transaction_at DESC,pt.id DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      res.json({
        items: rows.map((row) => ({
          uid: row.uid,
          transactionNumber: row.transactionNumber,
          businessDate: row.businessDate,
          transactionAt: row.transactionAt,
          status: row.status,
          quantity: normalizeStoredDecimal(row.quantity),
          rateSnapshot: normalizeStoredDecimal(row.rateSnapshot),
          grossAmount: normalizeStoredDecimal(row.grossAmount, 2),
          employee: {
            uid: row.employeeUid,
            employeeNumber: row.employeeNumber,
            fullName: row.fullName,
          },
          site: row.site,
          siteName: row.siteName,
          job: { uid: row.jobUid, code: row.jobCode, name: row.jobName },
          unit: {
            uid: row.unitUid,
            code: row.unitCode,
            name: row.unitName,
            decimalPrecision: Number(row.decimalPrecision),
          },
          device: row.deviceUid
            ? { uid: row.deviceUid, code: row.deviceCode, name: row.deviceName }
            : null,
        })),
        total: Number(summary.transactionCount ?? 0),
        page,
        pageSize,
        summary: {
          transactionCount: Number(summary.transactionCount ?? 0),
          employeeCount: Number(summary.employeeCount ?? 0),
          totalQuantity: normalizeStoredDecimal(summary.totalQuantity),
          totalGrossAmount: normalizeStoredDecimal(summary.totalGrossAmount, 2),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

productionTransactionsRouter.get(
  '/transactions/:uid',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      if (!z.string().uuid().safeParse(uid).success) {
        throw new ApiError(404, 'Transaksi Produksi tidak ditemukan.')
      }
      const scope = scopeWhere(auth)
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT pt.id FROM production_transactions pt
           JOIN sites s ON s.id=pt.site_id
          WHERE pt.uid=? AND ${scope.sql}`,
        [uid, ...scope.params]
      )
      if (!rows[0]) throw new ApiError(404, 'Transaksi Produksi tidak ditemukan.')
      res.json({ transaction: await transactionResponse(pool, Number(rows[0].id)) })
    } catch (error) {
      next(error)
    }
  }
)
