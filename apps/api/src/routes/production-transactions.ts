import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
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
import { productionTerminalSummaryAttendanceSql, productionTerminalSummaryPostedSql } from '../lib/production-terminal-summary.js'
import { assertProductionQcReplay, loadProductionQcOptions, lastProductionDeviceBrand, resolveProductionQc, saveProductionQc, readProductionQc, readProductionQcBatch, cloneProductionQc, loadProductionImportQcMasters, resolveProductionImportQc, saveProductionImportQc, assertProductionImportQcReplay, type ProductionImportQc, type ResolvedProductionQc } from '../lib/production-qc-storage.js'
import { priceProductionTiers, type ProductionRateTier } from '../lib/production-tier-pricing.js'
import {
  allocateDailyQuantityDeduction,
  cumulativeDeductionQuantity,
  LINTING_JOB_CODE,
} from '../lib/production-quantity-deduction.js'
import {
  calculateGrossAmount,
  normalizeQuantity,
  normalizeStoredDecimal,
  productionCorrectionInput,
  productionCorrectionPreviewInput,
  productionBatchDeleteInput,
  productionBatchDeleteSummaryInput,
  productionHistoricalPostInput,
  productionHistoricalPreviewInput,
  productionImportPostInput,
  productionImportPreviewInput,
  PRODUCTION_IMPORT_MAX_ROWS,
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

function assertSuperAdmin(auth: AuthContext) {
  if (!auth.roles.includes('SUPER_ADMIN')) {
    throw new ApiError(
      403,
      'Hapus transaksi batch hanya dapat dilakukan Super Admin.'
    )
  }
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
    throw new ApiError(401, 'Token perangkat Produksi tidak valid.', 'DEVICE_SESSION_INVALID')
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
    throw new ApiError(401, 'Perangkat Produksi tidak aktif atau belum terdaftar.', 'DEVICE_SESSION_INVALID')
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
            pms.production_section_id productionSectionId,
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
    const [corrections] = await conn.query<RowDataPacket[]>(
      `SELECT ac.id
         FROM attendance_corrections ac
         JOIN attendance_records ar ON ar.id=ac.attendance_record_id
        WHERE ac.attendance_record_id=?
          AND ar.employee_id=? AND ar.site_id=? AND ar.business_date=?
          AND ar.clock_in_source='CORRECTION' AND ar.clock_in_at IS NOT NULL
          AND ac.correction_type IN ('CLOCK_IN','BOTH')
          AND ac.approval_status='APPROVED' AND ac.applied_at IS NOT NULL
          AND ac.new_clock_in_at=ar.clock_in_at
        LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
      [attendance.id, employeeId, siteId, date]
    )
    if (!corrections[0]) {
      throw new ApiError(
        422,
        'Setoran ditolak: scan Masuk sukses atau koreksi jam Masuk yang disetujui belum ditemukan pada tanggal setoran.'
      )
    }
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
            (SELECT COUNT(*) FROM production_job_rate_tiers tier
              WHERE tier.job_rate_id=r.id) tierCount,
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
        tiered: Number(row.tierCount ?? 0)>1,
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
  input: {
    employeeUid: string
    site: string
    businessDate: string
    jobUid?: string
    quantity: string
  },
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
  const selectedJobUid = input.jobUid || defaultJobUid
  const job = jobs.find((candidate) => candidate.uid === selectedJobUid)
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
    [selectedJobUid,input.businessDate,input.businessDate,employee.id,site.id,input.businessDate,input.businessDate]
  )
  if (targets.length !== 1) throw new ApiError(422, 'Penugasan atau tarif historis tidak lagi tunggal.')
  const snapshot=await dailyDeductionSnapshot(conn,{
    employeeId:Number(employee.id),siteId:Number(site.id),jobId:Number(targets[0].jobId),businessDate:input.businessDate,
  },String(job.code),lock)
  const deductionPercentage=snapshot.percentage
  const [dailyRows]=await conn.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(quantity),0) rawQuantity,
            COALESCE(SUM(payable_quantity),0) payableQuantity
       FROM production_transactions WHERE employee_id=? AND site_id=?
        AND production_job_id=? AND business_date=? AND status='POSTED'`,
    [employee.id,site.id,targets[0].jobId,input.businessDate]
  )
  const precedingRaw=BigInt(normalizeStoredDecimal(dailyRows[0]?.rawQuantity??0).replace('.',''))
  const precedingPayable=normalizeStoredDecimal(dailyRows[0]?.payableQuantity??0)
  const quantityValue=BigInt(quantity.replace('.',''))
  const rawText=(value:bigint)=>`${value/10000n}.${String(value%10000n).padStart(4,'0')}`
  const beforeDeduction=BigInt(normalizeStoredDecimal(cumulativeDeductionQuantity(rawText(precedingRaw),deductionPercentage,unit.decimalPrecision)).replace('.',''))
  const afterDeduction=BigInt(normalizeStoredDecimal(cumulativeDeductionQuantity(rawText(precedingRaw+quantityValue),deductionPercentage,unit.decimalPrecision)).replace('.',''))
  const deductionQuantity=afterDeduction-beforeDeduction
  const payableQuantity=rawText(quantityValue-deductionQuantity)
  const priced=pricePayableQuantity(precedingPayable,payableQuantity,await rateTiers(conn,Number(targets[0].rateId)))
  return {
    employee, history, attendance, site,
    jobs, defaultJobUid,
    targetIds: { jobId: Number(targets[0].jobId), rateId: Number(targets[0].rateId), unitId: Number(targets[0].unitId) },
    proposed: {
      job: { uid: job.uid, code: job.code, name: job.name },
      unit, rate, quantity,
      deductionPercentage,
      deductionQuantity:rawText(deductionQuantity),
      payableQuantity,
      rateSnapshot: rate.amount,
      grossAmount: priced.grossAmount,
      rateDetails: priced.slices.map((slice) => ({
        minQuantity: slice.minQuantitySnapshot, quantity: slice.quantity,
        rateAmount: slice.rateSnapshot, amount: slice.amount,
      })),
    },
  }
}

type ProductionImportInputRow = {
  rowNumber: number
  businessDate: string
  employeeNumber: string
  employeeName?: string
  quantity: string
  qc?: ProductionImportQc
}

type ValidProductionImportRow = {
  input: ProductionImportInputRow
  valid: true
  message: string
  warning: string | null
  proposal: Awaited<ReturnType<typeof historicalProposal>>
  qc?: ResolvedProductionQc | null
}

type InvalidProductionImportRow = {
  input: ProductionImportInputRow
  valid: false
  message: string
  warning: null
}

type ProductionImportValidationRow =
  | ValidProductionImportRow
  | InvalidProductionImportRow

async function validateProductionImportRows(
  conn: PoolConnection,
  rows: ProductionImportInputRow[],
  auth: AuthContext,
  lock = false
): Promise<ProductionImportValidationRow[]> {
  const validation = await validateProductionImportBaseRows(conn, rows, auth, lock)
  const candidates = validation.filter((row): row is ValidProductionImportRow => row.valid && row.input.qc !== undefined)
  if (!candidates.length) return validation
  const masters = await loadProductionImportQcMasters(conn, [...new Set(candidates.map(row => Number(row.proposal.site.id)))], lock)
  return validation.map(row => {
    if (!row.valid) return row
    try {
      return { ...row, qc: resolveProductionImportQc(row.input.qc, Number(row.proposal.site.id), String(row.proposal.proposed.job.code), masters) }
    } catch (error) {
      return { input: row.input, valid: false, message: error instanceof ApiError ? error.message : 'Informasi QC tidak valid.', warning: null }
    }
  })
}

async function validateProductionImportBaseRows(
  conn: PoolConnection, rows: ProductionImportInputRow[], auth: AuthContext, lock = false
): Promise<ProductionImportValidationRow[]> {
  if (rows.length > 1) {
    return validateProductionImportRowsBatch(conn, rows, auth, lock)
  }
  const serverTime = await currentServerTime(conn)
  const output: ProductionImportValidationRow[] = []

  for (const input of rows) {
    try {
      if (!z.string().date().safeParse(input.businessDate).success) {
        throw new ApiError(422, 'Tanggal wajib menggunakan format YYYY-MM-DD.')
      }
      if (input.businessDate > String(serverTime.businessDate)) {
        throw new ApiError(422, 'Tanggal hasil kerja tidak boleh berada di masa depan.')
      }
      const [contexts] = await conn.query<RowDataPacket[]>(
        `SELECT e.uid,s.id siteId,s.code site
           FROM employees e
           JOIN employee_employment_histories history
             ON history.employee_id=e.id
            AND history.effective_from<=?
            AND (history.effective_to IS NULL OR history.effective_to>=?)
           JOIN sites s ON s.id=history.site_id
          WHERE e.employee_number=?
          ${lock ? 'FOR UPDATE' : ''}`,
        [input.businessDate, input.businessDate, input.employeeNumber]
      )
      if (contexts.length !== 1) {
        throw new ApiError(
          422,
          contexts.length === 0
            ? 'Karyawan atau histori penempatan pada tanggal tersebut tidak ditemukan.'
            : 'Histori penempatan karyawan bertumpang-tindih pada tanggal tersebut.'
        )
      }
      const context = contexts[0]
      enforceSite(auth, String(context.site))
      const payrollLock = await payrollDateLockContext(
        conn,
        Number(context.siteId),
        input.businessDate,
        lock
      )
      if (payrollLock.locked) {
        throw new ApiError(409, payrollLock.reasons[0])
      }
      const proposal = await historicalProposal(
        conn,
        {
          employeeUid: String(context.uid),
          site: String(context.site),
          businessDate: input.businessDate,
          quantity: input.quantity,
        },
        lock
      )
      const dailyKey = {
        employeeId: Number(proposal.employee.id),
        siteId: Number(proposal.site.id),
        jobId: proposal.targetIds.jobId,
        businessDate: input.businessDate,
      }
      const [existingRows] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) transactionCount,COALESCE(SUM(quantity),0) totalQuantity
           FROM production_transactions
          WHERE employee_id=? AND site_id=? AND production_job_id=?
            AND business_date=? AND status='POSTED'`,
        [
          dailyKey.employeeId,
          dailyKey.siteId,
          dailyKey.jobId,
          dailyKey.businessDate,
        ]
      )
      const existingCount = Number(existingRows[0]?.transactionCount ?? 0)
      output.push({
        input,
        valid: true,
        message: 'Siap diimpor.',
        warning: existingCount
          ? `Sudah ada ${existingCount} setoran tercatat (${normalizeStoredDecimal(existingRows[0]?.totalQuantity)} ${proposal.proposed.unit.code}); baris ini akan ditambahkan sebagai setoran baru.`
          : null,
        proposal,
      })
    } catch (error) {
      output.push({
        input,
        valid: false,
        message:
          error instanceof ApiError
            ? error.message
            : 'Baris gagal divalidasi karena gangguan layanan.',
        warning: null,
      })
    }
  }
  return output
}

async function validateProductionImportRowsBatch(
  conn: PoolConnection,
  rows: ProductionImportInputRow[],
  auth: AuthContext,
  lock: boolean
): Promise<ProductionImportValidationRow[]> {
  const serverTime = await currentServerTime(conn)
  const currentDate = String(serverTime.businessDate)
  const preliminary = new Map<number, string>()
  const candidates = rows.filter((input) => {
    if (!z.string().date().safeParse(input.businessDate).success) {
      preliminary.set(input.rowNumber, 'Tanggal wajib menggunakan format YYYY-MM-DD.')
      return false
    }
    if (input.businessDate > currentDate) {
      preliminary.set(input.rowNumber, 'Tanggal hasil kerja tidak boleh berada di masa depan.')
      return false
    }
    return true
  })
  if (!candidates.length) {
    return rows.map((input) => ({
      input,
      valid: false,
      message: preliminary.get(input.rowNumber) ?? 'Baris tidak valid.',
      warning: null,
    }))
  }

  await conn.query('DROP TEMPORARY TABLE IF EXISTS tmp_production_import_rows')
  await conn.query(
    `CREATE TEMPORARY TABLE tmp_production_import_rows(
       import_row_number INT NOT NULL PRIMARY KEY,
       business_date DATE NOT NULL,
       employee_number VARCHAR(50) NOT NULL,
       quantity VARCHAR(50) NOT NULL,
       KEY idx_tmp_production_import_employee_date(employee_number,business_date)
     ) ENGINE=InnoDB`
  )
  try {
    for (let offset = 0; offset < candidates.length; offset += 250) {
      const chunk = candidates.slice(offset, offset + 250)
      await conn.query(
        `INSERT INTO tmp_production_import_rows
           (import_row_number,business_date,employee_number,quantity)
         VALUES ${chunk.map(() => '(?,?,?,?)').join(',')}`,
        chunk.flatMap((row) => [
          row.rowNumber,
          row.businessDate,
          row.employeeNumber,
          row.quantity,
        ])
      )
    }

    const lockClause = lock ? 'FOR UPDATE' : ''
    const [contextRows] = await conn.query<RowDataPacket[]>(
      `SELECT input.import_row_number rowNumber,
              employee.id employeeId,employee.uid employeeUid,
              employee.employee_number employeeNumber,
              employee.full_name fullName,employee.barcode,
              history.id historyId,history.site_id siteId,
              history.work_group_id workGroupId,
              status.allows_production allowsProduction,
              status.code employeeStatus,type.code employeeType,
              type.name employeeTypeName,type.payroll_basis payrollBasis,
              site.code site,site.name siteName,site.is_active siteActive,
              work_group.uid workGroupUid,work_group.code workGroupCode,
              work_group.name workGroupName,
              section.id productionSectionId,section.uid productionSectionUid,
              section.code productionSectionCode,
              section.name productionSectionName,
              attendance.id attendanceId,attendance.uid attendanceUid,
              attendance.attendance_status attendanceStatus,
              DATE_FORMAT(attendance.clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00') clockInAt,
              EXISTS(
                SELECT 1 FROM attendance_scan_events scan
                 WHERE scan.attendance_record_id=attendance.id
                   AND scan.employee_id=employee.id
                   AND scan.site_id=history.site_id
                   AND scan.event_type='CLOCK_IN' AND scan.result_status='SUCCESS'
                   AND scan.scanned_at>=TIMESTAMP(input.business_date)
                   AND scan.scanned_at<DATE_ADD(TIMESTAMP(input.business_date),INTERVAL 1 DAY)
              ) hasSuccessfulClockIn,
              EXISTS(
                SELECT 1 FROM attendance_corrections correction
                 WHERE correction.attendance_record_id=attendance.id
                   AND attendance.clock_in_source='CORRECTION'
                   AND attendance.clock_in_at IS NOT NULL
                   AND correction.correction_type IN ('CLOCK_IN','BOTH')
                   AND correction.approval_status='APPROVED'
                   AND correction.applied_at IS NOT NULL
                   AND correction.new_clock_in_at=attendance.clock_in_at
              ) hasApprovedClockInCorrection
         FROM tmp_production_import_rows input
         LEFT JOIN employees employee
           ON employee.employee_number=input.employee_number
         LEFT JOIN employee_employment_histories history
           ON history.employee_id=employee.id
          AND history.effective_from<=input.business_date
          AND (history.effective_to IS NULL OR history.effective_to>=input.business_date)
         LEFT JOIN employee_statuses status ON status.id=history.employee_status_id
         LEFT JOIN employee_types type ON type.id=history.employee_type_id
         LEFT JOIN sites site ON site.id=history.site_id
         LEFT JOIN work_groups work_group ON work_group.id=history.work_group_id
         LEFT JOIN production_module_sections mapping
           ON mapping.id=history.production_module_section_id
         LEFT JOIN production_sections section
           ON section.id=mapping.production_section_id
         LEFT JOIN attendance_records attendance
           ON attendance.employee_id=employee.id
          AND attendance.site_id=history.site_id
          AND attendance.business_date=input.business_date
         ORDER BY input.import_row_number,history.id ${lockClause}`
    )
    const [assignmentRows] = await conn.query<RowDataPacket[]>(
      `SELECT input.import_row_number rowNumber,
              assignment.id assignmentId,assignment.is_primary isPrimary,
              job.id jobId,job.uid jobUid,job.code jobCode,job.name jobName,
              rate.id rateId,rate.uid rateUid,rate.rate_amount rateAmount,
              rate.currency,unit.id unitId,unit.uid unitUid,unit.code unitCode,
              unit.name unitName,unit.decimal_precision decimalPrecision
         FROM tmp_production_import_rows input
         JOIN employees employee ON employee.employee_number=input.employee_number
         JOIN employee_employment_histories history
           ON history.employee_id=employee.id
          AND history.effective_from<=input.business_date
          AND (history.effective_to IS NULL OR history.effective_to>=input.business_date)
         JOIN employee_job_assignments assignment
           ON assignment.employee_id=employee.id
          AND assignment.site_id=history.site_id
          AND assignment.status='ACTIVE'
          AND assignment.effective_from<=input.business_date
          AND (assignment.effective_to IS NULL OR assignment.effective_to>=input.business_date)
         JOIN production_jobs job
           ON job.id=assignment.production_job_id AND job.is_active=1
         LEFT JOIN production_job_rates rate
           ON rate.site_id=assignment.site_id
          AND rate.production_job_id=assignment.production_job_id
          AND rate.status='ACTIVE' AND rate.effective_from<=input.business_date
          AND (rate.effective_to IS NULL OR rate.effective_to>=input.business_date)
         LEFT JOIN work_units unit ON unit.id=rate.unit_id AND unit.is_active=1
         ORDER BY input.import_row_number,assignment.is_primary DESC,job.name,
                  rate.effective_from DESC,rate.id DESC ${lockClause}`
    )
    const [periodRows] = await conn.query<RowDataPacket[]>(
      `SELECT input.import_row_number rowNumber,period.status,
              EXISTS(
                SELECT 1 FROM payroll_runs run
                 WHERE run.payroll_period_id=period.id AND run.status='PROCESSING'
              ) processingRun
         FROM tmp_production_import_rows input
         JOIN employees employee ON employee.employee_number=input.employee_number
         JOIN employee_employment_histories history
           ON history.employee_id=employee.id
          AND history.effective_from<=input.business_date
          AND (history.effective_to IS NULL OR history.effective_to>=input.business_date)
         JOIN payroll_periods period
           ON period.site_id=history.site_id
          AND period.payroll_basis='PIECE_RATE'
          AND period.period_start<=input.business_date
          AND period.period_end>=input.business_date
          AND period.status<>'CANCELLED'
         ORDER BY input.import_row_number,period.id ${lockClause}`
    )
    const [productionRows] = await conn.query<RowDataPacket[]>(
      `SELECT input.import_row_number rowNumber,transaction.production_job_id jobId,
              transaction.quantity,transaction.payable_quantity payableQuantity,
              transaction.quantity_deduction_percentage deductionPercentage,
              transaction.quantity_deduction_policy_id deductionPolicyId,
              transaction.production_section_id productionSectionId
         FROM tmp_production_import_rows input
         JOIN employees employee ON employee.employee_number=input.employee_number
         JOIN employee_employment_histories history
           ON history.employee_id=employee.id
          AND history.effective_from<=input.business_date
          AND (history.effective_to IS NULL OR history.effective_to>=input.business_date)
         JOIN production_transactions transaction
           ON transaction.employee_id=employee.id
          AND transaction.site_id=history.site_id
          AND transaction.business_date=input.business_date
          AND transaction.status='POSTED'
         ORDER BY input.import_row_number,transaction.id ${lockClause}`
    )

    const [policyRows] = await conn.query<RowDataPacket[]>(
      `SELECT input.import_row_number rowNumber,job.id jobId,
              policy.id policyId,policy.percentage
         FROM tmp_production_import_rows input
         JOIN employees employee ON employee.employee_number=input.employee_number
         JOIN employee_employment_histories history
           ON history.employee_id=employee.id
          AND history.effective_from<=input.business_date
          AND (history.effective_to IS NULL OR history.effective_to>=input.business_date)
         JOIN employee_job_assignments assignment
           ON assignment.employee_id=employee.id AND assignment.site_id=history.site_id
          AND assignment.status='ACTIVE' AND assignment.is_primary=1
          AND assignment.effective_from<=input.business_date
          AND (assignment.effective_to IS NULL OR assignment.effective_to>=input.business_date)
         JOIN production_jobs job ON job.id=assignment.production_job_id
          AND job.code='BORONGAN-LINTING'
         JOIN production_quantity_deduction_policies policy
           ON policy.site_id=history.site_id
          AND policy.production_job_id=job.id AND policy.status='ACTIVE'
          AND policy.effective_from<=input.business_date
          AND (policy.effective_to IS NULL OR policy.effective_to>=input.business_date)
        ORDER BY input.import_row_number,policy.id ${lockClause}`
    )

    const rateIds = [
      ...new Set(
        assignmentRows
          .filter((row) => row.rateId && row.unitId)
          .map((row) => Number(row.rateId))
      ),
    ]
    const tiersByRate = new Map<number, ProductionRateTier[]>()
    if (rateIds.length) {
      const [tierRows] = await conn.query<RowDataPacket[]>(
        `SELECT rate.id rateId,tier.id tierId,tier.min_quantity minQuantity,
                COALESCE(tier.rate_amount,rate.rate_amount) rateAmount
           FROM production_job_rates rate
           LEFT JOIN production_job_rate_tiers tier ON tier.job_rate_id=rate.id
          WHERE rate.id IN (${rateIds.map(() => '?').join(',')})
          ORDER BY rate.id,tier.min_quantity ${lockClause}`,
        rateIds
      )
      for (const row of tierRows) {
        const rateId = Number(row.rateId)
        const tiers = tiersByRate.get(rateId) ?? []
        tiers.push({
          id: row.tierId === null ? null : Number(row.tierId),
          minQuantity: normalizeStoredDecimal(row.minQuantity ?? '1'),
          rateAmount: normalizeStoredDecimal(row.rateAmount),
        })
        tiersByRate.set(rateId, tiers)
      }
    }

    const byRow = <T extends RowDataPacket>(source: T[]) => {
      const result = new Map<number, T[]>()
      for (const row of source) {
        const key = Number(row.rowNumber)
        const values = result.get(key) ?? []
        values.push(row)
        result.set(key, values)
      }
      return result
    }
    const contexts = byRow(contextRows)
    const assignments = byRow(assignmentRows)
    const periods = byRow(periodRows)
    const productions = byRow(productionRows)
    const policies = byRow(policyRows)
    const batchRawQuantities = new Map<string, string>()
    const batchPayableQuantities = new Map<string, string>()

    return rows.map((input): ProductionImportValidationRow => {
      try {
        const preliminaryMessage = preliminary.get(input.rowNumber)
        if (preliminaryMessage) throw new ApiError(422, preliminaryMessage)
        const rowContexts = contexts
          .get(input.rowNumber)
          ?.filter((row) => row.employeeId && row.historyId) ?? []
        if (rowContexts.length !== 1) {
          throw new ApiError(
            422,
            rowContexts.length === 0
              ? 'Karyawan atau histori penempatan pada tanggal tersebut tidak ditemukan.'
              : 'Histori penempatan karyawan bertumpang-tindih pada tanggal tersebut.'
          )
        }
        const context = rowContexts[0]
        if (!context.barcode) {
          throw new ApiError(422, 'Karyawan tidak memiliki barcode aktif.')
        }
        if (Number(context.siteActive) !== 1) {
          throw new ApiError(422, 'Site Produksi tidak valid atau tidak aktif.')
        }
        enforceSite(auth, String(context.site))
        if (
          Number(context.allowsProduction) !== 1 ||
          String(context.payrollBasis) !== 'PIECE_RATE'
        ) {
          throw new ApiError(422, 'Karyawan tidak eligible untuk Produksi Borongan.')
        }
        const rowPeriods = periods.get(input.rowNumber) ?? []
        if (rowPeriods.some((period) => Number(period.processingRun) === 1)) {
          throw new ApiError(409, 'Perhitungan Payroll untuk periode ini sedang berjalan.')
        }
        const lockedPeriod = rowPeriods.find((period) =>
          ['CALCULATED', 'APPROVED', 'CLOSED'].includes(String(period.status))
        )
        if (lockedPeriod) {
          throw new ApiError(
            409,
            lockedPeriod.status === 'CLOSED'
              ? 'Periode Payroll sudah ditutup dan bersifat immutable.'
              : `Periode Payroll sudah berstatus ${lockedPeriod.status}.`
          )
        }
        if (!context.attendanceId || context.attendanceStatus !== 'PRESENT') {
          throw new ApiError(
            422,
            'Setoran ditolak: Attendance karyawan hari ini belum berstatus Hadir.'
          )
        }
        if (
          Number(context.hasSuccessfulClockIn) !== 1 &&
          Number(context.hasApprovedClockInCorrection) !== 1
        ) {
          throw new ApiError(
            422,
            'Setoran ditolak: scan Masuk sukses atau koreksi jam Masuk yang disetujui belum ditemukan pada tanggal setoran.'
          )
        }

        const rowAssignments = assignments.get(input.rowNumber) ?? []
        if (!rowAssignments.length) {
          throw new ApiError(422, 'Karyawan belum memiliki penugasan pekerjaan aktif.')
        }
        const primaryAssignmentCount = new Set(
          rowAssignments
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
        const assignmentGroups = new Map<string, RowDataPacket[]>()
        for (const row of rowAssignments) {
          const values = assignmentGroups.get(String(row.jobUid)) ?? []
          values.push(row)
          assignmentGroups.set(String(row.jobUid), values)
        }
        const jobs: Array<Record<string, unknown>> = []
        for (const group of assignmentGroups.values()) {
          if (new Set(group.map((row) => String(row.assignmentId))).size > 1) {
            throw new ApiError(
              422,
              `Penugasan aktif pekerjaan ${group[0].jobName} bertumpang-tindih.`
            )
          }
          const rates = [
            ...new Map(
              group
                .filter((row) => row.rateId && row.unitId)
                .map((row) => [String(row.rateId), row])
            ).values(),
          ]
          if (rates.length > 1) {
            throw new ApiError(
              422,
              `Tarif aktif pekerjaan ${group[0].jobName} bertumpang-tindih.`
            )
          }
          if (!rates.length) continue
          const rate = rates[0]
          jobs.push({
            uid: rate.jobUid,
            code: rate.jobCode,
            name: rate.jobName,
            isPrimary: group.some((item) => Number(item.isPrimary) === 1),
            jobId: Number(rate.jobId),
            rateId: Number(rate.rateId),
            unitId: Number(rate.unitId),
            unit: {
              uid: rate.unitUid,
              code: rate.unitCode,
              name: rate.unitName,
              decimalPrecision: Number(rate.decimalPrecision),
            },
            rate: {
              uid: rate.rateUid,
              amount: normalizeStoredDecimal(rate.rateAmount),
              currency: rate.currency,
              tiered: (tiersByRate.get(Number(rate.rateId))?.length ?? 0) > 1,
            },
          })
        }
        if (!jobs.length) {
          throw new ApiError(422, 'Penugasan karyawan belum memiliki tarif aktif hari ini.')
        }
        const primaryJobs = jobs.filter((job) => job.isPrimary)
        if (primaryJobs.length !== 1) {
          throw new ApiError(422, 'Pekerjaan utama belum memiliki tarif aktif hari ini.')
        }
        const job = primaryJobs[0]
        const unit = job.unit as {
          uid: string
          code: string
          name: string
          decimalPrecision: number
        }
        const rate = job.rate as { uid: string; amount: string; currency: string }
        const quantity = normalizeQuantity(input.quantity, unit.decimalPrecision)
        const jobId = Number(job.jobId)
        const rateId = Number(job.rateId)
        const unitId = Number(job.unitId)
        const existing = (productions.get(input.rowNumber) ?? []).filter(
          (row) => Number(row.jobId) === jobId
        )
        const precedingRaw = existing.reduce(
          (sum, row) =>
            sum + BigInt(normalizeStoredDecimal(row.quantity).replace('.', '')),
          0n
        )
        const precedingPayable = existing.reduce(
          (sum,row)=>sum+BigInt(normalizeStoredDecimal(row.payableQuantity??row.quantity).replace('.','')),
          0n
        )
        const groupKey = [
          context.employeeId,
          context.siteId,
          jobId,
          input.businessDate,
        ].join('|')
        const additionalRaw = BigInt(
          (batchRawQuantities.get(groupKey) ?? '0.0000').replace('.', '')
        )
        const additionalPayable = BigInt(
          (batchPayableQuantities.get(groupKey) ?? '0.0000').replace('.','')
        )
        const rowPolicies=(policies.get(input.rowNumber)??[]).filter((row)=>Number(row.jobId)===jobId)
        if(!existing.length && rowPolicies.length>1) throw new ApiError(422,'Kebijakan Potongan Hasil Linting aktif bertumpang-tindih.')
        const deductionPercentage=normalizeStoredDecimal(existing.length ? existing[0].deductionPercentage??0 : rowPolicies[0]?.percentage??0)
        const rawBefore=precedingRaw+additionalRaw
        const rawAfter=rawBefore+BigInt(quantity.replace('.',''))
        const rawText=(value:bigint)=>`${value/10000n}.${String(value%10000n).padStart(4,'0')}`
        const deductionBefore=BigInt(normalizeStoredDecimal(cumulativeDeductionQuantity(rawText(rawBefore),deductionPercentage,unit.decimalPrecision)).replace('.',''))
        const deductionAfter=BigInt(normalizeStoredDecimal(cumulativeDeductionQuantity(rawText(rawAfter),deductionPercentage,unit.decimalPrecision)).replace('.',''))
        const deductionQuantity=deductionAfter-deductionBefore
        const payableQuantityValue=BigInt(quantity.replace('.',''))-deductionQuantity
        const payableQuantity=rawText(payableQuantityValue)
        const starting = precedingPayable + additionalPayable
        const tiers = tiersByRate.get(rateId) ?? []
        const priced = pricePayableQuantity(
          `${starting / 10000n}.${String(starting % 10000n).padStart(4, '0')}`,
          payableQuantity,
          tiers
        )
        batchRawQuantities.set(
          groupKey,
          rawText(additionalRaw+BigInt(quantity.replace('.','')))
        )
        batchPayableQuantities.set(groupKey,rawText(additionalPayable+payableQuantityValue))
        const proposal = {
          employee: {
            id: context.employeeId,
            uid: context.employeeUid,
            employeeNumber: context.employeeNumber,
            fullName: context.fullName,
            barcode: context.barcode,
          },
          history: {
            id: context.historyId,
            siteId: context.siteId,
            workGroupId: context.workGroupId,
            allowsProduction: context.allowsProduction,
            employeeStatus: context.employeeStatus,
            employeeType: context.employeeType,
            employeeTypeName: context.employeeTypeName,
            payrollBasis: context.payrollBasis,
            site: context.site,
            siteName: context.siteName,
            workGroupUid: context.workGroupUid,
            workGroupCode: context.workGroupCode,
            workGroupName: context.workGroupName,
            productionSectionUid: context.productionSectionUid,
            productionSectionId: context.productionSectionId,
            productionSectionCode: context.productionSectionCode,
            productionSectionName: context.productionSectionName,
          },
          attendance: {
            id: context.attendanceId,
            uid: context.attendanceUid,
            attendanceStatus: context.attendanceStatus,
            clockInAt: context.clockInAt,
          },
          site: { id: context.siteId, name: context.siteName },
          jobs,
          defaultJobUid: String(job.uid),
          targetIds: { jobId, rateId, unitId },
          proposed: {
            job: { uid: job.uid, code: job.code, name: job.name },
            unit,
            rate,
            quantity,
            deductionPercentage: normalizeStoredDecimal(deductionPercentage),
            deductionQuantity: rawText(deductionQuantity),
            payableQuantity,
            rateSnapshot: rate.amount,
            grossAmount: priced.grossAmount,
            rateDetails: priced.slices.map((slice) => ({
              minQuantity: slice.minQuantitySnapshot,
              quantity: slice.quantity,
              rateAmount: slice.rateSnapshot,
              amount: slice.amount,
            })),
          },
        } as Awaited<ReturnType<typeof historicalProposal>>
        return {
          input,
          valid: true,
          message: 'Siap diimpor.',
          warning: existing.length
            ? `Sudah ada ${existing.length} setoran tercatat (${normalizeStoredDecimal(`${precedingRaw / 10000n}.${String(precedingRaw % 10000n).padStart(4, '0')}`)} ${unit.code}); baris ini akan ditambahkan sebagai setoran baru.`
            : null,
          proposal,
        }
      } catch (error) {
        return {
          input,
          valid: false,
          message:
            error instanceof ApiError
              ? error.message
              : 'Baris gagal divalidasi karena gangguan layanan.',
          warning: null,
        }
      }
    })
  } finally {
    await conn
      .query('DROP TEMPORARY TABLE IF EXISTS tmp_production_import_rows')
      .catch(() => undefined)
  }
}

function productionImportRowDto(row: ProductionImportValidationRow) {
  if (!row.valid) {
    return {
      rowNumber: row.input.rowNumber,
      businessDate: row.input.businessDate,
      employeeNumber: row.input.employeeNumber,
      employeeName: row.input.employeeName ?? '',
      valid: false,
      message: row.message,
      warning: null,
      qc: row.input.qc ?? null,
    }
  }
  return {
    rowNumber: row.input.rowNumber,
    businessDate: row.input.businessDate,
    employeeNumber: String(row.proposal.employee.employeeNumber),
    employeeName: String(row.proposal.employee.fullName),
    site: String(row.proposal.history.site),
    siteName: String(row.proposal.history.siteName),
    job: row.proposal.proposed.job,
    unit: row.proposal.proposed.unit,
    quantity: row.proposal.proposed.quantity,
    deductionPercentage: row.proposal.proposed.deductionPercentage ?? '0.0000',
    deductionQuantity: row.proposal.proposed.deductionQuantity ?? '0.0000',
    payableQuantity: row.proposal.proposed.payableQuantity ?? row.proposal.proposed.quantity,
    estimatedGrossAmount: row.proposal.proposed.grossAmount,
    valid: true,
    message: row.message,
    warning: row.warning,
    qc: row.input.qc ?? null,
  }
}

type ProductionImportAuditEntry = {
  siteId: number
  recordId: number
  recordUid: string
  description: string
  afterData: Record<string, unknown>
}

export async function writeProductionImportAudits(
  conn: PoolConnection,
  auth: AuthContext,
  request: Request,
  reason: string,
  entries: ProductionImportAuditEntry[]
) {
  for (let offset = 0; offset < entries.length; offset += 250) {
    const chunk = entries.slice(offset, offset + 250)
    await conn.execute(
      `INSERT INTO audit_logs(
         uid,user_id,site_id,module,action,table_name,record_id,record_uid,
         description,reason,before_data,after_data,request_id,ip_address,
         user_agent,created_by,updated_by
       ) VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')}`,
      chunk.flatMap((entry) => [
        randomUUID(),
        auth.id,
        entry.siteId,
        'PRODUCTION',
        'CREATE',
        'production_transactions',
        entry.recordId,
        entry.recordUid,
        entry.description,
        reason,
        null,
        JSON.stringify(entry.afterData),
        null,
        request.ip ?? null,
        request.get('user-agent') ?? null,
        auth.id,
        auth.id,
      ])
    )
  }
}

async function transactionResponse(conn: PoolConnection | Pool, transactionId: number) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pt.id,pt.uid,pt.transaction_number transactionNumber,
            DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDate,
            DATE_FORMAT(pt.transaction_at,'%Y-%m-%dT%H:%i:%s+07:00') transactionAt,
            pt.quantity,pt.quantity_deduction_percentage quantityDeductionPercentage,
            pt.deducted_quantity deductedQuantity,pt.payable_quantity payableQuantity,
            pt.rate_snapshot rateSnapshot,pt.gross_amount grossAmount,
            pt.status,pt.entry_source entrySource,pt.notes,
            DATE_FORMAT(pt.payroll_locked_at,'%Y-%m-%dT%H:%i:%s+07:00') payrollLockedAt,
            DATE_FORMAT(pt.voided_at,'%Y-%m-%dT%H:%i:%s+07:00') voidedAt,
            pt.void_reason voidReason,vu.uid voidedByUid,vu.full_name voidedByName,
            e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,
            s.code site,s.name siteName,
            section.uid productionSectionUid,section.code productionSectionCode,
            section.name productionSectionName,
            j.uid jobUid,j.code jobCode,j.name jobName,
            u.uid unitUid,u.code unitCode,u.name unitName,
            u.decimal_precision decimalPrecision,
            d.uid deviceUid,d.code deviceCode,d.name deviceName
       FROM production_transactions pt
       JOIN employees e ON e.id=pt.employee_id
       JOIN sites s ON s.id=pt.site_id
       JOIN production_jobs j ON j.id=pt.production_job_id
       JOIN work_units u ON u.id=pt.unit_id
       LEFT JOIN production_sections section ON section.id=pt.production_section_id
       LEFT JOIN scan_devices d ON d.id=pt.scan_device_id
       LEFT JOIN users vu ON vu.id=pt.voided_by
      WHERE pt.id=?`,
    [transactionId]
  )
  const row = rows[0]
  if (!row) throw new ApiError(500, 'Transaksi Produksi tidak dapat dimuat.')
  const [detailRows] = await conn.query<RowDataPacket[]>(
    `SELECT min_quantity_snapshot minQuantity,quantity,
            rate_snapshot rateAmount,amount
       FROM production_transaction_rate_details
      WHERE production_transaction_id=? ORDER BY id`,
    [transactionId]
  )
  return {
    uid: row.uid,
    qc: await readProductionQc(conn, transactionId),
    transactionNumber: row.transactionNumber,
    businessDate: row.businessDate,
    transactionAt: row.transactionAt,
    status: row.status,
    entrySource: row.entrySource,
    quantity: normalizeStoredDecimal(row.quantity),
    deductionPercentage: normalizeStoredDecimal(row.quantityDeductionPercentage),
    deductionQuantity: normalizeStoredDecimal(row.deductedQuantity),
    payableQuantity: normalizeStoredDecimal(row.payableQuantity),
    rateSnapshot: normalizeStoredDecimal(row.rateSnapshot),
    grossAmount: normalizeStoredDecimal(row.grossAmount, 2),
    productionSection: row.productionSectionUid ? {
      uid: row.productionSectionUid,
      code: row.productionSectionCode,
      name: row.productionSectionName,
    } : null,
    rateDetails: detailRows.map((detail) => ({
      minQuantity: normalizeStoredDecimal(detail.minQuantity),
      quantity: normalizeStoredDecimal(detail.quantity),
      rateAmount: normalizeStoredDecimal(detail.rateAmount),
      amount: normalizeStoredDecimal(detail.amount, 2),
    })),
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

type DailyProductionKey = {
  employeeId: number
  siteId: number
  jobId: number
  businessDate: string
}

type RepricingContext = {
  lockedEmployees: Set<number>
  tiersByRate: Map<number, ProductionRateTier[]>
  newTransactionIds?: Set<number>
  deductionSnapshot?: DeductionSnapshot
}

type DeductionSnapshot = { sectionId: number | null; policyId: number | null; percentage: string }

function storedDeduction(row: RowDataPacket): DeductionSnapshot {
  return {
    sectionId: row.productionSectionId == null ? null : Number(row.productionSectionId),
    policyId: row.deductionPolicyId == null ? null : Number(row.deductionPolicyId),
    percentage: normalizeStoredDecimal(row.deductionPercentage ?? 0),
  }
}

// A daily group retains its first recorded policy, including an explicit 0% snapshot.
async function dailyDeductionSnapshot(conn: SqlExecutor, key: DailyProductionKey, jobCode: string, lock = false, excludedIds: number[] = []): Promise<DeductionSnapshot> {
  const [existing] = await conn.query<RowDataPacket[]>(
    `SELECT production_section_id productionSectionId,
            quantity_deduction_policy_id deductionPolicyId,
            quantity_deduction_percentage deductionPercentage
       FROM production_transactions
      WHERE employee_id=? AND site_id=? AND production_job_id=?
        AND business_date=? AND status='POSTED'
        ${excludedIds.length ? `AND id NOT IN (${excludedIds.map(()=>'?').join(',')})` : ''}
      ORDER BY id LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [key.employeeId,key.siteId,key.jobId,key.businessDate,...excludedIds]
  )
  if (existing[0]) return storedDeduction(existing[0])
  const [histories] = await conn.query<RowDataPacket[]>(
    `SELECT mapping.production_section_id sectionId
       FROM employee_employment_histories history
       LEFT JOIN production_module_sections mapping ON mapping.id=history.production_module_section_id
      WHERE history.employee_id=? AND history.site_id=? AND history.effective_from<=?
        AND (history.effective_to IS NULL OR history.effective_to>=?) ${lock ? 'FOR UPDATE' : ''}`,
    [key.employeeId,key.siteId,key.businessDate,key.businessDate]
  )
  if (histories.length !== 1) throw new ApiError(422,'Histori kerja pada tanggal setoran tidak tunggal.')
  const sectionId=histories[0].sectionId == null ? null : Number(histories[0].sectionId)
  if (jobCode !== LINTING_JOB_CODE) return {sectionId,policyId:null,percentage:'0.0000'}
  const [policies]=await conn.query<RowDataPacket[]>(
    `SELECT id,percentage FROM production_quantity_deduction_policies
      WHERE site_id=? AND production_job_id=? AND status='ACTIVE'
        AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ${lock ? 'FOR UPDATE' : ''}`,
    [key.siteId,key.jobId,key.businessDate,key.businessDate]
  )
  if(policies.length>1) throw new ApiError(422,'Kebijakan Potongan Hasil Linting aktif bertumpang-tindih.')
  return {sectionId,policyId:policies[0] ? Number(policies[0].id) : null,percentage:normalizeStoredDecimal(policies[0]?.percentage??0)}
}

