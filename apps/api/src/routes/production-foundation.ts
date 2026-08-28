import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { businessDate } from '../lib/contract-lifecycle.js'
import { ApiError } from '../lib/errors.js'
import {
  assignmentStatusSql,
  booleanFilter,
  closeProductionAssignmentInput,
  csvValues,
  pageParams,
  productionAssignmentInput,
  productionAssignmentCorrectionInput,
  productionActiveRateCorrectionInput,
  productionRateExceptionInput,
  productionAssignmentReadinessIssue,
  productionEligibleEmployeeType,
  productionJobInput,
  productionRateInput,
  productionSiteCode,
  rateActivationInput,
  workUnitInput,
} from '../lib/production-foundation.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const routeParam = (value: string | string[]) =>
  Array.isArray(value) ? value[0] : value

function isGlobalViewer(auth: AuthContext) {
  return auth.roles.some((role) => role === 'SUPER_ADMIN' || role === 'DIRECTOR')
}

function scopeWhere(auth: AuthContext, column = 's.code') {
  return isGlobalViewer(auth)
    ? { sql: '1=1', params: [] as string[] }
    : {
        sql: `${column} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`,
        params: auth.siteAccess,
      }
}

function enforceSite(auth: AuthContext, site: string) {
  if (!isGlobalViewer(auth) && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

function normalizeRate(value: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiError(422, 'Tarif harus berupa angka nol atau lebih besar.')
  }
  return amount.toFixed(4)
}

async function resolveJobReferences(
  executor: Awaited<ReturnType<typeof pool.getConnection>>,
  input: { defaultUnitUid: string; positionUid?: string | null }
) {
  const [units] = await executor.query<RowDataPacket[]>(
    'SELECT id FROM work_units WHERE uid=? AND is_active=1',
    [input.defaultUnitUid]
  )
  if (!units[0]) throw new ApiError(422, 'Satuan tidak valid atau tidak aktif.')

  let positionId: number | null = null
  if (input.positionUid) {
    const [positions] = await executor.query<RowDataPacket[]>(
      "SELECT id FROM positions WHERE uid=? AND is_active=1 AND category='PRODUCTION'",
      [input.positionUid]
    )
    if (!positions[0]) {
      throw new ApiError(422, 'Jabatan produksi tidak valid atau tidak aktif.')
    }
    positionId = Number(positions[0].id)
  }
  return { unitId: Number(units[0].id), positionId }
}

async function assignmentCorrectionProposal(
  connection: PoolConnection,
  uid: string,
  input: z.infer<typeof productionAssignmentCorrectionInput>,
  lock: boolean
) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT a.id,a.employee_id employeeId,a.production_job_id jobId,a.site_id siteId,
            a.is_primary isPrimary,a.status,s.code site,e.uid employeeUid,
            j.uid jobUid,j.code jobCode,j.name jobName,
            DATE_FORMAT(a.effective_from,'%Y-%m-%d') effectiveFrom,
            DATE_FORMAT(a.effective_to,'%Y-%m-%d') effectiveTo
       FROM employee_job_assignments a JOIN sites s ON s.id=a.site_id
       JOIN employees e ON e.id=a.employee_id JOIN production_jobs j ON j.id=a.production_job_id
      WHERE a.uid=? ${lock ? 'FOR UPDATE' : ''}`,
    [uid]
  )
  const current = rows[0]
  if (!current) throw new ApiError(404, 'Penugasan tidak ditemukan.')
  if (current.status !== 'ACTIVE') throw new ApiError(409, 'Penugasan yang dibatalkan tidak dapat dikoreksi.')
  const [jobs] = await connection.query<RowDataPacket[]>(
    'SELECT id,uid,code,name FROM production_jobs WHERE uid=? AND is_active=1',
    [input.jobUid]
  )
  const job = jobs[0]
  if (!job) throw new ApiError(422, 'Pekerjaan pengganti tidak valid atau tidak aktif.')
  const [histories] = await connection.query<RowDataPacket[]>(
    `SELECT eh.id FROM employee_employment_histories eh
      JOIN employee_statuses es ON es.id=eh.employee_status_id AND es.allows_production=1
      JOIN employee_types et ON et.id=eh.employee_type_id AND et.code IN ('BORONGAN','TRAINING')
     WHERE eh.employee_id=? AND eh.site_id=? AND eh.effective_from<=?
       AND (eh.effective_to IS NULL OR eh.effective_to>=?)
       AND ((? IS NULL AND eh.effective_to IS NULL) OR (? IS NOT NULL AND (eh.effective_to IS NULL OR eh.effective_to>=?)))`,
    [current.employeeId,current.siteId,input.effectiveFrom,input.effectiveFrom,input.effectiveTo??null,input.effectiveTo??null,input.effectiveTo??null]
  )
  if (histories.length !== 1) throw new ApiError(422, 'Periode koreksi harus berada dalam satu histori kerja Produksi eligible.')
  const periodEnd = input.effectiveTo ?? '9999-12-31'
  const [overlaps] = await connection.query<RowDataPacket[]>(
    `SELECT id FROM employee_job_assignments WHERE employee_id=? AND site_id=?
       AND production_job_id=? AND status='ACTIVE' AND id<>?
       AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [current.employeeId,current.siteId,job.id,current.id,periodEnd,input.effectiveFrom]
  )
  if (overlaps[0]) throw new ApiError(409, 'Penugasan pekerjaan pengganti bertumpang-tindih.')
  if (input.isPrimary) {
    const [primary] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM employee_job_assignments WHERE employee_id=? AND site_id=?
        AND is_primary=1 AND status='ACTIVE' AND id<>? AND effective_from<=?
        AND (effective_to IS NULL OR effective_to>=?) LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
      [current.employeeId,current.siteId,current.id,periodEnd,input.effectiveFrom]
    )
    if (primary[0]) throw new ApiError(409, 'Pekerjaan utama pengganti bertumpang-tindih.')
  }
  const [lockedPeriods] = await connection.query<RowDataPacket[]>(
    `SELECT pp.id
       FROM payroll_periods pp
      WHERE pp.site_id=? AND pp.payroll_basis='PIECE_RATE'
        AND (
          pp.status IN ('CALCULATED','APPROVED','CLOSED')
          OR EXISTS(SELECT 1 FROM payroll_runs pr
            WHERE pr.payroll_period_id=pp.id AND pr.status='PROCESSING')
        )
        AND (
          (pp.period_start<=COALESCE(?,'9999-12-31') AND pp.period_end>=?)
          OR
          (pp.period_start<=? AND pp.period_end>=?)
        )
      LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [
      current.siteId,
      current.effectiveTo ?? null,
      current.effectiveFrom,
      periodEnd,
      input.effectiveFrom,
    ]
  )
  if (lockedPeriods[0]) {
    throw new ApiError(
      409,
      'Periode penugasan sudah masuk proses atau hasil Payroll dan tidak dapat dikoreksi.'
    )
  }
  const [transactions] = await connection.query<RowDataPacket[]>(
    `SELECT pt.id,DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDate,
            pt.payroll_locked_at payrollLockedAt,
            EXISTS(SELECT 1 FROM payroll_production_details ppd WHERE ppd.production_transaction_id=pt.id) snapshotted,
            EXISTS(SELECT 1 FROM payroll_periods pp WHERE pp.site_id=pt.site_id
              AND pp.payroll_basis='PIECE_RATE'
              AND pp.period_start<=pt.business_date AND pp.period_end>=pt.business_date
              AND (pp.status IN ('CALCULATED','APPROVED','CLOSED')
                OR EXISTS(SELECT 1 FROM payroll_runs pr
                  WHERE pr.payroll_period_id=pp.id AND pr.status='PROCESSING'))) lockedPeriod
       FROM production_transactions pt WHERE pt.employee_id=? AND pt.site_id=?
        AND pt.production_job_id=? AND pt.status='POSTED'
        AND pt.business_date>=? AND (? IS NULL OR pt.business_date<=?) ${lock ? 'FOR UPDATE' : ''}`,
    [current.employeeId,current.siteId,current.jobId,current.effectiveFrom,current.effectiveTo??null,current.effectiveTo??null]
  )
  if (transactions.some((row) => row.payrollLockedAt || Number(row.snapshotted)===1 || Number(row.lockedPeriod)===1)) {
    throw new ApiError(409, 'Penugasan tidak dapat dikoreksi karena transaksinya sudah dikunci Payroll.')
  }
  if (Number(current.jobId)!==Number(job.id) && transactions.length) {
    throw new ApiError(409, 'Pekerjaan penugasan tidak dapat diganti karena sudah digunakan transaksi POSTED. Void/koreksi transaksi lebih dahulu.')
  }
  if (transactions.some((row) => String(row.businessDate)<input.effectiveFrom || (input.effectiveTo && String(row.businessDate)>input.effectiveTo))) {
    throw new ApiError(409, 'Periode koreksi tidak mencakup seluruh transaksi POSTED yang menggunakan penugasan ini.')
  }
  return { current, job, proposed:{ job:{uid:job.uid,code:job.code,name:job.name},effectiveFrom:input.effectiveFrom,effectiveTo:input.effectiveTo??null,isPrimary:input.isPrimary },transactionCount:transactions.length }
}

async function activeRateContext(connection: PoolConnection, uid: string, lock: boolean) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT r.id,r.uid,r.status,r.site_id siteId,r.production_job_id jobId,
            DATE_FORMAT(r.effective_from,'%Y-%m-%d') effectiveFrom,
            DATE_FORMAT(r.effective_to,'%Y-%m-%d') effectiveTo,
            CAST(r.rate_amount AS CHAR) rateAmount,r.reference_number referenceNumber,r.notes,
            s.code site,j.uid jobUid,j.code jobCode,j.name jobName
       FROM production_job_rates r JOIN sites s ON s.id=r.site_id
       JOIN production_jobs j ON j.id=r.production_job_id
      WHERE r.uid=? ${lock ? 'FOR UPDATE' : ''}`,
    [uid]
  )
  const rate = rows[0]
  if (!rate) throw new ApiError(404, 'Tarif tidak ditemukan.')
  if (rate.status !== 'ACTIVE') {
    throw new ApiError(
      409,
      'Hanya tarif Aktif yang dapat dikoreksi atau dibatalkan.'
    )
  }
  const [usage] = await connection.query<RowDataPacket[]>(
    `SELECT id FROM production_transactions WHERE job_rate_id=? LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [rate.id]
  )
  if (usage[0]) {
    throw new ApiError(
      409,
      'Tarif sudah digunakan transaksi Produksi. Nilai snapshot tidak boleh direprice; gunakan adjustment Payroll.'
    )
  }
  return rate
}

export const productionFoundationRouter = Router()
productionFoundationRouter.use(authenticate)

productionFoundationRouter.get(
  '/work-units',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const where = ['1=1']
      const values: unknown[] = []
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push('(code LIKE ? OR name LIKE ?)')
        values.push(`%${query}%`, `%${query}%`)
      }
      const isActive = booleanFilter(req.query.isActive)
      if (isActive !== undefined) {
        where.push('is_active=?')
        values.push(isActive)
      }
      const clause = where.join(' AND ')
      const [count] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total FROM work_units WHERE ${clause}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT uid,code,name,decimal_precision decimalPrecision,
                is_active=1 isActive
           FROM work_units
          WHERE ${clause}
          ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      res.json({ items: rows, total: Number(count[0]?.total ?? 0), page, pageSize })
    } catch (error) {
      next(error)
    }
  }
)

productionFoundationRouter.post(
  '/work-units',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    try {
      const input = workUnitInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const uid = randomUUID()
      await pool.execute(
        `INSERT INTO work_units(
           uid,code,name,decimal_precision,is_active,created_by,updated_by
         ) VALUES(?,?,?,?,?,?,?)`,
        [
          uid,
          input.code.toUpperCase(),
          input.name,
          input.decimalPrecision,
          input.isActive ? 1 : 0,
          auth.id,
          auth.id,
        ]
      )
      await writeAudit({
        auth,
        request: req,
        module: 'PRODUCTION',
        action: 'CREATE',
        table: 'work_units',
        recordUid: uid,
        description: `Menambah satuan Produksi ${input.name}.`,
        afterData: input,
      })
      res.status(201).json({ uid })
    } catch (error) {
      next(error)
    }
  }
)

productionFoundationRouter.patch(
  '/work-units/:uid',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = workUnitInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      await connection.beginTransaction()
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id,code,name,decimal_precision decimalPrecision,is_active=1 isActive
           FROM work_units WHERE uid=? FOR UPDATE`,
        [uid]
      )
      const current = rows[0]
      if (!current) throw new ApiError(404, 'Satuan tidak ditemukan.')
      if (Number(current.decimalPrecision) !== input.decimalPrecision) {
        const [references] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM production_job_rates WHERE unit_id=? LIMIT 1`,
          [current.id]
        )
        if (references[0]) {
          throw new ApiError(
            409,
            'Presisi satuan tidak dapat diubah karena sudah digunakan tarif.'
          )
        }
      }
      if (Number(current.isActive) === 1 && !input.isActive) {
        const [activeJobs] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM production_jobs
            WHERE default_unit_id=? AND is_active=1 LIMIT 1`,
          [current.id]
        )
        if (activeJobs[0]) {
          throw new ApiError(
            409,
            'Satuan masih digunakan pekerjaan Produksi aktif.'
          )
        }
      }
      await connection.execute(
        `UPDATE work_units
            SET code=?,name=?,decimal_precision=?,is_active=?,updated_by=?
          WHERE id=?`,
        [
          input.code.toUpperCase(),
          input.name,
          input.decimalPrecision,
          input.isActive ? 1 : 0,
          auth.id,
          current.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          action: 'UPDATE',
          table: 'work_units',
          recordId: Number(current.id),
          recordUid: uid,
          description: `Memperbarui satuan Produksi ${input.name}.`,
          beforeData: current,
          afterData: input,
        },
        connection
      )
      await connection.commit()
      res.status(204).end()
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.get(
  '/jobs',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const where = ['1=1']
      const values: unknown[] = []
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push('(j.code LIKE ? OR j.name LIKE ? OR j.category LIKE ?)')
        values.push(`%${query}%`, `%${query}%`, `%${query}%`)
      }
      const unitUids = csvValues(req.query.unitUid)
      if (unitUids.length) {
        where.push(`u.uid IN (${unitUids.map(() => '?').join(',')})`)
        values.push(...unitUids)
      }
      const isActive = booleanFilter(req.query.isActive)
      if (isActive !== undefined) {
        where.push('j.is_active=?')
        values.push(isActive)
      }
      const clause = where.join(' AND ')
      const from = `FROM production_jobs j
        JOIN work_units u ON u.id=j.default_unit_id
        LEFT JOIN positions p ON p.id=j.position_id`
      const [count] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${from} WHERE ${clause}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT j.uid,j.code,j.name,j.description,j.category,j.is_active=1 isActive,
                u.uid defaultUnitUid,u.code defaultUnitCode,u.name defaultUnitName,
                p.uid positionUid,p.name positionName
           ${from} WHERE ${clause}
          ORDER BY j.created_at DESC,j.id DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      res.json({ items: rows, total: Number(count[0]?.total ?? 0), page, pageSize })
    } catch (error) {
      next(error)
    }
  }
)

