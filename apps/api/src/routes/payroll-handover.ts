import { createHash } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  buildPayrollHandoverWorkbook,
  composePayrollHandover,
  UNASSIGNED_MODULE_UID,
  type HandoverDailyAmount,
  type HandoverEmployee,
  type HandoverRun,
} from '../lib/payroll-handover.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const uid = z.string().uuid()
const moduleUid = z.union([uid, z.literal(UNASSIGNED_MODULE_UID)])
const printInput = z.object({
  moduleUid,
  sectionUid: uid,
  foremanName: z.string().trim().min(1).max(150),
  handoverDate: z.iso.date(),
  idempotencyKey: uid,
}).strict()
const exportInput = z.object({
  moduleUid: moduleUid.optional(),
  sectionUid: uid.optional(),
  foremanName: z.string().trim().min(1).max(150).optional(),
  handoverDate: z.iso.date(),
  idempotencyKey: uid,
}).strict()

function canViewSite(auth: AuthContext, siteCode: string) {
  return auth.roles.includes('SUPER_ADMIN') ||
    auth.roles.includes('DIRECTOR') ||
    auth.siteAccess.includes(siteCode)
}

async function loadHandoverRun(auth: AuthContext, runUid: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT pr.id runId,pr.uid,pr.run_number runNumber,
            pr.run_type runType,pr.status runStatus,
            pp.id periodId,pp.period_code periodCode,pp.period_name periodName,
            DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
            DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,
            pp.status periodStatus,pp.current_run_id currentRunId,
            pp.employee_type_code employeeType,pp.payroll_basis payrollBasis,
            s.id siteId,s.code siteCode,s.name siteName
       FROM payroll_runs pr
       JOIN payroll_periods pp ON pp.id=pr.payroll_period_id
       JOIN sites s ON s.id=pp.site_id
      WHERE pr.uid=?`,
    [runUid]
  )
  const row = rows[0]
  if (!row) throw new ApiError(404, 'Run Payroll tidak ditemukan.')
  if (!canViewSite(auth, String(row.siteCode))) {
    throw new ApiError(403, 'Akses site Payroll ditolak.')
  }
  if (row.runStatus !== 'COMPLETED' ||
      !['CALCULATED', 'APPROVED', 'CLOSED'].includes(String(row.periodStatus))) {
    throw new ApiError(409, 'Lembar serah terima hanya tersedia dari run yang selesai dihitung.')
  }
  if (row.employeeType !== 'BORONGAN' || row.payrollBasis !== 'PIECE_RATE') {
    throw new ApiError(409, 'Lembar serah terima harian saat ini hanya tersedia untuk Payroll Borongan.')
  }
  return row
}

async function loadPreview(auth: AuthContext, runUid: string, selectedModuleUid?: string, selectedSectionUid?: string) {
  const row = await loadHandoverRun(auth, runUid)
  const [employeeRows] = await pool.query<RowDataPacket[]>(
    `SELECT CAST(result.id AS CHAR) resultId,e.uid employeeUid,
            result.employee_number_snapshot employeeNumber,
            result.employee_name_snapshot fullName,
            result.employee_type_snapshot employeeType,
            result.work_group_name_snapshot workGroupName,
            pm.uid moduleUid,pm.name moduleName,
            ps.uid sectionUid,ps.name sectionName,
            result.piece_rate_amount pieceRateAmount,
            result.additional_earnings additionalEarnings,
            result.total_deductions totalDeductions,
            result.net_pay netPay,
            bpjs.total_employee_deduction bpjsEmployeeDeduction
       FROM payroll_employee_results result
       JOIN employees e ON e.id=result.employee_id
       LEFT JOIN employee_employment_histories history ON history.id=(
         SELECT latest.id FROM employee_employment_histories latest
          WHERE latest.employee_id=result.employee_id
            AND latest.site_id=result.site_id
            AND latest.effective_from<=?
            AND (latest.effective_to IS NULL OR latest.effective_to>=?)
          ORDER BY latest.effective_from DESC,latest.id DESC LIMIT 1
       )
       LEFT JOIN production_module_sections pms
         ON pms.id=history.production_module_section_id
       LEFT JOIN production_modules pm
         ON pm.id=pms.production_module_id AND pm.site_id=result.site_id
       LEFT JOIN production_sections ps
         ON ps.id=pms.production_section_id
       LEFT JOIN payroll_employee_bpjs_details bpjs
         ON bpjs.payroll_employee_result_id=result.id
      WHERE result.payroll_run_id=?
      ORDER BY result.employee_name_snapshot,result.employee_number_snapshot,result.id`,
    [row.periodEnd, row.periodStart, row.runId]
  )
  const [dailyRows] = await pool.query<RowDataPacket[]>(
    `SELECT CAST(detail.payroll_employee_result_id AS CHAR) resultId,
            DATE_FORMAT(detail.business_date,'%Y-%m-%d') businessDate,
            SUM(detail.amount_snapshot) amount
       FROM payroll_production_details detail
       JOIN payroll_employee_results result
         ON result.id=detail.payroll_employee_result_id
      WHERE result.payroll_run_id=?
      GROUP BY detail.payroll_employee_result_id,detail.business_date`,
    [row.runId]
  )
  const [settingRows] = await pool.query<RowDataPacket[]>(
    `SELECT setting_value settingValue FROM system_settings
      WHERE site_id IS NULL AND setting_key='payroll.handover.foremen' LIMIT 1`
  )
  const settingValue = settingRows[0]?.settingValue
  const decoded = typeof settingValue === 'string' ? JSON.parse(settingValue) : settingValue
  const foremen = settingValue === undefined ? [] : z.array(z.string().trim().min(1).max(150)).parse(decoded)
  const run: HandoverRun = {
    uid: String(row.uid),
    periodCode: String(row.periodCode),
    periodName: String(row.periodName),
    periodStart: String(row.periodStart),
    periodEnd: String(row.periodEnd),
    siteName: String(row.siteName),
    employeeType: String(row.employeeType),
    status: 'COMPLETED',
    runType: row.runType as HandoverRun['runType'],
    runNumber: Number(row.runNumber),
    isCurrent: Number(row.currentRunId) === Number(row.runId),
    periodStatus: row.periodStatus as HandoverRun['periodStatus'],
  }
  const preview = composePayrollHandover({
    run,
    employees: employeeRows as HandoverEmployee[],
    dailyAmounts: dailyRows as HandoverDailyAmount[],
    moduleUid: selectedModuleUid,
    sectionUid: selectedSectionUid,
    foremen,
  })
  return { row, preview }
}

async function recordOutput(input: {
  auth: AuthContext
  request: Parameters<typeof writeAudit>[0]['request']
  row: RowDataPacket
  kind: 'PRINT' | 'EXPORT'
  idempotencyKey: string
  moduleUid?: string
  sectionUid?: string
  foremanName?: string
  handoverDate: string
  rowCount: number
  checksum?: string
}) {
  const payloadHash = createHash('sha256').update(JSON.stringify({
    runUid: input.row.uid,
    kind: input.kind,
    moduleUid: input.moduleUid,
    sectionUid: input.sectionUid,
    foremanName: input.foremanName,
    handoverDate: input.handoverDate,
  })).digest('hex')
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [locked] = await conn.query<RowDataPacket[]>(
      `SELECT pp.current_run_id currentRunId,pp.status periodStatus,pr.status runStatus
         FROM payroll_runs pr JOIN payroll_periods pp ON pp.id=pr.payroll_period_id
        WHERE pr.id=? FOR UPDATE`,
      [input.row.runId]
    )
    if (!locked[0] || locked[0].runStatus !== 'COMPLETED' ||
      !['CALCULATED','APPROVED','CLOSED'].includes(String(locked[0].periodStatus))) {
      throw new ApiError(409, 'Run tidak lagi tersedia untuk serah terima. Buka kembali pratinjau.')
    }
    const [existing] = await conn.query<RowDataPacket[]>(
      `SELECT action,after_data afterData FROM audit_logs
        WHERE request_id=? AND module='PAYROLL' AND table_name='payroll_runs'
        ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [input.idempotencyKey]
    )
    if (existing[0]) {
      const stored = typeof existing[0].afterData === 'string'
        ? JSON.parse(existing[0].afterData) as { payloadHash?: string }
        : existing[0].afterData as { payloadHash?: string }
      if (existing[0].action !== input.kind || stored?.payloadHash !== payloadHash) {
        throw new ApiError(409, 'Kunci permintaan sudah dipakai untuk dokumen berbeda.')
      }
    } else {
      await writeAudit({
        auth: input.auth,
        request: input.request,
        module: 'PAYROLL',
        siteId: Number(input.row.siteId),
        action: input.kind,
        table: 'payroll_runs',
        recordId: Number(input.row.runId),
        recordUid: String(input.row.uid),
        description: input.kind === 'PRINT'
          ? 'Menerbitkan lembar serah terima upah untuk dicetak.'
          : 'Mengunduh Excel serah terima upah.',
        afterData: {
          documentType: 'WAGE_HANDOVER',
          payloadHash,
          employeeCount: input.rowCount,
          ...(input.checksum ? { checksumSha256: input.checksum } : {}),
        },
        requestId: input.idempotencyKey,
      }, conn)
    }
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export const payrollHandoverRouter = Router()
payrollHandoverRouter.use(authenticate)
payrollHandoverRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  next()
})

