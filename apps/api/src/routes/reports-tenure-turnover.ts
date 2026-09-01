import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  buildTenureTurnoverReportWorkbook,
  type TenureTurnoverExportRow,
} from '../lib/report-workbooks.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const employeeTypeCode = z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'])
const tenureBand = z.enum(['LT_1_YEAR', 'Y1_TO_3', 'Y3_TO_5', 'GTE_5_YEARS'])
const reportView = z.enum(['TENURE', 'TURNOVER'])
const baseInput = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    query: z.string().trim().max(150).optional(),
  })
  .superRefine((input, context) => {
    const start = new Date(`${input.dateFrom}T00:00:00Z`)
    const end = new Date(`${input.dateTo}T00:00:00Z`)
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    if (days < 1) {
      context.addIssue({
        code: 'custom',
        path: ['dateTo'],
        message: 'Tanggal akhir tidak boleh sebelum tanggal awal.',
      })
    } else if (days > 366) {
      context.addIssue({
        code: 'custom',
        path: ['dateTo'],
        message: 'Rentang laporan masa kerja dan turnover maksimal 366 hari kalender.',
      })
    }
  })

function csv<T extends string>(raw: unknown, schema: z.ZodType<T>) {
  return [
    ...new Set(
      String(raw ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ].map((value) => schema.parse(value))
}

function parseQuery(raw: Record<string, unknown>) {
  return {
    ...baseInput.parse({
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    productionSections: csv(raw.productionSection, z.string().uuid()),
    tenureBands: csv(raw.tenureBand, tenureBand),
    view: reportView.catch('TENURE').parse(raw.view),
  }
}

const exportInput = baseInput.extend({
  site: z.array(siteCode).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  productionSection: z.array(z.string().uuid()).default([]),
  tenureBand: z.array(tenureBand).default([]),
})
type Input = ReturnType<typeof parseQuery>

function pagination(page: unknown, pageSize: unknown) {
  const currentPage = Number(page ?? 1)
  const size = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(currentPage) && currentPage > 0 ? currentPage : 1,
    pageSize: Number.isInteger(size) && size > 0 ? Math.min(size, 500) : 50,
  }
}

function ensureSiteAccess(auth: AuthContext, requested: string[]) {
  if (
    !auth.roles.includes('SUPER_ADMIN') &&
    requested.some((site) => !auth.siteAccess.includes(site))
  ) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

function allowedSites(auth: AuthContext, requested: string[]) {
  ensureSiteAccess(auth, requested)
  return auth.roles.includes('SUPER_ADMIN')
    ? requested
    : requested.length
      ? requested
      : auth.siteAccess
}

function addList(
  where: string[],
  values: unknown[],
  column: string,
  items: string[]
) {
  if (!items.length) return
  where.push(`${column} IN (${items.map(() => '?').join(',')})`)
  values.push(...items)
}

const activeDatasetSql = `SELECT
  e.uid employeeUid,e.employee_number employeeNumber,e.full_name employeeName,
  DATE_FORMAT(e.join_date,'%Y-%m-%d') joinDate,
  s.uid siteUid,s.code siteCode,s.name siteName,
  et.uid employeeTypeUid,et.code employeeTypeCode,et.name employeeTypeName,
  ps.uid productionSectionUid,ps.code productionSectionCode,ps.name productionSectionName,
  es.code statusCode,
  GREATEST(0,DATEDIFF(?,e.join_date)) tenureDays,
  GREATEST(0,TIMESTAMPDIFF(MONTH,e.join_date,?)) tenureMonths,
  CASE WHEN DATEDIFF(?,e.join_date)<365 THEN 'LT_1_YEAR'
       WHEN DATEDIFF(?,e.join_date)<1095 THEN 'Y1_TO_3'
       WHEN DATEDIFF(?,e.join_date)<1825 THEN 'Y3_TO_5'
       ELSE 'GTE_5_YEARS' END tenureBand,
  (SELECT COUNT(*) FROM employee_employment_histories count_history
    WHERE count_history.employee_id=e.id
      AND count_history.effective_from<=?
      AND (count_history.effective_to IS NULL OR count_history.effective_to>=?)) historyCount
 FROM employees e
 JOIN employee_employment_histories h ON h.id=(
   SELECT selected_history.id FROM employee_employment_histories selected_history
   WHERE selected_history.employee_id=e.id
     AND selected_history.effective_from<=?
     AND (selected_history.effective_to IS NULL OR selected_history.effective_to>=?)
   ORDER BY selected_history.effective_from DESC,selected_history.id DESC LIMIT 1
 )
 JOIN sites s ON s.id=h.site_id
 JOIN employee_types et ON et.id=h.employee_type_id
 JOIN employee_statuses es ON es.id=h.employee_status_id
 LEFT JOIN production_module_sections pms ON pms.id=h.production_module_section_id
 LEFT JOIN production_sections ps ON ps.id=pms.production_section_id`

const turnoverDatasetSql = `SELECT
  h.uid historyUid,e.uid employeeUid,e.employee_number employeeNumber,e.full_name employeeName,
  DATE_FORMAT(e.join_date,'%Y-%m-%d') joinDate,
  DATE_FORMAT(h.effective_from,'%Y-%m-%d') exitDate,
  source_site.uid siteUid,source_site.code siteCode,source_site.name siteName,
  source_type.uid employeeTypeUid,source_type.code employeeTypeCode,source_type.name employeeTypeName,
  source_section.uid productionSectionUid,source_section.code productionSectionCode,source_section.name productionSectionName,
  GREATEST(0,DATEDIFF(h.effective_from,e.join_date)) tenureDays,
  GREATEST(0,TIMESTAMPDIFF(MONTH,e.join_date,h.effective_from)) tenureMonths,
  CASE WHEN DATEDIFF(h.effective_from,e.join_date)<365 THEN 'LT_1_YEAR'
       WHEN DATEDIFF(h.effective_from,e.join_date)<1095 THEN 'Y1_TO_3'
       WHEN DATEDIFF(h.effective_from,e.join_date)<1825 THEN 'Y3_TO_5'
       ELSE 'GTE_5_YEARS' END tenureBand,
  h.reference_number referenceNumber
 FROM employee_employment_histories h
 JOIN employees e ON e.id=h.employee_id
 JOIN employee_statuses target_status ON target_status.id=h.employee_status_id AND target_status.code='RESIGNED'
 JOIN employee_employment_histories source_history ON source_history.id=(
   SELECT previous_history.id FROM employee_employment_histories previous_history
   WHERE previous_history.employee_id=h.employee_id
     AND (previous_history.effective_from<h.effective_from
       OR (previous_history.effective_from=h.effective_from AND previous_history.id<h.id))
   ORDER BY previous_history.effective_from DESC,previous_history.id DESC LIMIT 1
 )
 JOIN employee_statuses source_status ON source_status.id=source_history.employee_status_id AND source_status.code='ACTIVE'
 JOIN sites source_site ON source_site.id=source_history.site_id
 JOIN employee_types source_type ON source_type.id=source_history.employee_type_id
 LEFT JOIN production_module_sections source_mapping ON source_mapping.id=source_history.production_module_section_id
 LEFT JOIN production_sections source_section ON source_section.id=source_mapping.production_section_id
 WHERE h.change_type<>'INITIAL'`

function activeValues(asOf: string) {
  return [asOf, asOf, asOf, asOf, asOf, asOf, asOf, asOf, asOf]
}

function structuralPredicate(
  input: Input,
  auth: AuthContext,
  prefix = ''
) {
  const where = ['1=1']
  const values: unknown[] = []
  const sites = allowedSites(auth, input.sites)
  if (sites.length) addList(where, values, `${prefix}siteCode`, sites)
  else if (!auth.roles.includes('SUPER_ADMIN')) where.push('1=0')
  addList(where, values, `${prefix}employeeTypeCode`, input.employeeTypes)
  addList(where, values, `${prefix}productionSectionUid`, input.productionSections)
  return { where, values }
}

function detailPredicate(input: Input, auth: AuthContext) {
  const predicate = structuralPredicate(input, auth)
  addList(predicate.where, predicate.values, 'tenureBand', input.tenureBands)
  if (input.query) {
    predicate.where.push('(employeeName LIKE ? OR employeeNumber LIKE ?)')
    predicate.values.push(`%${input.query}%`, `%${input.query}%`)
  }
  return predicate
}

async function snapshot(input: Input, auth: AuthContext, asOf: string) {
  const predicate = structuralPredicate(input, auth)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(historyCount=1 AND statusCode='ACTIVE'),0) activeHeadcount,
      COALESCE(SUM(historyCount<>1),0) ambiguousHistories
     FROM (${activeDatasetSql}) active_rows WHERE ${predicate.where.join(' AND ')}`,
    [...activeValues(asOf), ...predicate.values]
  )
  return {
    activeHeadcount: Number(rows[0]?.activeHeadcount ?? 0),
    ambiguousHistories: Number(rows[0]?.ambiguousHistories ?? 0),
  }
}

function previousDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function reference(row: RowDataPacket, prefix: string) {
  return row[`${prefix}Uid`]
    ? {
        uid: String(row[`${prefix}Uid`]),
        code: String(row[`${prefix}Code`]),
        name: String(row[`${prefix}Name`]),
      }
    : null
}

type ReportRow = {
  recordUid: string
  employeeUid: string
  employeeNumber: string
  employeeName: string
  joinDate: string
  referenceDate: string | null
  site: ReturnType<typeof reference>
  employeeType: ReturnType<typeof reference>
  productionSection: ReturnType<typeof reference>
  tenureDays: number
  tenureMonths: number
  tenureBand: string
  referenceNumber: string | null
}

function mapTenure(row: RowDataPacket): ReportRow {
  return {
    recordUid: String(row.employeeUid),
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    joinDate: String(row.joinDate),
    referenceDate: null,
    site: reference(row, 'site'),
    employeeType: reference(row, 'employeeType'),
    productionSection: reference(row, 'productionSection'),
    tenureDays: Number(row.tenureDays ?? 0),
    tenureMonths: Number(row.tenureMonths ?? 0),
    tenureBand: String(row.tenureBand),
    referenceNumber: null,
  }
}

function mapTurnover(row: RowDataPacket): ReportRow {
  return {
    recordUid: String(row.historyUid),
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    joinDate: String(row.joinDate),
    referenceDate: String(row.exitDate),
    site: reference(row, 'site'),
    employeeType: reference(row, 'employeeType'),
    productionSection: reference(row, 'productionSection'),
    tenureDays: Number(row.tenureDays ?? 0),
    tenureMonths: Number(row.tenureMonths ?? 0),
    tenureBand: String(row.tenureBand),
    referenceNumber: row.referenceNumber ? String(row.referenceNumber) : null,
  }
}

async function loadMeta(input: Input, auth: AuthContext) {
  const sites = allowedSites(auth, input.sites)
  const siteWhere = ['s.is_active=1']
  const siteValues: unknown[] = []
  if (!auth.roles.includes('SUPER_ADMIN')) {
    if (auth.siteAccess.length) addList(siteWhere, siteValues, 's.code', auth.siteAccess)
    else siteWhere.push('1=0')
  }
  const [siteRows, employeeTypes, productionSections] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT s.uid,s.code,s.name FROM sites s WHERE ${siteWhere.join(' AND ')} ORDER BY s.name`, siteValues),
    pool.query<RowDataPacket[]>('SELECT uid,code,name FROM employee_types WHERE is_active=1 ORDER BY name'),
    pool.query<RowDataPacket[]>(`SELECT DISTINCT ps.uid,ps.code,ps.name,pm.name moduleName
      FROM production_module_sections pms JOIN production_modules pm ON pm.id=pms.production_module_id
      JOIN production_sections ps ON ps.id=pms.production_section_id JOIN sites s ON s.id=pm.site_id
      WHERE pms.is_active=1 ${sites.length ? `AND s.code IN (${sites.map(() => '?').join(',')})` : ''}
      ORDER BY pm.name,ps.name`, sites),
  ])
  return {
    sites: siteRows[0],
    employeeTypes: employeeTypes[0],
    productionSections: productionSections[0],
    tenureBands: [
      { code: 'LT_1_YEAR', name: 'Kurang dari 1 tahun' },
      { code: 'Y1_TO_3', name: '1 sampai kurang dari 3 tahun' },
      { code: 'Y3_TO_5', name: '3 sampai kurang dari 5 tahun' },
      { code: 'GTE_5_YEARS', name: '5 tahun atau lebih' },
    ],
    canExport: true,
  }
}