function pricePayableQuantity(start: string, quantity: string, tiers: ProductionRateTier[]) {
  return BigInt(normalizeStoredDecimal(quantity).replace('.','')) === 0n
    ? {grossAmount:'0.00',slices:[] as ReturnType<typeof priceProductionTiers>['slices']}
    : priceProductionTiers(start,quantity,tiers)
}

async function rateTiers(conn: SqlExecutor, rateId: number): Promise<ProductionRateTier[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, min_quantity minQuantity, rate_amount rateAmount
       FROM production_job_rate_tiers WHERE job_rate_id=? ORDER BY min_quantity`,
    [rateId]
  )
  if (rows.length) return rows.map((row) => ({
    id: Number(row.id),
    minQuantity: normalizeStoredDecimal(row.minQuantity),
    rateAmount: normalizeStoredDecimal(row.rateAmount),
  }))
  const [rates] = await conn.query<RowDataPacket[]>(
    'SELECT rate_amount rateAmount FROM production_job_rates WHERE id=?',
    [rateId]
  )
  if (!rates[0]) throw new ApiError(422, 'Tarif pekerjaan tidak ditemukan.')
  return [{ id: null, minQuantity: '1.0000', rateAmount: normalizeStoredDecimal(rates[0].rateAmount) }]
}

async function proposedTierAmount(
  conn: SqlExecutor,
  key: DailyProductionKey,
  rateId: number,
  quantity: string,
  beforeOrAt?: string,
  excludedTransactionId?: number,
  additionalStartingQuantity = '0.0000',
  jobCode = '',
  unitPrecision = 0
) {
  const snapshot=await dailyDeductionSnapshot(conn,key,jobCode)
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(quantity),0) precedingQuantity
       FROM production_transactions
      WHERE employee_id=? AND site_id=? AND production_job_id=?
        AND business_date=? AND status='POSTED'
        ${beforeOrAt ? 'AND transaction_at<=?' : ''}
        ${excludedTransactionId ? 'AND id<>?' : ''}`,
    [key.employeeId,key.siteId,key.jobId,key.businessDate,
      ...(beforeOrAt ? [beforeOrAt] : []),
      ...(excludedTransactionId ? [excludedTransactionId] : [])]
  )
  const preceding = BigInt(
    normalizeStoredDecimal(rows[0]?.precedingQuantity).replace('.', '')
  )
  const additional = BigInt(
    normalizeStoredDecimal(additionalStartingQuantity).replace('.', '')
  )
  const starting = preceding + additional
  const allocations=allocateDailyQuantityDeduction([
    `${starting / 10000n}.${String(starting % 10000n).padStart(4,'0')}`,quantity,
  ],snapshot.percentage,unitPrecision)
  const allocation=allocations[1]
  return {
    ...pricePayableQuantity(allocations[0].payableQuantity,allocation.payableQuantity,await rateTiers(conn,rateId)),
    deductionPercentage:snapshot.percentage,deductionQuantity:allocation.deductionQuantity,payableQuantity:allocation.payableQuantity,
  }
}

