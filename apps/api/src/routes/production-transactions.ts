import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import {
  activationInput,
  generateDeviceToken,
  hashDeviceActivationCode,
  hashDeviceSecret,
} from '../lib/attendance-device-policy.js'
import { writeAudit } from '../lib/audit.js'
import { businessDate } from '../lib/contract-lifecycle.js'
import { ApiError } from '../lib/errors.js'
import {
  calculateGrossAmount,
  normalizeQuantity,
  normalizeStoredDecimal,
  productionCorrectionInput,
  productionCorrectionPreviewInput,
  productionHistoricalPostInput,
  productionHistoricalPreviewInput,
  productionTerminalLookupInput,
  productionTerminalPostInput,
  productionVoidInput,
  productionVoidPreviewInput,
  subtractDecimal,
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
            d.site_id siteId,d.is_active isActive,
            d.production_activated_at activatedAt,
            s.code site,s.name siteName
       FROM scan_devices d
       JOIN sites s ON s.id=d.site_id
      WHERE d.production_token_hash=?
        AND d.device_type IN ('USB_SCANNER','TERMINAL')
      ${lock ? 'FOR UPDATE' : ''}`,
    [hashDeviceSecret(token)]
  )
  const device = rows[0]
  if (
    !device || Number(device.isActive) !== 1 || device.activatedAt === null
  ) {
    throw new ApiError(401, 'Perangkat Produksi tidak aktif atau belum terdaftar.')
  }
  return device
}

async function employeeContextByUid(
  conn: PoolConnection,
  employeeUid: string,
  date: string,
  deviceSiteId: number,
  lock: boolean
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT barcode FROM employees WHERE uid=?',
    [employeeUid]
  )
  if (!rows[0]?.barcode) throw new ApiError(422, 'Karyawan tidak memiliki barcode aktif.')
  return employeeContext(conn, String(rows[0].barcode), date, deviceSiteId, lock)
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
  date: string,
  lock = false
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
        AND a.status='ACTIVE'
        AND a.effective_from<=?
        AND (a.effective_to IS NULL OR a.effective_to>=?)
      ORDER BY a.is_primary DESC,j.name,r.effective_from DESC,r.id DESC
      ${lock ? 'FOR UPDATE' : ''}`,
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

async function historicalProposal(
  conn: PoolConnection,
  input: { employeeUid: string; site: string; businessDate: string; jobUid: string; quantity: string },
  lock = false
) {
  const [sites] = await conn.query<RowDataPacket[]>(
    'SELECT id,name FROM sites WHERE code=? AND is_active=1',
    [input.site]
  )
  const site = sites[0]
  if (!site) throw new ApiError(422, 'Site Produksi tidak valid atau tidak aktif.')
  const { employee, history } = await employeeContextByUid(
    conn, input.employeeUid, input.businessDate, Number(site.id), lock
  )
  const attendance = await attendanceContext(
    conn, Number(employee.id), Number(site.id), input.businessDate, lock
  )
  const { jobs, defaultJobUid } = await availableJobs(
    conn, Number(employee.id), Number(site.id), input.businessDate, lock
  )
  const job = jobs.find((candidate) => candidate.uid === input.jobUid)
  if (!job) throw new ApiError(422, 'Pekerjaan tidak ditugaskan atau belum memiliki tarif pada tanggal tersebut.')
  const unit = job.unit as { uid: string; code: string; name: string; decimalPrecision: number }
  const rate = job.rate as { uid: string; amount: string; currency: string }
  const quantity = normalizeQuantity(input.quantity, unit.decimalPrecision)
  const [targets] = await conn.query<RowDataPacket[]>(
    `SELECT a.production_job_id jobId,r.id rateId,r.unit_id unitId
       FROM employee_job_assignments a
       JOIN production_jobs j ON j.id=a.production_job_id AND j.uid=? AND j.is_active=1
       JOIN production_job_rates r ON r.site_id=a.site_id
        AND r.production_job_id=a.production_job_id AND r.status='ACTIVE'
        AND r.effective_from<=? AND (r.effective_to IS NULL OR r.effective_to>=?)
       JOIN work_units u ON u.id=r.unit_id AND u.is_active=1
      WHERE a.employee_id=? AND a.site_id=? AND a.status='ACTIVE'
        AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)
      ${lock ? 'FOR UPDATE' : ''}`,
    [input.jobUid,input.businessDate,input.businessDate,employee.id,site.id,input.businessDate,input.businessDate]
  )
  if (targets.length !== 1) throw new ApiError(422, 'Penugasan atau tarif historis tidak lagi tunggal.')
  return {
    employee, history, attendance, site,
    jobs, defaultJobUid,
    targetIds: { jobId: Number(targets[0].jobId), rateId: Number(targets[0].rateId), unitId: Number(targets[0].unitId) },
    proposed: {
      job: { uid: job.uid, code: job.code, name: job.name },
      unit, rate, quantity,
      rateSnapshot: rate.amount,
      grossAmount: calculateGrossAmount(quantity, rate.amount),
    },
  }
}

async function transactionResponse(conn: PoolConnection | Pool, transactionId: number) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pt.id,pt.uid,pt.transaction_number transactionNumber,
            DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDate,
            DATE_FORMAT(pt.transaction_at,'%Y-%m-%dT%H:%i:%s+07:00') transactionAt,
            pt.quantity,pt.rate_snapshot rateSnapshot,pt.gross_amount grossAmount,
            pt.status,pt.entry_source entrySource,pt.notes,
            DATE_FORMAT(pt.payroll_locked_at,'%Y-%m-%dT%H:%i:%s+07:00') payrollLockedAt,
            DATE_FORMAT(pt.voided_at,'%Y-%m-%dT%H:%i:%s+07:00') voidedAt,
            pt.void_reason voidReason,vu.uid voidedByUid,vu.full_name voidedByName,
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
       LEFT JOIN users vu ON vu.id=pt.voided_by
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
    entrySource: row.entrySource,
    quantity: normalizeStoredDecimal(row.quantity),
    rateSnapshot: normalizeStoredDecimal(row.rateSnapshot),
    grossAmount: normalizeStoredDecimal(row.grossAmount, 2),
    notes: row.notes ?? null,
    payrollLockedAt: row.payrollLockedAt ?? null,
    voidedAt: row.voidedAt ?? null,
    voidReason: row.voidReason ?? null,
    voidedBy: row.voidedByUid
      ? { uid: row.voidedByUid, name: row.voidedByName }
      : null,
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

type SqlExecutor = PoolConnection | Pool

function parseJson(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value as Record<string, unknown>
  try {
    return JSON.parse(String(value)) as Record<string, unknown>
  } catch {
    return null
  }
}

async function managedTransaction(
  conn: SqlExecutor,
  uid: string,
  auth: AuthContext,
  lock = false
) {
  const scope = scopeWhere(auth)
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pt.*,
            DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDateKey,
            DATE_FORMAT(pt.transaction_at,'%Y-%m-%d %H:%i:%s.%f') transactionTimestamp,
            s.code site,s.name siteName,j.uid jobUid,j.code jobCode,
            j.name jobName,u.uid unitUid,u.code unitCode,u.name unitName,
            u.decimal_precision decimalPrecision,sr.uid rateUid,
            sr.currency rateCurrency,e.uid employeeUid,
            e.employee_number employeeNumber,e.full_name fullName
       FROM production_transactions pt
       JOIN sites s ON s.id=pt.site_id
       JOIN production_jobs j ON j.id=pt.production_job_id
       JOIN work_units u ON u.id=pt.unit_id
       JOIN production_job_rates sr ON sr.id=pt.job_rate_id
       JOIN employees e ON e.id=pt.employee_id
      WHERE pt.uid=? AND ${scope.sql}
      ${lock ? 'FOR UPDATE' : ''}`,
    [uid, ...scope.params]
  )
  if (!rows[0]) throw new ApiError(404, 'Transaksi Produksi tidak ditemukan.')
  return rows[0]
}

type PayrollLock = { locked: boolean; reasons: string[] }

async function payrollDateLockContext(
  conn: SqlExecutor,
  siteId: number,
  date: string,
  lock = false
): Promise<PayrollLock> {
  const reasons: string[] = []
  const [periods] = await conn.query<RowDataPacket[]>(
    `SELECT pp.status,
            EXISTS(
              SELECT 1 FROM payroll_runs pr
               WHERE pr.payroll_period_id=pp.id AND pr.status='PROCESSING'
            ) processingRun
       FROM payroll_periods pp
      WHERE pp.site_id=? AND pp.payroll_basis='PIECE_RATE'
        AND pp.period_start<=? AND pp.period_end>=?
        AND pp.status<>'CANCELLED'
      ${lock ? 'FOR UPDATE' : ''}`,
    [siteId, date, date]
  )
  if (periods.some((period) => Number(period.processingRun) === 1)) {
    reasons.push('Perhitungan Payroll untuk periode ini sedang berjalan.')
  }
  const lockedPeriod = periods.find((period) =>
    ['CALCULATED', 'APPROVED', 'CLOSED'].includes(String(period.status))
  )
  if (lockedPeriod) {
    reasons.unshift(
      lockedPeriod.status === 'CLOSED'
        ? 'Periode Payroll sudah ditutup dan bersifat immutable.'
        : `Periode Payroll sudah berstatus ${lockedPeriod.status}.`
    )
  }
  return { locked: reasons.length > 0, reasons }
}

async function payrollLockContext(
  conn: SqlExecutor,
  transaction: RowDataPacket,
  lock = false
): Promise<PayrollLock> {
  const reasons: string[] = []
  if (transaction.payroll_locked_at) {
    reasons.push('Transaksi telah dikunci oleh proses Payroll.')
  }
  const [snapshots] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM payroll_production_details
      WHERE production_transaction_id=? LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [transaction.id]
  )
  if (snapshots[0]) reasons.push('Transaksi telah masuk snapshot Payroll.')

  const periodLock = await payrollDateLockContext(
    conn,
    Number(transaction.site_id),
    String(transaction.businessDateKey),
    lock
  )
  reasons.unshift(...periodLock.reasons)
  return { locked: reasons.length > 0, reasons }
}

function assertPostedAndUnlocked(transaction: RowDataPacket, payrollLock: PayrollLock) {
  if (transaction.status !== 'POSTED') {
    throw new ApiError(409, 'Hanya transaksi POSTED yang dapat dikoreksi atau di-void.')
  }
  if (payrollLock.locked) {
    throw new ApiError(409, payrollLock.reasons[0] ?? 'Transaksi dikunci Payroll.')
  }
}

async function correctionProposal(
  conn: PoolConnection,
  transaction: RowDataPacket,
  jobUid: string,
  inputQuantity: string,
  lock = false,
  forceActiveValidation = false
) {
  if (!forceActiveValidation && String(transaction.jobUid) === jobUid) {
    const quantity = normalizeQuantity(
      inputQuantity,
      Number(transaction.decimalPrecision)
    )
    const sourceQuantity = normalizeStoredDecimal(transaction.quantity)
    if (quantity === sourceQuantity) {
      throw new ApiError(422, 'Koreksi tidak memiliki perubahan pekerjaan atau kuantitas.')
    }
    const rateSnapshot = normalizeStoredDecimal(transaction.rate_snapshot)
    return {
      jobs: [sourceJobOption(transaction)],
      targetIds: {
        jobId: Number(transaction.production_job_id),
        rateId: Number(transaction.job_rate_id),
        unitId: Number(transaction.unit_id),
      },
      proposed: {
        job: {
          uid: transaction.jobUid,
          code: transaction.jobCode,
          name: transaction.jobName,
        },
        unit: {
          uid: transaction.unitUid,
          code: transaction.unitCode,
          name: transaction.unitName,
          decimalPrecision: Number(transaction.decimalPrecision),
        },
        rate: {
          uid: transaction.rateUid,
          amount: rateSnapshot,
          currency: transaction.rateCurrency,
        },
        quantity,
        rateSnapshot,
        grossAmount: calculateGrossAmount(quantity, rateSnapshot),
      },
    }
  }
  const { jobs } = await availableJobs(
    conn,
    Number(transaction.employee_id),
    Number(transaction.site_id),
    String(transaction.businessDateKey),
    lock
  )
  const job = jobs.find((item) => item.uid === jobUid)
  if (!job) {
    throw new ApiError(
      422,
      'Pekerjaan tidak aktif, tidak ditugaskan, atau belum memiliki tarif pada tanggal transaksi.'
    )
  }
  const unit = job.unit as {
    uid: string
    code: string
    name: string
    decimalPrecision: number
  }
  const rate = job.rate as { uid: string; amount: string; currency: string }
  const quantity = normalizeQuantity(inputQuantity, unit.decimalPrecision)
  const grossAmount = calculateGrossAmount(quantity, rate.amount)
  const [targets] = await conn.query<RowDataPacket[]>(
    `SELECT j.id jobId,r.id rateId,u.id unitId
       FROM employee_job_assignments a
       JOIN production_jobs j ON j.id=a.production_job_id AND j.uid=?
       JOIN production_job_rates r
         ON r.site_id=a.site_id AND r.production_job_id=a.production_job_id
        AND r.status='ACTIVE' AND r.effective_from<=?
        AND (r.effective_to IS NULL OR r.effective_to>=?)
       JOIN work_units u ON u.id=r.unit_id AND u.is_active=1
      WHERE a.employee_id=? AND a.site_id=?
        AND a.status='ACTIVE'
        AND a.effective_from<=?
        AND (a.effective_to IS NULL OR a.effective_to>=?)
      ${lock ? 'FOR UPDATE' : ''}`,
    [
      jobUid,
      transaction.businessDateKey,
      transaction.businessDateKey,
      transaction.employee_id,
      transaction.site_id,
      transaction.businessDateKey,
      transaction.businessDateKey,
    ]
  )
  if (targets.length !== 1) {
    throw new ApiError(422, 'Pekerjaan atau tarif koreksi tidak lagi tunggal.')
  }
  return {
    jobs,
    targetIds: {
      jobId: Number(targets[0].jobId),
      rateId: Number(targets[0].rateId),
      unitId: Number(targets[0].unitId),
    },
    proposed: {
      job: { uid: job.uid, code: job.code, name: job.name },
      unit,
      rate,
      quantity,
      rateSnapshot: rate.amount,
      grossAmount,
    },
  }
}

async function correctionTarget(
  conn: PoolConnection,
  source: RowDataPacket,
  employeeUid: string | undefined,
  lock: boolean
) {
  if (!employeeUid || employeeUid === String(source.employeeUid)) {
    return { transaction: source, employeeChanged: false }
  }
  const { employee, history } = await employeeContextByUid(
    conn, employeeUid, String(source.businessDateKey), Number(source.site_id), lock
  )
  const attendance = await attendanceContext(
    conn, Number(employee.id), Number(source.site_id), String(source.businessDateKey), lock
  )
  return {
    employeeChanged: true,
    transaction: {
      ...source,
      employee_id: employee.id,
      employeeUid: employee.uid,
      employeeNumber: employee.employeeNumber,
      fullName: employee.fullName,
      work_group_id: history.workGroupId ?? null,
      attendance_record_id: attendance.id,
    } as RowDataPacket,
  }
}

function sourceJobOption(transaction: RowDataPacket) {
  return {
    uid: transaction.jobUid,
    code: transaction.jobCode,
    name: transaction.jobName,
    isPrimary: false,
    isCurrent: true,
    unit: {
      uid: transaction.unitUid,
      code: transaction.unitCode,
      name: transaction.unitName,
      decimalPrecision: Number(transaction.decimalPrecision),
    },
    rate: {
      uid: transaction.rateUid,
      amount: normalizeStoredDecimal(transaction.rate_snapshot),
      currency: transaction.rateCurrency,
    },
  }
}

async function correctionJobOptions(
  conn: PoolConnection,
  transaction: RowDataPacket
) {
  let jobs: Array<Record<string, unknown>> = []
  try {
    jobs = (
      await availableJobs(
        conn,
        Number(transaction.employee_id),
        Number(transaction.site_id),
        String(transaction.businessDateKey)
      )
    ).jobs
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
  }
  const current = sourceJobOption(transaction)
  return [
    current,
    ...jobs.filter((job) => String(job.uid) !== String(transaction.jobUid)),
  ]
}

function transactionSnapshot(row: RowDataPacket) {
  return {
    uid: String(row.uid),
    transactionNumber: String(row.transaction_number),
    employeeUid: String(row.employeeUid),
    site: String(row.site),
    businessDate: String(row.businessDateKey),
    transactionAt: String(row.transactionTimestamp),
    jobUid: String(row.jobUid),
    job: {
      uid: String(row.jobUid),
      code: String(row.jobCode),
      name: String(row.jobName),
    },
    unitUid: String(row.unitUid),
    unit: {
      uid: String(row.unitUid),
      code: String(row.unitCode),
      name: String(row.unitName),
    },
    quantity: normalizeStoredDecimal(row.quantity),
    rateSnapshot: normalizeStoredDecimal(row.rate_snapshot),
    grossAmount: normalizeStoredDecimal(row.gross_amount, 2),
    status: String(row.status),
  }
}

async function revisionReplay(
  conn: PoolConnection,
  source: RowDataPacket,
  action: 'CORRECTION' | 'VOID',
  idempotencyKey: string,
  requestPayload: Record<string, string>
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pr.id,pr.uid,pr.production_transaction_id sourceId,
            pr.replacement_transaction_id replacementId,
            pr.revision_number revisionNumber,pr.revision_type revisionType,
            pr.reason,pr.after_data afterData,
            DATE_FORMAT(pr.revised_at,'%Y-%m-%dT%H:%i:%s+07:00') revisedAt
       FROM production_transaction_revisions pr
      WHERE pr.idempotency_key=? FOR UPDATE`,
    [idempotencyKey]
  )
  const revision = rows[0]
  if (!revision) return null
  const afterData = parseJson(revision.afterData)
  const storedRequest = (afterData?.request ?? null) as Record<string, unknown> | null
  const matches =
    Number(revision.sourceId) === Number(source.id) &&
    revision.revisionType === action &&
    storedRequest !== null &&
    Object.entries(requestPayload).every(
      ([key, value]) => String(storedRequest[key] ?? '') === value
    )
  if (!matches) {
    throw new ApiError(409, 'Idempotency key sudah dipakai untuk revisi lain.')
  }
  return revision
}