async function summary(input: Input, auth: AuthContext) {
  const structural = structuralPredicate(input, auth)
  const [opening, closing, activeStats, joinRows, exitRows] = await Promise.all([
    snapshot(input, auth, previousDate(input.dateFrom)),
    snapshot(input, auth, input.dateTo),
    pool.query<RowDataPacket[]>(`SELECT
      COALESCE(AVG(tenureMonths),0) averageTenureMonths,
      COALESCE(SUM(tenureBand='LT_1_YEAR'),0) lessThanOneYear,
      COALESCE(SUM(tenureBand='Y1_TO_3'),0) oneToThreeYears,
      COALESCE(SUM(tenureBand='Y3_TO_5'),0) threeToFiveYears,
      COALESCE(SUM(tenureBand='GTE_5_YEARS'),0) fiveYearsOrMore
      FROM (${activeDatasetSql}) active_rows
      WHERE historyCount=1 AND statusCode='ACTIVE' AND ${structural.where.join(' AND ')}`,
    [...activeValues(input.dateTo), ...structural.values]),
    pool.query<RowDataPacket[]>(`SELECT COUNT(DISTINCT employeeId) joined FROM (
      SELECT h.employee_id employeeId,s.code siteCode,et.code employeeTypeCode,ps.uid productionSectionUid
      FROM employee_employment_histories h
      JOIN employee_statuses es ON es.id=h.employee_status_id AND es.code='ACTIVE'
      JOIN sites s ON s.id=h.site_id JOIN employee_types et ON et.id=h.employee_type_id
      LEFT JOIN production_module_sections pms ON pms.id=h.production_module_section_id
      LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
      WHERE h.change_type='INITIAL' AND h.effective_from BETWEEN ? AND ?
    ) joined_rows WHERE ${structural.where.join(' AND ')}`,
    [input.dateFrom,input.dateTo,...structural.values]),
    pool.query<RowDataPacket[]>(`SELECT COUNT(*) resigned FROM (${turnoverDatasetSql}) turnover_rows
      WHERE exitDate BETWEEN ? AND ? AND ${structural.where.join(' AND ')}`,
    [input.dateFrom,input.dateTo,...structural.values]),
  ])
  const averageHeadcount = (opening.activeHeadcount + closing.activeHeadcount) / 2
  const resigned = Number(exitRows[0][0]?.resigned ?? 0)
  return {
    openingHeadcount: opening.activeHeadcount,
    closingHeadcount: closing.activeHeadcount,
    averageHeadcount,
    joined: Number(joinRows[0][0]?.joined ?? 0),
    resigned,
    turnoverRate: averageHeadcount > 0 ? (resigned / averageHeadcount) * 100 : 0,
    averageTenureMonths: Number(activeStats[0][0]?.averageTenureMonths ?? 0),
    lessThanOneYear: Number(activeStats[0][0]?.lessThanOneYear ?? 0),
    oneToThreeYears: Number(activeStats[0][0]?.oneToThreeYears ?? 0),
    threeToFiveYears: Number(activeStats[0][0]?.threeToFiveYears ?? 0),
    fiveYearsOrMore: Number(activeStats[0][0]?.fiveYearsOrMore ?? 0),
    ambiguousOpening: opening.ambiguousHistories,
    ambiguousClosing: closing.ambiguousHistories,
  }
}

