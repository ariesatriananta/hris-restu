import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  buildHeadcountChangeReportWorkbook,
  type HeadcountChangeReportExportRow,
} from '../lib/report-workbooks.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const employeeTypeCode = z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'])
const movementType = z.enum([
  'JOIN',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'RESIGN',
  'DEACTIVATED',
  'REACTIVATED',
  'STATUS_CHANGE',
])
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
        message: 'Rentang laporan perubahan jumlah karyawan maksimal 366 hari kalender.',
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
    movementTypes: csv(raw.movementType, movementType),
  }
}

const exportInput = baseInput.extend({
  site: z.array(siteCode).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  productionSection: z.array(z.string().uuid()).default([]),
  movementType: z.array(movementType).default([]),
})
type Input = ReturnType<typeof parseQuery>

function pagination(page: unknown, pageSize: unknown) {
  const currentPage = Number(page ?? 1)
  const size = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(currentPage) && currentPage > 0 ? currentPage : 1,
    pageSize:
      Number.isInteger(size) && size > 0 ? Math.min(size, 500) : 50,
  }
}

function ensureSiteAccess(auth: AuthContext, requested: string[]) {
  if (
    !auth.roles.includes('SUPER_ADMIN') &&
    requested.some((site) => !auth.siteAccess.includes(site))
  )
    throw new ApiError(403, 'Akses site ditolak.')
}

function allowedSites(auth: AuthContext, requested: string[]) {
  ensureSiteAccess(auth, requested)
  return auth.roles.includes('SUPER_ADMIN')
    ? requested
    : requested.length
      ? requested
      : auth.siteAccess
}

function addList(where: string[], values: unknown[], column: string, items: string[]) {
  if (!items.length) return
  where.push(`${column} IN (${items.map(() => '?').join(',')})`)
  values.push(...items)
}

