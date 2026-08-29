import { randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { inspectPayrollRunIntegrity } from '../lib/payroll-approval.js'
import { ApiError } from '../lib/errors.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const uuid = z.string().uuid()
const idempotent = z.object({ idempotencyKey: uuid }).strict()
const submitInput = idempotent
  .extend({ notes: z.string().trim().max(500).optional() })
  .strict()
const reviewInput = idempotent
  .extend({ notes: z.string().trim().max(500).optional() })
  .strict()
const reasonInput = idempotent
  .extend({ reason: z.string().trim().min(5).max(500) })
  .strict()
const queueQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).default('PENDING'),
  siteCode: z.string().trim().max(20).optional(),
  query: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

type WorkflowAction = 'SUBMIT' | 'WITHDRAW' | 'APPROVE' | 'REJECT' | 'CLOSE'

function isSuper(auth: AuthContext) {
  return auth.roles.includes('SUPER_ADMIN')
}

function isGlobalViewer(auth: AuthContext) {
  return isSuper(auth) || auth.roles.includes('DIRECTOR')
}

function enforceSite(auth: AuthContext, siteCode: string) {
  if (!isGlobalViewer(auth) && !auth.siteAccess.includes(siteCode)) {
    throw new ApiError(403, 'Akses site Payroll ditolak.')
  }
}

function money(value: unknown) {
  const text = String(value ?? '0.00')
  const [integer, fraction = ''] = text.split('.')
  return `${integer}.${fraction.padEnd(2, '0').slice(0, 2)}`
}

function settingObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  try { return JSON.parse(String(value ?? '{}')) as Record<string, unknown> } catch { return {} }
}

