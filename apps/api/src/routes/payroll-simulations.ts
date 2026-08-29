import { z } from 'zod'
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  createProcessingRun,
  runDto,
  runProjection,
  schedulePayrollCalculation,
  type PayrollRunRow,
} from '../lib/payroll-simulation.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const uuid = z.string().uuid()
const moneyInput = z
  .string()
  .trim()
  .regex(/^\d{1,16}(?:\.\d{1,2})?$/)
const calculateInput = z.object({ idempotencyKey: uuid }).strict()
const manualInput = z
  .object({
    employeeUid: uuid,
    componentTypeUid: uuid,
    amount: moneyInput,
    notes: z.string().trim().max(500).optional(),
    idempotencyKey: uuid,
  })
  .strict()
const cancelManualInput = z
  .object({
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: uuid,
  })
  .strict()
const correctManualInput = z
  .object({
    amount: moneyInput,
    notes: z.string().trim().max(500).nullable().optional(),
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: uuid,
  })
  .strict()

function isGlobalViewer(auth: AuthContext) {
  return auth.roles.includes('SUPER_ADMIN') || auth.roles.includes('DIRECTOR')
}

function enforceSite(auth: AuthContext, code: string) {
  if (!isGlobalViewer(auth) && !auth.siteAccess.includes(code)) {
    throw new ApiError(403, 'Akses site Payroll ditolak.')
  }
}

function enforceMutationAccess(auth: AuthContext) {
  if (auth.roles.includes('DIRECTOR') && !auth.roles.includes('SUPER_ADMIN')) {
    throw new ApiError(403, 'Direktur memiliki akses baca-saja pada Payroll.')
  }
}

async function period(
  auth: AuthContext,
  uid: string,
  lock = false,
  executor: Pick<Pool | PoolConnection, 'query'> = pool
) {
  const [rows] = await executor.query<RowDataPacket[]>(
    `SELECT pp.id,pp.uid,pp.site_id siteId,pp.status,
            pp.payroll_basis payrollBasis,pp.pay_frequency payFrequency,
            pp.employee_type_code employeeType,
            DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
            DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,s.code siteCode
       FROM payroll_periods pp JOIN sites s ON s.id=pp.site_id
      WHERE pp.uid=? ${lock ? 'FOR UPDATE' : ''}`,
    [uid]
  )
  if (!rows[0]) throw new ApiError(404, 'Periode Payroll tidak ditemukan.')
  enforceSite(auth, String(rows[0].siteCode))
  return rows[0]
}

function amount(value: unknown) {
  const text = String(value ?? '0.00')
  return text.includes('.')
    ? `${text.split('.')[0]}.${(text.split('.')[1] ?? '').padEnd(2, '0').slice(0, 2)}`
    : `${text}.00`
}

function positiveMoney(value: string) {
  const [integer, fraction = ''] = value.split('.')
  if (BigInt(`${integer}${fraction.padEnd(2, '0')}`) <= 0n) {
    throw new ApiError(422, 'Nominal komponen harus lebih besar dari nol.')
  }
  return `${integer}.${fraction.padEnd(2, '0')}`
}

async function assertManualComponentsMutable(
  conn: PoolConnection,
  payrollPeriodId: number
) {
  const [locks] = await conn.query<RowDataPacket[]>(
    `SELECT
       EXISTS(SELECT 1 FROM payroll_runs run
               WHERE run.payroll_period_id=? AND run.status='PROCESSING') processingRun,
       EXISTS(SELECT 1 FROM payroll_approvals approval
               WHERE approval.payroll_period_id=?
                 AND approval.status IN ('PENDING','APPROVED')) lockedApproval`,
    [payrollPeriodId, payrollPeriodId]
  )
  if (Number(locks[0]?.processingRun) === 1) {
    throw new ApiError(
      409,
      'Komponen manual tidak dapat diubah saat perhitungan Payroll berjalan.'
    )
  }
  if (Number(locks[0]?.lockedApproval) === 1) {
    throw new ApiError(
      409,
      'Komponen manual tidak dapat diubah setelah masuk proses persetujuan.'
    )
  }
}

function manualDto(row: RowDataPacket) {
  return {
    uid: row.uid,
    status: row.status,
    employee: {
      uid: row.employeeUid,
      employeeNumber: row.employeeNumber,
      fullName: row.fullName,
    },
    componentType: {
      uid: row.componentTypeUid,
      code: row.componentCode,
      name: row.componentName,
      category: row.componentCategory,
    },
    amount: amount(row.amount),
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    cancelledAt: row.cancelledAt ?? null,
    cancellationReason: row.cancellationReason ?? null,
  }
}