type PreviewProductionEntry = {
  id: number
  rateId: number
  quantity: string
  transactionAt: string
  grossAmount: string
  jobCode?: string
  decimalPrecision?: number
}

function amountCents(value: unknown): bigint {
  return BigInt(normalizeStoredDecimal(value,2).replace('.', ''))
}

function centsAmount(value: bigint): string {
  const sign = value<0n ? '-' : ''
  const absolute = value<0n ? -value : value
  return `${sign}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`
}

async function previewDailyRepricing(
  conn: PoolConnection,
  key: DailyProductionKey,
  excludedTransactionId?: number,
  replacement?: Omit<PreviewProductionEntry,'grossAmount'>
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id,job_rate_id rateId,quantity,
            quantity_deduction_percentage deductionPercentage,
            quantity_deduction_policy_id deductionPolicyId,
            production_section_id productionSectionId,
            (SELECT decimal_precision FROM work_units WHERE id=production_transactions.unit_id) decimalPrecision,
            (SELECT code FROM production_jobs WHERE id=production_transactions.production_job_id) jobCode,
            DATE_FORMAT(transaction_at,'%Y-%m-%d %H:%i:%s.%f') transactionAt,
            gross_amount grossAmount
       FROM production_transactions
      WHERE employee_id=? AND site_id=? AND production_job_id=?
        AND business_date=? AND status='POSTED'
      ORDER BY transaction_at,id`,
    [key.employeeId,key.siteId,key.jobId,key.businessDate]
  )
  const existing = rows.map((row) => ({
    id:Number(row.id),rateId:Number(row.rateId),
    quantity:normalizeStoredDecimal(row.quantity),
    transactionAt:String(row.transactionAt),
    grossAmount:normalizeStoredDecimal(row.grossAmount,2),
  }))
  const before = existing.reduce((sum,row)=>sum+amountCents(row.grossAmount),0n)
  const proposed = existing.filter((row)=>row.id!==excludedTransactionId)
  if (replacement) proposed.push({...replacement,grossAmount:'0.00'})
  if (!proposed.length) return {before,after:0n}
  proposed.sort((a,b)=>a.transactionAt.localeCompare(b.transactionAt)||a.id-b.id)
  let cumulative=0n
  let after=0n
  const first=rows.slice().sort((a,b)=>Number(a.id)-Number(b.id))[0]
  const snapshot=first ? storedDeduction(first) : await dailyDeductionSnapshot(conn,key,replacement?.jobCode??'')
  const allocations=allocateDailyQuantityDeduction(proposed.map(row=>row.quantity),snapshot.percentage,Number(first?.decimalPrecision??replacement?.decimalPrecision??0))
  const cache=new Map<number,ProductionRateTier[]>()
  for (const [index,row] of proposed.entries()) {
    let tiers=cache.get(row.rateId)
    if (!tiers) {
      tiers=await rateTiers(conn,row.rateId)
      cache.set(row.rateId,tiers)
    }
    const startingQuantity=`${cumulative/10000n}.${String(cumulative%10000n).padStart(4,'0')}`
    const payableQuantity=allocations[index].payableQuantity
    const priced=pricePayableQuantity(startingQuantity,payableQuantity,tiers)
    cumulative+=BigInt(payableQuantity.replace('.',''))
    after+=amountCents(priced.grossAmount)
  }
  return {before,after}
}

async function repriceProductionDay(
  conn: PoolConnection,
  key: DailyProductionKey,
  auth: AuthContext,
  request: Request,
  context?: RepricingContext
) {
  // The employee row serializes inserts even when the employee has no earlier deposits.
  if (!context?.lockedEmployees.has(key.employeeId)) {
    await conn.query('SELECT id FROM employees WHERE id=? FOR UPDATE', [key.employeeId])
    context?.lockedEmployees.add(key.employeeId)
  }
  const dateLock = await payrollDateLockContext(
    conn,
    key.siteId,
    key.businessDate,
    true
  )
  if (dateLock.locked) throw new ApiError(409, dateLock.reasons[0])
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pt.id,pt.uid,pt.job_rate_id rateId,pt.quantity,pt.rate_snapshot rateSnapshot,
            pt.gross_amount grossAmount,pt.payroll_locked_at payrollLockedAt,
            pt.production_section_id productionSectionId,
            pt.quantity_deduction_policy_id deductionPolicyId,
            pt.quantity_deduction_percentage deductionPercentage,
            pt.deducted_quantity deductedQuantity,pt.payable_quantity payableQuantity,
            job.code jobCode,unit.decimal_precision decimalPrecision,
            EXISTS(SELECT 1 FROM payroll_production_details pd
                    WHERE pd.production_transaction_id=pt.id) payrollSnapshot,
            EXISTS(SELECT 1 FROM payroll_training_production_details td
                    WHERE td.production_transaction_id=pt.id) trainingSnapshot
       FROM production_transactions pt
       JOIN production_jobs job ON job.id=pt.production_job_id
       JOIN work_units unit ON unit.id=pt.unit_id
      WHERE pt.employee_id=? AND pt.site_id=? AND pt.production_job_id=?
        AND pt.business_date=? AND pt.status='POSTED'
      ORDER BY pt.transaction_at,pt.id FOR UPDATE`,
    [key.employeeId, key.siteId, key.jobId, key.businessDate]
  )
  if (rows.some((row) => row.payrollLockedAt || Number(row.payrollSnapshot) || Number(row.trainingSnapshot))) {
    throw new ApiError(409, 'Setoran harian sudah masuk atau dikunci Payroll; tarif tidak boleh dihitung ulang.')
  }
  if (!rows.length) return
  const existing=rows.filter(row=>!context?.newTransactionIds?.has(Number(row.id)))
    .sort((a,b)=>Number(a.id)-Number(b.id))[0]
  const snapshot=existing ? storedDeduction(existing) : context?.deductionSnapshot
    ?? await dailyDeductionSnapshot(conn,key,String(rows[0].jobCode),true,rows.map(row=>Number(row.id)))
  const {sectionId,policyId,percentage:deductionPercentage}=snapshot
  const decimalPrecision=Number(rows[0]?.decimalPrecision??0)
  const allocations=allocateDailyQuantityDeduction(
    rows.map((row)=>normalizeStoredDecimal(row.quantity)),
    deductionPercentage,
    decimalPrecision
  )
  let cumulative = 0n
  const tierCache = context?.tiersByRate ?? new Map<number, ProductionRateTier[]>()
  const detailsByTransaction = new Map<number, RowDataPacket[]>()
  for (let offset = 0; offset < rows.length; offset += 1_000) {
    const transactionIds = rows
      .slice(offset, offset + 1_000)
      .map((row) => Number(row.id))
    if (!transactionIds.length) continue
    const [detailRows] = await conn.query<RowDataPacket[]>(
      `SELECT production_transaction_id transactionId,
              job_rate_tier_id tierId,min_quantity_snapshot minQuantitySnapshot,
              quantity,rate_snapshot rateSnapshot,amount
         FROM production_transaction_rate_details
        WHERE production_transaction_id IN (${transactionIds.map(() => '?').join(',')})
        ORDER BY production_transaction_id,id`,
      transactionIds
    )
    for (const detail of detailRows) {
      const transactionId = Number(detail.transactionId)
      const existing = detailsByTransaction.get(transactionId) ?? []
      existing.push(detail)
      detailsByTransaction.set(transactionId, existing)
    }
  }
  const changedDetails: Array<{
    transactionId: number
    slices: ReturnType<typeof priceProductionTiers>['slices']
  }> = []
  for (const [rowIndex,row] of rows.entries()) {
    const rateId = Number(row.rateId)
    let tiers = tierCache.get(rateId)
    if (!tiers) {
      tiers = await rateTiers(conn, rateId)
      tierCache.set(rateId, tiers)
    }
    const startingQuantity = `${cumulative / 10000n}.${String(cumulative % 10000n).padStart(4, '0')}`
    const allocation=allocations[rowIndex]
    const priced = pricePayableQuantity(startingQuantity, allocation.payableQuantity, tiers)
    cumulative += BigInt(allocation.payableQuantity.replace('.', ''))
    const oldDetails = detailsByTransaction.get(Number(row.id)) ?? []
    const desired = JSON.stringify(priced.slices.map((slice) => [slice.tierId,slice.minQuantitySnapshot,slice.quantity,slice.rateSnapshot,slice.amount]))
    const previous = JSON.stringify(oldDetails.map((detail) => [
      detail.tierId === null ? null : Number(detail.tierId),
      normalizeStoredDecimal(detail.minQuantitySnapshot),
      normalizeStoredDecimal(detail.quantity),
      normalizeStoredDecimal(detail.rateSnapshot),
      normalizeStoredDecimal(detail.amount,2),
    ]))
    if (desired !== previous) {
      changedDetails.push({ transactionId: Number(row.id), slices: priced.slices })
    }
    const snapshotChanged=
      normalizeStoredDecimal(row.grossAmount,2)!==priced.grossAmount ||
      normalizeStoredDecimal(row.deductedQuantity??0)!==allocation.deductionQuantity ||
      normalizeStoredDecimal(row.payableQuantity??row.quantity)!==allocation.payableQuantity ||
      normalizeStoredDecimal(row.deductionPercentage??0)!==deductionPercentage ||
      Number(row.productionSectionId??0)!==Number(sectionId??0) ||
      Number(row.deductionPolicyId??0)!==Number(policyId??0)
    if (snapshotChanged) {
      await conn.execute(
        `UPDATE production_transactions
            SET production_section_id=?,quantity_deduction_policy_id=?,
                quantity_deduction_percentage=?,deducted_quantity=?,
                payable_quantity=?,gross_amount=?,updated_by=? WHERE id=?`,
        [sectionId,policyId,deductionPercentage,
         allocation.deductionQuantity,allocation.payableQuantity,
         priced.grossAmount,auth.id,row.id]
      )
      await writeAudit({
        auth, request, module: 'PRODUCTION', siteId: key.siteId, action: 'UPDATE',
        table: 'production_transactions', recordId: Number(row.id), recordUid: String(row.uid),
        description: 'Menghitung ulang tarif progresif setoran harian.',
        beforeData: { grossAmount: normalizeStoredDecimal(row.grossAmount,2),
          deductionPercentage:normalizeStoredDecimal(row.deductionPercentage??0),
          deductionQuantity:normalizeStoredDecimal(row.deductedQuantity??0),
          payableQuantity:normalizeStoredDecimal(row.payableQuantity??row.quantity) },
        afterData: { grossAmount: priced.grossAmount,quantity:allocation.rawQuantity,
          quantityDeductionPercentage:deductionPercentage,
          deductedQuantity:allocation.deductionQuantity,
          payableQuantity:allocation.payableQuantity,rateDetails:priced.slices },
      }, conn)
    }
  }
  for (let offset = 0; offset < changedDetails.length; offset += 1_000) {
    const transactionIds = changedDetails
      .slice(offset, offset + 1_000)
      .map((item) => item.transactionId)
    await conn.execute(
      `DELETE FROM production_transaction_rate_details
        WHERE production_transaction_id IN (${transactionIds.map(() => '?').join(',')})`,
      transactionIds
    )
  }
  const desiredDetails = changedDetails.flatMap((item) =>
    item.slices.map((slice) => ({ transactionId: item.transactionId, slice }))
  )
  for (let offset = 0; offset < desiredDetails.length; offset += 250) {
    const chunk = desiredDetails.slice(offset, offset + 250)
    await conn.execute(
      `INSERT INTO production_transaction_rate_details
         (uid,production_transaction_id,job_rate_tier_id,min_quantity_snapshot,
          quantity,rate_snapshot,amount,created_by,updated_by)
       VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')}`,
      chunk.flatMap(({ transactionId, slice }) => [
        randomUUID(),
        transactionId,
        slice.tierId,
        slice.minQuantitySnapshot,
        slice.quantity,
        slice.rateSnapshot,
        slice.amount,
        auth.id,
        auth.id,
      ])
    )
  }
}

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
    const priced = await proposedTierAmount(conn, {
      employeeId: Number(transaction.employee_id), siteId: Number(transaction.site_id),
      jobId: Number(transaction.production_job_id), businessDate: String(transaction.businessDateKey),
    }, Number(transaction.job_rate_id), quantity, String(transaction.transactionTimestamp), Number(transaction.id),'0.0000',String(transaction.jobCode),Number(transaction.decimalPrecision))
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
        deductionPercentage:priced.deductionPercentage,
        deductionQuantity:priced.deductionQuantity,
        payableQuantity:priced.payableQuantity,
        rateSnapshot,
        grossAmount: priced.grossAmount,
        rateDetails: priced.slices.map((slice) => ({
          minQuantity: slice.minQuantitySnapshot, quantity: slice.quantity,
          rateAmount: slice.rateSnapshot, amount: slice.amount,
        })),
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
  const priced = await proposedTierAmount(conn, {
    employeeId: Number(transaction.employee_id), siteId: Number(transaction.site_id),
    jobId: Number(targets[0].jobId), businessDate: String(transaction.businessDateKey),
  }, Number(targets[0].rateId), quantity, String(transaction.transactionTimestamp), Number(transaction.id),'0.0000',String(job.code),unit.decimalPrecision)
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
      deductionPercentage:priced.deductionPercentage,
      deductionQuantity:priced.deductionQuantity,
      payableQuantity:priced.payableQuantity,
      rateSnapshot: rate.amount,
      grossAmount: priced.grossAmount,
      rateDetails: priced.slices.map((slice) => ({
        minQuantity: slice.minQuantitySnapshot, quantity: slice.quantity,
        rateAmount: slice.rateSnapshot, amount: slice.amount,
      })),
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
      production_section_id: history.productionSectionId ?? null,
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
    deductionPercentage:normalizeStoredDecimal(row.quantity_deduction_percentage??0),
    deductionQuantity:normalizeStoredDecimal(row.deducted_quantity??0),
    payableQuantity:normalizeStoredDecimal(row.payable_quantity??row.quantity),
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

