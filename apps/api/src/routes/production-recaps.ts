import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import { jakartaDateTime } from '../lib/attendance-finalization-policy.js'
import { writeAudit } from '../lib/audit.js'
import { businessDate } from '../lib/contract-lifecycle.js'
import { ApiError } from '../lib/errors.js'
import {
  aggregateProductionRecap,
  buildProductionRecapWorkbook,
  type ProductionRecapTransaction,
  type ProductionRevisionExportRow,
} from '../lib/production-recap.js'
import { normalizeStoredDecimal } from '../lib/production-transaction-policy.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const uuid = z.string().uuid()
const employeeTypeCode = z.string().trim().min(1).max(30)

const recapInput = z.object({
  dateFrom: z.string().date(),
  dateTo: z.string().date(),
  query: z.string().trim().max(150).optional(),
  site: z.array(siteCode).default([]),
  jobUid: z.array(uuid).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  productionSectionUid: z.array(uuid).default([]),
  workGroupUid: z.array(uuid).default([]),
})

type RecapInput = z.infer<typeof recapInput>

function isGlobalViewer(auth: AuthContext) {
  return auth.roles.some((role) => role === 'SUPER_ADMIN' || role === 'DIRECTOR')
}

function enforceSite(auth: AuthContext, site: string) {
  if (!isGlobalViewer(auth) && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site Produksi ditolak.')
  }
}