const eventDatasetSql = `SELECT * FROM (
  SELECT h.uid historyUid,'JOIN' movementType,h.effective_from effectiveDateValue,
    DATE_FORMAT(h.effective_from,'%Y-%m-%d') effectiveDate,
    e.uid employeeUid,e.employee_number employeeNumber,e.full_name employeeName,
    target_site.uid eventSiteUid,target_site.code eventSiteCode,target_site.name eventSiteName,
    NULL sourceSiteUid,NULL sourceSiteCode,NULL sourceSiteName,
    target_site.uid targetSiteUid,target_site.code targetSiteCode,target_site.name targetSiteName,
    NULL sourceStatusUid,NULL sourceStatusCode,NULL sourceStatusName,
    target_status.uid targetStatusUid,target_status.code targetStatusCode,target_status.name targetStatusName,
    target_type.uid employeeTypeUid,target_type.code employeeTypeCode,target_type.name employeeTypeName,
    target_section.uid productionSectionUid,target_section.code productionSectionCode,target_section.name productionSectionName,
    h.reference_number referenceNumber
  FROM employee_employment_histories h
  JOIN employees e ON e.id=h.employee_id
  JOIN sites target_site ON target_site.id=h.site_id
  JOIN employee_statuses target_status ON target_status.id=h.employee_status_id
  JOIN employee_types target_type ON target_type.id=h.employee_type_id
  LEFT JOIN production_module_sections target_mapping ON target_mapping.id=h.production_module_section_id
  LEFT JOIN production_sections target_section ON target_section.id=target_mapping.production_section_id
  WHERE h.change_type='INITIAL' AND target_status.code='ACTIVE'

  UNION ALL
  SELECT h.uid,'TRANSFER_OUT',h.effective_from,DATE_FORMAT(h.effective_from,'%Y-%m-%d'),
    e.uid,e.employee_number,e.full_name,
    source_site.uid,source_site.code,source_site.name,
    source_site.uid,source_site.code,source_site.name,
    target_site.uid,target_site.code,target_site.name,
    source_status.uid,source_status.code,source_status.name,
    target_status.uid,target_status.code,target_status.name,
    source_type.uid,source_type.code,source_type.name,
    source_section.uid,source_section.code,source_section.name,h.reference_number
  FROM employee_employment_histories h
  JOIN employees e ON e.id=h.employee_id
  JOIN employee_employment_histories source_history ON source_history.id=(
    SELECT previous_history.id FROM employee_employment_histories previous_history
    WHERE previous_history.employee_id=h.employee_id
      AND (previous_history.effective_from<h.effective_from
        OR (previous_history.effective_from=h.effective_from AND previous_history.id<h.id))
    ORDER BY previous_history.effective_from DESC,previous_history.id DESC LIMIT 1
  )
  JOIN sites source_site ON source_site.id=source_history.site_id
  JOIN sites target_site ON target_site.id=h.site_id
  JOIN employee_statuses source_status ON source_status.id=source_history.employee_status_id
  JOIN employee_statuses target_status ON target_status.id=h.employee_status_id
  JOIN employee_types source_type ON source_type.id=source_history.employee_type_id
  LEFT JOIN production_module_sections source_mapping ON source_mapping.id=source_history.production_module_section_id
  LEFT JOIN production_sections source_section ON source_section.id=source_mapping.production_section_id
  WHERE h.change_type<>'INITIAL' AND source_history.site_id<>h.site_id

  UNION ALL
  SELECT h.uid,'TRANSFER_IN',h.effective_from,DATE_FORMAT(h.effective_from,'%Y-%m-%d'),
    e.uid,e.employee_number,e.full_name,
    target_site.uid,target_site.code,target_site.name,
    source_site.uid,source_site.code,source_site.name,
    target_site.uid,target_site.code,target_site.name,
    source_status.uid,source_status.code,source_status.name,
    target_status.uid,target_status.code,target_status.name,
    target_type.uid,target_type.code,target_type.name,
    target_section.uid,target_section.code,target_section.name,h.reference_number
  FROM employee_employment_histories h
  JOIN employees e ON e.id=h.employee_id
  JOIN employee_employment_histories source_history ON source_history.id=(
    SELECT previous_history.id FROM employee_employment_histories previous_history
    WHERE previous_history.employee_id=h.employee_id
      AND (previous_history.effective_from<h.effective_from
        OR (previous_history.effective_from=h.effective_from AND previous_history.id<h.id))
    ORDER BY previous_history.effective_from DESC,previous_history.id DESC LIMIT 1
  )
  JOIN sites source_site ON source_site.id=source_history.site_id
  JOIN sites target_site ON target_site.id=h.site_id
  JOIN employee_statuses source_status ON source_status.id=source_history.employee_status_id
  JOIN employee_statuses target_status ON target_status.id=h.employee_status_id
  JOIN employee_types target_type ON target_type.id=h.employee_type_id
  LEFT JOIN production_module_sections target_mapping ON target_mapping.id=h.production_module_section_id
  LEFT JOIN production_sections target_section ON target_section.id=target_mapping.production_section_id
  WHERE h.change_type<>'INITIAL' AND source_history.site_id<>h.site_id

  UNION ALL
  SELECT h.uid,
    CASE WHEN target_status.code='RESIGNED' THEN 'RESIGN'
         WHEN source_status.code='ACTIVE' AND target_status.code<>'ACTIVE' THEN 'DEACTIVATED'
         WHEN source_status.code<>'ACTIVE' AND target_status.code='ACTIVE' THEN 'REACTIVATED'
         ELSE 'STATUS_CHANGE' END,
    h.effective_from,DATE_FORMAT(h.effective_from,'%Y-%m-%d'),
    e.uid,e.employee_number,e.full_name,
    target_site.uid,target_site.code,target_site.name,
    source_site.uid,source_site.code,source_site.name,
    target_site.uid,target_site.code,target_site.name,
    source_status.uid,source_status.code,source_status.name,
    target_status.uid,target_status.code,target_status.name,
    target_type.uid,target_type.code,target_type.name,
    target_section.uid,target_section.code,target_section.name,h.reference_number
  FROM employee_employment_histories h
  JOIN employees e ON e.id=h.employee_id
  JOIN employee_employment_histories source_history ON source_history.id=(
    SELECT previous_history.id FROM employee_employment_histories previous_history
    WHERE previous_history.employee_id=h.employee_id
      AND (previous_history.effective_from<h.effective_from
        OR (previous_history.effective_from=h.effective_from AND previous_history.id<h.id))
    ORDER BY previous_history.effective_from DESC,previous_history.id DESC LIMIT 1
  )
  JOIN sites source_site ON source_site.id=source_history.site_id
  JOIN sites target_site ON target_site.id=h.site_id
  JOIN employee_statuses source_status ON source_status.id=source_history.employee_status_id
  JOIN employee_statuses target_status ON target_status.id=h.employee_status_id
  JOIN employee_types target_type ON target_type.id=h.employee_type_id
  LEFT JOIN production_module_sections target_mapping ON target_mapping.id=h.production_module_section_id
  LEFT JOIN production_sections target_section ON target_section.id=target_mapping.production_section_id
  WHERE h.change_type<>'INITIAL'
    AND source_history.employee_status_id<>h.employee_status_id
) movement_rows`