payrollHandoverRouter.get('/runs/:runUid/handover-preview',
  requirePermission('payroll.view'), async (req, res, next) => {
    try {
      const query = z.object({ moduleUid: moduleUid.optional(), sectionUid: uid.optional() }).parse(req.query)
      const { preview } = await loadPreview(res.locals.auth as AuthContext,
        uid.parse(req.params.runUid), query.moduleUid, query.sectionUid)
      res.json({ data: preview })
    } catch (error) { next(error) }
  }
)

payrollHandoverRouter.post('/runs/:runUid/handover-print',
  requirePermission('payroll.print'), async (req, res, next) => {
    try {
      const input = printInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const { row, preview } = await loadPreview(auth, uid.parse(req.params.runUid), input.moduleUid, input.sectionUid)
      if (!preview.foremen.includes(input.foremanName)) throw new ApiError(422, 'Mandor tidak tersedia pada pengaturan.')
      if (!preview.rows.length) throw new ApiError(422, 'Tidak ada karyawan untuk bagian dan modul yang dipilih.')
      await recordOutput({ auth, request: req, row, kind: 'PRINT',
        idempotencyKey: input.idempotencyKey, moduleUid: input.moduleUid, sectionUid: input.sectionUid,
        foremanName: input.foremanName, handoverDate: input.handoverDate,
        rowCount: preview.rows.length })
      res.json({ data: { ready: true } })
    } catch (error) { next(error) }
  }
)