type BatchDeleteSummary = {
  businessDate: string
  employeeCount: number
  transactionCount: number
  totalQuantityPcs: string
  totalGrossAmount: string
  canDelete: boolean
  blockers: string[]
  siteId: number | null
}

async function productionBatchDeleteSummary(
  executor: Pool | PoolConnection,
  filterSql: string,
  filterValues: string[]
): Promise<BatchDeleteSummary[]> {
  const [rows] = await executor.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(transaction.business_date,'%Y-%m-%d') businessDate,
            CASE WHEN COUNT(DISTINCT transaction.site_id)=1
              THEN MIN(transaction.site_id) ELSE NULL END siteId,
            COUNT(DISTINCT transaction.employee_id) employeeCount,
            COUNT(*) transactionCount,
            COALESCE(SUM(CASE
              WHEN transaction.status='POSTED' AND unit.code='PCS'
                THEN transaction.quantity ELSE 0 END),0) totalQuantityPcs,
            COALESCE(SUM(CASE
              WHEN transaction.status='POSTED'
                THEN transaction.gross_amount ELSE 0 END),0) totalGrossAmount,
            MAX(transaction.payroll_locked_at IS NOT NULL) hasPayrollLock,
            MAX(EXISTS(
              SELECT 1 FROM payroll_production_details detail
              JOIN production_transactions payroll_transaction
                ON payroll_transaction.id=detail.production_transaction_id
              WHERE payroll_transaction.business_date=transaction.business_date
                AND payroll_transaction.site_id=transaction.site_id
            ) OR EXISTS(
              SELECT 1 FROM payroll_training_production_details detail
              JOIN production_transactions payroll_transaction
                ON payroll_transaction.id=detail.production_transaction_id
              WHERE payroll_transaction.business_date=transaction.business_date
                AND payroll_transaction.site_id=transaction.site_id
            )) hasPayrollSnapshot,
            MAX(EXISTS(
              SELECT 1 FROM payroll_periods period
               WHERE transaction.business_date
                 BETWEEN period.period_start AND period.period_end
                 AND period.site_id=transaction.site_id
                 AND period.status NOT IN ('DRAFT','CANCELLED')
            )) hasProcessedPayrollPeriod,
            MAX(EXISTS(
              SELECT 1
                FROM payroll_runs run
                JOIN payroll_periods period
                  ON period.id=run.payroll_period_id
               WHERE transaction.business_date
                 BETWEEN period.period_start AND period.period_end
                 AND period.site_id=transaction.site_id
                 AND run.status='PROCESSING'
            )) hasProcessingPayrollRun
       FROM production_transactions transaction
       JOIN work_units unit ON unit.id=transaction.unit_id
       JOIN sites site ON site.id=transaction.site_id
      WHERE ${filterSql}
      GROUP BY transaction.business_date
      ORDER BY transaction.business_date DESC`,
    filterValues
  )

  return rows.map((row) => {
    const blockers: string[] = []
    if (Number(row.hasPayrollLock) > 0 || Number(row.hasPayrollSnapshot) > 0) {
      blockers.push('Ada transaksi yang sudah dikunci atau disnapshot Payroll.')
    }
    if (Number(row.hasProcessedPayrollPeriod) > 0) {
      blockers.push('Tanggal sudah masuk proses Payroll.')
    }
    if (Number(row.hasProcessingPayrollRun) > 0) {
      blockers.push('Tanggal sedang diproses Payroll.')
    }
    return {
      businessDate: String(row.businessDate),
      employeeCount: Number(row.employeeCount ?? 0),
      transactionCount: Number(row.transactionCount ?? 0),
      totalQuantityPcs: String(row.totalQuantityPcs ?? '0'),
      totalGrossAmount: String(row.totalGrossAmount ?? '0'),
      canDelete: blockers.length === 0,
      blockers,
      siteId: row.siteId == null ? null : Number(row.siteId),
    }
  })
}

export const productionTransactionsRouter = Router()
productionTransactionsRouter.use(authenticate)

productionTransactionsRouter.get('/terminal/daily-summary', requirePermission('production.scan'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const device = await getDevice(conn, deviceToken(req))
    enforceSite(res.locals.auth as AuthContext, String(device.site))
    const { businessDate } = await currentServerTime(conn)
    // Older operational schemas have no cancellation status on employment
    // histories. Keep their date-based semantics without requiring a migration.
    const [historyColumns] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) hasHistoryStatus FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employee_employment_histories'
          AND COLUMN_NAME='status'`
    )
    const hasHistoryStatus = Number(historyColumns[0]?.hasHistoryStatus) > 0
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT section.uid,section.name,
              COALESCE(summary.presentEmployees,0) presentEmployees,
              COALESCE(summary.submittedEmployees,0) submittedEmployees
         FROM production_sections section
         LEFT JOIN (
           SELECT mapping.production_section_id,
                  COUNT(DISTINCT attendance.employee_id) presentEmployees,
                  COUNT(DISTINCT CASE WHEN ${productionTerminalSummaryPostedSql}
                    THEN attendance.employee_id END) submittedEmployees
             ${productionTerminalSummaryAttendanceSql(hasHistoryStatus)}
            GROUP BY mapping.production_section_id
         ) summary ON summary.production_section_id=section.id
        WHERE section.is_active=1 ORDER BY section.name,section.id`,
      [businessDate,businessDate,businessDate,device.siteId,businessDate,businessDate]
    )
    res.json({ businessDate,siteName:device.siteName,sections:rows.map(row => ({
      uid:row.uid,name:row.name,presentEmployees:Number(row.presentEmployees),
      submittedEmployees:Number(row.submittedEmployees),
      pendingEmployees:Number(row.presentEmployees)-Number(row.submittedEmployees),
    })) })
  } catch (error) { next(error) } finally { conn.release() }
})

productionTransactionsRouter.get('/terminal/daily-summary/employees', requirePermission('production.scan'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const device = await getDevice(conn, deviceToken(req))
    enforceSite(res.locals.auth as AuthContext, String(device.site))
    const input = z.object({
      sectionUid:z.string().uuid(),
      condition:z.enum(['PRESENT','SUBMITTED','PENDING']).default('PRESENT'),
      page:z.coerce.number().int().min(1).max(1_000_000).default(1),
      pageSize:z.coerce.number().int().min(1).max(500).default(50),
      search:z.string().trim().max(100).default(''),
    }).parse(req.query)
    const { businessDate } = await currentServerTime(conn)
    const [historyColumns] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) hasHistoryStatus FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employee_employment_histories'
          AND COLUMN_NAME='status'`
    )
    const hasHistoryStatus = Number(historyColumns[0]?.hasHistoryStatus) > 0
    const condition = input.condition==='SUBMITTED'
      ? ` AND ${productionTerminalSummaryPostedSql}`
      : input.condition==='PENDING' ? ` AND NOT ${productionTerminalSummaryPostedSql}` : ''
    const filter = ` AND employee_section.uid=?${condition}
      ${input.search ? 'AND (employee.full_name LIKE ? OR employee.employee_number LIKE ?)' : ''}`
    const values = [businessDate,businessDate,businessDate,device.siteId,businessDate,businessDate,input.sectionUid,
      ...(input.search ? [`%${input.search}%`,`%${input.search}%`] : [])]
    const [counts] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT attendance.employee_id) total
        ${productionTerminalSummaryAttendanceSql(hasHistoryStatus)} ${filter}`, values
    )
    const total = Number(counts[0]?.total ?? 0)
    const page = Math.min(input.page,Math.max(1,Math.ceil(total/input.pageSize)))
    // Aggregate raw PCS only. No payable quantities, prices or Payroll data.
    const depositJoin = input.condition==='SUBMITTED' ? `LEFT JOIN (
      SELECT pt.employee_id,COUNT(*) depositCount,
             SUM(CASE WHEN unit.code='PCS' THEN pt.quantity ELSE 0 END) quantityPcs,
             MAX(pt.transaction_at) lastTransactionAt
        FROM production_transactions pt JOIN work_units unit ON unit.id=pt.unit_id
       WHERE pt.business_date=? AND pt.site_id=? AND pt.status='POSTED'
       GROUP BY pt.employee_id
    ) deposits ON deposits.employee_id=attendance.employee_id` : ''
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT employee.uid,employee.employee_number employeeNumber,employee.full_name fullName,
              employee_section.uid sectionUid,employee_section.name sectionName,
              employee_module.uid moduleUid,employee_module.name moduleName,
              DATE_FORMAT(attendance.clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00') clockInAt,
              DATE_FORMAT(attendance.clock_out_at,'%Y-%m-%dT%H:%i:%s+07:00') clockOutAt
              ${input.condition==='SUBMITTED' ? ",deposits.depositCount,CAST(deposits.quantityPcs AS CHAR) quantityPcs,DATE_FORMAT(deposits.lastTransactionAt,'%Y-%m-%dT%H:%i:%s+07:00') lastTransactionAt" : ''}
        ${productionTerminalSummaryAttendanceSql(hasHistoryStatus,depositJoin)} ${filter}
       ORDER BY employee.full_name,employee.employee_number,employee.id LIMIT ? OFFSET ?`,
      // Deposit placeholders occur after the two history-date placeholders.
      [values[0],values[1],...(depositJoin ? [businessDate,device.siteId] : []),...values.slice(2),input.pageSize,(page-1)*input.pageSize]
    )
    res.json({businessDate,siteName:device.siteName,
      items:rows.map(row => ({
        uid:row.uid,employeeNumber:row.employeeNumber,fullName:row.fullName,
        section:{uid:row.sectionUid,name:row.sectionName},module:{uid:row.moduleUid,name:row.moduleName},
        attendance:{status:'PRESENT',clockInAt:row.clockInAt ?? null,clockOutAt:row.clockOutAt ?? null},
        deposits:input.condition==='SUBMITTED' ? {count:Number(row.depositCount),quantityPcs:String(row.quantityPcs ?? '0'),lastTransactionAt:row.lastTransactionAt ?? null} : null,
      })),pagination:{page,pageSize:input.pageSize,total,totalPages:Math.ceil(total/input.pageSize)},
    })
  } catch (error) { next(error) } finally { conn.release() }
})