productionFoundationRouter.post(
  '/jobs',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = productionJobInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      await connection.beginTransaction()
      const refs = await resolveJobReferences(connection, input)
      const uid = randomUUID()
      await connection.execute(
        `INSERT INTO production_jobs(
           uid,code,name,description,default_unit_id,position_id,category,
           is_active,created_by,updated_by
         ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [
          uid,
          input.code.toUpperCase(),
          input.name,
          input.description ?? null,
          refs.unitId,
          refs.positionId,
          input.category ?? null,
          input.isActive ? 1 : 0,
          auth.id,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          action: 'CREATE',
          table: 'production_jobs',
          recordUid: uid,
          description: `Menambah pekerjaan Produksi ${input.name}.`,
          afterData: input,
        },
        connection
      )
      await connection.commit()
      res.status(201).json({ uid })
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.patch(
  '/jobs/:uid',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = productionJobInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      await connection.beginTransaction()
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id,code,name,description,default_unit_id defaultUnitId,
                position_id positionId,category,is_active=1 isActive
           FROM production_jobs WHERE uid=? FOR UPDATE`,
        [uid]
      )
      const current = rows[0]
      if (!current) throw new ApiError(404, 'Pekerjaan tidak ditemukan.')
      const refs = await resolveJobReferences(connection, input)
      if (Number(current.defaultUnitId) !== refs.unitId) {
        const [rates] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM production_job_rates
            WHERE production_job_id=? LIMIT 1`,
          [current.id]
        )
        if (rates[0]) {
          throw new ApiError(
            409,
            'Satuan pekerjaan tidak dapat diubah karena histori tarif sudah tersedia.'
          )
        }
      }
      if (Number(current.isActive) === 1 && !input.isActive) {
        const [assignments] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM employee_job_assignments
            WHERE production_job_id=?
              AND status='ACTIVE'
              AND (effective_to IS NULL OR effective_to>=?) LIMIT 1`,
          [current.id, businessDate()]
        )
        if (assignments[0]) {
          throw new ApiError(
            409,
            'Pekerjaan masih memiliki penugasan aktif atau mendatang.'
          )
        }
      }
      await connection.execute(
        `UPDATE production_jobs
            SET code=?,name=?,description=?,default_unit_id=?,position_id=?,
                category=?,is_active=?,updated_by=?
          WHERE id=?`,
        [
          input.code.toUpperCase(),
          input.name,
          input.description ?? null,
          refs.unitId,
          refs.positionId,
          input.category ?? null,
          input.isActive ? 1 : 0,
          auth.id,
          current.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          action: 'UPDATE',
          table: 'production_jobs',
          recordId: Number(current.id),
          recordUid: uid,
          description: `Memperbarui pekerjaan Produksi ${input.name}.`,
          beforeData: current,
          afterData: input,
        },
        connection
      )
      await connection.commit()
      res.status(204).end()
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.get(
  '/rates',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const where = ['1=1']
      const values: unknown[] = []
      const scope = scopeWhere(auth)
      where.push(scope.sql)
      values.push(...scope.params)
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push('(j.code LIKE ? OR j.name LIKE ? OR s.code LIKE ?)')
        values.push(`%${query}%`, `%${query}%`, `%${query}%`)
      }
      const sites = csvValues(req.query.site).filter((value) =>
        productionSiteCode.options.includes(value as never)
      )
      if (sites.length) {
        where.push(`s.code IN (${sites.map(() => '?').join(',')})`)
        values.push(...sites)
      }
      const jobUids = csvValues(req.query.jobUid)
      if (jobUids.length) {
        where.push(`j.uid IN (${jobUids.map(() => '?').join(',')})`)
        values.push(...jobUids)
      }
      const statuses = csvValues(req.query.status).filter((value) =>
        ['DRAFT', 'ACTIVE', 'INACTIVE'].includes(value)
      )
      if (statuses.length) {
        where.push(`r.status IN (${statuses.map(() => '?').join(',')})`)
        values.push(...statuses)
      }
      const activeOn = req.query.activeOn
        ? z.string().date().parse(req.query.activeOn)
        : undefined
      if (activeOn) {
        where.push(
          "r.status='ACTIVE' AND r.effective_from<=? AND (r.effective_to IS NULL OR r.effective_to>=?)"
        )
        values.push(activeOn, activeOn)
      }
      const clause = where.join(' AND ')
      const from = `FROM production_job_rates r
        JOIN sites s ON s.id=r.site_id
        JOIN production_jobs j ON j.id=r.production_job_id
        JOIN work_units u ON u.id=r.unit_id`
      const [count] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${from} WHERE ${clause}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT r.uid,s.code site,j.uid jobUid,j.code jobCode,j.name jobName,
                u.uid unitUid,u.code unitCode,u.name unitName,
                DATE_FORMAT(r.effective_from,'%Y-%m-%d') effectiveFrom,
                DATE_FORMAT(r.effective_to,'%Y-%m-%d') effectiveTo,
                CAST(r.rate_amount AS CHAR) rateAmount,r.currency,r.status,
                r.reference_number referenceNumber,r.notes
           ${from} WHERE ${clause}
          ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      res.json({ items: rows, total: Number(count[0]?.total ?? 0), page, pageSize })
    } catch (error) {
      next(error)
    }
  }
)