function eventPredicate(input: Input, auth: AuthContext) {
  const where = ['effectiveDateValue BETWEEN ? AND ?']
  const values: unknown[] = [input.dateFrom, input.dateTo]
  const sites = allowedSites(auth, input.sites)
  if (sites.length) addList(where, values, 'eventSiteCode', sites)
  else if (!auth.roles.includes('SUPER_ADMIN')) where.push('1=0')
  addList(where, values, 'employeeTypeCode', input.employeeTypes)
  addList(where, values, 'productionSectionUid', input.productionSections)
  addList(where, values, 'movementType', input.movementTypes)
  if (input.query) {
    where.push('(employeeName LIKE ? OR employeeNumber LIKE ? OR referenceNumber LIKE ?)')
    values.push(`%${input.query}%`, `%${input.query}%`, `%${input.query}%`)
  }
  return { where, values }
}

const snapshotDatasetSql = `SELECT e.id employeeId,
  s.code siteCode,et.code employeeTypeCode,ps.uid productionSectionUid,
  es.code employeeStatusCode,
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

function previousDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

async function snapshot(input: Input, auth: AuthContext, referenceDate: string) {
  const where = ['1=1']
  const values: unknown[] = [referenceDate, referenceDate, referenceDate, referenceDate]
  const sites = allowedSites(auth, input.sites)
  if (sites.length) addList(where, values, 'siteCode', sites)
  else if (!auth.roles.includes('SUPER_ADMIN')) where.push('1=0')
  addList(where, values, 'employeeTypeCode', input.employeeTypes)
  addList(where, values, 'productionSectionUid', input.productionSections)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(historyCount=1 AND employeeStatusCode='ACTIVE'),0) activeHeadcount,
      COALESCE(SUM(historyCount<>1),0) ambiguousHistories
     FROM (${snapshotDatasetSql}) snapshot_rows WHERE ${where.join(' AND ')}`,
    values
  )
  return {
    activeHeadcount: Number(rows[0]?.activeHeadcount ?? 0),
    ambiguousHistories: Number(rows[0]?.ambiguousHistories ?? 0),
  }
}