function csv<T>(raw: unknown, schema: z.ZodType<T>) {
  const values = String(raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return [...new Set(z.array(schema).parse(values))]
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

function parsePeriod(input: RecapInput) {
  const from = Date.parse(`${input.dateFrom}T00:00:00Z`)
  const to = Date.parse(`${input.dateTo}T00:00:00Z`)
  if (to < from) {
    throw new ApiError(422, 'Tanggal akhir tidak boleh mendahului tanggal awal.')
  }
  const dayCount = Math.floor((to - from) / 86_400_000) + 1
  if (dayCount > 31) {
    throw new ApiError(422, 'Periode Rekap Produksi maksimal 31 hari.')
  }
  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    dayCount,
    maxDays: 31,
    live: true,
  }
}

function parseQuery(raw: Record<string, unknown>) {
  const today = businessDate()
  const parsed = recapInput.parse({
    dateFrom: raw.dateFrom ?? today,
    dateTo: raw.dateTo ?? today,
    query: String(raw.query ?? '').trim() || undefined,
    site: csv(raw.site, siteCode),
    jobUid: csv(raw.jobUid, uuid),
    employeeType: csv(raw.employeeType, employeeTypeCode),
    productionSectionUid: csv(raw.productionSectionUid, uuid),
    workGroupUid: csv(raw.workGroupUid, uuid),
  })
  parsePeriod(parsed)
  return parsed
}

function parseBody(raw: unknown) {
  const parsed = recapInput.parse(raw)
  parsePeriod(parsed)
  return parsed
}

function jsonText(value: unknown) {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function filterWhere(
  auth: AuthContext,
  input: RecapInput,
  options: { postedOnly?: boolean; employeeUid?: string } = {}
) {
  const where = [
    ...(options.postedOnly === false ? [] : ["pt.status='POSTED'"]),
    'pt.business_date BETWEEN ? AND ?',
  ]
  const values: unknown[] = [input.dateFrom, input.dateTo]
  if (!isGlobalViewer(auth)) {
    where.push(`s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`)
    values.push(...auth.siteAccess)
  }
  if (input.site.length) {
    input.site.forEach((site) => enforceSite(auth, site))
    where.push(`s.code IN (${input.site.map(() => '?').join(',')})`)
    values.push(...input.site)
  }
  if (input.query) {
    where.push('(e.employee_number LIKE ? OR e.full_name LIKE ?)')
    values.push(`%${input.query}%`, `%${input.query}%`)
  }
  if (input.jobUid.length) {
    where.push(`j.uid IN (${input.jobUid.map(() => '?').join(',')})`)
    values.push(...input.jobUid)
  }
  if (input.employeeType.length) {
    where.push(`et.code IN (${input.employeeType.map(() => '?').join(',')})`)
    values.push(...input.employeeType)
  }
  if (input.productionSectionUid.length) {
    where.push(`ps.uid IN (${input.productionSectionUid.map(() => '?').join(',')})`)
    values.push(...input.productionSectionUid)
  }
  if (input.workGroupUid.length) {
    where.push(`wg.uid IN (${input.workGroupUid.map(() => '?').join(',')})`)
    values.push(...input.workGroupUid)
  }
  if (options.employeeUid) {
    where.push('e.uid=?')
    values.push(options.employeeUid)
  }
  return { sql: where.join(' AND '), values }
}

const projectionFrom = `FROM production_transactions pt
  JOIN employees e ON e.id=pt.employee_id
  JOIN sites s ON s.id=pt.site_id
  JOIN production_jobs j ON j.id=pt.production_job_id
  JOIN work_units u ON u.id=pt.unit_id
  LEFT JOIN employee_employment_histories eh
    ON eh.id=(
      SELECT history.id
      FROM employee_employment_histories history
      WHERE history.employee_id=pt.employee_id
        AND history.site_id=pt.site_id
        AND history.effective_from<=pt.business_date
        AND (history.effective_to IS NULL OR history.effective_to>=pt.business_date)
      ORDER BY history.effective_from DESC,history.id DESC
      LIMIT 1
    )
  LEFT JOIN employee_types et ON et.id=eh.employee_type_id
  LEFT JOIN positions pos ON pos.id=eh.position_id
  LEFT JOIN departments dept ON dept.id=eh.department_id
  LEFT JOIN work_groups wg ON wg.id=pt.work_group_id
  LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
  LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
  LEFT JOIN production_transaction_revisions incoming_revision
    ON incoming_revision.replacement_transaction_id=pt.id
  LEFT JOIN production_transactions source_transaction
    ON source_transaction.id=incoming_revision.production_transaction_id`

async function loadTransactions(
  auth: AuthContext,
  input: RecapInput,
  employeeUid?: string
) {
  const filter = filterWhere(auth, input, { employeeUid })
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT pt.id,pt.uid,pt.transaction_number transactionNumber,
            DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDate,
            DATE_FORMAT(pt.transaction_at,'%Y-%m-%dT%H:%i:%s+07:00') transactionAt,
            pt.quantity,pt.rate_snapshot rateSnapshot,pt.gross_amount grossAmount,
            EXISTS(
              SELECT 1 FROM payroll_production_details ppd
              WHERE ppd.production_transaction_id=pt.id
            ) payrollSnapshotted,
            e.id employeeId,e.uid employeeUid,e.employee_number employeeNumber,
            e.full_name employeeName,s.id siteId,s.code siteCode,s.name siteName,
            j.uid jobUid,j.code jobCode,j.name jobName,
            u.uid unitUid,u.code unitCode,u.name unitName,
            u.decimal_precision decimalPrecision,
            et.code employeeTypeCode,et.name employeeTypeName,
            pos.uid positionUid,pos.name positionName,
            dept.uid departmentUid,dept.name departmentName,
            ps.uid productionSectionUid,ps.code productionSectionCode,
            ps.name productionSectionName,
            wg.uid workGroupUid,wg.code workGroupCode,wg.name workGroupName,
            source_transaction.uid correctionSourceUid,
            source_transaction.transaction_number correctionSourceNumber,
            incoming_revision.reason correctionReason
       ${projectionFrom}
      WHERE ${filter.sql}
      ORDER BY pt.transaction_at DESC,pt.id DESC`,
    filter.values
  )
  return rows.map(
    (row): ProductionRecapTransaction => ({
      id: Number(row.id),
      uid: String(row.uid),
      transactionNumber: String(row.transactionNumber),
      businessDate: String(row.businessDate),
      transactionAt: String(row.transactionAt),
      quantity: normalizeStoredDecimal(row.quantity),
      rateSnapshot: normalizeStoredDecimal(row.rateSnapshot),
      grossAmount: normalizeStoredDecimal(row.grossAmount, 2),
      payrollSnapshotted: Boolean(row.payrollSnapshotted),
      employee: {
        id: Number(row.employeeId),
        uid: String(row.employeeUid),
        employeeNumber: String(row.employeeNumber),
        fullName: String(row.employeeName),
      },
      site: {
        id: Number(row.siteId),
        code: String(row.siteCode),
        name: String(row.siteName),
      },
      job: {
        uid: String(row.jobUid),
        code: String(row.jobCode),
        name: String(row.jobName),
      },
      unit: {
        uid: String(row.unitUid),
        code: String(row.unitCode),
        name: String(row.unitName),
        decimalPrecision: Number(row.decimalPrecision),
      },
      placement: {
        employeeType: {
          code: String(row.employeeTypeCode ?? 'UNKNOWN'),
          name: String(row.employeeTypeName ?? 'Tidak diketahui'),
        },
        position: row.positionUid
          ? { uid: String(row.positionUid), name: String(row.positionName) }
          : null,
        department: row.departmentUid
          ? { uid: String(row.departmentUid), name: String(row.departmentName) }
          : null,
        productionSection: row.productionSectionUid
          ? {
              uid: String(row.productionSectionUid),
              code: String(row.productionSectionCode),
              name: String(row.productionSectionName),
            }
          : null,
        workGroup: row.workGroupUid
          ? {
              uid: String(row.workGroupUid),
              code: String(row.workGroupCode),
              name: String(row.workGroupName),
            }
          : null,
      },
      correctionSource: row.correctionSourceUid
        ? {
            uid: String(row.correctionSourceUid),
            transactionNumber: String(row.correctionSourceNumber),
            reason: String(row.correctionReason),
          }
        : null,
    })
  )
}

async function loadFilterOptions(auth: AuthContext) {
  const scope = isGlobalViewer(auth)
    ? { sql: '1=1', values: [] as unknown[] }
    : {
        sql: `s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`,
        values: auth.siteAccess as unknown[],
      }
  const [sites, jobs, employeeTypes, sections, groups] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT s.code value,s.name label FROM sites s
       WHERE s.is_active=1 AND ${scope.sql} ORDER BY s.name`,
      scope.values
    ),
    pool.query<RowDataPacket[]>(
      `SELECT uid value,CONCAT(name,' (',code,')') label
       FROM production_jobs WHERE is_active=1 ORDER BY name`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT code value,name label FROM employee_types
       WHERE is_active=1 AND payroll_basis='PIECE_RATE' ORDER BY name`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT uid value,name label FROM production_sections
       WHERE is_active=1 ORDER BY name`
    ),
    pool.query<RowDataPacket[]>(
      `SELECT wg.uid value,CONCAT(wg.name,' - ',s.name) label,s.code site
       FROM work_groups wg JOIN sites s ON s.id=wg.site_id
       WHERE wg.is_active=1 AND ${scope.sql} ORDER BY s.name,wg.name`,
      scope.values
    ),
  ])
  return {
    sites: sites[0],
    jobs: jobs[0],
    employeeTypes: employeeTypes[0],
    productionSections: sections[0],
    workGroups: groups[0],
  }
}