productionFoundationRouter.post(
  '/rates',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = productionRateInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.site)
      await connection.beginTransaction()
      const [refs] = await connection.query<RowDataPacket[]>(
        `SELECT s.id siteId,j.id jobId,j.default_unit_id defaultUnitId,
                u.id unitId
           FROM sites s CROSS JOIN production_jobs j CROSS JOIN work_units u
          WHERE s.code=? AND s.is_active=1 AND j.uid=? AND j.is_active=1
            AND u.uid=? AND u.is_active=1`,
        [input.site, input.jobUid, input.unitUid]
      )
      const ref = refs[0]
      if (!ref) throw new ApiError(422, 'Referensi tarif tidak valid atau tidak aktif.')
      if (Number(ref.defaultUnitId) !== Number(ref.unitId)) {
        throw new ApiError(422, 'Satuan tarif harus sama dengan satuan pekerjaan.')
      }
      const uid = randomUUID()
      const rateAmount = normalizeRate(input.rateAmount)
      await connection.execute(
        `INSERT INTO production_job_rates(
           uid,site_id,production_job_id,unit_id,effective_from,effective_to,
           rate_amount,currency,status,reference_number,notes,created_by,updated_by
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          uid,
          ref.siteId,
          ref.jobId,
          ref.unitId,
          input.effectiveFrom,
          input.effectiveTo ?? null,
          rateAmount,
          'IDR',
          'DRAFT',
          input.referenceNumber ?? null,
          input.notes ?? null,
          auth.id,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(ref.siteId),
          action: 'CREATE',
          table: 'production_job_rates',
          recordUid: uid,
          description: 'Membuat draft tarif Produksi.',
          afterData: { ...input, rateAmount, status: 'DRAFT' },
        },
        connection
      )
      await connection.commit()
      res.status(201).json({ uid })
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.patch(
  '/rates/:uid',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = productionRateInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      enforceSite(auth, input.site)
      await connection.beginTransaction()
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT r.id,r.status,s.code site,s.id siteId,j.uid jobUid,u.uid unitUid,
                DATE_FORMAT(r.effective_from,'%Y-%m-%d') effectiveFrom,
                DATE_FORMAT(r.effective_to,'%Y-%m-%d') effectiveTo,
                CAST(r.rate_amount AS CHAR) rateAmount
           FROM production_job_rates r
           JOIN sites s ON s.id=r.site_id
           JOIN production_jobs j ON j.id=r.production_job_id
           JOIN work_units u ON u.id=r.unit_id
          WHERE r.uid=? FOR UPDATE`,
        [uid]
      )
      const current = rows[0]
      if (!current) throw new ApiError(404, 'Tarif tidak ditemukan.')
      enforceSite(auth, current.site)
      if (current.status !== 'DRAFT') {
        throw new ApiError(409, 'Hanya tarif Draft yang dapat diubah.')
      }
      if (current.site !== input.site) {
        throw new ApiError(422, 'Site tarif Draft tidak dapat diubah.')
      }
      const [refs] = await connection.query<RowDataPacket[]>(
        `SELECT j.id jobId,j.default_unit_id defaultUnitId,u.id unitId
           FROM production_jobs j CROSS JOIN work_units u
          WHERE j.uid=? AND j.is_active=1 AND u.uid=? AND u.is_active=1`,
        [input.jobUid, input.unitUid]
      )
      if (!refs[0]) throw new ApiError(422, 'Pekerjaan atau satuan tidak valid.')
      if (Number(refs[0].defaultUnitId) !== Number(refs[0].unitId)) {
        throw new ApiError(422, 'Satuan tarif harus sama dengan satuan pekerjaan.')
      }
      const rateAmount = normalizeRate(input.rateAmount)
      await connection.execute(
        `UPDATE production_job_rates
            SET production_job_id=?,unit_id=?,effective_from=?,effective_to=?,
                rate_amount=?,reference_number=?,notes=?,updated_by=?
          WHERE id=?`,
        [
          refs[0].jobId,
          refs[0].unitId,
          input.effectiveFrom,
          input.effectiveTo ?? null,
          rateAmount,
          input.referenceNumber ?? null,
          input.notes ?? null,
          auth.id,
          current.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(current.siteId),
          action: 'UPDATE',
          table: 'production_job_rates',
          recordId: Number(current.id),
          recordUid: uid,
          description: 'Memperbarui draft tarif Produksi.',
          beforeData: current,
          afterData: { ...input, rateAmount, status: 'DRAFT' },
        },
        connection
      )
      await connection.commit()
      res.status(204).end()
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.post(
  '/rates/:uid/activate',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = rateActivationInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      await connection.beginTransaction()
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT r.id,r.status,r.site_id siteId,r.production_job_id jobId,
                DATE_FORMAT(r.effective_from,'%Y-%m-%d') effectiveFrom,
                DATE_FORMAT(r.effective_to,'%Y-%m-%d') effectiveTo,
                r.rate_amount rateAmount,s.code site
           FROM production_job_rates r
           JOIN sites s ON s.id=r.site_id
          WHERE r.uid=? FOR UPDATE`,
        [uid]
      )
      const draft = rows[0]
      if (!draft) throw new ApiError(404, 'Tarif tidak ditemukan.')
      enforceSite(auth, draft.site)
      if (draft.status !== 'DRAFT') {
        throw new ApiError(409, 'Tarif ini tidak lagi berstatus Draft.')
      }
      if (Number(draft.rateAmount) <= 0) {
        throw new ApiError(422, 'Tarif Aktif harus lebih besar dari nol.')
      }
      const [overlaps] = await connection.query<RowDataPacket[]>(
        `SELECT id,uid,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom,
                DATE_FORMAT(effective_to,'%Y-%m-%d') effectiveTo
           FROM production_job_rates
          WHERE site_id=? AND production_job_id=? AND status='ACTIVE'
            AND effective_from<=?
            AND (effective_to IS NULL OR effective_to>=?)
          FOR UPDATE`,
        [
          draft.siteId,
          draft.jobId,
          draft.effectiveTo ?? '9999-12-31',
          draft.effectiveFrom,
        ]
      )
      if (overlaps.length) {
        const replacement = overlaps.find(
          (row) => row.uid === input.replaceActiveRateUid
        )
        if (!replacement || overlaps.length !== 1) {
          throw new ApiError(
            409,
            'Periode tarif bertumpang-tindih. Pilih satu tarif aktif yang akan digantikan.'
          )
        }
        if (replacement.effectiveFrom >= draft.effectiveFrom) {
          throw new ApiError(
            422,
            'Tarif pengganti harus mulai setelah tarif aktif yang digantikan.'
          )
        }
        const [transactions] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM production_transactions
            WHERE site_id=? AND production_job_id=? AND status='POSTED'
              AND business_date>=? LIMIT 1 FOR UPDATE`,
          [draft.siteId, draft.jobId, draft.effectiveFrom]
        )
        if (transactions[0]) {
          throw new ApiError(
            409,
            'Tarif tidak dapat diaktifkan retroaktif karena rentang sudah memiliki transaksi Produksi.'
          )
        }
        await connection.execute(
          `UPDATE production_job_rates
              SET effective_to=DATE_SUB(?,INTERVAL 1 DAY),updated_by=?
            WHERE id=?`,
          [draft.effectiveFrom, auth.id, replacement.id]
        )
      }
      await connection.execute(
        `UPDATE production_job_rates SET status='ACTIVE',updated_by=? WHERE id=?`,
        [auth.id, draft.id]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(draft.siteId),
          action: 'APPROVE',
          table: 'production_job_rates',
          recordId: Number(draft.id),
          recordUid: uid,
          description: 'Mengaktifkan tarif Produksi.',
          reason: input.reason,
          beforeData: { status: 'DRAFT' },
          afterData: {
            status: 'ACTIVE',
            replacedRateUid: input.replaceActiveRateUid ?? null,
          },
        },
        connection
      )
      await connection.commit()
      res.status(204).end()
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.post(
  '/rates/:uid/cancellation-preview',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      z.object({}).strict().parse(req.body ?? {})
      const auth = res.locals.auth as AuthContext
      const rate = await activeRateContext(connection, routeParam(req.params.uid), false)
      enforceSite(auth, String(rate.site))
      res.json({ source: rate, proposed: { status: 'INACTIVE' }, canApply: true })
    } catch (error) { next(error) } finally { connection.release() }
  }
)