async function auditExport(input: {
  auth: AuthContext
  request: Parameters<typeof writeAudit>[0]['request']
  requestId: string
  sites: string[]
  data: Record<string, unknown>
}) {
  const selected = allowedSites(input.auth, input.sites)
  const where = ['s.is_active=1']
  const values: unknown[] = []
  if (selected.length) addList(where, values, 's.code', selected)
  else if (!input.auth.roles.includes('SUPER_ADMIN')) where.push('1=0')
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id,s.code FROM sites s WHERE ${where.join(' AND ')}`,
    values
  )
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    for (const site of rows) {
      await writeAudit({
        auth: input.auth,
        request: input.request,
        requestId: input.requestId,
        module: 'REPORTS',
        siteId: Number(site.id),
        action: 'EXPORT',
        table: 'employee_employment_histories',
        description: `Mengekspor Laporan Masa Kerja & Turnover untuk ${String(site.code)}.`,
        afterData: input.data,
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

export const tenureTurnoverReportRouter = Router()
tenureTurnoverReportRouter.use(
  requirePermission('reports.view'),
  requirePermission('employees.view')
)

tenureTurnoverReportRouter.get('/meta', async (req, res, next) => {
  try {
    const input = parseQuery(req.query as Record<string, unknown>)
    res.json(await loadMeta(input, res.locals.auth as AuthContext))
  } catch (error) {
    next(error)
  }
})

tenureTurnoverReportRouter.get('/', async (req, res, next) => {
  try {
    const input = parseQuery(req.query as Record<string, unknown>)
    const auth = res.locals.auth as AuthContext
    const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
    const predicate = detailPredicate(input, auth)
    const isTurnover = input.view === 'TURNOVER'
    const dataset = isTurnover ? turnoverDatasetSql : activeDatasetSql
    const baseValues = isTurnover ? [] : activeValues(input.dateTo)
    const fixedWhere = isTurnover
      ? ['exitDate BETWEEN ? AND ?', ...predicate.where]
      : ["historyCount=1", "statusCode='ACTIVE'", ...predicate.where]
    const fixedValues = isTurnover
      ? [input.dateFrom, input.dateTo, ...predicate.values]
      : [...baseValues, ...predicate.values]
    const [reportSummary, countRows, rows] = await Promise.all([
      summary(input, auth),
      pool.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM (${dataset}) report_rows WHERE ${fixedWhere.join(' AND ')}`, fixedValues),
      pool.query<RowDataPacket[]>(`SELECT * FROM (${dataset}) report_rows WHERE ${fixedWhere.join(' AND ')}
        ORDER BY ${isTurnover ? 'exitDate DESC,' : 'tenureDays DESC,'} employeeName LIMIT ? OFFSET ?`,
      [...fixedValues,pageSize,(page-1)*pageSize]),
    ])
    res.json({
      items: isTurnover ? rows[0].map(mapTurnover) : rows[0].map(mapTenure),
      summary: reportSummary,
      total: Number(countRows[0][0]?.total ?? 0),
      page,
      pageSize,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      view: input.view,
    })
  } catch (error) {
    next(error)
  }
})