async function snapshotCompanyAtClosing(
  conn: PoolConnection,
  periodId: number,
  auth: AuthContext
) {
  const [existing] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM payroll_period_company_snapshots WHERE payroll_period_id=? FOR UPDATE`,
    [periodId]
  )
  if (existing[0]) return
  const [settings] = await conn.query<RowDataPacket[]>(
    `SELECT setting_value settingValue FROM system_settings
      WHERE site_id IS NULL AND setting_key='company.profile' LIMIT 1 FOR UPDATE`
  )
  const profile = settingObject(settings[0]?.settingValue)
  const companyName = String(profile.companyName ?? '').trim()
  const legalAddress = String(profile.legalAddress ?? '').trim()
  if (!companyName || !legalAddress) {
    throw new ApiError(
      409,
      'Profil perusahaan wajib memiliki nama dan alamat sebelum Payroll ditutup.'
    )
  }
  const optional = (key: string) => {
    const value = String(profile[key] ?? '').trim()
    return value || null
  }
  await conn.execute(
    `INSERT INTO payroll_period_company_snapshots(
       uid,payroll_period_id,company_name,legal_address,phone,email,website,
       tax_number,logo_file_uid,snapshot_source,snapped_by,created_by,updated_by
     ) VALUES(?,?,?,?,?,?,?,?,?,'CLOSE',?,?,?)`,
    [randomUUID(),periodId,companyName,legalAddress,optional('phone'),optional('email'),
      optional('website'),optional('taxNumber'),optional('logoFileUid'),auth.id,auth.id,auth.id]
  )
}

const periodWorkflowProjection = `SELECT
  pp.id periodId,pp.uid periodUid,pp.status periodStatus,pp.current_run_id currentRunId,
  pp.payroll_basis payrollBasis,pp.pay_frequency payFrequency,
  pp.employee_type_code employeeTypeCode,
  policy_snapshot.policy_snapshot policySnapshot,
  pp.period_code periodCode,pp.period_name periodName,
  DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
  DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,
  s.id siteId,s.code siteCode,s.name siteName,
  run.id runId,run.uid runUid,run.run_number runNumber,run.status runStatus,
  run.run_type runType,run.employee_count employeeCount,
  run.calculated_by calculatedBy,
  run.total_piece_rate_amount totalPieceRateAmount,run.total_earnings totalEarnings,
  run.total_deductions totalDeductions,run.total_net_pay totalNetPay,
  approval.id approvalId,approval.uid approvalUid,approval.status approvalStatus,
  CONCAT(DATE_FORMAT(approval.requested_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') requestedAt,
  requester.full_name requestedByName,approval.requested_by requestedBy,
  IF(approval.reviewed_at IS NULL,NULL,CONCAT(DATE_FORMAT(approval.reviewed_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00')) reviewedAt,
  reviewer.full_name reviewedByName,approval.reviewed_by reviewedBy,approval.notes
 FROM payroll_periods pp
 JOIN sites s ON s.id=pp.site_id
 LEFT JOIN payroll_period_policy_snapshots policy_snapshot
   ON policy_snapshot.payroll_period_id=pp.id
 LEFT JOIN payroll_runs run ON run.id=pp.current_run_id AND run.payroll_period_id=pp.id
 LEFT JOIN payroll_approvals approval ON approval.payroll_run_id=run.id AND approval.approval_level=1
 LEFT JOIN users requester ON requester.id=approval.requested_by
 LEFT JOIN users reviewer ON reviewer.id=approval.reviewed_by`

async function findPeriod(
  conn: PoolConnection,
  auth: AuthContext,
  periodUid: string
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `${periodWorkflowProjection} WHERE pp.uid=? FOR UPDATE`,
    [periodUid]
  )
  const row = rows[0]
  if (!row) throw new ApiError(404, 'Periode Payroll tidak ditemukan.')
  enforceSite(auth, String(row.siteCode))
  return row
}

async function findApproval(
  conn: PoolConnection,
  auth: AuthContext,
  approvalUid: string
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT
       pp.id periodId,pp.uid periodUid,pp.status periodStatus,pp.current_run_id currentRunId,
       pp.payroll_basis payrollBasis,pp.pay_frequency payFrequency,
       pp.employee_type_code employeeTypeCode,
       policy_snapshot.policy_snapshot policySnapshot,
       pp.period_code periodCode,pp.period_name periodName,
       DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
       DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,
       s.id siteId,s.code siteCode,s.name siteName,
       run.id runId,run.uid runUid,run.run_number runNumber,run.status runStatus,
       run.run_type runType,run.employee_count employeeCount,
       run.calculated_by calculatedBy,
       run.total_piece_rate_amount totalPieceRateAmount,run.total_earnings totalEarnings,
       run.total_deductions totalDeductions,run.total_net_pay totalNetPay,
       approval.id approvalId,approval.uid approvalUid,approval.status approvalStatus,
       CONCAT(DATE_FORMAT(approval.requested_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') requestedAt,
       requester.full_name requestedByName,approval.requested_by requestedBy,
       IF(approval.reviewed_at IS NULL,NULL,CONCAT(DATE_FORMAT(approval.reviewed_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00')) reviewedAt,
       reviewer.full_name reviewedByName,approval.reviewed_by reviewedBy,approval.notes
     FROM payroll_approvals approval
     JOIN payroll_periods pp ON pp.id=approval.payroll_period_id
     LEFT JOIN payroll_period_policy_snapshots policy_snapshot
       ON policy_snapshot.payroll_period_id=pp.id
     JOIN sites s ON s.id=pp.site_id
     JOIN payroll_runs run ON run.id=approval.payroll_run_id
     LEFT JOIN users requester ON requester.id=approval.requested_by
     LEFT JOIN users reviewer ON reviewer.id=approval.reviewed_by
     WHERE approval.uid=? FOR UPDATE`,
    [approvalUid]
  )
  const row = rows[0]
  if (!row) throw new ApiError(404, 'Pengajuan Payroll tidak ditemukan.')
  enforceSite(auth, String(row.siteCode))
  return row
}

async function lockIntegritySources(conn: PoolConnection, row: RowDataPacket) {
  await conn.query(
    `SELECT id FROM production_transactions
      WHERE site_id=? AND business_date BETWEEN ? AND ? FOR UPDATE`,
    [row.siteId, row.periodStart, row.periodEnd]
  )
  await conn.query(
    `SELECT id FROM attendance_records
      WHERE site_id=? AND business_date BETWEEN ? AND ? FOR UPDATE`,
    [row.siteId, row.periodStart, row.periodEnd]
  )
  await conn.query(
    `SELECT manual.id FROM payroll_period_manual_components manual
      WHERE manual.payroll_period_id=? FOR UPDATE`,
    [row.periodId]
  )
  await conn.query(
    `SELECT recurring.id FROM employee_payroll_components recurring
      JOIN payroll_employee_results result ON result.employee_id=recurring.employee_id
     WHERE result.payroll_run_id=? AND recurring.effective_from<=?
       AND (recurring.effective_to IS NULL OR recurring.effective_to>=?) FOR UPDATE`,
    [row.runId, row.periodEnd, row.periodStart]
  )
  await conn.query(
    `SELECT employee.id FROM employees employee
      JOIN payroll_employee_results result ON result.employee_id=employee.id
     WHERE result.payroll_run_id=? FOR UPDATE`,
    [row.runId]
  )
  if (row.payrollBasis === 'TIME_BASED') {
    await conn.query(
      `SELECT history.id FROM employee_employment_histories history
        JOIN payroll_employee_results result ON result.employee_id=history.employee_id
       WHERE result.payroll_run_id=? AND history.site_id=?
         AND history.effective_from<=? AND (history.effective_to IS NULL OR history.effective_to>=?) FOR UPDATE`,
      [row.runId,row.siteId,row.periodEnd,row.periodStart]
    )
    await conn.query(
      `SELECT assignment.id FROM employee_shift_assignments assignment
        JOIN payroll_employee_results result ON result.employee_id=assignment.employee_id
       WHERE result.payroll_run_id=? AND assignment.effective_from<=?
         AND (assignment.effective_to IS NULL OR assignment.effective_to>=?) FOR UPDATE`,
      [row.runId,row.periodEnd,row.periodStart]
    )
    await conn.query(
      `SELECT id FROM attendance_calendar_events
        WHERE event_date BETWEEN ? AND ? AND cancelled_at IS NULL FOR UPDATE`,
      [row.periodStart,row.periodEnd]
    )
    await conn.query(
      `SELECT id FROM attendance_calendar_site_rules
        WHERE site_id=? AND business_date BETWEEN ? AND ? AND cancelled_at IS NULL FOR UPDATE`,
      [row.siteId,row.periodStart,row.periodEnd]
    )
    await conn.query(
      `SELECT id FROM payroll_period_policy_snapshots WHERE payroll_period_id=? FOR UPDATE`,
      [row.periodId]
    )
    if (row.employeeTypeCode === 'BULANAN') {
      await conn.query(
        `SELECT salary.id FROM employee_salary_histories salary
          JOIN payroll_employee_results result ON result.employee_id=salary.employee_id
         WHERE result.payroll_run_id=? AND salary.status='ACTIVE'
           AND salary.effective_from<=? AND (salary.effective_to IS NULL OR salary.effective_to>=?) FOR UPDATE`,
        [row.runId,row.periodEnd,row.periodStart]
      )
    } else {
      await conn.query(
        `SELECT rate.id FROM employee_daily_rate_histories rate
          JOIN payroll_employee_results result ON result.employee_id=rate.employee_id
         WHERE result.payroll_run_id=? AND rate.site_id=? AND rate.employee_type_code=?
           AND rate.status='ACTIVE' AND rate.effective_from<=?
           AND (rate.effective_to IS NULL OR rate.effective_to>=?) FOR UPDATE`,
        [row.runId,row.siteId,row.employeeTypeCode,row.periodEnd,row.periodStart]
      )
    }
  }
}

async function assertNoProcessingRun(conn: PoolConnection, periodId: number) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM payroll_runs
      WHERE payroll_period_id=? AND status='PROCESSING' LIMIT 1 FOR UPDATE`,
    [periodId]
  )
  if (rows[0])
    throw new ApiError(
      409,
      'Perhitungan Payroll masih berjalan. Tunggu sampai simulasi selesai.'
    )
}

async function replay(
  conn: PoolConnection,
  key: string,
  action: WorkflowAction,
  expected: { periodId?: number; approvalId?: number }
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id,action_type actionType,payroll_period_id periodId,
            payroll_approval_id approvalId
       FROM payroll_workflow_actions WHERE idempotency_key=? FOR UPDATE`,
    [key]
  )
  const row = rows[0]
  if (!row) return false
  if (
    row.actionType !== action ||
    (expected.periodId && Number(row.periodId) !== expected.periodId) ||
    (expected.approvalId && Number(row.approvalId) !== expected.approvalId)
  ) {
    throw new ApiError(
      409,
      'Idempotency key sudah digunakan untuk aksi Payroll yang berbeda.'
    )
  }
  return true
}

async function addAction(
  conn: PoolConnection,
  input: {
    periodId: number
    runId: number
    approvalId?: number | null
    action: WorkflowAction
    idempotencyKey: string
    reason?: string | null
    override?: boolean
    auth: AuthContext
  }
) {
  await conn.execute(
    `INSERT INTO payroll_workflow_actions(
       uid,payroll_period_id,payroll_run_id,payroll_approval_id,action_type,
       idempotency_key,reason,is_super_admin_override,performed_by,
       created_by,updated_by
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      randomUUID(),
      input.periodId,
      input.runId,
      input.approvalId ?? null,
      input.action,
      input.idempotencyKey,
      input.reason ?? null,
      input.override ? 1 : 0,
      input.auth.id,
      input.auth.id,
      input.auth.id,
    ]
  )
}

function assertCurrentCompletedRun(row: RowDataPacket) {
  if (!row.runId || Number(row.currentRunId) !== Number(row.runId)) {
    throw new ApiError(409, 'Periode tidak memiliki current run yang valid.')
  }
  if (row.runStatus !== 'COMPLETED') {
    throw new ApiError(409, 'Current run Payroll belum selesai dihitung.')
  }
}

async function assertIntegrity(conn: PoolConnection, row: RowDataPacket) {
  assertCurrentCompletedRun(row)
  await lockIntegritySources(conn, row)
  const integrity = await inspectPayrollRunIntegrity(conn, {
    id: Number(row.runId),
    periodId: Number(row.periodId),
    siteId: Number(row.siteId),
    periodStart: String(row.periodStart),
    periodEnd: String(row.periodEnd),
    payrollBasis: row.payrollBasis,
    payFrequency: row.payFrequency,
    employeeType: row.employeeTypeCode,
    policySnapshot: row.policySnapshot,
  })
  if (!integrity.valid) {
    throw new ApiError(
      409,
      `Payroll belum dapat diproses: ${integrity.issues[0]?.message ?? 'integritas snapshot tidak valid.'}`
    )
  }
}

function capabilities(auth: AuthContext, row: RowDataPacket, integrityValid: boolean) {
  const calculate = isSuper(auth) || auth.permissions.includes('payroll.calculate')
  const approve = isSuper(auth) || auth.permissions.includes('payroll.approve')
  const close = isSuper(auth) || auth.permissions.includes('payroll.close')
  const separatedApprover =
    isSuper(auth) ||
    (Number(row.requestedBy) !== auth.id && Number(row.calculatedBy) !== auth.id)
  return {
    canSubmit:
      calculate &&
      row.periodStatus === 'CALCULATED' &&
      row.runStatus === 'COMPLETED' &&
      integrityValid &&
      !row.approvalId,
    canWithdraw:
      calculate &&
      row.approvalStatus === 'PENDING',
    canApprove:
      approve &&
      separatedApprover &&
      row.approvalStatus === 'PENDING' &&
      integrityValid,
    canReject: approve && row.approvalStatus === 'PENDING',
    canClose:
      close &&
      row.periodStatus === 'APPROVED' &&
      row.approvalStatus === 'APPROVED' &&
      integrityValid &&
      row.runStatus === 'COMPLETED',
  }
}

async function workflowDto(auth: AuthContext, periodUid: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `${periodWorkflowProjection} WHERE pp.uid=?`,
    [periodUid]
  )
  const row = rows[0]
  if (!row) throw new ApiError(404, 'Periode Payroll tidak ditemukan.')
  enforceSite(auth, String(row.siteCode))
  const [historyRows] = await pool.query<RowDataPacket[]>(
    `SELECT action.uid,action.action_type action,action.reason,
            action.is_super_admin_override superAdminOverride,
            CONCAT(DATE_FORMAT(action.performed_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') performedAt,
            user.full_name performedByName
       FROM payroll_workflow_actions action
       JOIN users user ON user.id=action.performed_by
      WHERE action.payroll_period_id=? ORDER BY action.performed_at,action.id`,
    [row.periodId]
  )
  const integrity = row.runId && row.runStatus === 'COMPLETED' && row.periodStatus !== 'CLOSED'
      ? await inspectPayrollRunIntegrity(pool, {
          id: Number(row.runId),
          periodId: Number(row.periodId),
          siteId: Number(row.siteId),
          periodStart: String(row.periodStart),
          periodEnd: String(row.periodEnd),
          payrollBasis: row.payrollBasis,
          payFrequency: row.payFrequency,
          employeeType: row.employeeTypeCode,
          policySnapshot: row.policySnapshot,
        })
      : { valid: row.periodStatus === 'CLOSED', issues: [] }
  const override = historyRows.some(
    (history) =>
      history.action === 'APPROVE' && Number(history.superAdminOverride) === 1
  )
  return {
    periodUid: row.periodUid,
    periodStatus: row.periodStatus,
    payrollBasis: row.payrollBasis,
    payFrequency: row.payFrequency,
    employeeType: row.employeeTypeCode,
    currentRun: row.runId
      ? {
          uid: row.runUid,
          runNumber: Number(row.runNumber),
          status: row.runStatus,
          runType: row.runType,
          employeeCount: Number(row.employeeCount),
          totalPieceRateAmount: money(row.totalPieceRateAmount),
          totalEarnings: money(row.totalEarnings),
          totalDeductions: money(row.totalDeductions),
          totalNetPay: money(row.totalNetPay),
        }
      : null,
    approval: row.approvalId
      ? {
          uid: row.approvalUid,
          status: row.approvalStatus,
          requestedAt: row.requestedAt,
          requestedByName: row.requestedByName,
          reviewedAt: row.reviewedAt ?? null,
          reviewedByName: row.reviewedByName ?? null,
          notes: row.notes ?? null,
          superAdminOverride: override,
        }
      : null,
    capabilities: capabilities(auth, row, integrity.valid),
    integrity,
    history: historyRows.map((history) => ({
      uid: history.uid,
      action: history.action,
      reason: history.reason ?? null,
      superAdminOverride: Number(history.superAdminOverride) === 1,
      performedAt: history.performedAt,
      performedByName: history.performedByName,
    })),
  }
}

async function audit(
  conn: PoolConnection,
  request: Request,
  auth: AuthContext,
  row: RowDataPacket,
  input: {
    action: 'CREATE' | 'UPDATE' | 'APPROVE' | 'REJECT'
    table?: 'payroll_approvals' | 'payroll_periods'
    description: string
    reason?: string | null
    before: Record<string, unknown>
    after: Record<string, unknown>
  }
) {
  await writeAudit(
    {
      auth,
      request,
      module: 'PAYROLL',
      siteId: Number(row.siteId),
      action: input.action,
      table: input.table ?? 'payroll_approvals',
      recordId: Number(input.table === 'payroll_periods' ? row.periodId : row.approvalId),
      recordUid: String(input.table === 'payroll_periods' ? row.periodUid : row.approvalUid),
      description: input.description,
      reason: input.reason ?? null,
      beforeData: input.before,
      afterData: input.after,
    },
    conn
  )
}

export const payrollApprovalsRouter = Router()
payrollApprovalsRouter.use(authenticate)

payrollApprovalsRouter.get(
  '/periods/:periodUid/workflow',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const periodUid = uuid.parse(req.params.periodUid)
      res.json({ data: await workflowDto(res.locals.auth, periodUid) })
    } catch (error) {
      next(error)
    }
  }
)

payrollApprovalsRouter.get(
  '/approvals',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const query = queueQuery.parse(req.query)
      if (query.siteCode) enforceSite(auth, query.siteCode)
      const clauses = ['approval.status=?']
      const params: unknown[] = [query.status]
      if (query.siteCode) {
        clauses.push('site.code=?')
        params.push(query.siteCode)
      }
      if (query.query) {
        clauses.push(`(period.period_code LIKE ? OR period.period_name LIKE ? OR site.code LIKE ? OR site.name LIKE ? OR requester.full_name LIKE ?)`)
        const search = `%${query.query}%`
        params.push(search, search, search, search, search)
      }
      if (!isGlobalViewer(auth)) {
        if (auth.siteAccess.length === 0)
          return res.json({ data: [], meta: { page: query.page, pageSize: query.pageSize, total: 0 } })
        clauses.push(`site.code IN (${auth.siteAccess.map(() => '?').join(',')})`)
        params.push(...auth.siteAccess)
      }
      const where = clauses.join(' AND ')
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total FROM payroll_approvals approval
          JOIN payroll_periods period ON period.id=approval.payroll_period_id
          JOIN sites site ON site.id=period.site_id
          JOIN users requester ON requester.id=approval.requested_by WHERE ${where}`,
        params
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT approval.uid approvalUid,period.uid periodUid,
                period.period_code periodCode,period.period_name periodName,
                site.code siteCode,site.name siteName,run.uid runUid,
                run.run_number runNumber,run.employee_count employeeCount,
                run.total_net_pay totalNetPay,
                CONCAT(DATE_FORMAT(approval.requested_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') requestedAt,
                requester.full_name requestedByName,
                EXISTS(SELECT 1 FROM payroll_workflow_actions action
                        WHERE action.payroll_approval_id=approval.id
                          AND action.is_super_admin_override=1) superAdminOverride
           FROM payroll_approvals approval
           JOIN payroll_periods period ON period.id=approval.payroll_period_id
           JOIN sites site ON site.id=period.site_id
           JOIN payroll_runs run ON run.id=approval.payroll_run_id
           JOIN users requester ON requester.id=approval.requested_by
          WHERE ${where}
          ORDER BY approval.requested_at DESC,approval.id DESC LIMIT ? OFFSET ?`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize]
      )
      res.json({
        data: rows.map((row) => ({
          ...row,
          runNumber: Number(row.runNumber),
          employeeCount: Number(row.employeeCount),
          totalNetPay: money(row.totalNetPay),
          superAdminOverride: Number(row.superAdminOverride) === 1,
        })),
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: Number(countRows[0]?.total ?? 0),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

payrollApprovalsRouter.post(
  '/periods/:periodUid/submit',
  requirePermission('payroll.calculate'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const periodUid = uuid.parse(req.params.periodUid)
      const input = submitInput.parse(req.body)
      await conn.beginTransaction()
      const row = await findPeriod(conn, auth, periodUid)

      if (
        await replay(conn, input.idempotencyKey, 'SUBMIT', {
          periodId: Number(row.periodId),
        })
      ) {
        await conn.commit()
        return res.json({ data: await workflowDto(auth, periodUid), meta: { replay: true } })
      }
      if (row.periodStatus !== 'CALCULATED')
        throw new ApiError(409, 'Hanya Payroll CALCULATED yang dapat diajukan.')
      assertCurrentCompletedRun(row)
      await assertNoProcessingRun(conn, Number(row.periodId))
      if (row.approvalId)
        throw new ApiError(409, 'Run Payroll ini sudah pernah diajukan dan tidak dapat diajukan ulang.')
      const [pending] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM payroll_approvals WHERE payroll_period_id=? AND status IN ('PENDING','APPROVED') LIMIT 1 FOR UPDATE`,
        [row.periodId]
      )
      if (pending[0]) throw new ApiError(409, 'Periode Payroll sudah masuk proses persetujuan.')
      await assertIntegrity(conn, row)
      const approvalUid = randomUUID()
      const [inserted] = await conn.execute<ResultSetHeader>(
        `INSERT INTO payroll_approvals(
           uid,payroll_period_id,payroll_run_id,approval_level,approval_role,
           status,requested_by,notes,created_by,updated_by
         ) VALUES(?,?,?,1,'DIRECTOR','PENDING',?,?,?,?)`,
        [approvalUid, row.periodId, row.runId, auth.id, input.notes ?? null, auth.id, auth.id]
      )
      row.approvalId = inserted.insertId
      row.approvalUid = approvalUid
      await addAction(conn, {
        periodId: Number(row.periodId), runId: Number(row.runId),
        approvalId: inserted.insertId, action: 'SUBMIT',
        idempotencyKey: input.idempotencyKey, reason: input.notes ?? null, auth,
      })
      await audit(conn, req, auth, row, {
        action: 'CREATE', description: 'Mengajukan hasil simulasi Payroll untuk persetujuan Direksi.',
        before: { status: null }, after: { status: 'PENDING', runUid: row.runUid },
      })
      await conn.commit()
      res.status(201).json({ data: await workflowDto(auth, periodUid), meta: { replay: false } })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

async function reviewHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  action: 'APPROVE' | 'REJECT'
) {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext
    const approvalUid = uuid.parse(req.params.approvalUid)
    const input = action === 'REJECT' ? reasonInput.parse(req.body) : reviewInput.parse(req.body)
    await conn.beginTransaction()
    const row = await findApproval(conn, auth, approvalUid)

    if (await replay(conn, input.idempotencyKey, action, { approvalId: Number(row.approvalId) })) {
      await conn.commit()
      return res.json({ data: await workflowDto(auth, String(row.periodUid)), meta: { replay: true } })
    }
    if (row.approvalStatus !== 'PENDING' || row.periodStatus !== 'CALCULATED')
      throw new ApiError(409, 'Pengajuan Payroll tidak lagi menunggu persetujuan.')
    if (Number(row.currentRunId) !== Number(row.runId))
      throw new ApiError(409, 'Pengajuan tidak menunjuk current run Payroll.')
    const selfApproval =
      Number(row.requestedBy) === auth.id || Number(row.calculatedBy) === auth.id
    if (action === 'APPROVE' && selfApproval && !isSuper(auth))
      throw new ApiError(409, 'Penghitung atau pengaju Payroll tidak boleh menyetujui hasilnya sendiri.')
    if (action === 'APPROVE') {
      await assertNoProcessingRun(conn, Number(row.periodId))
      await assertIntegrity(conn, row)
    }
    const reason = 'reason' in input ? input.reason : input.notes ?? null
    const [approvalUpdate] = await conn.execute<ResultSetHeader>(
      `UPDATE payroll_approvals SET status=?,reviewed_at=NOW(3),reviewed_by=?,notes=COALESCE(?,notes),updated_by=?
        WHERE id=? AND status='PENDING'`,
      [action === 'APPROVE' ? 'APPROVED' : 'REJECTED', auth.id, reason, auth.id, row.approvalId]
    )
    if (approvalUpdate.affectedRows !== 1)
      throw new ApiError(409, 'Status pengajuan Payroll berubah. Muat ulang data.')
    if (action === 'APPROVE') {
      const [periodUpdate] = await conn.execute<ResultSetHeader>(
        `UPDATE payroll_periods SET status='APPROVED',approved_at=NOW(3),approved_by=?,updated_by=?
          WHERE id=? AND status='CALCULATED' AND current_run_id=?`,
        [auth.id, auth.id, row.periodId, row.runId]
      )
      if (periodUpdate.affectedRows !== 1)
        throw new ApiError(409, 'Status periode Payroll berubah. Muat ulang data.')
    }
    const override = action === 'APPROVE' && selfApproval && isSuper(auth)
    await addAction(conn, {
      periodId: Number(row.periodId), runId: Number(row.runId), approvalId: Number(row.approvalId),
      action, idempotencyKey: input.idempotencyKey, reason, override, auth,
    })
    await audit(conn, req, auth, row, {
      action: action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      description: action === 'APPROVE'
        ? override ? 'Menyetujui Payroll dengan override Super Admin.' : 'Menyetujui Payroll.'
        : 'Menolak pengajuan Payroll. Run wajib dihitung ulang sebelum pengajuan baru.',
      reason, before: { status: 'PENDING' },
      after: { status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED', superAdminOverride: override },
    })
    await conn.commit()
    res.json({ data: await workflowDto(auth, String(row.periodUid)), meta: { replay: false } })
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally {
    conn.release()
  }
}

payrollApprovalsRouter.post(
  '/approvals/:approvalUid/approve',
  requirePermission('payroll.approve'),
  (req, res, next) => void reviewHandler(req, res, next, 'APPROVE')
)
payrollApprovalsRouter.post(
  '/approvals/:approvalUid/reject',
  requirePermission('payroll.approve'),
  (req, res, next) => void reviewHandler(req, res, next, 'REJECT')
)

payrollApprovalsRouter.post(
  '/approvals/:approvalUid/withdraw',
  requirePermission('payroll.calculate'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const approvalUid = uuid.parse(req.params.approvalUid)
      const input = reasonInput.parse(req.body)
      await conn.beginTransaction()
      const row = await findApproval(conn, auth, approvalUid)

      if (await replay(conn, input.idempotencyKey, 'WITHDRAW', { approvalId: Number(row.approvalId) })) {
        await conn.commit()
        return res.json({ data: await workflowDto(auth, String(row.periodUid)), meta: { replay: true } })
      }
      if (row.approvalStatus !== 'PENDING' || row.periodStatus !== 'CALCULATED')
        throw new ApiError(409, 'Hanya pengajuan PENDING yang dapat ditarik.')
      const [approvalUpdate] = await conn.execute<ResultSetHeader>(
        `UPDATE payroll_approvals SET status='CANCELLED',reviewed_at=NOW(3),reviewed_by=?,notes=?,updated_by=?
          WHERE id=? AND status='PENDING'`,
        [auth.id, input.reason, auth.id, row.approvalId]
      )
      if (approvalUpdate.affectedRows !== 1)
        throw new ApiError(409, 'Status pengajuan Payroll berubah. Muat ulang data.')
      await addAction(conn, {
        periodId: Number(row.periodId), runId: Number(row.runId), approvalId: Number(row.approvalId),
        action: 'WITHDRAW', idempotencyKey: input.idempotencyKey, reason: input.reason, auth,
      })
      await audit(conn, req, auth, row, {
        action: 'UPDATE', description: 'Menarik pengajuan Payroll. Run wajib dihitung ulang sebelum pengajuan baru.',
        reason: input.reason, before: { status: 'PENDING' }, after: { status: 'CANCELLED' },
      })
      await conn.commit()
      res.json({ data: await workflowDto(auth, String(row.periodUid)), meta: { replay: false } })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

payrollApprovalsRouter.post(
  '/periods/:periodUid/close',
  requirePermission('payroll.close'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const periodUid = uuid.parse(req.params.periodUid)
      const input = idempotent.parse(req.body)
      await conn.beginTransaction()
      const row = await findPeriod(conn, auth, periodUid)

      if (await replay(conn, input.idempotencyKey, 'CLOSE', { periodId: Number(row.periodId) })) {
        await conn.commit()
        return res.json({ data: await workflowDto(auth, periodUid), meta: { replay: true } })
      }
      if (row.periodStatus === 'CLOSED')
        throw new ApiError(409, 'Payroll CLOSED bersifat final dan tidak dapat ditutup ulang.')
      if (row.periodStatus !== 'APPROVED' || row.approvalStatus !== 'APPROVED')
        throw new ApiError(409, 'Payroll hanya dapat ditutup setelah disetujui.')
      await assertNoProcessingRun(conn, Number(row.periodId))
      await assertIntegrity(conn, row)
      await snapshotCompanyAtClosing(conn, Number(row.periodId), auth)
      const [runUpdate] = await conn.execute<ResultSetHeader>(
        `UPDATE payroll_runs SET run_type='FINAL',updated_by=?
          WHERE id=? AND payroll_period_id=? AND status='COMPLETED' AND run_type='SIMULATION'`,
        [auth.id, row.runId, row.periodId]
      )
      if (runUpdate.affectedRows !== 1)
        throw new ApiError(409, 'Current run Payroll tidak dapat ditetapkan sebagai FINAL.')
      const [periodUpdate] = await conn.execute<ResultSetHeader>(
        `UPDATE payroll_periods SET status='CLOSED',closed_at=NOW(3),closed_by=?,updated_by=?
          WHERE id=? AND status='APPROVED' AND current_run_id=?`,
        [auth.id, auth.id, row.periodId, row.runId]
      )
      if (periodUpdate.affectedRows !== 1)
        throw new ApiError(409, 'Status periode Payroll berubah. Muat ulang data.')
      await addAction(conn, {
        periodId: Number(row.periodId), runId: Number(row.runId), approvalId: Number(row.approvalId),
        action: 'CLOSE', idempotencyKey: input.idempotencyKey, auth,
      })
      await audit(conn, req, auth, row, {
        action: 'UPDATE', table: 'payroll_periods',
        description: 'Menutup periode Payroll dan menetapkan current run sebagai FINAL.',
        before: { periodStatus: 'APPROVED', runType: 'SIMULATION' },
        after: { periodStatus: 'CLOSED', runType: 'FINAL' },
      })
      await conn.commit()
      res.json({ data: await workflowDto(auth, periodUid), meta: { replay: false } })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)