productionFoundationRouter.post(
  '/rates/:uid/cancel',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = productionRateExceptionInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const rateUid = routeParam(req.params.uid)
      await connection.beginTransaction()
      const [replay] = await connection.query<RowDataPacket[]>(
        `SELECT uid,production_job_rate_id rateId,revision_type revisionType,reason
           FROM production_job_rate_revisions
          WHERE idempotency_key=? FOR UPDATE`,
        [input.idempotencyKey]
      )
      if (replay[0]) {
        const [rates] = await connection.query<RowDataPacket[]>(
          'SELECT id FROM production_job_rates WHERE uid=?',
          [rateUid]
        )
        if (
          !rates[0] ||
          Number(rates[0].id) !== Number(replay[0].rateId) ||
          replay[0].revisionType !== 'CANCELLATION' ||
          String(replay[0].reason) !== input.reason
        ) {
          throw new ApiError(
            409,
            'Idempotency key sudah dipakai untuk perubahan tarif lain.'
          )
        }
        await connection.commit()
        return res.json({ duplicate: true, revisionUid: replay[0].uid })
      }
      const rate = await activeRateContext(connection, rateUid, true)
      enforceSite(auth, String(rate.site))
      const after = { status: 'INACTIVE' }
      await connection.execute(
        "UPDATE production_job_rates SET status='INACTIVE',updated_by=? WHERE id=?",
        [auth.id, rate.id]
      )
      const revisionUid = randomUUID()
      await connection.execute(
        `INSERT INTO production_job_rate_revisions(
           uid,production_job_rate_id,revision_type,idempotency_key,
           before_data,after_data,reason,revised_by
         ) VALUES(?,?,'CANCELLATION',?,?,?,?,?)`,
        [
          revisionUid,
          rate.id,
          input.idempotencyKey,
          JSON.stringify(rate),
          JSON.stringify(after),
          input.reason,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(rate.siteId),
          action: 'UPDATE',
          table: 'production_job_rates',
          recordId: Number(rate.id),
          recordUid: rateUid,
          description: 'Membatalkan tarif aktif yang belum digunakan.',
          reason: input.reason,
          beforeData: rate,
          afterData: after,
        },
        connection
      )
      await connection.commit()
      res.json({ duplicate: false, revisionUid })
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.post(
  '/rates/:uid/correction-preview',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = productionActiveRateCorrectionInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const rate = await activeRateContext(connection, routeParam(req.params.uid), false)
      enforceSite(auth, String(rate.site))
      if (input.effectiveTo && input.effectiveTo < rate.effectiveFrom) {
        throw new ApiError(422, 'Tanggal selesai mendahului tanggal mulai tarif.')
      }
      res.json({
        source: rate,
        proposed: {
          rateAmount: normalizeRate(input.rateAmount),
          effectiveTo: input.effectiveTo ?? null,
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? null,
        },
        canApply: true,
      })
    } catch (error) {
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.post(
  '/rates/:uid/correct',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = productionActiveRateCorrectionInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const rateUid = routeParam(req.params.uid)
      const after = {
        rateAmount: normalizeRate(input.rateAmount),
        effectiveTo: input.effectiveTo ?? null,
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
      }
      await connection.beginTransaction()
      const [replay] = await connection.query<RowDataPacket[]>(
        `SELECT uid,production_job_rate_id rateId,revision_type revisionType,
                reason,after_data afterData
           FROM production_job_rate_revisions
          WHERE idempotency_key=? FOR UPDATE`,
        [input.idempotencyKey]
      )
      if (replay[0]) {
        const [rates] = await connection.query<RowDataPacket[]>(
          'SELECT id FROM production_job_rates WHERE uid=?',
          [rateUid]
        )
        const replayAfter =
          typeof replay[0].afterData === 'string'
            ? JSON.parse(replay[0].afterData)
            : replay[0].afterData
        if (
          !rates[0] ||
          Number(rates[0].id) !== Number(replay[0].rateId) ||
          replay[0].revisionType !== 'CORRECTION' ||
          String(replay[0].reason) !== input.reason ||
          JSON.stringify(replayAfter) !== JSON.stringify(after)
        ) {
          throw new ApiError(
            409,
            'Idempotency key sudah dipakai untuk perubahan tarif lain.'
          )
        }
        await connection.commit()
        return res.json({ duplicate: true, revisionUid: replay[0].uid })
      }
      const rate = await activeRateContext(connection, rateUid, true)
      enforceSite(auth, String(rate.site))
      if (input.effectiveTo && input.effectiveTo < rate.effectiveFrom) {
        throw new ApiError(422, 'Tanggal selesai mendahului tanggal mulai tarif.')
      }
      const [overlap] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM production_job_rates
          WHERE site_id=? AND production_job_id=? AND id<>? AND status='ACTIVE'
            AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
          LIMIT 1 FOR UPDATE`,
        [
          rate.siteId,
          rate.jobId,
          rate.id,
          input.effectiveTo ?? '9999-12-31',
          rate.effectiveFrom,
        ]
      )
      if (overlap[0]) {
        throw new ApiError(
          409,
          'Periode koreksi tarif bertumpang-tindih tarif aktif lain.'
        )
      }
      await connection.execute(
        `UPDATE production_job_rates
            SET rate_amount=?,effective_to=?,reference_number=?,notes=?,updated_by=?
          WHERE id=?`,
        [
          after.rateAmount,
          after.effectiveTo,
          after.referenceNumber,
          after.notes,
          auth.id,
          rate.id,
        ]
      )
      const revisionUid = randomUUID()
      await connection.execute(
        `INSERT INTO production_job_rate_revisions(
           uid,production_job_rate_id,revision_type,idempotency_key,
           before_data,after_data,reason,revised_by
         ) VALUES(?,?,'CORRECTION',?,?,?,?,?)`,
        [
          revisionUid,
          rate.id,
          input.idempotencyKey,
          JSON.stringify(rate),
          JSON.stringify(after),
          input.reason,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(rate.siteId),
          action: 'UPDATE',
          table: 'production_job_rates',
          recordId: Number(rate.id),
          recordUid: rateUid,
          description: 'Mengoreksi tarif aktif yang belum digunakan.',
          reason: input.reason,
          beforeData: rate,
          afterData: after,
        },
        connection
      )
      await connection.commit()
      res.json({ duplicate: false, revisionUid })
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.get(
  '/assignment-readiness',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const asOf = req.query.asOf
        ? z.string().date().parse(req.query.asOf)
        : businessDate()
      const issue = productionAssignmentReadinessIssue.parse(
        String(req.query.issue ?? 'ALL').toUpperCase()
      )
      const requestedSites = csvValues(req.query.site)
      const invalidSite = requestedSites.find(
        (value) => !productionSiteCode.options.includes(value as never)
      )
      if (invalidSite) {
        throw new ApiError(422, `Site ${invalidSite} tidak valid.`)
      }

      const where = [
        'eh.effective_from<=?',
        '(eh.effective_to IS NULL OR eh.effective_to>=?)',
        'es.allows_production=1',
        "et.code IN ('BORONGAN','TRAINING')",
        `(SELECT COUNT(*)
            FROM employee_employment_histories active_history
           WHERE active_history.employee_id=eh.employee_id
             AND active_history.effective_from<=?
             AND (active_history.effective_to IS NULL OR active_history.effective_to>=?))=1`,
      ]
      const values: unknown[] = [asOf, asOf, asOf, asOf]
      const scope = scopeWhere(auth)
      where.push(scope.sql)
      values.push(...scope.params)
      if (requestedSites.length) {
        where.push(`s.code IN (${requestedSites.map(() => '?').join(',')})`)
        values.push(...requestedSites)
      }
      const facetWhere = [...where]
      const facetValues = [...values]
      const employeeTypes = csvValues(req.query.employeeType)
      const invalidEmployeeType = employeeTypes.find(
        (value) => !productionEligibleEmployeeType.options.includes(value as never)
      )
      if (invalidEmployeeType) {
        throw new ApiError(422, `Jenis karyawan ${invalidEmployeeType} tidak valid.`)
      }
      if (employeeTypes.length) {
        where.push(`et.code IN (${employeeTypes.map(() => '?').join(',')})`)
        values.push(...employeeTypes)
      }
      const productionSectionUids = csvValues(req.query.productionSectionUid)
      const invalidProductionSectionUid = productionSectionUids.find(
        (value) => !z.string().uuid().safeParse(value).success
      )
      if (invalidProductionSectionUid) {
        throw new ApiError(422, 'UID Bagian Produksi tidak valid.')
      }
      if (productionSectionUids.length) {
        where.push(
          `ps.uid IN (${productionSectionUids.map(() => '?').join(',')})`
        )
        values.push(...productionSectionUids)
      }
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push(
          `(e.employee_number LIKE ? OR e.full_name LIKE ?
            OR et.code LIKE ? OR ps.code LIKE ? OR ps.name LIKE ?)`
        )
        values.push(
          `%${query}%`,
          `%${query}%`,
          `%${query}%`,
          `%${query}%`,
          `%${query}%`
        )
      }

      const baseQuery = `SELECT
          e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,
          et.code employeeType,s.code site,s.name siteName,
          ps.uid productionSectionUid,ps.code productionSectionCode,
          ps.name productionSectionName,
          COUNT(a.id) assignmentCount,
          SUM(CASE WHEN a.is_primary=1 THEN 1 ELSE 0 END) primaryAssignmentCount,
          MAX(CASE WHEN a.is_primary=1 THEN j.uid END) primaryJobUid,
          MAX(CASE WHEN a.is_primary=1 THEN j.code END) primaryJobCode,
          MAX(CASE WHEN a.is_primary=1 THEN j.name END) primaryJobName
        FROM employee_employment_histories eh
        JOIN employees e ON e.id=eh.employee_id
        JOIN employee_statuses es ON es.id=eh.employee_status_id
        JOIN employee_types et ON et.id=eh.employee_type_id
        JOIN sites s ON s.id=eh.site_id
        LEFT JOIN production_module_sections pms
          ON pms.id=eh.production_module_section_id
        LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
        LEFT JOIN employee_job_assignments a
          ON a.employee_id=eh.employee_id AND a.site_id=eh.site_id
         AND a.status='ACTIVE'
         AND a.effective_from<=?
         AND (a.effective_to IS NULL OR a.effective_to>=?)
        LEFT JOIN production_jobs j ON j.id=a.production_job_id
        WHERE ${where.join(' AND ')}
        GROUP BY e.id,e.uid,e.employee_number,e.full_name,et.code,
                 s.id,s.code,s.name,ps.uid,ps.code,ps.name`
      const baseValues = [asOf, asOf, ...values]
      const issueWhere =
        issue === 'UNASSIGNED'
          ? 'assignmentCount=0'
          : issue === 'MISSING_PRIMARY'
            ? 'primaryAssignmentCount=0'
            : issue === 'AMBIGUOUS_PRIMARY'
              ? 'primaryAssignmentCount>1'
              : issue === 'READY'
                ? 'assignmentCount>0 AND primaryAssignmentCount=1'
                : '1=1'

      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total FROM (${baseQuery}) assignment_readiness
          WHERE ${issueWhere}`,
        baseValues
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${baseQuery}) assignment_readiness
          WHERE ${issueWhere}
          ORDER BY fullName,employeeNumber
          LIMIT ? OFFSET ?`,
        [...baseValues, pageSize, (page - 1) * pageSize]
      )
      const [facetRows] = await pool.query<RowDataPacket[]>(
        `SELECT et.code employeeType,s.code site,
                ps.uid productionSectionUid,ps.code productionSectionCode,
                ps.name productionSectionName
           FROM employee_employment_histories eh
           JOIN employee_statuses es ON es.id=eh.employee_status_id
           JOIN employee_types et ON et.id=eh.employee_type_id
           JOIN sites s ON s.id=eh.site_id
           LEFT JOIN production_module_sections pms
             ON pms.id=eh.production_module_section_id
           LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
          WHERE ${facetWhere.join(' AND ')}
          GROUP BY et.code,s.code,ps.uid,ps.code,ps.name
          ORDER BY et.code,s.code,ps.name`,
        facetValues
      )

      const employeeTypeFacets = [
        ...new Set(facetRows.map((row) => String(row.employeeType))),
      ]
      const productionSectionFacets = [
        ...new Map(
          facetRows
            .filter((row) => row.productionSectionUid)
            .map((row) => [
              String(row.productionSectionUid),
              {
                uid: row.productionSectionUid,
                code: row.productionSectionCode,
                name: row.productionSectionName,
                site: row.site,
              },
            ])
        ).values(),
      ]

      res.json({
        items: rows.map((row) => {
          const assignmentCount = Number(row.assignmentCount ?? 0)
          const primaryAssignmentCount = Number(row.primaryAssignmentCount ?? 0)
          const issueCodes = [
            assignmentCount === 0 ? 'UNASSIGNED' : null,
            primaryAssignmentCount === 0 ? 'MISSING_PRIMARY' : null,
            primaryAssignmentCount > 1 ? 'AMBIGUOUS_PRIMARY' : null,
          ].filter(Boolean)
          return {
            employee: {
              uid: row.employeeUid,
              employeeNumber: row.employeeNumber,
              fullName: row.fullName,
              employeeType: row.employeeType,
            },
            site: { code: row.site, name: row.siteName },
            productionSection: row.productionSectionUid
              ? {
                  uid: row.productionSectionUid,
                  code: row.productionSectionCode,
                  name: row.productionSectionName,
                }
              : null,
            assignmentCount,
            primaryAssignmentCount,
            currentPrimaryJob:
              primaryAssignmentCount === 1 && row.primaryJobUid
                ? {
                    uid: row.primaryJobUid,
                    code: row.primaryJobCode,
                    name: row.primaryJobName,
                  }
                : null,
            issueCodes,
          }
        }),
        total: Number(countRows[0]?.total ?? 0),
        page,
        pageSize,
        asOf,
        issue,
        facets: {
          employeeTypes: employeeTypeFacets,
          productionSections: productionSectionFacets,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

productionFoundationRouter.get(
  '/eligible-employees',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const asOf = req.query.asOf ? z.string().date().parse(req.query.asOf) : businessDate()
      const site = productionSiteCode.parse(String(req.query.site ?? ''))
      enforceSite(auth, site)
      const query = String(req.query.query ?? '').trim()
      const values: unknown[] = [site, asOf, asOf, asOf, asOf]
      const search = query ? 'AND (e.employee_number LIKE ? OR e.full_name LIKE ?)' : ''
      if (query) values.push(`%${query}%`, `%${query}%`)
      const from = `FROM employee_employment_histories eh
        JOIN employees e ON e.id=eh.employee_id
        JOIN sites s ON s.id=eh.site_id
        JOIN employee_statuses es ON es.id=eh.employee_status_id AND es.allows_production=1
        JOIN employee_types et ON et.id=eh.employee_type_id AND et.code IN ('BORONGAN','TRAINING')
        LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
        LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
       WHERE s.code=? AND eh.effective_from<=? AND (eh.effective_to IS NULL OR eh.effective_to>=?)
         AND (SELECT COUNT(*) FROM employee_employment_histories active_history
               WHERE active_history.employee_id=e.id AND active_history.effective_from<=?
                 AND (active_history.effective_to IS NULL OR active_history.effective_to>=?))=1 ${search}`
      const [counts] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total ${from}`, values)
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT e.id employeeId,e.uid,e.employee_number employeeNumber,e.full_name fullName,s.code site,
                et.code employeeType,ps.uid productionSectionUid,ps.code productionSectionCode,
                ps.name productionSectionName,
                (SELECT COUNT(*) FROM employee_job_assignments a
                  WHERE a.employee_id=e.id AND a.site_id=eh.site_id AND a.status='ACTIVE'
                    AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)) assignmentCount,
                EXISTS(SELECT 1 FROM employee_job_assignments a
                  WHERE a.employee_id=e.id AND a.site_id=eh.site_id AND a.status='ACTIVE'
                    AND a.is_primary=1 AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)) hasPrimary
           ${from} ORDER BY e.full_name,e.employee_number LIMIT ? OFFSET ?`,
        [asOf,asOf,asOf,asOf,...values,pageSize,(page-1)*pageSize]
      )

      const assignmentsByEmployee = new Map<number, Array<{
        uid: string
        jobUid: string
        jobCode: string
        jobName: string
        isPrimary: boolean
        unit: { uid: string; code: string; name: string; decimalPrecision: number }
        rate: { uid: string; amount: string; currency: string }
      }>>()
      const employeeIds = rows.map((row) => Number(row.employeeId))
      if (employeeIds.length > 0) {
        const employeePlaceholders = employeeIds.map(() => '?').join(',')
        const [assignmentRows] = await pool.query<RowDataPacket[]>(
          `SELECT a.employee_id employeeId,a.uid,j.uid jobUid,j.code jobCode,j.name jobName,
                  a.is_primary=1 isPrimary,u.uid unitUid,u.code unitCode,u.name unitName,
                  u.decimal_precision decimalPrecision,r.uid rateUid,
                  CAST(r.rate_amount AS CHAR) rateAmount,r.currency
             FROM employee_job_assignments a
             JOIN sites s ON s.id=a.site_id AND s.code=?
             JOIN production_jobs j ON j.id=a.production_job_id AND j.is_active=1
             JOIN work_units u ON u.id=j.default_unit_id AND u.is_active=1
             JOIN production_job_rates r ON r.site_id=a.site_id
              AND r.production_job_id=a.production_job_id AND r.status='ACTIVE'
              AND r.effective_from<=? AND (r.effective_to IS NULL OR r.effective_to>=?)
            WHERE a.employee_id IN (${employeePlaceholders}) AND a.status='ACTIVE'
              AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)
              AND (SELECT COUNT(*) FROM production_job_rates active_rate
                    WHERE active_rate.site_id=a.site_id
                      AND active_rate.production_job_id=a.production_job_id
                      AND active_rate.status='ACTIVE' AND active_rate.effective_from<=?
                      AND (active_rate.effective_to IS NULL OR active_rate.effective_to>=?))=1
            ORDER BY a.employee_id,a.is_primary DESC,j.name,j.code`,
          [site,asOf,asOf,...employeeIds,asOf,asOf,asOf,asOf]
        )
        for (const assignment of assignmentRows) {
          const employeeId = Number(assignment.employeeId)
          const existing = assignmentsByEmployee.get(employeeId) ?? []
          existing.push({
            uid: assignment.uid,
            jobUid: assignment.jobUid,
            jobCode: assignment.jobCode,
            jobName: assignment.jobName,
            isPrimary: Number(assignment.isPrimary) === 1,
            unit: {
              uid: assignment.unitUid,
              code: assignment.unitCode,
              name: assignment.unitName,
              decimalPrecision: Number(assignment.decimalPrecision),
            },
            rate: {
              uid: assignment.rateUid,
              amount: String(assignment.rateAmount),
              currency: assignment.currency,
            },
          })
          assignmentsByEmployee.set(employeeId, existing)
        }
      }

      res.json({ items: rows.map((row) => ({
        uid:row.uid,employeeNumber:row.employeeNumber,fullName:row.fullName,site:row.site,employeeType:row.employeeType,
        productionSection:row.productionSectionUid?{uid:row.productionSectionUid,code:row.productionSectionCode,name:row.productionSectionName}:null,
        assignments: assignmentsByEmployee.get(Number(row.employeeId)) ?? [],
        assignmentCount:Number(row.assignmentCount),hasPrimary:Number(row.hasPrimary)===1,
      })),total:Number(counts[0]?.total??0),page,pageSize,asOf })
    } catch (error) { next(error) }
  }
)

productionFoundationRouter.get(
  '/assignments',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const where = ['1=1']
      const values: unknown[] = []
      const scope = scopeWhere(auth)
      where.push(scope.sql)
      values.push(...scope.params)
      const sites = csvValues(req.query.site).filter((value) =>
        productionSiteCode.options.includes(value as never)
      )
      if (sites.length) {
        where.push(`s.code IN (${sites.map(() => '?').join(',')})`)
        values.push(...sites)
      }
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push('(e.employee_number LIKE ? OR e.full_name LIKE ? OR j.name LIKE ?)')
        values.push(`%${query}%`, `%${query}%`, `%${query}%`)
      }
      const statuses = csvValues(req.query.status).filter((value) =>
        ['ACTIVE', 'UPCOMING', 'ENDED', 'CANCELLED'].includes(value)
      )
      const statusExpression = assignmentStatusSql('a')
      if (statuses.length) {
        where.push(
          `${statusExpression} IN (${statuses.map(() => '?').join(',')})`
        )
        values.push(...statuses)
      }
      const clause = where.join(' AND ')
      const from = `FROM employee_job_assignments a
        JOIN employees e ON e.id=a.employee_id
        JOIN production_jobs j ON j.id=a.production_job_id
        JOIN sites s ON s.id=a.site_id`
      const [count] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${from} WHERE ${clause}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT a.uid,e.uid employeeUid,e.employee_number employeeNumber,
                e.full_name fullName,s.code site,j.uid jobUid,j.code jobCode,
                j.name jobName,DATE_FORMAT(a.effective_from,'%Y-%m-%d') effectiveFrom,
                DATE_FORMAT(a.effective_to,'%Y-%m-%d') effectiveTo,
                a.is_primary=1 isPrimary,${statusExpression} status
           ${from} WHERE ${clause}
          ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      res.json({
        items: rows.map((row) => ({
          uid: row.uid,
          employee: {
            uid: row.employeeUid,
            employeeNumber: row.employeeNumber,
            fullName: row.fullName,
          },
          site: row.site,
          job: { uid: row.jobUid, code: row.jobCode, name: row.jobName },
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
          isPrimary: Number(row.isPrimary) === 1,
          status: row.status,
        })),
        total: Number(count[0]?.total ?? 0),
        page,
        pageSize,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Endpoint kompatibilitas untuk detail karyawan. Scope site dipaksakan di SQL
// agar satu karyawan yang pernah berpindah site tidak membocorkan histori.
productionFoundationRouter.get(
  '/assignments/:employeeUid',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const scope = scopeWhere(auth)
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT a.uid,j.uid jobUid,j.code jobCode,j.name jobName,s.code site,
                DATE_FORMAT(a.effective_from,'%Y-%m-%d') effectiveFrom,
                DATE_FORMAT(a.effective_to,'%Y-%m-%d') effectiveTo,
                a.is_primary=1 isPrimary,${assignmentStatusSql('a')} status
           FROM employee_job_assignments a
           JOIN employees e ON e.id=a.employee_id
           JOIN sites s ON s.id=a.site_id
           JOIN production_jobs j ON j.id=a.production_job_id
          WHERE e.uid=? AND ${scope.sql}
          ORDER BY a.effective_from DESC,a.id DESC`,
        [routeParam(req.params.employeeUid), ...scope.params]
      )
      res.json(
        rows.map((row) => ({
          ...row,
          isPrimary: Number(row.isPrimary) === 1,
        }))
      )
    } catch (error) {
      next(error)
    }
  }
)