tenureTurnoverReportRouter.post('/export', async (req, res, next) => {
  try {
    const parsed = exportInput.parse(req.body)
    const input: Input = {
      dateFrom: parsed.dateFrom,
      dateTo: parsed.dateTo,
      query: parsed.query,
      sites: parsed.site,
      employeeTypes: parsed.employeeType,
      productionSections: parsed.productionSection,
      tenureBands: parsed.tenureBand,
      view: 'TENURE',
    }
    const auth = res.locals.auth as AuthContext
    const predicate = detailPredicate(input, auth)
    const [reportSummary, activeRows, turnoverRows] = await Promise.all([
      summary(input, auth),
      pool.query<RowDataPacket[]>(`SELECT * FROM (${activeDatasetSql}) active_rows
        WHERE historyCount=1 AND statusCode='ACTIVE' AND ${predicate.where.join(' AND ')}
        ORDER BY tenureDays DESC,employeeName`,
      [...activeValues(input.dateTo),...predicate.values]),
      pool.query<RowDataPacket[]>(`SELECT * FROM (${turnoverDatasetSql}) turnover_rows
        WHERE exitDate BETWEEN ? AND ? AND ${predicate.where.join(' AND ')}
        ORDER BY exitDate DESC,employeeName`,
      [input.dateFrom,input.dateTo,...predicate.values]),
    ])
    const mapExport = (row: ReportRow): TenureTurnoverExportRow => ({
      employeeNumber: row.employeeNumber,
      employeeName: row.employeeName,
      joinDate: row.joinDate,
      referenceDate: row.referenceDate,
      siteName: row.site?.name ?? '',
      employeeTypeName: row.employeeType?.name ?? '',
      productionSectionName: row.productionSection?.name ?? null,
      tenureDays: row.tenureDays,
      tenureMonths: row.tenureMonths,
      tenureBand: row.tenureBand,
      referenceNumber: row.referenceNumber,
    })
    const filters = {
      dateFrom: input.dateFrom,dateTo: input.dateTo,sites: input.sites,
      employeeTypes: input.employeeTypes,productionSections: input.productionSections,
      tenureBands: input.tenureBands,hasSearch: Boolean(input.query),
    }
    const workbook = await buildTenureTurnoverReportWorkbook({
      title: 'Masa Kerja & Turnover Karyawan',
      periodLabel: `${input.dateFrom} s.d. ${input.dateTo}`,
      generatedAt: new Date().toISOString(),generatedBy: auth.name,filters,
      summary: reportSummary,
      activeRows: activeRows[0].map(mapTenure).map(mapExport),
      turnoverRows: turnoverRows[0].map(mapTurnover).map(mapExport),
    })
    const fileName = `laporan-masa-kerja-turnover-${input.dateFrom}-${input.dateTo}.xlsx`
    const supplied = req.get('x-request-id')
    const requestId = supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : randomUUID()
    await auditExport({
      auth,request: req,requestId,sites: input.sites,
      data: {...filters,fileName,activeRowCount: activeRows[0].length,
        turnoverRowCount: turnoverRows[0].length,
        checksumSha256: createHash('sha256').update(workbook).digest('hex')},
    })
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition',`attachment; filename="${fileName}"`)
    res.setHeader('X-Request-ID',requestId)
    res.send(workbook)
  } catch (error) {
    next(error)
  }
})
