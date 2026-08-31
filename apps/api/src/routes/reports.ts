import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { env } from '../config.js'
import { pool } from '../db.js'
import {
  aggregateAttendanceRecap,
  loadAttendanceRecapProjection,
  summarizeAttendanceRecap,
  type AttendanceRecapDetail,
  type AttendanceRecapSite,
} from '../lib/attendance-recap.js'
import {
  attendanceRecapPeriodInput,
  recapAttendanceStatuses,
} from '../lib/attendance-recap-policy.js'
import { ApiError } from '../lib/errors.js'
import { jakartaDateTime } from '../lib/attendance-finalization-policy.js'
import { writeAudit } from '../lib/audit.js'
import {
  buildContractReportWorkbook,
  buildEmployeeReportWorkbook,
  type ContractReportExportRow,
  type EmployeeReportExportRow,
} from '../lib/report-workbooks.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const employeeTypeCode = z.enum([
  'BORONGAN',
  'HARIAN',
  'BULANAN',
  'TRAINING',
])
const employeeStatusCode = z.enum(['ACTIVE', 'INACTIVE', 'RESIGNED', 'LEAVE'])
const productionSectionUid = z.string().uuid()
const attendanceStatus = z.enum(recapAttendanceStatuses)
const contractStatus = z.enum([
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'EXPIRED',
  'TERMINATED',
  'CANCELLED',
  'UNKNOWN',
])
const expiryState = z.enum(['UPCOMING', 'EXPIRED'])

function csv<T extends string>(raw: unknown, schema: z.ZodType<T>) {
  const values = String(raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return [...new Set(z.array(schema).parse(values))]
}

function pagination(page: unknown, pageSize: unknown) {
  const parsedPage = Number(page ?? 1)
  const parsedPageSize = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize:
      Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(parsedPageSize, 500)
        : 50,
  }
}