function jsonValue(value: unknown) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

const manualProjection = `SELECT manual.id,manual.uid,manual.payroll_period_id periodId,
  manual.status,manual.amount,manual.notes,manual.idempotency_key idempotencyKey,
  CONCAT(DATE_FORMAT(manual.created_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') createdAt,
  IF(manual.cancelled_at IS NULL,NULL,CONCAT(DATE_FORMAT(manual.cancelled_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00')) cancelledAt,
  manual.cancellation_reason cancellationReason,
  e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,
  pct.uid componentTypeUid,pct.code componentCode,pct.name componentName,
  pct.component_category componentCategory
 FROM payroll_period_manual_components manual
 JOIN employees e ON e.id=manual.employee_id
 JOIN payroll_component_types pct ON pct.id=manual.payroll_component_type_id`

async function loadRun(auth: AuthContext, uid: string) {
  const [rows] = await pool.query<PayrollRunRow[]>(
    `${runProjection} WHERE pr.uid=?`,
    [uid]
  )
  if (!rows[0]) throw new ApiError(404, 'Run Payroll tidak ditemukan.')
  enforceSite(auth, rows[0].siteCode)
  return rows[0]
}

function requireCompletedRun(run: PayrollRunRow) {
  if (run.status !== 'COMPLETED') {
    throw new ApiError(
      409,
      'Hasil karyawan tersedia setelah simulasi Payroll selesai.'
    )
  }
}

export const payrollSimulationsRouter = Router()
payrollSimulationsRouter.use(authenticate)

payrollSimulationsRouter.get(
  '/periods/:periodUid/simulation-meta',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const current = await period(auth, uuid.parse(req.params.periodUid))
      const [componentTypes] = await pool.query<RowDataPacket[]>(
        `SELECT uid,code,name,component_category category
         FROM payroll_component_types
        WHERE is_active=1 AND calculation_method='MANUAL' ORDER BY component_category,name`
      )
      const [employees] = await pool.query<RowDataPacket[]>(
        `SELECT DISTINCT e.uid,e.employee_number employeeNumber,e.full_name fullName
         FROM employees e
         JOIN employee_employment_histories eh ON eh.employee_id=e.id AND eh.site_id=?
          AND eh.effective_from<=? AND (eh.effective_to IS NULL OR eh.effective_to>=?)
         JOIN employee_types et ON et.id=eh.employee_type_id AND et.code=?
        ORDER BY e.full_name,e.employee_number`,
        [
          current.siteId,
          current.periodEnd,
          current.periodStart,
          current.employeeType,
        ]
      )
      res.json({ data: { componentTypes, employees } })
    } catch (error) {
      next(error)
    }
  }
)

payrollSimulationsRouter.get(
  '/periods/:periodUid/manual-components',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const current = await period(auth, uuid.parse(req.params.periodUid))
      const [rows] = await pool.query<RowDataPacket[]>(
        `${manualProjection} WHERE manual.payroll_period_id=? ORDER BY manual.created_at DESC,manual.id DESC`,
        [current.id]
      )
      res.json({ data: rows.map(manualDto) })
    } catch (error) {
      next(error)
    }
  }
)