function publicRevision(row: RowDataPacket) {
  return {
    uid: row.uid,
    revisionNumber: Number(row.revisionNumber),
    type: row.revisionType,
    reason: row.reason,
    revisedAt: row.revisedAt,
    replacementTransactionUid: row.replacementUid ?? null,
    revisedBy: row.revisedByUid
      ? { uid: row.revisedByUid, name: row.revisedByName }
      : null,
    before: parseJson(row.beforeData),
    after: parseJson(row.afterData),
  }
}

async function transactionLifecycle(
  conn: SqlExecutor,
  transaction: RowDataPacket
) {
  const payrollLock = await payrollLockContext(conn, transaction, false)
  const [revisions] = await conn.query<RowDataPacket[]>(
    `SELECT pr.uid,pr.revision_number revisionNumber,
            pr.revision_type revisionType,pr.reason,
            pr.before_data beforeData,pr.after_data afterData,
            DATE_FORMAT(pr.revised_at,'%Y-%m-%dT%H:%i:%s+07:00') revisedAt,
            replacement.uid replacementUid,ru.uid revisedByUid,
            ru.full_name revisedByName
       FROM production_transaction_revisions pr
       LEFT JOIN production_transactions replacement
         ON replacement.id=pr.replacement_transaction_id
       LEFT JOIN users ru ON ru.id=pr.revised_by
      WHERE pr.production_transaction_id=?
      ORDER BY pr.revision_number,pr.id`,
    [transaction.id]
  )
  const [links] = await conn.query<RowDataPacket[]>(
    `SELECT source.uid sourceUid,source.transaction_number sourceNumber,
            replacement.uid replacementUid,
            replacement.transaction_number replacementNumber
       FROM production_transaction_revisions pr
       JOIN production_transactions source ON source.id=pr.production_transaction_id
       LEFT JOIN production_transactions replacement
         ON replacement.id=pr.replacement_transaction_id
      WHERE pr.production_transaction_id=? OR pr.replacement_transaction_id=?
      ORDER BY pr.id DESC`,
    [transaction.id, transaction.id]
  )
  const outgoing = links.find(
    (row) => String(row.sourceUid) === String(transaction.uid) && row.replacementUid
  )
  const incoming = links.find(
    (row) => String(row.replacementUid) === String(transaction.uid)
  )
  return {
    payrollLocked: payrollLock.locked,
    payrollLockReasons: payrollLock.reasons,
    canCorrect: transaction.status === 'POSTED' && !payrollLock.locked,
    canVoid: transaction.status === 'POSTED' && !payrollLock.locked,
    revisions: revisions.map(publicRevision),
    replacementTransaction: outgoing
      ? { uid: outgoing.replacementUid, transactionNumber: outgoing.replacementNumber }
      : null,
    replacedTransaction: incoming
      ? { uid: incoming.sourceUid, transactionNumber: incoming.sourceNumber }
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
          WHERE d.activation_code_hash IN (?,?)
            AND d.activation_code_expires_at>NOW(3)
            AND d.device_type IN ('USB_SCANNER','TERMINAL')
          FOR UPDATE`,
        [
          hashDeviceActivationCode(input.activationCode, 'PRODUCTION'),
          hashDeviceSecret(input.activationCode),
        ]
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
            SET production_token_hash=?,activation_code_hash=NULL,
                activation_code_expires_at=NULL,production_activated_at=NOW(3),
                production_activated_by=?,last_seen_at=NOW(3),updated_by=?
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
            AND a.status='ACTIVE'
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
      const datePayrollLock = await payrollDateLockContext(
        conn,
        Number(device.siteId),
        String(time.businessDate),
        true
      )
      if (datePayrollLock.locked) throw new ApiError(409, datePayrollLock.reasons[0])
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

productionTransactionsRouter.post(
  '/transactions/historical-preview',
  requirePermission('production.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = productionHistoricalPreviewInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.site)
      const time = await currentServerTime(conn)
      if (input.businessDate > String(time.businessDate)) {
        throw new ApiError(422, 'Tanggal setoran susulan tidak boleh berada di masa depan.')
      }
      const [siteRows] = await conn.query<RowDataPacket[]>('SELECT id FROM sites WHERE code=?', [input.site])
      const payrollLock = siteRows[0]
        ? await payrollDateLockContext(conn, Number(siteRows[0].id), input.businessDate)
        : { locked: false, reasons: [] }
      if (payrollLock.locked) throw new ApiError(409, payrollLock.reasons[0])
      const proposal = await historicalProposal(conn, input)
      res.json({
        employee: { uid: proposal.employee.uid, employeeNumber: proposal.employee.employeeNumber, fullName: proposal.employee.fullName },
        site: input.site,
        businessDate: input.businessDate,
        attendance: { uid: proposal.attendance.uid, clockInAt: proposal.attendance.clockInAt },
        jobs: proposal.jobs,
        defaultJobUid: proposal.defaultJobUid,
        proposed: proposal.proposed,
        payrollLock,
        canApply: true,
      })
    } catch (error) { next(error) } finally { conn.release() }
  }
)

productionTransactionsRouter.post(
  '/transactions/historical',
  requirePermission('production.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = productionHistoricalPostInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.site)
      await conn.beginTransaction()
      const time = await currentServerTime(conn)
      if (input.businessDate > String(time.businessDate)) throw new ApiError(422, 'Tanggal setoran susulan tidak boleh berada di masa depan.')
      const [existingRows] = await conn.query<RowDataPacket[]>(
        `SELECT pt.id,e.uid employeeUid,s.code site,j.uid jobUid,
                DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDate,
                pt.quantity,pt.entry_source entrySource,pt.notes
           FROM production_transactions pt
           JOIN employees e ON e.id=pt.employee_id
           JOIN sites s ON s.id=pt.site_id
           JOIN production_jobs j ON j.id=pt.production_job_id
          WHERE pt.idempotency_key=? FOR UPDATE`,
        [input.idempotencyKey]
      )
      const existing = existingRows[0]
      if (existing) {
        if (existing.entrySource !== 'HISTORICAL' || String(existing.employeeUid) !== input.employeeUid ||
            String(existing.site) !== input.site || String(existing.jobUid) !== input.jobUid ||
            String(existing.businessDate) !== input.businessDate ||
            normalizeStoredDecimal(existing.quantity) !== normalizeQuantity(input.quantity, 4) ||
            String(existing.notes ?? '') !== `Setoran susulan: ${input.reason}`) {
          throw new ApiError(409, 'Idempotency key sudah dipakai untuk setoran lain.')
        }
        await conn.commit()
        return res.json({ duplicate: true, message: 'Setoran susulan sebelumnya dikembalikan.', transaction: await transactionResponse(conn, Number(existing.id)) })
      }
      const proposal = await historicalProposal(conn, input, true)
      const payrollLock = await payrollDateLockContext(conn, Number(proposal.site.id), input.businessDate, true)
      if (payrollLock.locked) throw new ApiError(409, payrollLock.reasons[0])
      const uid = randomUUID()
      const transactionNumber = `PRD-MAN-${input.businessDate.replaceAll('-','')}-${input.site}-${randomUUID().replaceAll('-','').slice(0,8).toUpperCase()}`
      const [insertResult] = await conn.execute(
        `INSERT INTO production_transactions(
           uid,transaction_number,employee_id,site_id,work_group_id,production_job_id,
           unit_id,job_rate_id,attendance_record_id,scan_device_id,business_date,
           transaction_at,quantity,rate_snapshot,gross_amount,status,entry_source,
           idempotency_key,notes,created_by,updated_by
         ) VALUES(?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,'POSTED','HISTORICAL',?,?,?,?)`,
        [uid,transactionNumber,proposal.employee.id,proposal.site.id,proposal.history.workGroupId ?? null,
         proposal.targetIds.jobId,proposal.targetIds.unitId,proposal.targetIds.rateId,proposal.attendance.id,
         input.businessDate,time.transactionTimestamp,proposal.proposed.quantity,proposal.proposed.rateSnapshot,
         proposal.proposed.grossAmount,input.idempotencyKey,`Setoran susulan: ${input.reason}`,auth.id,auth.id]
      )
      const transactionId = Number((insertResult as { insertId?: number }).insertId ?? 0)
      await writeAudit({ auth,request:req,module:'PRODUCTION',siteId:Number(proposal.site.id),action:'CREATE',table:'production_transactions',recordId:transactionId,recordUid:uid,description:`Mencatat setoran susulan ${transactionNumber}.`,reason:input.reason,afterData:{...input,quantity:proposal.proposed.quantity,rateSnapshot:proposal.proposed.rateSnapshot,grossAmount:proposal.proposed.grossAmount} },conn)
      await conn.commit()
      res.status(201).json({ duplicate:false,message:'Setoran susulan berhasil dicatat.',transaction:await transactionResponse(conn,transactionId) })
    } catch (error) { await conn.rollback(); next(error) } finally { conn.release() }
  }
)

productionTransactionsRouter.get(
  '/transactions/:uid/correction-context',
  requirePermission('production.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const uid = routeParam(req.params.uid)
      if (!z.string().uuid().safeParse(uid).success) {
        throw new ApiError(404, 'Transaksi Produksi tidak ditemukan.')
      }
      const auth = res.locals.auth as AuthContext
      const source = await managedTransaction(conn, uid, auth)
      const payrollLock = await payrollLockContext(conn, source, false)
      const jobs = await correctionJobOptions(conn, source)
      res.json({
        transaction: await transactionResponse(conn, Number(source.id)),
        jobs,
        payrollLock,
        canCorrect: source.status === 'POSTED' && !payrollLock.locked,
        canVoid: source.status === 'POSTED' && !payrollLock.locked,
      })
    } catch (error) {
      next(error)
    } finally {
      conn.release()
    }
  }
)

productionTransactionsRouter.post(
  '/transactions/:uid/correction-preview',
  requirePermission('production.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const uid = routeParam(req.params.uid)
      if (!z.string().uuid().safeParse(uid).success) {
        throw new ApiError(404, 'Transaksi Produksi tidak ditemukan.')
      }
      const input = productionCorrectionPreviewInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const source = await managedTransaction(conn, uid, auth)
      const payrollLock = await payrollLockContext(conn, source, false)
      assertPostedAndUnlocked(source, payrollLock)
      const target = await correctionTarget(conn, source, input.employeeUid, false)
      const { proposed } = await correctionProposal(
        conn,
        target.transaction,
        input.jobUid,
        input.quantity,
        false,
        target.employeeChanged
      )
      res.json({
        source: await transactionResponse(conn, Number(source.id)),
        targetEmployee: {
          uid: target.transaction.employeeUid,
          employeeNumber: target.transaction.employeeNumber,
          fullName: target.transaction.fullName,
        },
        proposed,
        delta: {
          quantity: subtractDecimal(
            proposed.quantity,
            normalizeStoredDecimal(source.quantity),
            4
          ),
          grossAmount: subtractDecimal(
            proposed.grossAmount,
            normalizeStoredDecimal(source.gross_amount, 2),
            2
          ),
        },
        payrollLock,
        canApply: true,
      })
    } catch (error) {
      next(error)
    } finally {
      conn.release()
    }
  }
)

productionTransactionsRouter.post(
  '/transactions/:uid/void-preview',
  requirePermission('production.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      productionVoidPreviewInput.parse(req.body ?? {})
      const uid = routeParam(req.params.uid)
      if (!z.string().uuid().safeParse(uid).success) {
        throw new ApiError(404, 'Transaksi Produksi tidak ditemukan.')
      }
      const auth = res.locals.auth as AuthContext
      const source = await managedTransaction(conn, uid, auth)
      const payrollLock = await payrollLockContext(conn, source, false)
      assertPostedAndUnlocked(source, payrollLock)
      res.json({
        source: await transactionResponse(conn, Number(source.id)),
        impact: {
          quantity: `-${normalizeStoredDecimal(source.quantity)}`,
          grossAmount: `-${normalizeStoredDecimal(source.gross_amount, 2)}`,
        },
        payrollLock,
        canApply: true,
      })
    } catch (error) {
      next(error)
    } finally {
      conn.release()
    }
  }
)

productionTransactionsRouter.post(
  '/transactions/:uid/correct',
  requirePermission('production.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const uid = routeParam(req.params.uid)
      if (!z.string().uuid().safeParse(uid).success) {
        throw new ApiError(404, 'Transaksi Produksi tidak ditemukan.')
      }
      const input = productionCorrectionInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const source = await managedTransaction(conn, uid, auth, true)
      const replayPayload = {
        employeeUid: input.employeeUid ?? String(source.employeeUid),
        jobUid: input.jobUid,
        quantity: normalizeQuantity(input.quantity, 4),
        reason: input.reason,
      }
      const replay = await revisionReplay(
        conn,
        source,
        'CORRECTION',
        input.idempotencyKey,
        replayPayload
      )
      if (replay) {
        await conn.commit()
        return res.json({
          duplicate: true,
          message: 'Koreksi sebelumnya dikembalikan tanpa membuat revisi baru.',
          sourceTransaction: await transactionResponse(conn, Number(source.id)),
          transaction: await transactionResponse(conn, Number(replay.replacementId)),
          revision: {
            uid: replay.uid,
            revisionNumber: Number(replay.revisionNumber),
            type: replay.revisionType,
            reason: replay.reason,
            revisedAt: replay.revisedAt,
          },
        })
      }
      const payrollLock = await payrollLockContext(conn, source, true)
      assertPostedAndUnlocked(source, payrollLock)
      const target = await correctionTarget(conn, source, input.employeeUid, true)
      const { proposed, targetIds } = await correctionProposal(
        conn,
        target.transaction,
        input.jobUid,
        input.quantity,
        true,
        target.employeeChanged
      )
      const replacementUid = randomUUID()
      const replacementNumber = `PRD-COR-${String(source.businessDateKey).replaceAll('-', '')}-${String(source.site)}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`
      const [insertResult] = await conn.execute(
        `INSERT INTO production_transactions(
           uid,transaction_number,employee_id,site_id,work_group_id,
           production_job_id,unit_id,job_rate_id,attendance_record_id,
           scan_device_id,business_date,transaction_at,quantity,rate_snapshot,
           gross_amount,status,entry_source,notes,created_by,updated_by
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'POSTED','CORRECTION',?,?,?)`,
        [
          replacementUid,
          replacementNumber,
          target.transaction.employee_id,
          source.site_id,
          target.transaction.work_group_id ?? null,
          targetIds.jobId,
          targetIds.unitId,
          targetIds.rateId,
          target.transaction.attendance_record_id,
          source.scan_device_id ?? null,
          source.businessDateKey,
          source.transactionTimestamp,
          proposed.quantity,
          proposed.rateSnapshot,
          proposed.grossAmount,
          `Koreksi dari ${source.transaction_number}: ${input.reason}`,
          auth.id,
          auth.id,
        ]
      )
      const replacementId = Number(
        (insertResult as { insertId?: number }).insertId ?? 0
      )
      const before = transactionSnapshot(source)
      const after = {
        ...before,
        uid: replacementUid,
        transactionNumber: replacementNumber,
        employeeUid: String(target.transaction.employeeUid),
        employee: {
          uid: String(target.transaction.employeeUid),
          employeeNumber: String(target.transaction.employeeNumber),
          fullName: String(target.transaction.fullName),
        },
        jobUid: proposed.job.uid,
        job: proposed.job,
        unitUid: proposed.unit.uid,
        unit: {
          uid: proposed.unit.uid,
          code: proposed.unit.code,
          name: proposed.unit.name,
        },
        quantity: proposed.quantity,
        rateSnapshot: proposed.rateSnapshot,
        grossAmount: proposed.grossAmount,
        status: 'POSTED',
        request: replayPayload,
      }
      const [revisionRows] = await conn.query<RowDataPacket[]>(
        `SELECT COALESCE(MAX(revision_number),0)+1 revisionNumber
           FROM production_transaction_revisions
          WHERE production_transaction_id=? FOR UPDATE`,
        [source.id]
      )
      const revisionNumber = Number(revisionRows[0]?.revisionNumber ?? 1)
      const revisionUid = randomUUID()
      await conn.execute(
        `INSERT INTO production_transaction_revisions(
           uid,production_transaction_id,replacement_transaction_id,
           revision_number,revision_type,idempotency_key,before_data,after_data,
           reason,revised_by,created_by,updated_by
         ) VALUES(?,?,?,?,'CORRECTION',?,?,?,?,?,?,?)`,
        [
          revisionUid,
          source.id,
          replacementId,
          revisionNumber,
          input.idempotencyKey,
          JSON.stringify(before),
          JSON.stringify(after),
          input.reason,
          auth.id,
          auth.id,
          auth.id,
        ]
      )
      const [updateResult] = await conn.execute(
        `UPDATE production_transactions
            SET status='VOID',voided_at=NOW(3),voided_by=?,void_reason=?,updated_by=?
          WHERE id=? AND status='POSTED'`,
        [auth.id, input.reason, auth.id, source.id]
      )
      if (Number((updateResult as { affectedRows?: number }).affectedRows) !== 1) {
        throw new ApiError(409, 'Status transaksi berubah saat koreksi diproses.')
      }
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(source.site_id),
          action: 'UPDATE',
          table: 'production_transactions',
          recordId: Number(source.id),
          recordUid: String(source.uid),
          description: `Mengoreksi setoran Produksi ${source.transaction_number}.`,
          reason: input.reason,
          beforeData: before,
          afterData: after,
        },
        conn
      )
      await conn.commit()
      res.status(201).json({
        duplicate: false,
        message: 'Koreksi setoran Produksi berhasil diterapkan.',
        sourceTransaction: await transactionResponse(conn, Number(source.id)),
        transaction: await transactionResponse(conn, replacementId),
        revision: {
          uid: revisionUid,
          revisionNumber,
          type: 'CORRECTION',
          reason: input.reason,
        },
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
  '/transactions/:uid/void',
  requirePermission('production.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const uid = routeParam(req.params.uid)
      if (!z.string().uuid().safeParse(uid).success) {
        throw new ApiError(404, 'Transaksi Produksi tidak ditemukan.')
      }
      const input = productionVoidInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const source = await managedTransaction(conn, uid, auth, true)
      const replayPayload = { reason: input.reason }
      const replay = await revisionReplay(
        conn,
        source,
        'VOID',
        input.idempotencyKey,
        replayPayload
      )
      if (replay) {
        await conn.commit()
        return res.json({
          duplicate: true,
          message: 'Void sebelumnya dikembalikan tanpa membuat revisi baru.',
          transaction: await transactionResponse(conn, Number(source.id)),
          revision: {
            uid: replay.uid,
            revisionNumber: Number(replay.revisionNumber),
            type: replay.revisionType,
            reason: replay.reason,
            revisedAt: replay.revisedAt,
          },
        })
      }
      const payrollLock = await payrollLockContext(conn, source, true)
      assertPostedAndUnlocked(source, payrollLock)
      const before = transactionSnapshot(source)
      const after = {
        ...before,
        status: 'VOID',
        request: replayPayload,
      }
      const [revisionRows] = await conn.query<RowDataPacket[]>(
        `SELECT COALESCE(MAX(revision_number),0)+1 revisionNumber
           FROM production_transaction_revisions
          WHERE production_transaction_id=? FOR UPDATE`,
        [source.id]
      )
      const revisionNumber = Number(revisionRows[0]?.revisionNumber ?? 1)
      const revisionUid = randomUUID()
      await conn.execute(
        `INSERT INTO production_transaction_revisions(
           uid,production_transaction_id,replacement_transaction_id,
           revision_number,revision_type,idempotency_key,before_data,after_data,
           reason,revised_by,created_by,updated_by
         ) VALUES(?,?,NULL,?,'VOID',?,?,?,?,?,?,?)`,
        [
          revisionUid,
          source.id,
          revisionNumber,
          input.idempotencyKey,
          JSON.stringify(before),
          JSON.stringify(after),
          input.reason,
          auth.id,
          auth.id,
          auth.id,
        ]
      )
      const [updateResult] = await conn.execute(
        `UPDATE production_transactions
            SET status='VOID',voided_at=NOW(3),voided_by=?,void_reason=?,updated_by=?
          WHERE id=? AND status='POSTED'`,
        [auth.id, input.reason, auth.id, source.id]
      )
      if (Number((updateResult as { affectedRows?: number }).affectedRows) !== 1) {
        throw new ApiError(409, 'Status transaksi berubah saat void diproses.')
      }
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(source.site_id),
          action: 'UPDATE',
          table: 'production_transactions',
          recordId: Number(source.id),
          recordUid: String(source.uid),
          description: `Membatalkan setoran Produksi ${source.transaction_number}.`,
          reason: input.reason,
          beforeData: before,
          afterData: after,
        },
        conn
      )
      await conn.commit()
      res.json({
        duplicate: false,
        message: 'Setoran Produksi berhasil di-void.',
        transaction: await transactionResponse(conn, Number(source.id)),
        revision: {
          uid: revisionUid,
          revisionNumber,
          type: 'VOID',
          reason: input.reason,
        },
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
                COALESCE(SUM(CASE WHEN pt.status='POSTED' THEN pt.gross_amount ELSE 0 END),0) totalGrossAmount
           ${from} WHERE ${clause}`,
        values
      )
      const summary = summaryRows[0] ?? {}
      const [quantityRows] = await pool.query<RowDataPacket[]>(
        `SELECT u.uid,u.code,u.name,u.decimal_precision decimalPrecision,
                COALESCE(SUM(pt.quantity),0) quantity
           ${from} WHERE ${clause} AND pt.status='POSTED'
          GROUP BY u.id,u.uid,u.code,u.name,u.decimal_precision
          ORDER BY u.code`,
        values
      )
      const quantityTotals = quantityRows.map((row) => ({
        unit: {
          uid: row.uid,
          code: row.code,
          name: row.name,
          decimalPrecision: Number(row.decimalPrecision),
        },
        quantity: normalizeStoredDecimal(row.quantity),
      }))
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
          // Deprecated compatibility field. A mixed-unit total is deliberately
          // null so PCS/KG/BOX are never presented as one misleading number.
          totalQuantity:
            quantityTotals.length <= 1
              ? quantityTotals[0]?.quantity ?? '0'
              : null,
          quantityTotals,
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
      const row = await managedTransaction(pool, uid, auth)
      const transaction = await transactionResponse(pool, Number(row.id))
      res.json({
        transaction: {
          ...transaction,
          ...(await transactionLifecycle(pool, row)),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)