function enforceRequestedSites(auth: AuthContext, requested: string[]) {
  if (
    !auth.roles.includes('SUPER_ADMIN') &&
    requested.some((site) => !auth.siteAccess.includes(site))
  ) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

function scopedSiteCodes(auth: AuthContext, requested: string[]) {
  enforceRequestedSites(auth, requested)
  return auth.roles.includes('SUPER_ADMIN')
    ? requested
    : requested.length
      ? requested
      : auth.siteAccess
}

function addListFilter(
  where: string[],
  values: unknown[],
  column: string,
  items: string[]
) {
  if (!items.length) return
  where.push(`${column} IN (${items.map(() => '?').join(',')})`)
  values.push(...items)
}

function addSiteScope(
  where: string[],
  values: unknown[],
  auth: AuthContext,
  requested: string[],
  column = 's.code'
) {
  const sites = scopedSiteCodes(auth, requested)
  if (sites.length) {
    addListFilter(where, values, column, sites)
  } else if (!auth.roles.includes('SUPER_ADMIN')) {
    where.push('1=0')
  }
}

function mapReference(row: RowDataPacket, prefix: string) {
  const uid = row[`${prefix}Uid`]
  if (!uid) return null
  return {
    uid: String(uid),
    ...(row[`${prefix}Code`] === undefined
      ? {}
      : { code: String(row[`${prefix}Code`]) }),
    name: String(row[`${prefix}Name`]),
  }
}

const employeeQuerySchema = z.object({
  asOf: z.string().date(),
  query: z.string().trim().max(150).optional(),
})

function parseEmployeeQuery(raw: Record<string, unknown>) {
  return {
    ...employeeQuerySchema.parse({
      asOf: raw.asOf,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    employeeStatuses: csv(raw.employeeStatus, employeeStatusCode),
    productionSections: csv(raw.productionSection, productionSectionUid),
  }
}

const employeeExportSchema = employeeQuerySchema.extend({
  site: z.array(siteCode).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  employeeStatus: z.array(employeeStatusCode).default([]),
  productionSection: z.array(productionSectionUid).default([]),
})

const contractQuerySchema = z
  .object({
    referenceDate: z.string().date(),
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    query: z.string().trim().max(150).optional(),
  })
  .refine((input) => input.dateFrom <= input.dateTo, {
    message: 'Tanggal awal tidak boleh melewati tanggal akhir.',
    path: ['dateTo'],
  })

function parseContractQuery(raw: Record<string, unknown>) {
  return {
    ...contractQuerySchema.parse({
      referenceDate: raw.referenceDate,
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    contractTypes: csv(raw.contractType, z.string().uuid()),
    contractStatuses: csv(raw.contractStatus, contractStatus),
    expiryStates: csv(raw.expiryState, expiryState),
  }
}

const contractExportSchema = contractQuerySchema.extend({
  site: z.array(siteCode).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  contractType: z.array(z.string().uuid()).default([]),
  contractStatus: z.array(contractStatus).default([]),
  expiryState: z.array(expiryState).default([]),
})

const attendanceQuerySchema = attendanceRecapPeriodInput.and(
  z.object({ query: z.string().trim().max(150).optional() })
)

function parseAttendanceQuery(raw: Record<string, unknown>) {
  return {
    ...attendanceQuerySchema.parse({
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    productionSections: csv(raw.productionSection, productionSectionUid),
    attendanceStatuses: csv(raw.attendanceStatus, attendanceStatus),
  }
}

async function loadReportMeta(auth: AuthContext, requestedSites: string[]) {
  const siteWhere = ['s.is_active=1']
  const siteValues: unknown[] = []
  addSiteScope(siteWhere, siteValues, auth, requestedSites)

  const [sites] = await pool.query<RowDataPacket[]>(
    `SELECT s.uid,s.code,s.name
       FROM sites s
      WHERE ${siteWhere.join(' AND ')}
      ORDER BY s.name`,
    siteValues
  )
  const [employeeTypes] = await pool.query<RowDataPacket[]>(
    `SELECT uid,code,name FROM employee_types WHERE is_active=1 ORDER BY name`
  )
  const [employeeStatuses] = await pool.query<RowDataPacket[]>(
    `SELECT uid,code,name FROM employee_statuses WHERE is_active=1 ORDER BY name`
  )

  const sectionWhere = ['pms.is_active=1', 'pm.is_active=1', 'ps.is_active=1']
  const sectionValues: unknown[] = []
  addSiteScope(
    sectionWhere,
    sectionValues,
    auth,
    requestedSites,
    'module_site.code'
  )
  const [productionSections] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT ps.uid,ps.code,ps.name,pm.uid moduleUid,pm.name moduleName
       FROM production_module_sections pms
       JOIN production_modules pm ON pm.id=pms.production_module_id
       JOIN production_sections ps ON ps.id=pms.production_section_id
       JOIN sites module_site ON module_site.id=pm.site_id
      WHERE ${sectionWhere.join(' AND ')}
      ORDER BY pm.name,ps.name`,
    sectionValues
  )
  return { sites, employeeTypes, employeeStatuses, productionSections }
}

async function resolveAttendanceSites(
  auth: AuthContext,
  requestedSites: string[]
): Promise<AttendanceRecapSite[]> {
  const where = ['s.is_active=1']
  const values: unknown[] = []
  addSiteScope(where, values, auth, requestedSites)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id,s.uid,s.code,s.name
       FROM sites s
      WHERE ${where.join(' AND ')}
      ORDER BY s.code`,
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
    uid: String(row.uid),
    code: String(row.code),
    name: String(row.name),
  }))
}

function filterAttendanceDetails(
  details: AttendanceRecapDetail[],
  input: ReturnType<typeof parseAttendanceQuery>
) {
  const query = input.query?.toLocaleLowerCase('id')
  return details.filter(
    (row) =>
      (!query ||
        row.employeeName.toLocaleLowerCase('id').includes(query) ||
        row.employeeNumber.toLocaleLowerCase('id').includes(query)) &&
      (!input.employeeTypes.length ||
        input.employeeTypes.includes(
          row.employeeType as (typeof input.employeeTypes)[number]
        )) &&
      (!input.productionSections.length ||
        (row.productionSectionUid !== null &&
          input.productionSections.includes(row.productionSectionUid))) &&
      (!input.attendanceStatuses.length ||
        input.attendanceStatuses.includes(
          row.status as (typeof input.attendanceStatuses)[number]
        ))
  )
}

const employeeReportFromSql = `FROM (
  SELECT effective_history.*,
         COUNT(*) OVER (PARTITION BY effective_history.employee_id) effectiveHistoryCount,
         ROW_NUMBER() OVER (
           PARTITION BY effective_history.employee_id
           ORDER BY effective_history.effective_from DESC,effective_history.id DESC
         ) effectiveHistoryRank
    FROM employee_employment_histories effective_history
   WHERE effective_history.effective_from<=?
     AND (effective_history.effective_to IS NULL OR effective_history.effective_to>=?)
) eh
  JOIN employees e ON e.id=eh.employee_id
  JOIN sites s ON s.id=eh.site_id
  JOIN employee_types et ON et.id=eh.employee_type_id
  JOIN employee_statuses es ON es.id=eh.employee_status_id
  LEFT JOIN departments dep ON dep.id=eh.department_id
  LEFT JOIN positions pos ON pos.id=eh.position_id
  LEFT JOIN work_groups wg ON wg.id=eh.work_group_id
  LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
  LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
  LEFT JOIN production_sections ps ON ps.id=pms.production_section_id`

const employeeReportSelectSql = `SELECT e.uid employeeUid,e.employee_number employeeNumber,
  e.full_name employeeName,
  s.uid siteUid,s.code siteCode,s.name siteName,
  et.uid employeeTypeUid,et.code employeeTypeCode,et.name employeeTypeName,
  es.uid employeeStatusUid,es.code employeeStatusCode,es.name employeeStatusName,
  dep.uid departmentUid,dep.name departmentName,
  pos.uid positionUid,pos.name positionName,
  pm.uid productionModuleUid,pm.name productionModuleName,
  ps.uid productionSectionUid,ps.code productionSectionCode,ps.name productionSectionName,
  wg.uid workGroupUid,wg.name workGroupName,
  eh.effectiveHistoryCount,
  DATE_FORMAT(eh.effective_from,'%Y-%m-%d') effectiveFrom,
  DATE_FORMAT(eh.effective_to,'%Y-%m-%d') effectiveTo`

function employeeReportPredicate(
  input: ReturnType<typeof parseEmployeeQuery>,
  auth: AuthContext
) {
  const where = ['eh.effectiveHistoryRank=1']
  const values: unknown[] = [input.asOf, input.asOf]
  addSiteScope(where, values, auth, input.sites)
  addListFilter(where, values, 'et.code', input.employeeTypes)
  addListFilter(where, values, 'es.code', input.employeeStatuses)
  addListFilter(where, values, 'ps.uid', input.productionSections)
  if (input.query) {
    where.push('(e.full_name LIKE ? OR e.employee_number LIKE ?)')
    values.push(`%${input.query}%`, `%${input.query}%`)
  }
  return { where, values }
}

function mapEmployeeReportRow(row: RowDataPacket) {
  return {
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    site: mapReference(row, 'site'),
    employeeType: mapReference(row, 'employeeType'),
    employeeStatus: mapReference(row, 'employeeStatus'),
    department: mapReference(row, 'department'),
    position: mapReference(row, 'position'),
    productionModule: mapReference(row, 'productionModule'),
    productionSection: mapReference(row, 'productionSection'),
    workGroup: mapReference(row, 'workGroup'),
    historyStatus:
      Number(row.effectiveHistoryCount) === 1 ? 'VALID' : 'AMBIGUOUS',
    effectiveFrom: String(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? String(row.effectiveTo) : null,
  } as const
}

// Site kontrak berasal dari snapshot saat kontrak dibuat. Data lama yang belum
// memiliki snapshot memakai tepat satu histori kerja yang efektif pada awal kontrak.
// Current site karyawan sengaja tidak dipakai agar mutasi tidak mengubah laporan lama.
const contractReportFromSql = `FROM employee_contracts c
  JOIN employees e ON e.id=c.employee_id
  JOIN contract_types ct ON ct.id=c.contract_type_id
  LEFT JOIN employee_employment_histories eh ON eh.id=(
    SELECT effective_history.id
      FROM employee_employment_histories effective_history
     WHERE effective_history.employee_id=c.employee_id
       AND effective_history.effective_from<=c.start_date
       AND (effective_history.effective_to IS NULL OR effective_history.effective_to>=c.start_date)
     ORDER BY effective_history.effective_from DESC,effective_history.id DESC
     LIMIT 1
  )
  LEFT JOIN employee_types et ON et.id=eh.employee_type_id
  LEFT JOIN sites history_site ON history_site.id=eh.site_id
  LEFT JOIN sites snapshot_site ON snapshot_site.code=CASE
    WHEN UPPER(TRIM(c.site_name_snapshot)) IN ('JEPARA','SITE JEPARA','RSIAKDS-HR') THEN 'JEPARA'
    WHEN UPPER(TRIM(c.site_name_snapshot)) IN ('SEMARANG','SITE SEMARANG','RSIASMG-HR') THEN 'SEMARANG'
    WHEN UPPER(TRIM(c.site_name_snapshot)) IN ('KLATEN','SITE KLATEN','RSIASLO-HR') THEN 'KLATEN'
    ELSE NULL END
  LEFT JOIN sites s ON s.id=COALESCE(snapshot_site.id,history_site.id)
  LEFT JOIN employee_contract_lifecycle_events lifecycle ON lifecycle.id=(
    SELECT event.id
      FROM employee_contract_lifecycle_events event
     WHERE event.contract_id=c.id AND event.effective_date<=?
     ORDER BY event.effective_date DESC,event.id DESC
     LIMIT 1
  )`

const contractReportSelectSql = `SELECT c.uid contractUid,c.contract_number contractNumber,
  e.uid employeeUid,e.employee_number employeeNumber,e.full_name employeeName,
  s.uid siteUid,s.code siteCode,s.name siteName,
  CASE WHEN snapshot_site.id IS NOT NULL THEN 'SNAPSHOT'
       WHEN history_site.id IS NOT NULL THEN 'HISTORY' ELSE 'UNRESOLVED' END siteResolution,
  (SELECT COUNT(*) FROM employee_employment_histories history_count
    WHERE history_count.employee_id=c.employee_id
      AND history_count.effective_from<=c.start_date
      AND (history_count.effective_to IS NULL OR history_count.effective_to>=c.start_date)
  ) effectiveHistoryCount,
  et.uid employeeTypeUid,et.code employeeTypeCode,et.name employeeTypeName,
  ct.uid contractTypeUid,ct.code contractTypeCode,ct.name contractTypeName,
  DATE_FORMAT(c.start_date,'%Y-%m-%d') startDate,
  DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,
  COALESCE(lifecycle.to_status,'UNKNOWN') contractStatus,
  CASE WHEN lifecycle.id IS NOT NULL THEN 'LIFECYCLE' ELSE 'UNRESOLVED' END statusResolution,
  CASE WHEN c.end_date<? THEN 'EXPIRED' ELSE 'UPCOMING' END expiryState,
  lifecycle.uid latestLifecycleUid,lifecycle.from_status latestLifecycleFromStatus,
  lifecycle.to_status latestLifecycleToStatus,
  DATE_FORMAT(lifecycle.effective_date,'%Y-%m-%d') latestLifecycleDate,
  lifecycle.source latestLifecycleSource`

type ContractReportInput = ReturnType<typeof parseContractQuery>

function contractReportPredicate(input: ContractReportInput, auth: AuthContext) {
  const where = ['c.end_date IS NOT NULL', 'c.end_date BETWEEN ? AND ?']
  const values: unknown[] = [
    input.referenceDate,
    input.referenceDate,
    input.dateFrom,
    input.dateTo,
  ]
  addSiteScope(where, values, auth, input.sites)
  addListFilter(where, values, 'et.code', input.employeeTypes)
  addListFilter(where, values, 'ct.uid', input.contractTypes)
  if (input.contractStatuses.length) {
    const knownStatuses = input.contractStatuses.filter(
      (status) => status !== 'UNKNOWN'
    )
    const statusPredicates: string[] = []
    if (knownStatuses.length) {
      statusPredicates.push(
        `lifecycle.to_status IN (${knownStatuses.map(() => '?').join(',')})`
      )
      values.push(...knownStatuses)
    }
    if (input.contractStatuses.includes('UNKNOWN')) {
      statusPredicates.push('lifecycle.id IS NULL')
    }
    where.push(`(${statusPredicates.join(' OR ')})`)
  }
  if (!input.contractStatuses.length) {
    where.push("(lifecycle.to_status IS NULL OR lifecycle.to_status NOT IN ('DRAFT','CANCELLED'))")
  }
  if (input.expiryStates.length) {
    where.push(
      `CASE WHEN c.end_date<? THEN 'EXPIRED' ELSE 'UPCOMING' END IN (${input.expiryStates.map(() => '?').join(',')})`
    )
    values.push(input.referenceDate, ...input.expiryStates)
  }
  if (input.query) {
    where.push(
      '(e.full_name LIKE ? OR e.employee_number LIKE ? OR c.contract_number LIKE ?)'
    )
    values.push(`%${input.query}%`, `%${input.query}%`, `%${input.query}%`)
  }
  return { where, values }
}

function mapContractReportRow(row: RowDataPacket) {
  const historyCount = Number(row.effectiveHistoryCount ?? 0)
  return {
    contractUid: String(row.contractUid),
    contractNumber: String(row.contractNumber),
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    site: mapReference(row, 'site'),
    siteResolution: String(row.siteResolution) as
      | 'SNAPSHOT'
      | 'HISTORY'
      | 'UNRESOLVED',
    historyStatus:
      historyCount === 1 ? 'VALID' : historyCount > 1 ? 'AMBIGUOUS' : 'MISSING',
    employeeType: mapReference(row, 'employeeType'),
    contractType: mapReference(row, 'contractType'),
    startDate: String(row.startDate),
    endDate: String(row.endDate),
    contractStatus: String(row.contractStatus),
    statusResolution: String(row.statusResolution) as
      | 'LIFECYCLE'
      | 'UNRESOLVED',
    expiryState: String(row.expiryState) as 'UPCOMING' | 'EXPIRED',
    latestLifecycle: row.latestLifecycleUid
      ? {
          uid: String(row.latestLifecycleUid),
          fromStatus: row.latestLifecycleFromStatus
            ? String(row.latestLifecycleFromStatus)
            : null,
          toStatus: String(row.latestLifecycleToStatus),
          effectiveDate: String(row.latestLifecycleDate),
          source: String(row.latestLifecycleSource),
        }
      : null,
  } as const
}

function generatedAtJakarta() {
  return `${jakartaDateTime().replace(' ', 'T')}+07:00`
}

function auditRequestId(req: Parameters<typeof writeAudit>[0]['request']) {
  const supplied = req?.get('x-request-id')
  return supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied)
    ? supplied
    : randomUUID()
}

async function accessibleReportSites(auth: AuthContext, requested: string[]) {
  const where = ['1=1']
  const values: unknown[] = []
  addSiteScope(where, values, auth, requested)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id,s.code,s.name FROM sites s WHERE ${where.join(' AND ')} ORDER BY s.code`,
    values
  )
  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
  }))
}

async function auditReportExport(input: {
  auth: AuthContext
  request: Parameters<typeof writeAudit>[0]['request']
  requestId: string
  sites: Array<{ id: number; code: string }>
  table: string
  description: (siteCode: string) => string
  data: Record<string, unknown>
}) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    for (const site of input.sites) {
      await writeAudit(
        {
          auth: input.auth,
          request: input.request,
          requestId: input.requestId,
          module: 'REPORTS',
          siteId: site.id,
          action: 'EXPORT',
          table: input.table,
          description: input.description(site.code),
          afterData: input.data,
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
}

export const reportsRouter = Router()

reportsRouter.get(
  '/employees/meta',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = parseEmployeeQuery(req.query as Record<string, unknown>)
      res.json(
        await loadReportMeta(res.locals.auth as AuthContext, input.sites)
      )
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/employees',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = parseEmployeeQuery(req.query as Record<string, unknown>)
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const auth = res.locals.auth as AuthContext
      const { where, values } = employeeReportPredicate(input, auth)

      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total,
                COALESCE(SUM(es.code='ACTIVE'),0) active,
                COALESCE(SUM(es.code='INACTIVE'),0) inactive,
                COALESCE(SUM(es.code='RESIGNED'),0) resigned,
                COALESCE(SUM(es.code='LEAVE'),0) employeeLeave,
                COALESCE(SUM(eh.effectiveHistoryCount<>1),0) ambiguousHistory
           ${employeeReportFromSql}
          WHERE ${where.join(' AND ')}`,
        values
      )
      const [siteRows] = await pool.query<RowDataPacket[]>(
        `SELECT s.code siteCode,s.name siteName,COUNT(*) total
           ${employeeReportFromSql}
          WHERE ${where.join(' AND ')}
          GROUP BY s.id,s.code,s.name
          ORDER BY s.name`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `${employeeReportSelectSql}
           ${employeeReportFromSql}
          WHERE ${where.join(' AND ')}
          ORDER BY e.full_name,e.employee_number
          LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const totals = countRows[0] ?? {}
      res.json({
        items: rows.map(mapEmployeeReportRow),
        summary: {
          total: Number(totals.total ?? 0),
          active: Number(totals.active ?? 0),
          inactive: Number(totals.inactive ?? 0),
          resigned: Number(totals.resigned ?? 0),
          leave: Number(totals.employeeLeave ?? 0),
          ambiguousHistory: Number(totals.ambiguousHistory ?? 0),
          bySite: siteRows.map((row) => ({
            siteCode: String(row.siteCode),
            siteName: String(row.siteName),
            total: Number(row.total),
          })),
        },
        total: Number(totals.total ?? 0),
        page,
        pageSize,
        asOf: input.asOf,
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.post(
  '/employees/export',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const parsed = employeeExportSchema.parse(req.body)
      const input: ReturnType<typeof parseEmployeeQuery> = {
        asOf: parsed.asOf,
        query: parsed.query,
        sites: parsed.site,
        employeeTypes: parsed.employeeType,
        employeeStatuses: parsed.employeeStatus,
        productionSections: parsed.productionSection,
      }
      const auth = res.locals.auth as AuthContext
      const { where, values } = employeeReportPredicate(input, auth)
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `${employeeReportSelectSql}
           ${employeeReportFromSql}
          WHERE ${where.join(' AND ')}
          ORDER BY s.name,e.full_name,e.employee_number`,
        values
      )
      const rows = rawRows.map(mapEmployeeReportRow)
      const sites = await accessibleReportSites(auth, input.sites)
      const generatedAt = generatedAtJakarta()
      const filters = {
        asOf: input.asOf,
        sites: sites.map((site) => site.code),
        employeeTypes: input.employeeTypes,
        employeeStatuses: input.employeeStatuses,
        productionSections: input.productionSections,
        hasEmployeeSearch: Boolean(input.query),
      }
      const workbook = await buildEmployeeReportWorkbook({
        title: 'Posisi Karyawan per Tanggal',
        periodLabel: input.asOf,
        generatedAt,
        generatedBy: auth.name,
        filters,
        rows: rows.map(
          (row): EmployeeReportExportRow => ({
            employeeNumber: row.employeeNumber,
            employeeName: row.employeeName,
            siteName: row.site?.name ?? '',
            employeeTypeName: row.employeeType?.name ?? '',
            employeeStatusName: row.employeeStatus?.name ?? '',
            departmentName: row.department?.name ?? null,
            positionName: row.position?.name ?? null,
            productionModuleName: row.productionModule?.name ?? null,
            productionSectionName: row.productionSection?.name ?? null,
            workGroupName: row.workGroup?.name ?? null,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo,
            historyStatus: row.historyStatus,
          })
        ),
      })
      const filename = `laporan-karyawan-${input.asOf}.xlsx`
      const requestId = auditRequestId(req)
      await auditReportExport({
        auth,
        request: req,
        requestId,
        sites,
        table: 'employee_employment_histories',
        description: (site) =>
          `Mengekspor Laporan Karyawan ${site} per ${input.asOf}.`,
        data: {
          ...filters,
          filename,
          rowCount: rows.length,
          checksumSha256: createHash('sha256').update(workbook).digest('hex'),
        },
      })
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

reportsRouter.get(
  '/contracts/meta',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = parseContractQuery(req.query as Record<string, unknown>)
      const [meta, contractTypes] = await Promise.all([
        loadReportMeta(res.locals.auth as AuthContext, input.sites),
        pool.query<RowDataPacket[]>(
          'SELECT uid,code,name FROM contract_types WHERE is_active=1 ORDER BY name'
        ),
      ])
      res.json({
        sites: meta.sites,
        employeeTypes: meta.employeeTypes,
        contractTypes: contractTypes[0],
        contractStatuses: [
          { code: 'DRAFT', name: 'Draf' },
          { code: 'SCHEDULED', name: 'Terjadwal' },
          { code: 'ACTIVE', name: 'Aktif' },
          { code: 'EXPIRED', name: 'Berakhir' },
          { code: 'TERMINATED', name: 'Dihentikan' },
          { code: 'CANCELLED', name: 'Dibatalkan' },
          { code: 'UNKNOWN', name: 'Perlu diperiksa' },
        ],
        expiryStates: [
          { code: 'UPCOMING', name: 'Akan berakhir' },
          { code: 'EXPIRED', name: 'Sudah berakhir' },
        ],
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/contracts',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = parseContractQuery(req.query as Record<string, unknown>)
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const { where, values } = contractReportPredicate(
        input,
        res.locals.auth as AuthContext
      )
      const dataset = `${contractReportSelectSql}
        ${contractReportFromSql}
        WHERE ${where.join(' AND ')}`
      const [summaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total,
                COALESCE(SUM(expiryState='UPCOMING'),0) upcoming,
                COALESCE(SUM(expiryState='EXPIRED'),0) expired,
                COALESCE(SUM(contractStatus='ACTIVE'),0) active,
                COALESCE(SUM(contractStatus='SCHEDULED'),0) scheduled,
                COALESCE(SUM(contractStatus='EXPIRED'),0) expiredStatus,
                COALESCE(SUM(effectiveHistoryCount>1),0) ambiguousHistory,
                COALESCE(SUM(effectiveHistoryCount=0),0) missingHistory,
                COALESCE(SUM(siteResolution='UNRESOLVED'),0) unresolvedSite
                ,COALESCE(SUM(statusResolution='UNRESOLVED'),0) unresolvedStatus
           FROM (${dataset}) report_rows`,
        values
      )
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${dataset}) report_rows
         ORDER BY endDate ASC,employeeName ASC,contractNumber ASC
         LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const summary = summaryRows[0] ?? {}
      res.json({
        items: rawRows.map(mapContractReportRow),
        summary: {
          total: Number(summary.total ?? 0),
          upcoming: Number(summary.upcoming ?? 0),
          expired: Number(summary.expired ?? 0),
          active: Number(summary.active ?? 0),
          scheduled: Number(summary.scheduled ?? 0),
          expiredStatus: Number(summary.expiredStatus ?? 0),
          ambiguousHistory: Number(summary.ambiguousHistory ?? 0),
          missingHistory: Number(summary.missingHistory ?? 0),
          unresolvedSite: Number(summary.unresolvedSite ?? 0),
          unresolvedStatus: Number(summary.unresolvedStatus ?? 0),
        },
        total: Number(summary.total ?? 0),
        page,
        pageSize,
        referenceDate: input.referenceDate,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.post(
  '/contracts/export',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const parsed = contractExportSchema.parse(req.body)
      const input: ContractReportInput = {
        referenceDate: parsed.referenceDate,
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        query: parsed.query,
        sites: parsed.site,
        employeeTypes: parsed.employeeType,
        contractTypes: parsed.contractType,
        contractStatuses: parsed.contractStatus,
        expiryStates: parsed.expiryState,
      }
      const auth = res.locals.auth as AuthContext
      const { where, values } = contractReportPredicate(input, auth)
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${contractReportSelectSql}
          ${contractReportFromSql}
          WHERE ${where.join(' AND ')}) report_rows
         ORDER BY endDate ASC,employeeName ASC,contractNumber ASC`,
        values
      )
      const rows = rawRows.map(mapContractReportRow)
      const sites = await accessibleReportSites(auth, input.sites)
      const generatedAt = generatedAtJakarta()
      const filters = {
        referenceDate: input.referenceDate,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        sites: sites.map((site) => site.code),
        employeeTypes: input.employeeTypes,
        contractTypes: input.contractTypes,
        contractStatuses: input.contractStatuses,
        expiryStates: input.expiryStates,
        hasEmployeeSearch: Boolean(input.query),
      }
      const workbook = await buildContractReportWorkbook({
        title: 'Kontrak Akan dan Sudah Berakhir',
        periodLabel: `${input.dateFrom} s.d. ${input.dateTo}`,
        generatedAt,
        generatedBy: auth.name,
        filters,
        rows: rows.map(
          (row): ContractReportExportRow => ({
            contractNumber: row.contractNumber,
            employeeNumber: row.employeeNumber,
            employeeName: row.employeeName,
            siteName: row.site?.name ?? null,
            siteResolution: row.siteResolution,
            historyStatus: row.historyStatus,
            employeeTypeName: row.employeeType?.name ?? null,
            contractTypeName: row.contractType?.name ?? '',
            startDate: row.startDate,
            endDate: row.endDate,
            contractStatus: row.contractStatus,
            statusResolution: row.statusResolution,
            expiryState: row.expiryState,
            latestLifecycleDate: row.latestLifecycle?.effectiveDate ?? null,
            latestLifecycleSource: row.latestLifecycle?.source ?? null,
          })
        ),
      })
      const filename = `laporan-kontrak-${input.dateFrom}-${input.dateTo}.xlsx`
      const requestId = auditRequestId(req)
      await auditReportExport({
        auth,
        request: req,
        requestId,
        sites,
        table: 'employee_contracts',
        description: (site) =>
          `Mengekspor Laporan Kontrak ${site} periode akhir ${input.dateFrom} sampai ${input.dateTo}.`,
        data: {
          ...filters,
          filename,
          rowCount: rows.length,
          checksumSha256: createHash('sha256').update(workbook).digest('hex'),
        },
      })
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

reportsRouter.get(
  '/attendance/meta',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseAttendanceQuery(req.query as Record<string, unknown>)
      const meta = await loadReportMeta(
        res.locals.auth as AuthContext,
        input.sites
      )
      res.json({
        sites: meta.sites,
        employeeTypes: meta.employeeTypes,
        productionSections: meta.productionSections,
        attendanceStatuses: [
          { code: 'PRESENT', name: 'Hadir' },
          { code: 'ABSENT', name: 'Alpha' },
          { code: 'LEAVE', name: 'Cuti' },
          { code: 'SICK', name: 'Sakit' },
          { code: 'PERMISSION', name: 'Izin' },
          { code: 'HOLIDAY', name: 'Libur' },
          { code: 'WEEKLY_OFF', name: 'Libur mingguan' },
        ],
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/attendance',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseAttendanceQuery(req.query as Record<string, unknown>)
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const sites = await resolveAttendanceSites(
        res.locals.auth as AuthContext,
        input.sites
      )
      const projection = await loadAttendanceRecapProjection({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        goLiveDate: env.ATTENDANCE_GO_LIVE_DATE,
        sites,
      })
      const groups = summarizeAttendanceRecap(
        filterAttendanceDetails(projection.details, input)
      )
      res.json({
        items: groups.slice((page - 1) * pageSize, page * pageSize),
        summary: aggregateAttendanceRecap(groups),
        finalization: {
          status: projection.completeness.exportAllowed
            ? 'OFFICIAL'
            : 'PROVISIONAL',
          ...projection.completeness,
        },
        total: groups.length,
        page,
        pageSize,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      })
    } catch (error) {
      next(error)
    }
  }
)