productionFoundationRouter.post(
  '/assignments',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = productionAssignmentInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.site)
      await connection.beginTransaction()
      const [refs] = await connection.query<RowDataPacket[]>(
        `SELECT e.id employeeId,j.id jobId,s.id siteId
           FROM employees e CROSS JOIN production_jobs j CROSS JOIN sites s
          WHERE e.uid=? AND j.uid=? AND j.is_active=1
            AND s.code=? AND s.is_active=1`,
        [input.employeeUid, input.jobUid, input.site]
      )
      const ref = refs[0]
      if (!ref) throw new ApiError(422, 'Karyawan, pekerjaan, atau site tidak valid.')
      const [histories] = await connection.query<RowDataPacket[]>(
        `SELECT eh.id
           FROM employee_employment_histories eh
           JOIN employee_statuses es ON es.id=eh.employee_status_id
           JOIN employee_types et ON et.id=eh.employee_type_id
          WHERE eh.employee_id=? AND eh.site_id=?
            AND es.allows_production=1 AND et.code IN ('BORONGAN','TRAINING')
            AND eh.effective_from<=?
            AND (eh.effective_to IS NULL OR eh.effective_to>=?)
            AND (
              (? IS NULL AND eh.effective_to IS NULL)
              OR
              (? IS NOT NULL AND (eh.effective_to IS NULL OR eh.effective_to>=?))
            )
          FOR UPDATE`,
        [
          ref.employeeId,
          ref.siteId,
          input.effectiveFrom,
          input.effectiveFrom,
          input.effectiveTo ?? null,
          input.effectiveTo ?? null,
          input.effectiveTo ?? null,
        ]
      )
      if (histories.length !== 1) {
        throw new ApiError(
          422,
          'Periode penugasan harus berada dalam satu histori kerja Produksi yang eligible pada site yang sama.'
        )
      }
      const periodEnd = input.effectiveTo ?? '9999-12-31'
      const [overlaps] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM employee_job_assignments
          WHERE employee_id=? AND production_job_id=? AND site_id=? AND status='ACTIVE'
            AND effective_from<=?
            AND (effective_to IS NULL OR effective_to>=?)
          LIMIT 1 FOR UPDATE`,
        [ref.employeeId, ref.jobId, ref.siteId, periodEnd, input.effectiveFrom]
      )
      if (overlaps[0]) {
        throw new ApiError(409, 'Penugasan pekerjaan yang sama bertumpang-tindih.')
      }
      if (input.isPrimary) {
        const [primary] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM employee_job_assignments
            WHERE employee_id=? AND site_id=? AND is_primary=1 AND status='ACTIVE'
              AND effective_from<=?
              AND (effective_to IS NULL OR effective_to>=?)
            LIMIT 1 FOR UPDATE`,
          [ref.employeeId, ref.siteId, periodEnd, input.effectiveFrom]
        )
        if (primary[0]) {
          throw new ApiError(409, 'Karyawan sudah memiliki pekerjaan utama pada periode tersebut.')
        }
      }
      const uid = randomUUID()
      await connection.execute(
        `INSERT INTO employee_job_assignments(
           uid,employee_id,production_job_id,site_id,effective_from,effective_to,
           is_primary,created_by,updated_by
         ) VALUES(?,?,?,?,?,?,?,?,?)`,
        [
          uid,
          ref.employeeId,
          ref.jobId,
          ref.siteId,
          input.effectiveFrom,
          input.effectiveTo ?? null,
          input.isPrimary ? 1 : 0,
          auth.id,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(ref.siteId),
          action: 'CREATE',
          table: 'employee_job_assignments',
          recordUid: uid,
          description: 'Menambah penugasan pekerjaan Produksi.',
          reason: input.reason,
          afterData: input,
        },
        connection
      )
      await connection.commit()
      res.status(201).json({ uid })
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.post(
  '/assignments/:uid/close',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = closeProductionAssignmentInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      await connection.beginTransaction()
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT a.id,a.employee_id employeeId,a.production_job_id jobId,
                a.site_id siteId,a.status,s.code site,
                DATE_FORMAT(a.effective_from,'%Y-%m-%d') effectiveFrom,
                DATE_FORMAT(a.effective_to,'%Y-%m-%d') effectiveTo
           FROM employee_job_assignments a
           JOIN sites s ON s.id=a.site_id
          WHERE a.uid=? FOR UPDATE`,
        [uid]
      )
      const assignment = rows[0]
      if (!assignment) throw new ApiError(404, 'Penugasan tidak ditemukan.')
      enforceSite(auth, assignment.site)
      if (assignment.status !== 'ACTIVE') {
        throw new ApiError(409, 'Penugasan yang dibatalkan tidak dapat ditutup.')
      }
      if (assignment.effectiveTo) {
        throw new ApiError(409, 'Penugasan ini sudah memiliki tanggal selesai.')
      }
      if (input.effectiveTo < assignment.effectiveFrom) {
        throw new ApiError(422, 'Tanggal selesai mendahului awal penugasan.')
      }
      const [transactions] = await connection.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(MAX(business_date),'%Y-%m-%d') lastBusinessDate
           FROM production_transactions
          WHERE employee_id=? AND production_job_id=? AND site_id=?
            AND status='POSTED'`,
        [assignment.employeeId, assignment.jobId, assignment.siteId]
      )
      if (
        transactions[0]?.lastBusinessDate &&
        String(transactions[0].lastBusinessDate) > input.effectiveTo
      ) {
        throw new ApiError(
          409,
          'Penugasan masih dipakai transaksi Produksi setelah tanggal selesai tersebut.'
        )
      }
      const [lockedPeriods] = await connection.query<RowDataPacket[]>(
        `SELECT pp.id FROM payroll_periods pp
          WHERE pp.site_id=? AND pp.payroll_basis='PIECE_RATE'
            AND pp.period_end>?
            AND (
              pp.status IN ('CALCULATED','APPROVED','CLOSED')
              OR EXISTS(SELECT 1 FROM payroll_runs pr
                WHERE pr.payroll_period_id=pp.id AND pr.status='PROCESSING')
            )
          LIMIT 1 FOR UPDATE`,
        [assignment.siteId, input.effectiveTo]
      )
      if (lockedPeriods[0]) {
        throw new ApiError(
          409,
          'Penugasan tidak dapat ditutup karena periode setelah tanggal tersebut sudah diproses Payroll.'
        )
      }
      await connection.execute(
        `UPDATE employee_job_assignments
            SET effective_to=?,updated_by=? WHERE id=?`,
        [input.effectiveTo, auth.id, assignment.id]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(assignment.siteId),
          action: 'UPDATE',
          table: 'employee_job_assignments',
          recordId: Number(assignment.id),
          recordUid: uid,
          description: 'Menutup penugasan pekerjaan Produksi.',
          reason: input.reason,
          beforeData: assignment,
          afterData: { effectiveTo: input.effectiveTo },
        },
        connection
      )
      await connection.commit()
      res.status(204).end()
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.post(
  '/assignments/:uid/correction-preview',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = productionAssignmentCorrectionInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const proposal = await assignmentCorrectionProposal(
        connection,
        routeParam(req.params.uid),
        input,
        false
      )
      enforceSite(auth, String(proposal.current.site))
      res.json({
        source: proposal.current,
        proposed: proposal.proposed,
        impact: { postedTransactions: proposal.transactionCount },
        canApply: true,
      })
    } catch (error) {
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.post(
  '/assignments/:uid/correct',
  requirePermission('production.manage_master'),
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = productionAssignmentCorrectionInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const assignmentUid = routeParam(req.params.uid)
      await connection.beginTransaction()
      const [replays] = await connection.query<RowDataPacket[]>(
        `SELECT revision.uid,revision.employee_job_assignment_id assignmentId,
                revision.after_data afterData,revision.reason
           FROM employee_job_assignment_revisions revision WHERE revision.idempotency_key=? FOR UPDATE`,
        [input.idempotencyKey]
      )
      if (replays[0]) {
        const [assignmentRows] = await connection.query<RowDataPacket[]>(
          'SELECT id FROM employee_job_assignments WHERE uid=?',
          [assignmentUid]
        )
        const replayAfter =
          typeof replays[0].afterData === 'string'
            ? JSON.parse(replays[0].afterData)
            : replays[0].afterData
        const requestedAfter = {
          jobUid: input.jobUid,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          isPrimary: input.isPrimary,
        }
        if (
          !assignmentRows[0] ||
          Number(assignmentRows[0].id) !== Number(replays[0].assignmentId) ||
          String(replays[0].reason) !== input.reason ||
          JSON.stringify(replayAfter) !== JSON.stringify(requestedAfter)
        ) {
          throw new ApiError(
            409,
            'Idempotency key sudah dipakai untuk koreksi lain.'
          )
        }
        await connection.commit()
        return res.json({ duplicate: true, revisionUid: replays[0].uid })
      }
      const proposal = await assignmentCorrectionProposal(
        connection,
        assignmentUid,
        input,
        true
      )
      enforceSite(auth, String(proposal.current.site))
      const before = {
        jobUid: proposal.current.jobUid,
        effectiveFrom: proposal.current.effectiveFrom,
        effectiveTo: proposal.current.effectiveTo ?? null,
        isPrimary: Number(proposal.current.isPrimary) === 1,
      }
      const after = {
        jobUid: input.jobUid,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        isPrimary: input.isPrimary,
      }
      await connection.execute(
        `UPDATE employee_job_assignments
            SET production_job_id=?,effective_from=?,effective_to=?,is_primary=?,updated_by=?
          WHERE id=?`,
        [
          proposal.job.id,
          input.effectiveFrom,
          input.effectiveTo ?? null,
          input.isPrimary ? 1 : 0,
          auth.id,
          proposal.current.id,
        ]
      )
      const revisionUid = randomUUID()
      await connection.execute(
        `INSERT INTO employee_job_assignment_revisions(
           uid,employee_job_assignment_id,idempotency_key,before_data,
           after_data,reason,revised_by
         ) VALUES(?,?,?,?,?,?,?)`,
        [
          revisionUid,
          proposal.current.id,
          input.idempotencyKey,
          JSON.stringify(before),
          JSON.stringify(after),
          input.reason,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'PRODUCTION',
          siteId: Number(proposal.current.siteId),
          action: 'UPDATE',
          table: 'employee_job_assignments',
          recordId: Number(proposal.current.id),
          recordUid: assignmentUid,
          description: 'Mengoreksi histori penugasan pekerjaan Produksi.',
          reason: input.reason,
          beforeData: before,
          afterData: after,
        },
        connection
      )
      await connection.commit()
      res.json({ duplicate: false, revisionUid })
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

productionFoundationRouter.get(
  '/readiness',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const asOf = req.query.asOf
        ? z.string().date().parse(req.query.asOf)
        : businessDate()
      const requestedSites = csvValues(req.query.site).filter((value) =>
        productionSiteCode.options.includes(value as never)
      )
      const scope = scopeWhere(auth)
      const where = [scope.sql]
      const values: unknown[] = [...scope.params]
      if (requestedSites.length) {
        where.push(`s.code IN (${requestedSites.map(() => '?').join(',')})`)
        values.push(...requestedSites)
      }
      const [sites] = await pool.query<RowDataPacket[]>(
        `SELECT s.id,s.code site,s.name siteName
           FROM sites s WHERE s.is_active=1 AND ${where.join(' AND ')}
          ORDER BY s.code`,
        values
      )
      const items = []
      for (const site of sites) {
        const [metricsRows] = await pool.query<RowDataPacket[]>(
          `SELECT
             COUNT(*) eligibleEmployees,
             SUM(NOT EXISTS(
               SELECT 1 FROM employee_job_assignments a
                WHERE a.employee_id=eligible.employeeId AND a.site_id=? AND a.status='ACTIVE'
                  AND a.effective_from<=?
                  AND (a.effective_to IS NULL OR a.effective_to>=?)
             )) employeesWithoutAssignment,
             SUM(NOT EXISTS(
               SELECT 1 FROM employee_job_assignments a
                WHERE a.employee_id=eligible.employeeId AND a.site_id=? AND a.status='ACTIVE'
                  AND a.is_primary=1 AND a.effective_from<=?
                  AND (a.effective_to IS NULL OR a.effective_to>=?)
             )) employeesWithoutPrimaryAssignment,
             SUM((SELECT COUNT(*) FROM employee_job_assignments a
                   WHERE a.employee_id=eligible.employeeId AND a.site_id=? AND a.status='ACTIVE'
                     AND a.is_primary=1 AND a.effective_from<=?
                     AND (a.effective_to IS NULL OR a.effective_to>=?))>1)
               employeesWithAmbiguousPrimary
           FROM (
             SELECT eh.employee_id employeeId
               FROM employee_employment_histories eh
               JOIN employee_statuses es ON es.id=eh.employee_status_id
               JOIN employee_types et ON et.id=eh.employee_type_id
              WHERE eh.site_id=? AND es.allows_production=1
                AND et.code IN ('BORONGAN','TRAINING')
                AND eh.effective_from<=?
                AND (eh.effective_to IS NULL OR eh.effective_to>=?)
                AND (SELECT COUNT(*)
                       FROM employee_employment_histories active_history
                      WHERE active_history.employee_id=eh.employee_id
                        AND active_history.effective_from<=?
                        AND (active_history.effective_to IS NULL
                             OR active_history.effective_to>=?))=1
           ) eligible`,
          [
            site.id,
            asOf,
            asOf,
            site.id,
            asOf,
            asOf,
            site.id,
            asOf,
            asOf,
            site.id,
            asOf,
            asOf,
            asOf,
            asOf,
          ]
        )
        const employeeMetrics = metricsRows[0] ?? {}
        const [jobMetricsRows] = await pool.query<RowDataPacket[]>(
          `SELECT
             COUNT(*) assignedJobs,
             SUM(rateCount=0) assignedJobsWithoutActiveRate,
             SUM(rateCount>1) assignedJobsWithAmbiguousRate,
             SUM(jobActive=0) inactiveAssignedJobs,
             SUM(unitActive=0) inactiveAssignedUnits
           FROM (
             SELECT a.production_job_id,j.is_active jobActive,u.is_active unitActive,
                    (SELECT COUNT(*) FROM production_job_rates r
                      WHERE r.site_id=a.site_id
                        AND r.production_job_id=a.production_job_id
                        AND r.status='ACTIVE' AND r.effective_from<=?
                        AND (r.effective_to IS NULL OR r.effective_to>=?)) rateCount
               FROM employee_job_assignments a
               JOIN production_jobs j ON j.id=a.production_job_id
               JOIN work_units u ON u.id=j.default_unit_id
              WHERE a.site_id=? AND a.status='ACTIVE' AND a.effective_from<=?
                AND (a.effective_to IS NULL OR a.effective_to>=?)
              GROUP BY a.production_job_id,a.site_id,j.is_active,u.is_active
           ) assigned`,
          [asOf, asOf, site.id, asOf, asOf]
        )
        const jobMetrics = jobMetricsRows[0] ?? {}
        const [deviceRows] = await pool.query<RowDataPacket[]>(
          `SELECT COUNT(*) readyProductionDevices FROM scan_devices
            WHERE site_id=? AND is_active=1 AND device_type IN ('USB_SCANNER','TERMINAL')
              AND production_activated_at IS NOT NULL AND production_token_hash IS NOT NULL`,
          [site.id]
        )
        const [adminRows] = await pool.query<RowDataPacket[]>(
          `SELECT COUNT(DISTINCT u.id) activeProductionAdmins
             FROM users u
             JOIN user_roles ur ON ur.user_id=u.id
             JOIN roles role ON role.id=ur.role_id AND role.code='PRODUCTION_ADMIN'
             JOIN user_site_access usa ON usa.user_id=u.id AND usa.site_id=?
            WHERE u.status='ACTIVE'`,
          [site.id]
        )
        const metrics = {
          eligibleEmployees: Number(employeeMetrics.eligibleEmployees ?? 0),
          employeesWithoutAssignment: Number(
            employeeMetrics.employeesWithoutAssignment ?? 0
          ),
          employeesWithoutPrimaryAssignment: Number(
            employeeMetrics.employeesWithoutPrimaryAssignment ?? 0
          ),
          employeesWithAmbiguousPrimary: Number(
            employeeMetrics.employeesWithAmbiguousPrimary ?? 0
          ),
          assignedJobs: Number(jobMetrics.assignedJobs ?? 0),
          assignedJobsWithoutActiveRate: Number(
            jobMetrics.assignedJobsWithoutActiveRate ?? 0
          ),
          assignedJobsWithAmbiguousRate: Number(
            jobMetrics.assignedJobsWithAmbiguousRate ?? 0
          ),
          inactiveAssignedJobs: Number(jobMetrics.inactiveAssignedJobs ?? 0),
          inactiveAssignedUnits: Number(jobMetrics.inactiveAssignedUnits ?? 0),
          readyProductionDevices: Number(deviceRows[0]?.readyProductionDevices ?? 0),
          activeProductionAdmins: Number(adminRows[0]?.activeProductionAdmins ?? 0),
        }
        const blockers = [
          metrics.employeesWithoutAssignment > 0
            ? {
                code: 'EMPLOYEE_ASSIGNMENT_MISSING',
                count: metrics.employeesWithoutAssignment,
                message: 'Pekerja produksi belum memiliki penugasan pekerjaan.',
                actionUrl: `/produksi/master-pekerjaan?tab=assignments&site=${site.site}&asOf=${asOf}&issue=UNASSIGNED`,
              }
            : null,
          metrics.employeesWithoutPrimaryAssignment > 0
            ? {
                code: 'PRIMARY_ASSIGNMENT_MISSING',
                count: metrics.employeesWithoutPrimaryAssignment,
                message: 'Pekerja produksi belum memiliki pekerjaan utama.',
                actionUrl: `/produksi/master-pekerjaan?tab=assignments&site=${site.site}&asOf=${asOf}&issue=MISSING_PRIMARY`,
              }
            : null,
          metrics.employeesWithAmbiguousPrimary > 0
            ? {
                code: 'PRIMARY_ASSIGNMENT_AMBIGUOUS',
                count: metrics.employeesWithAmbiguousPrimary,
                message: 'Pekerja memiliki lebih dari satu pekerjaan utama aktif.',
                actionUrl: `/produksi/master-pekerjaan?tab=assignments&site=${site.site}&asOf=${asOf}&issue=AMBIGUOUS_PRIMARY`,
              }
            : null,
          metrics.assignedJobsWithoutActiveRate > 0
            ? {
                code: 'ACTIVE_RATE_MISSING',
                count: metrics.assignedJobsWithoutActiveRate,
                message: 'Pekerjaan yang digunakan belum mempunyai tarif aktif.',
                actionUrl: '/produksi/tarif-site',
              }
            : null,
          metrics.assignedJobsWithAmbiguousRate > 0
            ? {
                code: 'ACTIVE_RATE_AMBIGUOUS',
                count: metrics.assignedJobsWithAmbiguousRate,
                message: 'Pekerjaan memiliki tarif aktif yang bertumpang-tindih.',
                actionUrl: '/produksi/tarif-site',
              }
            : null,
          metrics.inactiveAssignedJobs > 0
            ? { code:'ASSIGNED_JOB_INACTIVE',count:metrics.inactiveAssignedJobs,message:'Penugasan memakai pekerjaan yang sudah nonaktif.',actionUrl:'/produksi/master-pekerjaan' }
            : null,
          metrics.inactiveAssignedUnits > 0
            ? { code:'ASSIGNED_UNIT_INACTIVE',count:metrics.inactiveAssignedUnits,message:'Penugasan memakai satuan yang sudah nonaktif.',actionUrl:'/produksi/master-pekerjaan' }
            : null,
          metrics.readyProductionDevices === 0
            ? { code:'PRODUCTION_DEVICE_MISSING',count:1,message:'Belum ada Terminal Produksi aktif untuk site ini.',actionUrl:'/produksi/terminal' }
            : null,
          metrics.activeProductionAdmins === 0
            ? {
                code: 'PRODUCTION_OPERATOR_MISSING',
                count: 1,
                message: 'Belum ada Admin Produksi aktif untuk site ini.',
                actionUrl: `/administrasi/user-hak-akses?site=${site.site}`,
              }
            : null,
        ].filter(Boolean)
        items.push({
          site: site.site,
          siteName: site.siteName,
          status: blockers.length ? 'BLOCKED' : 'READY',
          metrics,
          blockers,
        })
      }
      res.json({ asOf, sites: items })
    } catch (error) {
      next(error)
    }
  }
)