function nullable(value: unknown) {
  return value == null || value === '' ? null : String(value)
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
function mapRow(row: RowDataPacket) {
  return {
    historyUid: String(row.historyUid),
    movementType: String(row.movementType),
    effectiveDate: String(row.effectiveDate),
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    eventSite: reference(row, 'eventSite'),
    sourceSite: reference(row, 'sourceSite'),
    targetSite: reference(row, 'targetSite'),
    sourceStatus: reference(row, 'sourceStatus'),
    targetStatus: reference(row, 'targetStatus'),
    employeeType: reference(row, 'employeeType'),
    productionSection: reference(row, 'productionSection'),
    referenceNumber: nullable(row.referenceNumber),
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
    movementTypes: [
      { code: 'JOIN', name: 'Karyawan masuk' },
      { code: 'TRANSFER_IN', name: 'Mutasi masuk' },
      { code: 'TRANSFER_OUT', name: 'Mutasi keluar' },
      { code: 'RESIGN', name: 'Resign' },
      { code: 'DEACTIVATED', name: 'Menjadi nonaktif' },
      { code: 'REACTIVATED', name: 'Aktif kembali' },
      { code: 'STATUS_CHANGE', name: 'Perubahan status lainnya' },
    ],
    canExport: true,
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
      await writeAudit(
        {
          auth: input.auth,
          request: input.request,
          requestId: input.requestId,
          module: 'REPORTS',
          siteId: Number(site.id),
          action: 'EXPORT',
          table: 'employee_employment_histories',
          description: `Mengekspor Laporan Perubahan Jumlah Karyawan untuk ${String(site.code)}.`,
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

export const headcountChangeReportRouter = Router()
headcountChangeReportRouter.use(
  requirePermission('reports.view'),
  requirePermission('employees.view')
)

headcountChangeReportRouter.get('/meta', async (req, res, next) => {
  try {
    const input = parseQuery(req.query as Record<string, unknown>)
    res.json(await loadMeta(input, res.locals.auth as AuthContext))
  } catch (error) {
    next(error)
  }
})

headcountChangeReportRouter.get('/', async (req, res, next) => {
  try {
    const input = parseQuery(req.query as Record<string, unknown>)
    const auth = res.locals.auth as AuthContext
    const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
    const { where, values } = eventPredicate(input, auth)
    const condition = where.join(' AND ')
    const [opening, closing, eventSummary, rows] = await Promise.all([
      snapshot(input, auth, previousDate(input.dateFrom)),
      snapshot(input, auth, input.dateTo),
      pool.query<RowDataPacket[]>(`SELECT COUNT(*) totalMovements,
        COALESCE(SUM(movementType='JOIN'),0) joined,
        COALESCE(SUM(movementType='TRANSFER_IN'),0) transferredIn,
        COALESCE(SUM(movementType='TRANSFER_OUT'),0) transferredOut,
        COALESCE(SUM(movementType='RESIGN'),0) resigned,
        COALESCE(SUM(movementType IN ('DEACTIVATED','REACTIVATED','STATUS_CHANGE')),0) statusChanges
        FROM (${eventDatasetSql}) events WHERE ${condition}`, values),
      pool.query<RowDataPacket[]>(`SELECT * FROM (${eventDatasetSql}) events WHERE ${condition}
        ORDER BY effectiveDateValue DESC,employeeName,movementType LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize]),
    ])
    const movements = eventSummary[0][0] ?? {}
    res.json({
      items: rows[0].map(mapRow),
      summary: {
        openingHeadcount: opening.activeHeadcount,
        closingHeadcount: closing.activeHeadcount,
        netChange: closing.activeHeadcount - opening.activeHeadcount,
        joined: Number(movements.joined ?? 0),
        transferredIn: Number(movements.transferredIn ?? 0),
        transferredOut: Number(movements.transferredOut ?? 0),
        resigned: Number(movements.resigned ?? 0),
        statusChanges: Number(movements.statusChanges ?? 0),
        ambiguousOpening: opening.ambiguousHistories,
        ambiguousClosing: closing.ambiguousHistories,
      },
      total: Number(movements.totalMovements ?? 0),
      page,
      pageSize,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    })
  } catch (error) {
    next(error)
  }
})

headcountChangeReportRouter.post('/export', async (req, res, next) => {
  try {
    const parsed = exportInput.parse(req.body)
    const input: Input = {
      dateFrom: parsed.dateFrom,
      dateTo: parsed.dateTo,
      query: parsed.query,
      sites: parsed.site,
      employeeTypes: parsed.employeeType,
      productionSections: parsed.productionSection,
      movementTypes: parsed.movementType,
    }
    const auth = res.locals.auth as AuthContext
    const { where, values } = eventPredicate(input, auth)
    const [opening, closing, rows] = await Promise.all([
      snapshot(input, auth, previousDate(input.dateFrom)),
      snapshot(input, auth, input.dateTo),
      pool.query<RowDataPacket[]>(`SELECT * FROM (${eventDatasetSql}) events WHERE ${where.join(' AND ')}
        ORDER BY effectiveDateValue DESC,employeeName,movementType`, values),
    ])
    const mapped = rows[0].map(mapRow)
    const filters = {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      sites: input.sites,
      employeeTypes: input.employeeTypes,
      productionSections: input.productionSections,
      movementTypes: input.movementTypes,
      hasSearch: Boolean(input.query),
    }
    const workbook = await buildHeadcountChangeReportWorkbook({
      title: 'Perubahan Jumlah Karyawan',
      periodLabel: `${input.dateFrom} s.d. ${input.dateTo}`,
      generatedAt: new Date().toISOString(),
      generatedBy: auth.name,
      filters,
      openingHeadcount: opening.activeHeadcount,
      closingHeadcount: closing.activeHeadcount,
      ambiguousOpening: opening.ambiguousHistories,
      ambiguousClosing: closing.ambiguousHistories,
      rows: mapped.map((row): HeadcountChangeReportExportRow => ({
        effectiveDate: row.effectiveDate,
        movementType: row.movementType,
        employeeNumber: row.employeeNumber,
        employeeName: row.employeeName,
        eventSiteName: row.eventSite?.name ?? '',
        sourceSiteName: row.sourceSite?.name ?? null,
        targetSiteName: row.targetSite?.name ?? null,
        sourceStatusName: row.sourceStatus?.name ?? null,
        targetStatusName: row.targetStatus?.name ?? null,
        employeeTypeName: row.employeeType?.name ?? '',
        productionSectionName: row.productionSection?.name ?? null,
        referenceNumber: row.referenceNumber,
      })),
    })
    const fileName = `laporan-perubahan-jumlah-karyawan-${input.dateFrom}-${input.dateTo}.xlsx`
    const supplied = req.get('x-request-id')
    const requestId = supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : randomUUID()
    await auditExport({
      auth,
      request: req,
      requestId,
      sites: input.sites,
      data: {
        ...filters,
        fileName,
        rowCount: mapped.length,
        checksumSha256: createHash('sha256').update(workbook).digest('hex'),
      },
    })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('X-Request-ID', requestId)
    res.send(workbook)
  } catch (error) {
    next(error)
  }
})