payrollHandoverRouter.post('/runs/:runUid/handover-export',
  requirePermission('payroll.export'), async (req, res, next) => {
    try {
      const input = exportInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const { row, preview } = await loadPreview(auth, uid.parse(req.params.runUid), input.moduleUid, input.sectionUid)
      if (input.foremanName && !preview.foremen.includes(input.foremanName)) throw new ApiError(422, 'Mandor tidak tersedia pada pengaturan.')
      const workbook = await buildPayrollHandoverWorkbook({
        preview, foremanName: input.foremanName, handoverDate: input.handoverDate,
      })
      await recordOutput({ auth, request: req, row, kind: 'EXPORT',
        idempotencyKey: input.idempotencyKey, moduleUid: input.moduleUid, sectionUid: input.sectionUid,
        foremanName: input.foremanName, handoverDate: input.handoverDate,
        rowCount: preview.rows.length,
        checksum: createHash('sha256').update(workbook).digest('hex') })
      const sectionName = preview.sections.find((section) => section.uid === input.sectionUid)?.name ?? 'semua-bagian'
      const sectionSlug = sectionName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const filename = `daftar-upah-skt-${sectionSlug}-${String(row.periodCode).toLowerCase().replace(/[^a-z0-9-]/g, '-')}.xlsx`
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(workbook)
    } catch (error) { next(error) }
  }
)