async function resolveAuditSites(auth: AuthContext, requestedSites: string[]) {
  requestedSites.forEach((site) => enforceSite(auth, site))
  const where = ['s.is_active=1']
  const values: unknown[] = []
  if (!isGlobalViewer(auth)) {
    where.push(`s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`)
    values.push(...auth.siteAccess)
  }
  if (requestedSites.length) {
    where.push(`s.code IN (${requestedSites.map(() => '?').join(',')})`)
    values.push(...requestedSites)
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id,s.code,s.name FROM sites s
     WHERE ${where.join(' AND ')} ORDER BY s.code`,
    values
  )
  if (requestedSites.length !== rows.length) {
    const found = new Set(rows.map((row) => String(row.code)))
    if (requestedSites.some((site) => !found.has(site))) {
      throw new ApiError(422, 'Satu atau lebih site tidak valid atau tidak aktif.')
    }
  }
  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
  }))
}

async function loadPlacementTimeline(
  employeeId: number,
  siteId: number,
  dateFrom: string,
  dateTo: string
) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT eh.uid,DATE_FORMAT(eh.effective_from,'%Y-%m-%d') effectiveFrom,
            DATE_FORMAT(eh.effective_to,'%Y-%m-%d') effectiveTo,
            et.code employeeTypeCode,et.name employeeTypeName,
            pos.uid positionUid,pos.name positionName,
            dept.uid departmentUid,dept.name departmentName,
            ps.uid productionSectionUid,ps.code productionSectionCode,
            ps.name productionSectionName,
            wg.uid workGroupUid,wg.code workGroupCode,wg.name workGroupName
       FROM employee_employment_histories eh
       JOIN employee_types et ON et.id=eh.employee_type_id
       LEFT JOIN positions pos ON pos.id=eh.position_id
       LEFT JOIN departments dept ON dept.id=eh.department_id
       LEFT JOIN work_groups wg ON wg.id=eh.work_group_id
       LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
       LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
      WHERE eh.employee_id=? AND eh.site_id=?
        AND eh.effective_from<=?
        AND (eh.effective_to IS NULL OR eh.effective_to>=?)
      ORDER BY eh.effective_from DESC,eh.id DESC`,
    [employeeId, siteId, dateTo, dateFrom]
  )
  return rows.map((row) => ({
    uid: row.uid,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    employeeType: {
      code: row.employeeTypeCode,
      name: row.employeeTypeName,
    },
    position: row.positionUid
      ? { uid: row.positionUid, name: row.positionName }
      : null,
    department: row.departmentUid
      ? { uid: row.departmentUid, name: row.departmentName }
      : null,
    productionSection: row.productionSectionUid
      ? {
          uid: row.productionSectionUid,
          code: row.productionSectionCode,
          name: row.productionSectionName,
        }
      : null,
    workGroup: row.workGroupUid
      ? {
          uid: row.workGroupUid,
          code: row.workGroupCode,
          name: row.workGroupName,
        }
      : null,
  }))
}