productionTransactionsRouter.get('/terminal/recent', requirePermission('production.scan'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext
    const device = await getDevice(conn, deviceToken(req))
    enforceSite(auth, String(device.site))
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT pt.uid,pt.transaction_number transactionNumber,
              DATE_FORMAT(pt.transaction_at,'%Y-%m-%dT%H:%i:%s+07:00') transactionAt,
              CAST(pt.quantity AS CHAR) quantity,e.uid employeeUid,e.full_name fullName,
              e.employee_number employeeNumber,j.uid jobUid,j.code jobCode,j.name jobName,
              u.uid unitUid,u.code unitCode,u.name unitName,u.decimal_precision decimalPrecision,
              brand.uid brandUid,qc.brand_name_snapshot brandName,qc.id qcId,
              CAST(qc.weight_1_grams AS CHAR) weight1Grams,CAST(qc.weight_2_grams AS CHAR) weight2Grams,
              (SELECT COALESCE(SUM(defect.quantity),0) FROM production_transaction_qc_defects defect
                WHERE defect.production_transaction_qc_id=qc.id) totalDefects
         FROM production_transactions pt
         JOIN employees e ON e.id=pt.employee_id
         JOIN production_jobs j ON j.id=pt.production_job_id
         JOIN work_units u ON u.id=pt.unit_id
         LEFT JOIN production_transaction_qc qc ON qc.production_transaction_id=pt.id
         LEFT JOIN production_brands brand ON brand.id=qc.brand_id
        WHERE pt.scan_device_id=? AND pt.site_id=? AND pt.status='POSTED'
        ORDER BY pt.transaction_at DESC,pt.id DESC LIMIT 5`,
      [device.id, device.siteId]
    )
    res.json({ items: rows.map(row => ({
      uid: row.uid,transactionNumber: row.transactionNumber,transactionAt: row.transactionAt,quantity: row.quantity,
      employee: { uid:row.employeeUid,fullName:row.fullName,employeeNumber:row.employeeNumber },
      job: { uid:row.jobUid,code:row.jobCode,name:row.jobName },
      unit: { uid:row.unitUid,code:row.unitCode,name:row.unitName,decimalPrecision:Number(row.decimalPrecision) },
      brand: row.brandUid ? { uid:row.brandUid,name:row.brandName } : null,
      qcSummary: row.qcId ? { weight1Grams:row.weight1Grams ?? null,weight2Grams:row.weight2Grams ?? null,totalDefects:Number(row.totalDefects ?? 0) } : null,
    })) })
  } catch (error) { next(error) } finally { conn.release() }
})

productionTransactionsRouter.get('/terminal/transactions/:uid', requirePermission('production.scan'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const uid = z.string().uuid().parse(routeParam(req.params.uid))
    const device = await getDevice(conn, deviceToken(req))
    enforceSite(res.locals.auth as AuthContext, String(device.site))
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT pt.id,pt.uid,pt.transaction_number transactionNumber,pt.status,pt.entry_source entrySource,
              DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDate,
              DATE_FORMAT(pt.transaction_at,'%Y-%m-%dT%H:%i:%s+07:00') transactionAt,
              CAST(pt.quantity AS CHAR) quantity,e.uid employeeUid,e.full_name fullName,e.employee_number employeeNumber,
              j.uid jobUid,j.code jobCode,j.name jobName,u.uid unitUid,u.code unitCode,u.name unitName,u.decimal_precision decimalPrecision
         FROM production_transactions pt
         JOIN employees e ON e.id=pt.employee_id
         JOIN production_jobs j ON j.id=pt.production_job_id
         JOIN work_units u ON u.id=pt.unit_id
        WHERE pt.uid=? AND pt.scan_device_id=? AND pt.site_id=? LIMIT 1`,
      [uid,device.id,device.siteId]
    )
    const row = rows[0]
    if (!row) throw new ApiError(404, 'Setoran tidak ditemukan pada perangkat ini.')
    const qc = await readProductionQc(conn, Number(row.id))
    res.json({ transaction: {
      uid:row.uid,transactionNumber:row.transactionNumber,businessDate:row.businessDate,transactionAt:row.transactionAt,
      status:row.status,entrySource:row.entrySource,quantity:row.quantity,siteName:device.siteName,
      device:{uid:device.uid,code:device.code,name:device.name},
      employee:{uid:row.employeeUid,fullName:row.fullName,employeeNumber:row.employeeNumber},
      job:{uid:row.jobUid,code:row.jobCode,name:row.jobName},
      unit:{uid:row.unitUid,code:row.unitCode,name:row.unitName,decimalPrecision:Number(row.decimalPrecision)},qc,
    } })
  } catch (error) { next(error) } finally { conn.release() }
})

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
          'Kode aktivasi tidak valid, sudah digunakan/diganti, atau bukan perangkat Produksi.'
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
      const qcOptions = jobs.length
        ? await loadProductionQcOptions(conn,Number(device.siteId)) : undefined
      const lastBrandUid = qcOptions ? await lastProductionDeviceBrand(conn, Number(device.id), Number(device.siteId)) : null
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
        qcOptions,
        lastBrandUid,
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
        await assertProductionQcReplay(conn,Number(existing.id),input.qc)
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
      const qc = await resolveProductionQc(conn,input.qc,Number(device.siteId),String(assignment.jobCode),true)
      const [insertResult] = await conn.execute(
        `INSERT INTO production_transactions(
           uid,transaction_number,employee_id,site_id,work_group_id,production_section_id,
           production_job_id,unit_id,job_rate_id,attendance_record_id,
           scan_device_id,business_date,transaction_at,quantity,rate_snapshot,
           payable_quantity,gross_amount,status,idempotency_key,created_by,updated_by
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'POSTED',?,?,?)`,
        [
          uid,
          transactionNumber,
          employee.id,
          device.siteId,
          history.workGroupId ?? null,
          history.productionSectionId ?? null,
          assignment.jobId,
          rate.unitId,
          rate.rateId,
          attendance.id,
          device.id,
          time.businessDate,
          time.transactionTimestamp,
          quantity,
          rateSnapshot,
          quantity,
          grossAmount,
          input.idempotencyKey,
          auth.id,
          auth.id,
        ]
      )
      const transactionId = Number(
        (insertResult as { insertId?: number }).insertId ?? 0
      )
      await saveProductionQc(conn,transactionId,qc,auth.id)
      await repriceProductionDay(conn, {
        employeeId: Number(employee.id), siteId: Number(device.siteId),
        jobId: Number(assignment.jobId), businessDate: String(time.businessDate),
      }, auth, req,{lockedEmployees:new Set(),tiersByRate:new Map(),newTransactionIds:new Set([transactionId])})
      const pricedTransaction = await transactionResponse(conn, transactionId)
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
            grossAmount: pricedTransaction.grossAmount,
            ...(input.qc ? { qc:input.qc } : {}),
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
  '/transactions/batch-delete/summary',
  requirePermission('production.correct'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      assertSuperAdmin(auth)
      const input = productionBatchDeleteSummaryInput.parse(req.body)
      const dateFrom = input.dateFrom
      const dateTo = input.dateTo
      const rangeDays =
        Math.floor(
          (Date.parse(`${dateTo}T00:00:00Z`) -
            Date.parse(`${dateFrom}T00:00:00Z`)) /
            86_400_000
        ) + 1
      if (rangeDays < 1) {
        throw new ApiError(422, 'Tanggal akhir tidak boleh sebelum tanggal awal.')
      }
      if (rangeDays > 31) {
        throw new ApiError(422, 'Ringkasan reset maksimal untuk 31 hari.')
      }
      const siteFilter =
        input.site === 'ALL' ? '' : ' AND site.code=?'
      const rows = await productionBatchDeleteSummary(
        pool,
        `transaction.business_date BETWEEN ? AND ?${siteFilter}`,
        input.site === 'ALL' ? [dateFrom, dateTo] : [dateFrom, dateTo, input.site]
      )
      res.json({ data: { dateFrom, dateTo, site: input.site, rows } })
    } catch (error) {
      next(error)
    }
  }
)