payrollSimulationsRouter.get(
  '/periods/:periodUid/manual-components/:componentUid/revisions',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const current = await period(auth, uuid.parse(req.params.periodUid))
      const componentUid = uuid.parse(req.params.componentUid)
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT revision.uid,revision.revision_type revisionType,
                revision.before_data beforeData,revision.after_data afterData,
                revision.reason,
                CONCAT(DATE_FORMAT(revision.revised_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') revisedAt,
                actor.uid revisedByUid,COALESCE(actor.full_name,'Pengguna tidak tersedia') revisedByName
           FROM payroll_period_manual_component_revisions revision
           JOIN payroll_period_manual_components manual
             ON manual.id=revision.payroll_period_manual_component_id
           LEFT JOIN users actor ON actor.id=revision.revised_by
          WHERE manual.uid=? AND manual.payroll_period_id=?
          ORDER BY revision.revised_at DESC,revision.id DESC`,
        [componentUid, current.id]
      )
      res.json({
        data: rows.map((row) => ({
          uid: row.uid,
          revisionType: row.revisionType,
          beforeData: jsonValue(row.beforeData),
          afterData: jsonValue(row.afterData),
          reason: row.reason ?? null,
          revisedAt: row.revisedAt,
          revisedBy: { uid: row.revisedByUid ?? null, name: row.revisedByName },
        })),
      })
    } catch (error) {
      next(error)
    }
  }
)

payrollSimulationsRouter.post(
  '/periods/:periodUid/manual-components',
  requirePermission('payroll.calculate'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      enforceMutationAccess(auth)
      const periodUid = uuid.parse(req.params.periodUid)
      const input = manualInput.parse(req.body)
      const normalizedAmount = positiveMoney(input.amount)
      await conn.beginTransaction()
      const current = await period(auth, periodUid, true, conn)
      if (!['DRAFT', 'CALCULATED'].includes(String(current.status)))
        throw new ApiError(
          409,
          'Komponen manual hanya dapat diubah sebelum proses persetujuan.'
        )
      await assertManualComponentsMutable(conn, Number(current.id))
      const [replayRows] = await conn.query<RowDataPacket[]>(
        `${manualProjection} WHERE manual.idempotency_key=? FOR UPDATE`,
        [input.idempotencyKey]
      )
      if (replayRows[0]) {
        const replay = replayRows[0]
        if (
          Number(replay.periodId) !== Number(current.id) ||
          replay.employeeUid !== input.employeeUid ||
          replay.componentTypeUid !== input.componentTypeUid ||
          amount(replay.amount) !== normalizedAmount ||
          String(replay.notes ?? '') !== String(input.notes ?? '')
        ) {
          throw new ApiError(
            409,
            'Idempotency key sudah digunakan untuk komponen manual berbeda.'
          )
        }
        await conn.commit()
        return res.json({ data: manualDto(replay) })
      }
      const [employees] = await conn.query<RowDataPacket[]>(
        `SELECT e.id,e.uid FROM employees e
        WHERE e.uid=? AND EXISTS (
          SELECT 1 FROM employee_employment_histories eh
          JOIN employee_types et ON et.id=eh.employee_type_id AND et.code=?
           WHERE eh.employee_id=e.id AND eh.site_id=?
             AND eh.effective_from<=? AND (eh.effective_to IS NULL OR eh.effective_to>=?)
        ) FOR UPDATE`,
        [
          input.employeeUid,
          current.employeeType,
          current.siteId,
          current.periodEnd,
          current.periodStart,
        ]
      )
      if (!employees[0])
        throw new ApiError(
          422,
          'Karyawan tidak eligible pada site dan periode Payroll ini.'
        )
      const [types] = await conn.query<RowDataPacket[]>(
        `SELECT id,uid,code,name,component_category category FROM payroll_component_types
        WHERE uid=? AND is_active=1 AND calculation_method='MANUAL' FOR UPDATE`,
        [input.componentTypeUid]
      )
      if (!types[0])
        throw new ApiError(
          422,
          'Jenis komponen Payroll tidak tersedia untuk input manual.'
        )
      const manualUid = randomUUID()
      const [inserted] = await conn.execute<ResultSetHeader>(
        `INSERT INTO payroll_period_manual_components(
         uid,payroll_period_id,employee_id,payroll_component_type_id,amount,notes,
         status,active_slot,idempotency_key,created_by,updated_by
       ) VALUES(?,?,?,?,?,?,'ACTIVE',1,?,?,?)`,
        [
          manualUid,
          current.id,
          employees[0].id,
          types[0].id,
          normalizedAmount,
          input.notes ?? null,
          input.idempotencyKey,
          auth.id,
          auth.id,
        ]
      )
      const afterData = {
        employeeUid: input.employeeUid,
        componentTypeUid: input.componentTypeUid,
        amount: normalizedAmount,
        notes: input.notes ?? null,
        status: 'ACTIVE',
      }
      await conn.execute(
        `INSERT INTO payroll_period_manual_component_revisions(
         uid,payroll_period_manual_component_id,revision_type,idempotency_key,
         before_data,after_data,reason,revised_by
       ) VALUES(?,?,'CREATE',?,?,?,NULL,?)`,
        [
          randomUUID(),
          inserted.insertId,
          input.idempotencyKey,
          JSON.stringify({}),
          JSON.stringify(afterData),
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PAYROLL',
          siteId: Number(current.siteId),
          action: 'CREATE',
          table: 'payroll_period_manual_components',
          recordId: inserted.insertId,
          recordUid: manualUid,
          description: 'Menambahkan komponen manual periode Payroll.',
          afterData,
        },
        conn
      )
      const [created] = await conn.query<RowDataPacket[]>(
        `${manualProjection} WHERE manual.id=?`,
        [inserted.insertId]
      )
      await conn.commit()
      res.status(201).json({ data: manualDto(created[0]) })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

payrollSimulationsRouter.post(
  '/periods/:periodUid/manual-components/:componentUid/cancel',
  requirePermission('payroll.calculate'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      enforceMutationAccess(auth)
      const periodUid = uuid.parse(req.params.periodUid)
      const componentUid = uuid.parse(req.params.componentUid)
      const input = cancelManualInput.parse(req.body)
      await conn.beginTransaction()
      const current = await period(auth, periodUid, true, conn)
      if (!['DRAFT', 'CALCULATED'].includes(String(current.status)))
        throw new ApiError(
          409,
          'Komponen manual tidak dapat dibatalkan setelah proses persetujuan dimulai.'
        )
      await assertManualComponentsMutable(conn, Number(current.id))
      const [revisionReplay] = await conn.query<RowDataPacket[]>(
        `SELECT revision.payroll_period_manual_component_id sourceId,manual.uid sourceUid
         FROM payroll_period_manual_component_revisions revision
         JOIN payroll_period_manual_components manual ON manual.id=revision.payroll_period_manual_component_id
        WHERE revision.idempotency_key=? AND revision.revision_type='CANCELLATION' FOR UPDATE`,
        [input.idempotencyKey]
      )
      if (revisionReplay[0]) {
        if (revisionReplay[0].sourceUid !== componentUid)
          throw new ApiError(
            409,
            'Idempotency key sudah digunakan untuk pembatalan berbeda.'
          )
        const [replayed] = await conn.query<RowDataPacket[]>(
          `${manualProjection} WHERE manual.id=?`,
          [revisionReplay[0].sourceId]
        )
        await conn.commit()
        return res.json({ data: manualDto(replayed[0]) })
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `${manualProjection} WHERE manual.uid=? AND manual.payroll_period_id=? FOR UPDATE`,
        [componentUid, current.id]
      )
      const manual = rows[0]
      if (!manual) throw new ApiError(404, 'Komponen manual tidak ditemukan.')
      if (manual.status !== 'ACTIVE')
        throw new ApiError(409, 'Komponen manual sudah tidak aktif.')
      const beforeData = manualDto(manual)
      await conn.execute(
        `UPDATE payroll_period_manual_components SET status='CANCELLED',active_slot=NULL,
              cancelled_at=NOW(3),cancelled_by=?,cancellation_reason=?,updated_by=? WHERE id=?`,
        [auth.id, input.reason, auth.id, manual.id]
      )
      await conn.execute(
        `INSERT INTO payroll_period_manual_component_revisions(
         uid,payroll_period_manual_component_id,revision_type,idempotency_key,
         before_data,after_data,reason,revised_by
       ) VALUES(?,?,'CANCELLATION',?,?,?,?,?)`,
        [
          randomUUID(),
          manual.id,
          input.idempotencyKey,
          JSON.stringify(beforeData),
          JSON.stringify({
            ...beforeData,
            status: 'CANCELLED',
            cancellationReason: input.reason,
          }),
          input.reason,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PAYROLL',
          siteId: Number(current.siteId),
          action: 'UPDATE',
          table: 'payroll_period_manual_components',
          recordId: Number(manual.id),
          recordUid: manual.uid,
          description: 'Membatalkan komponen manual periode Payroll.',
          reason: input.reason,
          beforeData,
          afterData: { status: 'CANCELLED', cancellationReason: input.reason },
        },
        conn
      )
      const [cancelled] = await conn.query<RowDataPacket[]>(
        `${manualProjection} WHERE manual.id=?`,
        [manual.id]
      )
      await conn.commit()
      res.json({ data: manualDto(cancelled[0]) })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

payrollSimulationsRouter.patch(
  '/periods/:periodUid/manual-components/:componentUid',
  requirePermission('payroll.calculate'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      enforceMutationAccess(auth)
      const periodUid = uuid.parse(req.params.periodUid)
      const componentUid = uuid.parse(req.params.componentUid)
      const input = correctManualInput.parse(req.body)
      const normalizedAmount = positiveMoney(input.amount)
      await conn.beginTransaction()
      const current = await period(auth, periodUid, true, conn)
      if (!['DRAFT', 'CALCULATED'].includes(String(current.status)))
        throw new ApiError(
          409,
          'Komponen manual tidak dapat dikoreksi setelah proses persetujuan dimulai.'
        )
      await assertManualComponentsMutable(conn, Number(current.id))
      const [revisionReplay] = await conn.query<RowDataPacket[]>(
        `SELECT revision.payroll_period_manual_component_id sourceId,manual.uid sourceUid
         FROM payroll_period_manual_component_revisions revision
         JOIN payroll_period_manual_components manual ON manual.id=revision.payroll_period_manual_component_id
        WHERE revision.idempotency_key=? AND revision.revision_type='CORRECTION' FOR UPDATE`,
        [input.idempotencyKey]
      )
      if (revisionReplay[0]) {
        if (revisionReplay[0].sourceUid !== componentUid)
          throw new ApiError(
            409,
            'Idempotency key sudah digunakan untuk koreksi berbeda.'
          )
        const [replayed] = await conn.query<RowDataPacket[]>(
          `${manualProjection} WHERE manual.id=?`,
          [revisionReplay[0].sourceId]
        )
        await conn.commit()
        return res.json({ data: manualDto(replayed[0]) })
      }
      const [rows] = await conn.query<RowDataPacket[]>(
        `${manualProjection} WHERE manual.uid=? AND manual.payroll_period_id=? FOR UPDATE`,
        [componentUid, current.id]
      )
      const manual = rows[0]
      if (!manual) throw new ApiError(404, 'Komponen manual tidak ditemukan.')
      if (manual.status !== 'ACTIVE')
        throw new ApiError(
          409,
          'Hanya komponen manual aktif yang dapat dikoreksi.'
        )
      const beforeData = manualDto(manual)
      const notes = input.notes === undefined ? manual.notes : input.notes
      await conn.execute(
        `UPDATE payroll_period_manual_components SET amount=?,notes=?,updated_by=? WHERE id=?`,
        [normalizedAmount, notes ?? null, auth.id, manual.id]
      )
      const afterData = {
        ...beforeData,
        amount: normalizedAmount,
        notes: notes ?? null,
      }
      await conn.execute(
        `INSERT INTO payroll_period_manual_component_revisions(
         uid,payroll_period_manual_component_id,revision_type,idempotency_key,
         before_data,after_data,reason,revised_by
       ) VALUES(?,?,'CORRECTION',?,?,?,?,?)`,
        [
          randomUUID(),
          manual.id,
          input.idempotencyKey,
          JSON.stringify(beforeData),
          JSON.stringify(afterData),
          input.reason,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PAYROLL',
          siteId: Number(current.siteId),
          action: 'UPDATE',
          table: 'payroll_period_manual_components',
          recordId: Number(manual.id),
          recordUid: manual.uid,
          description: 'Mengoreksi komponen manual periode Payroll.',
          reason: input.reason,
          beforeData,
          afterData,
        },
        conn
      )
      const [updated] = await conn.query<RowDataPacket[]>(
        `${manualProjection} WHERE manual.id=?`,
        [manual.id]
      )
      await conn.commit()
      res.json({ data: manualDto(updated[0]) })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

payrollSimulationsRouter.post(
  '/periods/:periodUid/calculate',
  requirePermission('payroll.calculate'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      enforceMutationAccess(auth)
      const periodUid = uuid.parse(req.params.periodUid)
      const input = calculateInput.parse(req.body)
      const result = await createProcessingRun({
        auth,
        periodUid,
        idempotencyKey: input.idempotencyKey,
        request: req,
      })
      if (!result.replay && result.row.status === 'PROCESSING')
        schedulePayrollCalculation(Number(result.row.id), auth)
      res
        .status(result.replay && result.row.status !== 'PROCESSING' ? 200 : 202)
        .json({ data: runDto(result.row) })
    } catch (error) {
      next(error)
    }
  }
)

payrollSimulationsRouter.get(
  '/periods/:periodUid/runs',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const current = await period(auth, uuid.parse(req.params.periodUid))
      const [rows] = await pool.query<PayrollRunRow[]>(
        `${runProjection} WHERE pr.payroll_period_id=? ORDER BY pr.run_number DESC,pr.id DESC`,
        [current.id]
      )
      res.json({ data: rows.map(runDto) })
    } catch (error) {
      next(error)
    }
  }
)

payrollSimulationsRouter.get(
  '/runs/:runUid',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const run = await loadRun(auth, uuid.parse(req.params.runUid))
      const [issues] = await pool.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(net_pay<0),0) negativeNetEmployees,
              COALESCE(SUM(bank_account_number_snapshot IS NULL OR TRIM(bank_account_number_snapshot)=''),0) missingBankEmployees
         FROM payroll_employee_results WHERE payroll_run_id=?`,
        [run.id]
      )
      res.json({
        data: {
          ...runDto(run),
          issues: {
            negativeNetEmployees: Number(issues[0]?.negativeNetEmployees ?? 0),
            missingBankEmployees: Number(issues[0]?.missingBankEmployees ?? 0),
          },
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

payrollSimulationsRouter.post(
  '/runs/:runUid/recover-stale',
  requirePermission('payroll.calculate'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      enforceMutationAccess(auth)
      const runUid = uuid.parse(req.params.runUid)
      await conn.beginTransaction()
      const [rows] = await conn.query<PayrollRunRow[]>(
        `${runProjection} WHERE pr.uid=? FOR UPDATE`,
        [runUid]
      )
      const run = rows[0]
      if (!run) throw new ApiError(404, 'Run Payroll tidak ditemukan.')
      enforceSite(auth, run.siteCode)
      const [stale] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM payroll_runs WHERE id=? AND status='PROCESSING' AND calculation_started_at<DATE_SUB(NOW(3),INTERVAL 30 MINUTE) FOR UPDATE`,
        [run.id]
      )
      if (!stale[0])
        throw new ApiError(
          409,
          'Run Payroll belum dapat dipulihkan karena tidak stale atau sudah selesai.'
        )
      await conn.execute(
        `UPDATE payroll_runs SET status='FAILED',processing_slot=NULL,calculation_finished_at=NOW(3),error_message='Run PROCESSING dipulihkan setelah melewati batas 30 menit.',updated_by=? WHERE id=?`,
        [auth.id, run.id]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PAYROLL',
          siteId: Number(run.siteId),
          action: 'OTHER',
          table: 'payroll_runs',
          recordId: Number(run.id),
          recordUid: run.uid,
          description: 'Memulihkan run Payroll stale menjadi FAILED.',
          reason: 'PROCESSING melebihi 30 menit.',
          beforeData: { status: 'PROCESSING' },
          afterData: { status: 'FAILED' },
        },
        conn
      )
      const [updated] = await conn.query<PayrollRunRow[]>(
        `${runProjection} WHERE pr.id=?`,
        [run.id]
      )
      await conn.commit()
      res.json({ data: runDto(updated[0]) })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

payrollSimulationsRouter.get(
  '/runs/:runUid/employees',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const run = await loadRun(auth, uuid.parse(req.params.runUid))
      requireCompletedRun(run)
      const page = Math.max(1, Number(req.query.page ?? 1) || 1)
      const pageSize = Math.min(
        500,
        Math.max(1, Number(req.query.pageSize ?? 50) || 50)
      )
      const query = String(req.query.query ?? '').trim()
      const issue = z
        .enum(['NEGATIVE_NET', 'MISSING_BANK'])
        .optional()
        .parse(req.query.issue || undefined)
      const where = ['result.payroll_run_id=?']
      const values: unknown[] = [run.id]
      if (query) {
        where.push(
          '(result.employee_number_snapshot LIKE ? OR result.employee_name_snapshot LIKE ?)'
        )
        values.push(`%${query}%`, `%${query}%`)
      }
      if (issue === 'NEGATIVE_NET') where.push('result.net_pay<0')
      if (issue === 'MISSING_BANK')
        where.push(
          "(result.bank_account_number_snapshot IS NULL OR TRIM(result.bank_account_number_snapshot)='')"
        )
      const [counts] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total FROM payroll_employee_results result WHERE ${where.join(' AND ')}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT result.uid,result.employee_number_snapshot employeeNumber,result.employee_name_snapshot fullName,
              result.employee_type_snapshot employeeType,result.department_name_snapshot departmentName,
              result.position_name_snapshot positionName,result.production_transaction_count productionTransactionCount,
              result.attendance_days attendanceDays,
              (SELECT COALESCE(SUM(time_detail.is_payable=1),0)
                 FROM payroll_time_details time_detail
                WHERE time_detail.payroll_employee_result_id=result.id) payablePresentDays,
              (SELECT COALESCE(SUM(time_detail.warning_code='OFFDAY_PRESENT'),0)
                 FROM payroll_time_details time_detail
                WHERE time_detail.payroll_employee_result_id=result.id) offdayPresentDays,
              result.piece_rate_amount pieceRateAmount,result.basic_salary_amount basicSalaryAmount,
              result.additional_earnings additionalEarnings,
              result.gross_earnings grossEarnings,result.total_deductions totalDeductions,result.net_pay netPay,
              result.bank_name_snapshot bankName,result.bank_account_number_snapshot bankAccountNumber
         FROM payroll_employee_results result WHERE ${where.join(' AND ')}
        ORDER BY result.employee_name_snapshot,result.employee_number_snapshot LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const data = rows.map((row) => ({
        uid: row.uid,
        employeeNumber: row.employeeNumber,
        fullName: row.fullName,
        employeeType: row.employeeType,
        departmentName: row.departmentName,
        positionName: row.positionName,
        productionTransactionCount: Number(row.productionTransactionCount),
        attendanceDays: Number(row.attendanceDays),
        payablePresentDays: Number(row.payablePresentDays ?? 0),
        offdayPresentDays: Number(row.offdayPresentDays ?? 0),
        pieceRateAmount: amount(row.pieceRateAmount),
        basicSalaryAmount: amount(row.basicSalaryAmount),
        additionalEarnings: amount(row.additionalEarnings),
        grossEarnings: amount(row.grossEarnings),
        totalDeductions: amount(row.totalDeductions),
        netPay: amount(row.netPay),
        issues: [
          ...(String(row.netPay).trim().startsWith('-')
            ? ['NEGATIVE_NET']
            : []),
          ...(!row.bankAccountNumber ? ['MISSING_BANK'] : []),
        ],
        bank: {
          bankName: row.bankName ?? null,
          accountLast4: row.bankAccountNumber
            ? String(row.bankAccountNumber).slice(-4)
            : null,
          complete: Boolean(row.bankName && row.bankAccountNumber),
        },
      }))
      const total = Number(counts[0]?.total ?? 0)
      res.json({
        data,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

payrollSimulationsRouter.get(
  '/runs/:runUid/employees/:employeeResultUid',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const run = await loadRun(auth, uuid.parse(req.params.runUid))
      requireCompletedRun(run)
      const resultUid = uuid.parse(req.params.employeeResultUid)
      const [results] = await pool.query<RowDataPacket[]>(
        `SELECT result.*,e.uid employeeUid FROM payroll_employee_results result JOIN employees e ON e.id=result.employee_id
        WHERE result.uid=? AND result.payroll_run_id=?`,
        [resultUid, run.id]
      )
      const result = results[0]
      if (!result)
        throw new ApiError(404, 'Hasil Payroll karyawan tidak ditemukan.')
      const [production] = await pool.query<RowDataPacket[]>(
        `SELECT transaction_number_snapshot transactionNumber,DATE_FORMAT(business_date,'%Y-%m-%d') businessDate,job_name_snapshot jobName,unit_name_snapshot unitName,quantity_snapshot quantity,rate_snapshot rate,amount_snapshot amount FROM payroll_production_details WHERE payroll_employee_result_id=? ORDER BY business_date,transaction_number_snapshot`,
        [result.id]
      )
      const [timeDetails] = await pool.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(detail.business_date,'%Y-%m-%d') businessDate,
                detail.attendance_status_snapshot attendanceStatus,
                detail.calendar_day_type_snapshot calendarDayType,
                detail.is_scheduled isScheduled,detail.is_payable isPayable,
                detail.daily_rate_snapshot dailyRate,detail.amount_snapshot amount,
                detail.worked_minutes_snapshot workedMinutes,detail.warning_code warningCode
           FROM payroll_time_details detail
          WHERE detail.payroll_employee_result_id=?
          ORDER BY detail.business_date,detail.id`,
        [result.id]
      )
      const [trainingProduction] = await pool.query<RowDataPacket[]>(
        `SELECT detail.transaction_number_snapshot transactionNumber,
                DATE_FORMAT(detail.business_date,'%Y-%m-%d') businessDate,
                detail.job_name_snapshot jobName,detail.unit_name_snapshot unitName,
                detail.quantity_snapshot quantity
           FROM payroll_training_production_details detail
          WHERE detail.payroll_employee_result_id=?
          ORDER BY detail.business_date,detail.transaction_number_snapshot`,
        [result.id]
      )
      const [components] = await pool.query<RowDataPacket[]>(
        `SELECT component_code_snapshot code,component_name_snapshot name,component_category category,source_type sourceType,amount,notes FROM payroll_employee_component_details WHERE payroll_employee_result_id=? ORDER BY component_category,component_name_snapshot,id`,
        [result.id]
      )
      const [attendance] = await pool.query<RowDataPacket[]>(
        `SELECT scheduled_days scheduledDays,present_days presentDays,absent_days absentDays,leave_days leaveDays,sick_days sickDays,permission_days permissionDays,holiday_days holidayDays,late_minutes lateMinutes,early_leave_minutes earlyLeaveMinutes,worked_minutes workedMinutes FROM payroll_attendance_summaries WHERE payroll_employee_result_id=?`,
        [result.id]
      )
      const showLast4 =
        auth.roles.includes('SUPER_ADMIN') ||
        auth.permissions.includes('payroll.calculate')
      res.json({
        data: {
          uid: result.uid,
          employee: {
            uid: result.employeeUid,
            employeeNumber: result.employee_number_snapshot,
            fullName: result.employee_name_snapshot,
            employeeType: result.employee_type_snapshot,
            departmentName: result.department_name_snapshot,
            positionName: result.position_name_snapshot,
            workGroupName: result.work_group_name_snapshot,
          },
          totals: {
            pieceRateAmount: amount(result.piece_rate_amount),
            basicSalaryAmount: amount(result.basic_salary_amount),
            additionalEarnings: amount(result.additional_earnings),
            grossEarnings: amount(result.gross_earnings),
            totalDeductions: amount(result.total_deductions),
            netPay: amount(result.net_pay),
          },
          bank: {
            bankName: result.bank_name_snapshot ?? null,
            accountNumber: showLast4
              ? (result.bank_account_number_snapshot ?? null)
              : null,
            accountLast4: result.bank_account_number_snapshot
              ? String(result.bank_account_number_snapshot).slice(-4)
              : null,
            accountName: showLast4
              ? (result.bank_account_name_snapshot ?? null)
              : null,
            complete: Boolean(
              result.bank_name_snapshot &&
              result.bank_account_number_snapshot &&
              result.bank_account_name_snapshot
            ),
          },
          production: production.map((row) => ({
            ...row,
            quantity: String(row.quantity),
            rate: String(row.rate),
            amount: amount(row.amount),
          })),
          timeDetails: timeDetails.map((row) => ({
            businessDate: row.businessDate,
            attendanceStatus: row.attendanceStatus,
            calendarDayType: row.calendarDayType,
            isScheduled: Number(row.isScheduled) === 1,
            isPayable: Number(row.isPayable) === 1,
            dailyRate: amount(row.dailyRate),
            amount: amount(row.amount),
            workedMinutes:
              row.workedMinutes == null ? null : Number(row.workedMinutes),
            warningCode: row.warningCode ?? null,
          })),
          trainingProduction: trainingProduction.map((row) => ({
            transactionNumber: row.transactionNumber,
            businessDate: row.businessDate,
            jobName: row.jobName,
            unitName: row.unitName,
            quantity: String(row.quantity),
          })),
          components: components.map((row) => ({
            ...row,
            amount: amount(row.amount),
          })),
          attendance: attendance[0] ?? null,
          formulaTrace: {
            pieceRate:
              run.payrollBasis === 'PIECE_RATE'
                ? 'SUM(snapshot Produksi POSTED)'
                : null,
            timeBased:
              run.payrollBasis === 'TIME_BASED'
                ? 'ROUND(HALF_UP, SUM(tarif harian pada Attendance PRESENT), Rp1)'
                : null,
            recurring:
              run.payrollBasis === 'PIECE_RATE'
                ? 'Nominal penuh satu kali bila efektif overlap periode'
                : 'Tidak digunakan pada TIME_BASED M5B',
            manual: 'Komponen ACTIVE pada periode',
            net: 'grossEarnings - totalDeductions',
          },
        },
      })
    } catch (error) {
      next(error)
    }
  }
)