async function loadRevisionRows(auth: AuthContext, input: RecapInput) {
  const filter = filterWhere(auth, input, { postedOnly: false })
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT pr.uid revisionUid,pr.revision_type revisionType,
            pr.revision_number revisionNumber,pr.reason,
            DATE_FORMAT(pr.revised_at,'%Y-%m-%dT%H:%i:%s+07:00') revisedAt,
            COALESCE(actor.full_name,'User tidak tersedia') revisedBy,
            pt.transaction_number sourceTransactionNumber,
            replacement.transaction_number replacementTransactionNumber,
            e.employee_number employeeNumber,e.full_name employeeName,
            s.name site,DATE_FORMAT(pt.business_date,'%Y-%m-%d') businessDate,
            j.name jobName,pr.before_data beforeData,pr.after_data afterData
       FROM production_transaction_revisions pr
       JOIN production_transactions pt ON pt.id=pr.production_transaction_id
       JOIN employees e ON e.id=pt.employee_id
       JOIN sites s ON s.id=pt.site_id
       JOIN production_jobs j ON j.id=pt.production_job_id
       LEFT JOIN users actor ON actor.id=pr.revised_by
       LEFT JOIN production_transactions replacement
         ON replacement.id=pr.replacement_transaction_id
       LEFT JOIN employee_employment_histories eh
         ON eh.id=(
           SELECT history.id FROM employee_employment_histories history
           WHERE history.employee_id=pt.employee_id
             AND history.site_id=pt.site_id
             AND history.effective_from<=pt.business_date
             AND (history.effective_to IS NULL OR history.effective_to>=pt.business_date)
           ORDER BY history.effective_from DESC,history.id DESC LIMIT 1
         )
       LEFT JOIN employee_types et ON et.id=eh.employee_type_id
       LEFT JOIN work_groups wg ON wg.id=eh.work_group_id
       LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
       LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
      WHERE ${filter.sql}
      ORDER BY pr.revised_at DESC,pr.id DESC`,
    filter.values
  )
  return rows.map(
    (row): ProductionRevisionExportRow => ({
      revisionUid: String(row.revisionUid),
      revisionType: row.revisionType as 'CORRECTION' | 'VOID',
      revisionNumber: Number(row.revisionNumber),
      reason: String(row.reason),
      revisedAt: String(row.revisedAt),
      revisedBy: String(row.revisedBy),
      sourceTransactionNumber: String(row.sourceTransactionNumber),
      replacementTransactionNumber: row.replacementTransactionNumber
        ? String(row.replacementTransactionNumber)
        : null,
      employeeNumber: String(row.employeeNumber),
      employeeName: String(row.employeeName),
      site: String(row.site),
      businessDate: String(row.businessDate),
      jobName: String(row.jobName),
      beforeData: jsonText(row.beforeData) ?? '{}',
      afterData: jsonText(row.afterData),
    })
  )
}

export const productionRecapsRouter = Router()
productionRecapsRouter.use(authenticate)

productionRecapsRouter.get(
  '/recaps',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const input = parseQuery(req.query as Record<string, unknown>)
      const period = parsePeriod(input)
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const auth = res.locals.auth as AuthContext
      input.site.forEach((site) => enforceSite(auth, site))
      const [transactions, facets] = await Promise.all([
        loadTransactions(auth, input),
        loadFilterOptions(auth),
      ])
      const projection = aggregateProductionRecap(transactions)
      res.json({
        period,
        summary: projection.summary,
        quantityTotals: projection.quantityTotals,
        employees: {
          items: projection.employees.slice(
            (page - 1) * pageSize,
            page * pageSize
          ),
          total: projection.employees.length,
          page,
          pageSize,
        },
        jobs: projection.jobs,
        facets,
      })
    } catch (error) {
      next(error)
    }
  }
)

productionRecapsRouter.get(
  '/recaps/employees/:employeeUid',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const employeeUid = uuid.parse(
        Array.isArray(req.params.employeeUid)
          ? req.params.employeeUid[0]
          : req.params.employeeUid
      )
      const site = siteCode.parse(req.query.site)
      const input = parseQuery({
        ...(req.query as Record<string, unknown>),
        site,
        query: undefined,
      })
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, site)
      const transactions = (await loadTransactions(auth, input, employeeUid)).filter(
        (row) => row.employee.uid === employeeUid && row.site.code === site
      )
      if (!transactions.length) {
        throw new ApiError(404, 'Detail Rekap Produksi karyawan tidak ditemukan.')
      }
      const summary = aggregateProductionRecap(transactions).employees[0]
      const placementTimeline = await loadPlacementTimeline(
        transactions[0].employee.id,
        transactions[0].site.id,
        input.dateFrom,
        input.dateTo
      )
      res.json({
        period: parsePeriod(input),
        employee: summary.employee,
        site: summary.site,
        summary,
        placementTimeline,
        transactions,
      })
    } catch (error) {
      next(error)
    }
  }
)

productionRecapsRouter.get(
  '/recaps/jobs/:jobUid',
  requirePermission('production.view'),
  async (req, res, next) => {
    try {
      const jobUid = uuid.parse(
        Array.isArray(req.params.jobUid) ? req.params.jobUid[0] : req.params.jobUid
      )
      const input = parseQuery({
        ...(req.query as Record<string, unknown>),
        jobUid,
      })
      const auth = res.locals.auth as AuthContext
      const transactions = (await loadTransactions(auth, input)).filter(
        (row) => row.job.uid === jobUid
      )
      if (!transactions.length) {
        throw new ApiError(404, 'Detail pekerjaan Rekap Produksi tidak ditemukan.')
      }
      const projection = aggregateProductionRecap(transactions)
      res.json({
        period: parsePeriod(input),
        job: transactions[0].job,
        summary: projection.jobs[0],
        employees: projection.employees,
        transactions,
      })
    } catch (error) {
      next(error)
    }
  }
)

productionRecapsRouter.post(
  '/recaps/export',
  requirePermission('production.export'),
  async (req, res, next) => {
    try {
      const input = parseBody(req.body)
      const auth = res.locals.auth as AuthContext
      const [transactions, revisions, auditSiteRows] = await Promise.all([
        loadTransactions(auth, input),
        loadRevisionRows(auth, input),
        resolveAuditSites(auth, input.site),
      ])
      const projection = aggregateProductionRecap(transactions)
      const generatedAt = `${jakartaDateTime().replace(' ', 'T')}+07:00`
      const workbook = await buildProductionRecapWorkbook({
        projection,
        transactions,
        revisions,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        generatedAt,
        generatedBy: auth.name,
      })
      const checksumSha256 = createHash('sha256').update(workbook).digest('hex')
      const selectedSites = input.site.length
        ? input.site
        : isGlobalViewer(auth)
          ? ['SEMUA-SITE']
          : auth.siteAccess
      const filename = `rekap-produksi-${input.dateFrom}-${input.dateTo}-${selectedSites
        .map((site) => site.toLowerCase())
        .join('-')}.xlsx`
      const suppliedRequestId = req.get('x-request-id')
      const requestId =
        suppliedRequestId && /^[A-Za-z0-9._:-]{1,100}$/.test(suppliedRequestId)
          ? suppliedRequestId
          : randomUUID()
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        for (const site of auditSiteRows) {
          await writeAudit(
            {
              auth,
              request: req,
              requestId,
              module: 'PRODUCTION',
              siteId: site.id,
              action: 'EXPORT',
              table: 'production_transactions',
              description: `Mengekspor Rekap Produksi ${site.code} periode ${input.dateFrom} sampai ${input.dateTo}.`,
              afterData: {
                dateFrom: input.dateFrom,
                dateTo: input.dateTo,
                employeeRows: projection.employees.filter(
                  (row) => row.site.id === site.id
                ).length,
                transactionRows: transactions.filter(
                  (row) => row.site.id === site.id
                ).length,
                revisionRows: revisions.filter((row) => row.site === site.name)
                  .length,
                filename,
                checksumSha256,
              },
            },
            conn
          )
        }
        await conn.commit()
      } catch (error) {
        await conn.rollback()
        throw error
      } finally {
        conn.release()
      }
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('X-Request-ID', requestId)
      res.send(workbook)
    } catch (error) {
      next(error)
    }
  }
)