productionTransactionsRouter.post(
  '/transactions/batch-delete',
  requirePermission('production.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      assertSuperAdmin(auth)
      const input = productionBatchDeleteInput.parse(req.body)
      const businessDates = [...new Set(input.businessDates)].sort()
      if (businessDates.length !== input.businessDates.length) {
        throw new ApiError(422, 'Tanggal reset tidak boleh duplikat.')
      }
      const placeholders = businessDates.map(() => '?').join(',')
      const siteFilter = input.site === 'ALL' ? '' : ' AND site.code=?'
      const targetValues =
        input.site === 'ALL' ? businessDates : [...businessDates, input.site]

      await conn.beginTransaction()
      const [targets] = await conn.query<RowDataPacket[]>(
        `SELECT transaction.id
           FROM production_transactions transaction
           JOIN sites site ON site.id=transaction.site_id
          WHERE transaction.business_date IN (${placeholders})${siteFilter}
          FOR UPDATE`,
        targetValues
      )
      if (!targets.length) {
        throw new ApiError(
          409,
          'Tidak ada transaksi Produksi pada tanggal yang dipilih.'
        )
      }

      const firstDate = businessDates[0]
      const lastDate = businessDates[businessDates.length - 1]
      await conn.query<RowDataPacket[]>(
        `SELECT period.id FROM payroll_periods period
          JOIN sites site ON site.id=period.site_id
          WHERE period.period_end>=? AND period.period_start<=?${siteFilter}
          FOR UPDATE`,
        input.site === 'ALL'
          ? [firstDate, lastDate]
          : [firstDate, lastDate, input.site]
      )
      await conn.query<RowDataPacket[]>(
        `SELECT run.id
           FROM payroll_runs run
           JOIN payroll_periods period ON period.id=run.payroll_period_id
          JOIN sites site ON site.id=period.site_id
          WHERE period.period_end>=? AND period.period_start<=?${siteFilter}
          FOR UPDATE`,
        input.site === 'ALL'
          ? [firstDate, lastDate]
          : [firstDate, lastDate, input.site]
      )

      const summary = await productionBatchDeleteSummary(
        conn,
        `transaction.business_date IN (${placeholders})${siteFilter}`,
        targetValues
      )
      const foundDates = new Set(summary.map((row) => row.businessDate))
      const missingDates = businessDates.filter((date) => !foundDates.has(date))
      if (missingDates.length) {
        throw new ApiError(
          409,
          `Reset dibatalkan: transaksi tanggal ${missingDates.join(', ')} sudah tidak tersedia.`
        )
      }
      const blocked = summary.filter((row) => !row.canDelete)
      if (blocked.length) {
        throw new ApiError(
          409,
          `Reset dibatalkan untuk ${blocked.map((row) => row.businessDate).join(', ')}: ${blocked[0].blockers[0]}`
        )
      }

      // Normal corrections retain the source site/date. Reject an incomplete
      // chain rather than deleting the history of a transaction outside this batch.
      const [revisions] = await conn.query<RowDataPacket[]>(
        `SELECT revision.id,revision.production_transaction_id sourceId,
                revision.replacement_transaction_id replacementId
           FROM production_transaction_revisions revision
           JOIN production_transactions transaction
             ON transaction.id=revision.production_transaction_id
             OR transaction.id=revision.replacement_transaction_id
           JOIN sites site ON site.id=transaction.site_id
          WHERE transaction.business_date IN (${placeholders})${siteFilter}
          FOR UPDATE`,
        targetValues
      )
      const targetIds = new Set(targets.map((row) => String(row.id)))
      if (revisions.some((row) =>
        !targetIds.has(String(row.sourceId)) ||
        (row.replacementId != null && !targetIds.has(String(row.replacementId)))
      )) {
        throw new ApiError(
          409,
          'Reset dibatalkan: transaksi koreksi terhubung ke transaksi di luar tanggal atau site yang dipilih.'
        )
      }
      await conn.execute(
        `DELETE revision FROM production_transaction_revisions revision
           JOIN production_transactions transaction
             ON transaction.id=revision.production_transaction_id
             OR transaction.id=revision.replacement_transaction_id
           JOIN sites site ON site.id=transaction.site_id
          WHERE transaction.business_date IN (${placeholders})${siteFilter}`,
        targetValues
      )
      await conn.execute(
        `DELETE detail FROM production_transaction_qc_defects detail
          JOIN production_transaction_qc header ON header.id=detail.production_transaction_qc_id
          JOIN production_transactions transaction ON transaction.id=header.production_transaction_id
          JOIN sites site ON site.id=transaction.site_id
          WHERE transaction.business_date IN (${placeholders})${siteFilter}`, targetValues)
      await conn.execute(
        `DELETE header FROM production_transaction_qc header
          JOIN production_transactions transaction ON transaction.id=header.production_transaction_id
          JOIN sites site ON site.id=transaction.site_id
          WHERE transaction.business_date IN (${placeholders})${siteFilter}`, targetValues)
      await conn.execute(
        `DELETE detail
           FROM production_transaction_rate_details detail
           JOIN production_transactions transaction
             ON transaction.id=detail.production_transaction_id
          JOIN sites site ON site.id=transaction.site_id
          WHERE transaction.business_date IN (${placeholders})${siteFilter}`,
        targetValues
      )
      const [deleted] = await conn.execute<ResultSetHeader>(
        `DELETE transaction FROM production_transactions transaction
          JOIN sites site ON site.id=transaction.site_id
          WHERE transaction.business_date IN (${placeholders})${siteFilter}`,
        targetValues
      )
      const expected = summary.reduce(
        (total, row) => total + row.transactionCount,
        0
      )
      if (deleted.affectedRows !== expected) {
        throw new ApiError(
          409,
          'Reset dibatalkan karena jumlah transaksi berubah saat diproses.'
        )
      }

      for (const row of summary) {
        await writeAudit(
          {
            auth,
            request: req,
            module: 'PRODUCTION',
            siteId: row.siteId,
            action: 'DELETE',
            table: 'production_transactions',
            description: `Menghapus seluruh transaksi Produksi tanggal ${row.businessDate} melalui reset batch.`,
            reason: input.reason,
            beforeData: {
              businessDate: row.businessDate,
              site: input.site,
              employeeCount: row.employeeCount,
              transactionCount: row.transactionCount,
              totalQuantityPcs: row.totalQuantityPcs,
              totalGrossAmount: row.totalGrossAmount,
            },
            afterData: { deleted: true },
          },
          conn
        )
      }

      await conn.commit()
      res.json({
        data: {
          deletedDates: summary.length,
          deletedTransactions: deleted.affectedRows,
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
  '/transactions/import/preview',
  requirePermission('production.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const input = productionImportPreviewInput.parse(req.body)
      const validation = await validateProductionImportRows(
        conn,
        input.rows,
        auth
      )
      res.json({
        data: {
          total: validation.length,
          valid: validation.filter((row) => row.valid).length,
          invalid: validation.filter((row) => !row.valid).length,
          warnings: validation.filter((row) => row.warning).length,
          rows: validation.map(productionImportRowDto),
        },
      })
    } catch (error) {
      next(error)
    } finally {
      conn.release()
    }
  }
)

productionTransactionsRouter.get(
  '/transactions/import/template-employees',
  requirePermission('production.correct'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const referenceDate = z
        .string()
        .date()
        .parse(req.query.businessDate ?? businessDate())
      if (referenceDate > businessDate()) {
        throw new ApiError(
          422,
          'Tanggal referensi template tidak boleh lebih dari hari ini.'
        )
      }
      const scope = scopeWhere(auth, 'site.code')
      const [counts] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT employee.id) total
           FROM employees employee
           JOIN employee_employment_histories history
             ON history.employee_id=employee.id
            AND history.effective_from<=?
            AND (history.effective_to IS NULL OR history.effective_to>=?)
           JOIN employee_statuses status
             ON status.id=history.employee_status_id
            AND status.allows_production=1
           JOIN employee_types type
             ON type.id=history.employee_type_id
            AND type.payroll_basis='PIECE_RATE'
           JOIN sites site ON site.id=history.site_id AND site.is_active=1
          WHERE ${scope.sql}`,
        [referenceDate, referenceDate, ...scope.params]
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT DISTINCT employee.employee_number employeeNumber,
                         employee.full_name employeeName
           FROM employees employee
           JOIN employee_employment_histories history
             ON history.employee_id=employee.id
            AND history.effective_from<=?
            AND (history.effective_to IS NULL OR history.effective_to>=?)
           JOIN employee_statuses status
             ON status.id=history.employee_status_id
            AND status.allows_production=1
           JOIN employee_types type
             ON type.id=history.employee_type_id
            AND type.payroll_basis='PIECE_RATE'
           JOIN sites site ON site.id=history.site_id AND site.is_active=1
          WHERE ${scope.sql}
          ORDER BY employee.full_name,employee.employee_number
          LIMIT ${PRODUCTION_IMPORT_MAX_ROWS}`,
        [referenceDate, referenceDate, ...scope.params]
      )
      res.json({
        data: rows.map((row) => ({
          employeeNumber: String(row.employeeNumber),
          employeeName: String(row.employeeName),
        })),
        qcOptions: await productionImportTemplateQcOptions(auth),
        meta: {
          total: Number(counts[0]?.total ?? 0),
          limit: PRODUCTION_IMPORT_MAX_ROWS,
          referenceDate,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

async function productionImportTemplateQcOptions(auth: AuthContext) {
  const scope = scopeWhere(auth, 'site.code')
  const [brands] = await pool.query<RowDataPacket[]>(
    `SELECT brand.uid,brand.code,brand.name,brand.sort_order sortOrder,site.code siteCode,site.name siteName
      FROM production_brands brand JOIN sites site ON site.id=brand.site_id
      WHERE brand.is_active=1 AND site.is_active=1 AND ${scope.sql}
      ORDER BY site.code,brand.sort_order,brand.id`,scope.params)
  const [defects] = await pool.query<RowDataPacket[]>(
    `SELECT uid,code,name,sort_order sortOrder FROM production_defects WHERE is_active=1 ORDER BY sort_order,id`)
  return {brands:brands.map(row => ({uid:String(row.uid),code:String(row.code),name:String(row.name),sortOrder:Number(row.sortOrder),
    site:{code:String(row.siteCode),name:String(row.siteName)}})),defects:defects.map(row => ({uid:String(row.uid),code:String(row.code),name:String(row.name),sortOrder:Number(row.sortOrder)}))}
}

productionTransactionsRouter.post(
  '/transactions/import',
  requirePermission('production.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const input = productionImportPostInput.parse(req.body)
      const rowKeys = input.rows.map(
        (row) => `PRD-IMPORT-${input.idempotencyKey}-${row.rowNumber}`
      )
      await conn.beginTransaction()
      const [existing] = await conn.query<RowDataPacket[]>(
        `SELECT transaction.id,transaction.idempotency_key idempotencyKey,
                transaction.entry_source entrySource,
                DATE_FORMAT(transaction.business_date,'%Y-%m-%d') businessDate,
                transaction.quantity,transaction.notes,
                employee.employee_number employeeNumber,
                unit.decimal_precision decimalPrecision
           FROM production_transactions transaction
           JOIN employees employee ON employee.id=transaction.employee_id
           JOIN work_units unit ON unit.id=transaction.unit_id
          WHERE transaction.idempotency_key IN (${rowKeys.map(() => '?').join(',')})
          FOR UPDATE`,
        rowKeys
      )
      if (existing.length) {
        if (existing.length !== rowKeys.length) {
          throw new ApiError(
            409,
            'Import sebelumnya hanya tersimpan sebagian. Hubungi administrator sebelum mencoba kembali.'
          )
        }
        const existingByKey = new Map(
          existing.map((row) => [String(row.idempotencyKey), row])
        )
        const payloadMatches = input.rows.every((row, index) => {
          const stored = existingByKey.get(rowKeys[index])
          if (!stored) return false
          try {
            return (
              String(stored.entrySource) === 'HISTORICAL' &&
              String(stored.businessDate) === row.businessDate &&
              String(stored.employeeNumber) === row.employeeNumber &&
              normalizeStoredDecimal(stored.quantity) ===
                normalizeQuantity(row.quantity, Number(stored.decimalPrecision)) &&
              String(stored.notes ?? '') === `Import Excel: ${input.reason}`
            )
          } catch {
            return false
          }
        })
        if (!payloadMatches) {
          throw new ApiError(
            409,
            'Kunci import sudah digunakan untuk isi file atau alasan yang berbeda.'
          )
        }
        await assertProductionImportQcReplay(conn, input.rows.map((row,index) => ({transactionId: Number(existingByKey.get(rowKeys[index])!.id),qc:row.qc})))
        await conn.commit()
        return res.json({
          data: {
            total: input.rows.length,
            imported: 0,
            replayed: input.rows.length,
          },
        })
      }

      const validation = await validateProductionImportRows(
        conn,
        input.rows,
        auth,
        true
      )
      const invalid = validation.filter((row) => !row.valid)
      if (invalid.length) {
        throw new ApiError(
          422,
          `Import dibatalkan: ${invalid.length} baris tidak lagi valid. Muat ulang preview.`
        )
      }
      const validRows = validation.filter(
        (row): row is ValidProductionImportRow => row.valid
      )
      const time = await currentServerTime(conn)
      const inserted: Array<{
        id: number
        uid: string
        rowKey: string
        row: ValidProductionImportRow
      }> = []
      const dailyGroups = new Map<string, DailyProductionKey>()

      const pendingRows = validRows.map((row, index) => {
        const proposal = row.proposal
        return {
          row,
          rowKey: rowKeys[index],
          uid: randomUUID(),
          transactionNumber: `PRD-IMP-${row.input.businessDate.replaceAll('-', '')}-${String(proposal.history.site)}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
        }
      })

      for (let offset = 0; offset < pendingRows.length; offset += 250) {
        const chunk = pendingRows.slice(offset, offset + 250)
        const placeholders = chunk.map(() =>
          `(?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,'POSTED','HISTORICAL',?,?,?,?)`
        ).join(',')
        const params = chunk.flatMap(({ row, rowKey, uid, transactionNumber }) => {
          const proposal = row.proposal
          return [
            uid,
            transactionNumber,
            proposal.employee.id,
            proposal.site.id,
            proposal.history.workGroupId ?? null,
            proposal.history.productionSectionId ?? null,
            proposal.targetIds.jobId,
            proposal.targetIds.unitId,
            proposal.targetIds.rateId,
            proposal.attendance.id,
            row.input.businessDate,
            time.transactionTimestamp,
            proposal.proposed.quantity,
            proposal.proposed.rateSnapshot,
            proposal.proposed.quantity,
            proposal.proposed.grossAmount,
            rowKey,
            `Import Excel: ${input.reason}`,
            auth.id,
            auth.id,
          ]
        })
        await conn.execute(
          `INSERT INTO production_transactions(
             uid,transaction_number,employee_id,site_id,work_group_id,production_section_id,
             production_job_id,unit_id,job_rate_id,attendance_record_id,
             scan_device_id,business_date,transaction_at,quantity,rate_snapshot,
             payable_quantity,gross_amount,status,entry_source,idempotency_key,notes,created_by,updated_by
           ) VALUES ${placeholders}`,
          params
        )
        const [insertedRows] = await conn.query<RowDataPacket[]>(
          `SELECT id,uid,idempotency_key rowKey
             FROM production_transactions
            WHERE idempotency_key IN (${chunk.map(() => '?').join(',')})
            FOR UPDATE`,
          chunk.map((item) => item.rowKey)
        )
        const insertedByKey = new Map(
          insertedRows.map((item) => [String(item.rowKey), item])
        )
        for (const item of chunk) {
          const stored = insertedByKey.get(item.rowKey)
          if (!stored) {
            throw new ApiError(500, 'Transaksi hasil import tidak dapat diverifikasi.')
          }
          inserted.push({
            id: Number(stored.id),
            uid: String(stored.uid),
            rowKey: item.rowKey,
            row: item.row,
          })
        }
      }

      await saveProductionImportQc(conn, inserted.map(item => ({transactionId:item.id,qc:item.row.qc ?? null})), auth.id)
      for (const row of validRows) {
        const proposal = row.proposal
        const dailyKey = {
          employeeId: Number(proposal.employee.id),
          siteId: Number(proposal.site.id),
          jobId: proposal.targetIds.jobId,
          businessDate: row.input.businessDate,
        }
        dailyGroups.set(
          [
            dailyKey.employeeId,
            dailyKey.siteId,
            dailyKey.jobId,
            dailyKey.businessDate,
          ].join('|'),
          dailyKey
        )
      }

      const repricingContext: RepricingContext = {
        lockedEmployees: new Set(),
        tiersByRate: new Map(),
        newTransactionIds:new Set(inserted.map(row=>row.id)),
      }
      for (const dailyKey of dailyGroups.values()) {
        await repriceProductionDay(conn, dailyKey, auth, req, repricingContext)
      }
      const [auditRows] = await conn.query<RowDataPacket[]>(
        `SELECT id,uid,transaction_number transactionNumber,
                gross_amount grossAmount,idempotency_key rowKey
           FROM production_transactions
          WHERE idempotency_key IN (${rowKeys.map(() => '?').join(',')})
          FOR UPDATE`,
        rowKeys
      )
      const auditByKey = new Map(
        auditRows.map((row) => [String(row.rowKey), row])
      )
      const auditEntries: ProductionImportAuditEntry[] = []
      for (const item of inserted) {
        const transaction = auditByKey.get(item.rowKey)
        if (!transaction) {
          throw new ApiError(500, 'Transaksi hasil import tidak dapat dimuat untuk audit.')
        }
        auditEntries.push({
          siteId: Number(item.row.proposal.site.id),
          recordId: item.id,
          recordUid: item.uid,
          description: `Mengimpor setoran Produksi ${transaction.transactionNumber}.`,
          afterData: {
            batchKey: input.idempotencyKey,
            rowNumber: item.row.input.rowNumber,
            businessDate: item.row.input.businessDate,
            employeeNumber: item.row.input.employeeNumber,
            quantity: item.row.proposal.proposed.quantity,
            job: item.row.proposal.proposed.job,
            grossAmount: transaction.grossAmount,
            ...(item.row.input.qc ? { qc: item.row.input.qc } : {}),
          },
        })
      }
      await writeProductionImportAudits(conn, auth, req, input.reason, auditEntries)
      await conn.commit()
      res.status(201).json({
        data: {
          total: inserted.length,
          imported: inserted.length,
          replayed: 0,
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
      await resolveProductionQc(conn,input.qc,Number(proposal.site.id),String(proposal.proposed.job.code))
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
        await assertProductionQcReplay(conn,Number(existing.id),input.qc)
        await conn.commit()
        return res.json({ duplicate: true, message: 'Setoran susulan sebelumnya dikembalikan.', transaction: await transactionResponse(conn, Number(existing.id)) })
      }
      const proposal = await historicalProposal(conn, input, true)
      const payrollLock = await payrollDateLockContext(conn, Number(proposal.site.id), input.businessDate, true)
      if (payrollLock.locked) throw new ApiError(409, payrollLock.reasons[0])
      const uid = randomUUID()
      const transactionNumber = `PRD-MAN-${input.businessDate.replaceAll('-','')}-${input.site}-${randomUUID().replaceAll('-','').slice(0,8).toUpperCase()}`
      const qc = await resolveProductionQc(conn,input.qc,Number(proposal.site.id),String(proposal.proposed.job.code),true)
      const [insertResult] = await conn.execute(
        `INSERT INTO production_transactions(
           uid,transaction_number,employee_id,site_id,work_group_id,production_section_id,production_job_id,
           unit_id,job_rate_id,attendance_record_id,scan_device_id,business_date,
           transaction_at,quantity,rate_snapshot,payable_quantity,gross_amount,status,entry_source,
           idempotency_key,notes,created_by,updated_by
         ) VALUES(?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,'POSTED','HISTORICAL',?,?,?,?)`,
        [uid,transactionNumber,proposal.employee.id,proposal.site.id,proposal.history.workGroupId ?? null,
         proposal.history.productionSectionId??null,proposal.targetIds.jobId,proposal.targetIds.unitId,proposal.targetIds.rateId,proposal.attendance.id,
         input.businessDate,time.transactionTimestamp,proposal.proposed.quantity,proposal.proposed.rateSnapshot,
         proposal.proposed.quantity,proposal.proposed.grossAmount,input.idempotencyKey,`Setoran susulan: ${input.reason}`,auth.id,auth.id]
      )
      const transactionId = Number((insertResult as { insertId?: number }).insertId ?? 0)
      await saveProductionQc(conn,transactionId,qc,auth.id)
      await repriceProductionDay(conn, {
        employeeId: Number(proposal.employee.id), siteId: Number(proposal.site.id),
        jobId: proposal.targetIds.jobId, businessDate: input.businessDate,
      }, auth, req,{lockedEmployees:new Set(),tiersByRate:new Map(),newTransactionIds:new Set([transactionId])})
      const pricedTransaction = await transactionResponse(conn, transactionId)
      await writeAudit({ auth,request:req,module:'PRODUCTION',siteId:Number(proposal.site.id),action:'CREATE',table:'production_transactions',recordId:transactionId,recordUid:uid,description:`Mencatat setoran susulan ${transactionNumber}.`,reason:input.reason,afterData:{...input,quantity:proposal.proposed.quantity,rateSnapshot:proposal.proposed.rateSnapshot,grossAmount:pricedTransaction.grossAmount} },conn)
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
      const { proposed, targetIds } = await correctionProposal(
        conn,
        target.transaction,
        input.jobUid,
        input.quantity,
        false,
        target.employeeChanged
      )
      const sourceKey = {
        employeeId:Number(source.employee_id),siteId:Number(source.site_id),
        jobId:Number(source.production_job_id),businessDate:String(source.businessDateKey),
      }
      const targetKey = {
        employeeId:Number(target.transaction.employee_id),siteId:Number(source.site_id),
        jobId:targetIds.jobId,businessDate:String(source.businessDateKey),
      }
      const replacement = {
        id:Number.MAX_SAFE_INTEGER,rateId:targetIds.rateId,
        quantity:proposed.quantity,transactionAt:String(source.transactionTimestamp),
        jobCode:String(proposed.job.code),decimalPrecision:proposed.unit.decimalPrecision,
      }
      const sameGroup = sourceKey.employeeId===targetKey.employeeId
        && sourceKey.jobId===targetKey.jobId
      const sourceImpact = await previewDailyRepricing(
        conn,sourceKey,Number(source.id),sameGroup ? replacement : undefined
      )
      const targetImpact = sameGroup ? null
        : await previewDailyRepricing(conn,targetKey,undefined,replacement)
      const grossDelta=sourceImpact.after-sourceImpact.before
        +(targetImpact ? targetImpact.after-targetImpact.before : 0n)
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
          grossAmount: centsAmount(grossDelta),
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
      const impact = await previewDailyRepricing(conn,{
        employeeId:Number(source.employee_id),siteId:Number(source.site_id),
        jobId:Number(source.production_job_id),businessDate:String(source.businessDateKey),
      },Number(source.id))
      res.json({
        source: await transactionResponse(conn, Number(source.id)),
        impact: {
          quantity: `-${normalizeStoredDecimal(source.quantity)}`,
          grossAmount: centsAmount(impact.after-impact.before),
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
           uid,transaction_number,employee_id,site_id,work_group_id,production_section_id,
           production_job_id,unit_id,job_rate_id,attendance_record_id,
           scan_device_id,business_date,transaction_at,quantity,rate_snapshot,
           payable_quantity,gross_amount,status,entry_source,notes,created_by,updated_by
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'POSTED','CORRECTION',?,?,?)`,
        [
          replacementUid,
          replacementNumber,
          target.transaction.employee_id,
          source.site_id,
          target.transaction.work_group_id ?? null,
          target.transaction.production_section_id ?? null,
          targetIds.jobId,
          targetIds.unitId,
          targetIds.rateId,
          target.transaction.attendance_record_id,
          source.scan_device_id ?? null,
          source.businessDateKey,
          source.transactionTimestamp,
          proposed.quantity,
          proposed.rateSnapshot,
          proposed.quantity,
          proposed.grossAmount,
          `Koreksi dari ${source.transaction_number}: ${input.reason}`,
          auth.id,
          auth.id,
        ]
      )
      const replacementId = Number(
        (insertResult as { insertId?: number }).insertId ?? 0
      )
      await cloneProductionQc(conn, Number(source.id), replacementId, String(proposed.job.code), auth.id)
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
      const sourceKey = {
        employeeId: Number(source.employee_id), siteId: Number(source.site_id),
        jobId: Number(source.production_job_id), businessDate: String(source.businessDateKey),
      }
      const targetKey = {
        employeeId: Number(target.transaction.employee_id), siteId: Number(source.site_id),
        jobId: targetIds.jobId, businessDate: String(source.businessDateKey),
      }
      const sameGroup=sourceKey.employeeId===targetKey.employeeId && sourceKey.jobId===targetKey.jobId
      const repricingContext:RepricingContext={lockedEmployees:new Set(),tiersByRate:new Map(),newTransactionIds:new Set([replacementId]),
        deductionSnapshot:sameGroup ? storedDeduction({productionSectionId:source.production_section_id,deductionPolicyId:source.quantity_deduction_policy_id,deductionPercentage:source.quantity_deduction_percentage} as RowDataPacket) : undefined}
      await repriceProductionDay(conn, sourceKey, auth, req,repricingContext)
      if (sourceKey.employeeId !== targetKey.employeeId || sourceKey.jobId !== targetKey.jobId) {
        await repriceProductionDay(conn, targetKey, auth, req,repricingContext)
      }
      const pricedReplacement = await transactionResponse(conn, replacementId)
      after.grossAmount = pricedReplacement.grossAmount
      after.deductionPercentage=pricedReplacement.deductionPercentage
      after.deductionQuantity=pricedReplacement.deductionQuantity
      after.payableQuantity=pricedReplacement.payableQuantity
      await conn.execute(
        'UPDATE production_transaction_revisions SET after_data=? WHERE uid=?',
        [JSON.stringify(after),revisionUid]
      )
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
      await repriceProductionDay(conn, {
        employeeId: Number(source.employee_id), siteId: Number(source.site_id),
        jobId: Number(source.production_job_id), businessDate: String(source.businessDateKey),
      }, auth, req)
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

productionTransactionsRouter.get('/transactions/module-options', requirePermission('production.view'), async (req,res,next) => {
  try {
    const auth=res.locals.auth as AuthContext
    const scope=scopeWhere(auth)
    const sites=csvValues(req.query.site)
    if (sites.some(site => !allowedSites.includes(site as never))) throw new ApiError(422,'Filter site tidak valid.')
    sites.forEach(site => enforceSite(auth,site))
    const [rows]=await pool.query<RowDataPacket[]>(
      `SELECT module.uid,module.name,s.code site,s.name siteName
        FROM production_modules module JOIN sites s ON s.id=module.site_id
       WHERE ${scope.sql} ${sites.length ? `AND s.code IN (${sites.map(() => '?').join(',')})` : ''}
       ORDER BY s.name,module.name,module.id`, [...scope.params,...sites]
    )
    res.json({items:rows.map(row => ({uid:row.uid,name:row.name,site:row.site,siteName:row.siteName}))})
  } catch(error) {next(error)}
})

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
      const moduleUids = csvValues(req.query.moduleUid)
      const employeeTypes = csvValues(req.query.employeeType)
      let hasHistoryStatus: boolean | undefined
      if (employeeTypes.some(type => !['BORONGAN','HARIAN','BULANAN','TRAINING'].includes(type))) {
        throw new ApiError(422, 'Filter jenis karyawan tidak valid.')
      }
      if (moduleUids.length || employeeTypes.length) {
        if (moduleUids.some((uid) => !z.string().uuid().safeParse(uid).success)) {
          throw new ApiError(422, 'Filter modul Produksi tidak valid.')
        }
        const [columns] = await pool.query<RowDataPacket[]>(
          `SELECT COUNT(*) hasHistoryStatus FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employee_employment_histories' AND COLUMN_NAME='status'`
        )
        const hasStatus = Number(columns[0]?.hasHistoryStatus)>0
        hasHistoryStatus = hasStatus
        // Historical placement, not the employee's current module. EXISTS
        // avoids duplicating transaction totals when joining employment data.
        where.push(`EXISTS (
          SELECT 1 FROM employee_employment_histories module_history
          LEFT JOIN production_module_sections module_mapping ON module_mapping.id=module_history.production_module_section_id
          LEFT JOIN production_modules module ON module.id=module_mapping.production_module_id
          JOIN employee_types historical_type ON historical_type.id=module_history.employee_type_id
          WHERE module_history.employee_id=pt.employee_id AND module_history.site_id=pt.site_id
            AND module_history.effective_from<=pt.business_date
            AND (module_history.effective_to IS NULL OR module_history.effective_to>=pt.business_date)
            ${hasStatus ? "AND module_history.status='ACTIVE'" : ''}
            ${moduleUids.length ? `AND module.uid IN (${moduleUids.map(() => '?').join(',')})` : ''}
            ${employeeTypes.length ? `AND historical_type.code IN (${employeeTypes.map(() => '?').join(',')})` : ''}
            AND NOT EXISTS (
              SELECT 1 FROM employee_employment_histories conflicting_history
              WHERE conflicting_history.employee_id=module_history.employee_id AND conflicting_history.id<>module_history.id
                AND conflicting_history.effective_from<=pt.business_date
                AND (conflicting_history.effective_to IS NULL OR conflicting_history.effective_to>=pt.business_date)
                ${hasStatus ? "AND conflicting_history.status='ACTIVE'" : ''}
            )
        )`)
        values.push(...moduleUids)
        values.push(...employeeTypes)
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
                COALESCE(SUM(pt.quantity),0) quantity,
                COALESCE(SUM(pt.deducted_quantity),0) deductionQuantity,
                COALESCE(SUM(pt.payable_quantity),0) payableQuantity
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
        deductionQuantity: normalizeStoredDecimal(row.deductionQuantity),
        payableQuantity: normalizeStoredDecimal(row.payableQuantity),
      }))
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT pt.id,pt.uid,pt.transaction_number transactionNumber,
                DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDate,
                DATE_FORMAT(pt.transaction_at,'%Y-%m-%dT%H:%i:%s+07:00') transactionAt,
                pt.quantity,pt.quantity_deduction_percentage deductionPercentage,
                pt.deducted_quantity deductionQuantity,
                pt.payable_quantity payableQuantity,
                pt.rate_snapshot rateSnapshot,pt.gross_amount grossAmount,
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
      const transactionIds = rows.map(row => Number(row.id))
      const qcByTransaction = await readProductionQcBatch(pool, transactionIds)
      const modulesByTransaction = new Map<number, {uid:string;code:string;name:string}>()
      if (transactionIds.length) {
        if (hasHistoryStatus === undefined) {
          const [columns] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) hasHistoryStatus FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employee_employment_histories' AND COLUMN_NAME='status'`
          )
          hasHistoryStatus = Number(columns[0]?.hasHistoryStatus)>0
        }
        const [moduleRows] = await pool.query<RowDataPacket[]>(
          `SELECT pt.id transactionId,module.uid,module.code,module.name
           FROM production_transactions pt
           JOIN employee_employment_histories module_history ON module_history.employee_id=pt.employee_id
             AND module_history.site_id=pt.site_id AND module_history.effective_from<=pt.business_date
             AND (module_history.effective_to IS NULL OR module_history.effective_to>=pt.business_date)
             ${hasHistoryStatus ? "AND module_history.status='ACTIVE'" : ''}
           JOIN production_module_sections module_mapping ON module_mapping.id=module_history.production_module_section_id
           JOIN production_modules module ON module.id=module_mapping.production_module_id
           WHERE pt.id IN (${transactionIds.map(() => '?').join(',')})
             AND NOT EXISTS (
               SELECT 1 FROM employee_employment_histories conflicting_history
               WHERE conflicting_history.employee_id=module_history.employee_id AND conflicting_history.id<>module_history.id
                 AND conflicting_history.effective_from<=pt.business_date
                 AND (conflicting_history.effective_to IS NULL OR conflicting_history.effective_to>=pt.business_date)
                 ${hasHistoryStatus ? "AND conflicting_history.status='ACTIVE'" : ''}
             )`,
          transactionIds
        )
        for (const row of moduleRows) modulesByTransaction.set(Number(row.transactionId), {uid:String(row.uid),code:String(row.code),name:String(row.name)})
      }
      res.json({
        items: rows.map((row) => ({
          uid: row.uid,
          transactionNumber: row.transactionNumber,
          businessDate: row.businessDate,
          transactionAt: row.transactionAt,
          status: row.status,
          productionModule: modulesByTransaction.get(Number(row.id)) ?? null,
          qc: qcByTransaction.get(Number(row.id)) ?? null,
          quantity: normalizeStoredDecimal(row.quantity),
          deductionPercentage: normalizeStoredDecimal(row.deductionPercentage),
          deductionQuantity: normalizeStoredDecimal(row.deductionQuantity),
          payableQuantity: normalizeStoredDecimal(row.payableQuantity),
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
