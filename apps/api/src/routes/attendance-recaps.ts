import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { env } from '../config.js'
import { pool } from '../db.js'
import {
  aggregateAttendanceRecap,
  buildAttendanceRecapWorkbook,
  loadAttendanceRecapProjection,
  summarizeAttendanceRecap,
  type AttendanceRecapDetail,
  type AttendanceRecapSite,
} from '../lib/attendance-recap.js'
import {
  attendanceRecapPeriodInput,
  recapAttendanceStatuses,
} from '../lib/attendance-recap-policy.js'
import { jakartaDateTime } from '../lib/attendance-finalization-policy.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const employeeType = z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'])
const attendanceStatus = z.enum(recapAttendanceStatuses)

const filtersSchema = attendanceRecapPeriodInput.and(
  z.object({
    query: z.string().trim().max(150).optional(),
    site: z.array(siteCode).default([]),
    employeeType: z.array(employeeType).default([]),
    attendanceStatus: z.array(attendanceStatus).default([]),
  })
)

const exportSchema = filtersSchema

function pageParams(page: unknown, pageSize: unknown) {
  const parsedPage = Number(page ?? 1)
  const parsedPageSize = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize:
      Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(500, parsedPageSize)
        : 50,
  }
}

function csv<T extends string>(raw: unknown, schema: z.ZodType<T>) {
  const values = String(raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return [...new Set(z.array(schema).parse(values))]
}

function parseQuery(raw: Record<string, unknown>) {
  return filtersSchema.parse({
    dateFrom: raw.dateFrom,
    dateTo: raw.dateTo,
    query: String(raw.query ?? '').trim() || undefined,
    site: csv(raw.site, siteCode),
    employeeType: csv(raw.employeeType, employeeType),
    attendanceStatus: csv(raw.attendanceStatus, attendanceStatus),
  })
}

async function resolveSites(auth: AuthContext, requested: string[]) {
  if (
    !auth.roles.includes('SUPER_ADMIN') &&
    requested.some((site) => !auth.siteAccess.includes(site))
  ) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
  const scopedCodes = auth.roles.includes('SUPER_ADMIN')
    ? requested
    : requested.length
      ? requested
      : auth.siteAccess
  const where = ['is_active=1']
  const values: unknown[] = []
  if (scopedCodes.length) {
    where.push(`code IN (${scopedCodes.map(() => '?').join(',')})`)
    values.push(...scopedCodes)
  } else if (!auth.roles.includes('SUPER_ADMIN')) {
    where.push('1=0')
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id,uid,code,name FROM sites WHERE ${where.join(' AND ')} ORDER BY code`,
    values
  )
  if (requested.length !== rows.length) {
    const found = new Set(rows.map((row) => String(row.code)))
    if (requested.some((site) => !found.has(site))) {
      throw new ApiError(422, 'Satu atau lebih site tidak valid atau tidak aktif.')
    }
  }
  return rows.map(
    (row): AttendanceRecapSite => ({
      id: Number(row.id),
      uid: String(row.uid),
      code: String(row.code),
      name: String(row.name),
    })
  )
}

function applyDetailFilters(
  details: AttendanceRecapDetail[],
  input: z.infer<typeof filtersSchema>
) {
  const query = input.query?.toLocaleLowerCase('id')
  return details.filter(
    (row) =>
      (!query ||
        row.employeeName.toLocaleLowerCase('id').includes(query) ||
        row.employeeNumber.toLocaleLowerCase('id').includes(query)) &&
      (!input.employeeType.length ||
        input.employeeType.includes(
          row.employeeType as (typeof input.employeeType)[number]
        )) &&
      (!input.attendanceStatus.length ||
        input.attendanceStatus.includes(
          row.status as (typeof input.attendanceStatus)[number]
        ))
  )
}

export const attendanceRecapsRouter = Router()

attendanceRecapsRouter.get(
  '/recaps',
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseQuery(req.query as Record<string, unknown>)
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const sites = await resolveSites(res.locals.auth as AuthContext, input.site)
      const projection = await loadAttendanceRecapProjection({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        goLiveDate: env.ATTENDANCE_GO_LIVE_DATE,
        sites,
      })
      const groups = summarizeAttendanceRecap(
        applyDetailFilters(projection.details, input)
      )
      res.json({
        items: groups.slice((page - 1) * pageSize, page * pageSize),
        total: groups.length,
        page,
        pageSize,
        summary: aggregateAttendanceRecap(groups),
        completeness: projection.completeness,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceRecapsRouter.get(
  '/recaps/:employeeUid/days',
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseQuery(req.query as Record<string, unknown>)
      const employeeUid = z.string().uuid().parse(
        Array.isArray(req.params.employeeUid)
          ? req.params.employeeUid[0]
          : req.params.employeeUid
      )
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const sites = await resolveSites(res.locals.auth as AuthContext, input.site)
      const projection = await loadAttendanceRecapProjection({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        goLiveDate: env.ATTENDANCE_GO_LIVE_DATE,
        sites,
      })
      const items = applyDetailFilters(projection.details, input).filter(
        (row) => row.employeeUid === employeeUid
      )
      res.json({
        items: items.slice((page - 1) * pageSize, page * pageSize),
        total: items.length,
        page,
        pageSize,
        completeness: projection.completeness,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceRecapsRouter.post(
  '/recaps/export',
  requirePermission('attendance.export'),
  async (req, res, next) => {
    try {
      const input = exportSchema.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const sites = await resolveSites(auth, input.site)
      const projection = await loadAttendanceRecapProjection({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        goLiveDate: env.ATTENDANCE_GO_LIVE_DATE,
        sites,
      })
      if (!projection.completeness.exportAllowed) {
        return res.status(409).json({
          code: 'ATTENDANCE_RECAP_INCOMPLETE',
          message: 'Rekap Attendance belum lengkap dan belum dapat diekspor resmi.',
          completeness: projection.completeness,
        })
      }
      const details = applyDetailFilters(projection.details, input)
      const groups = summarizeAttendanceRecap(details)
      const generatedAt = `${jakartaDateTime().replace(' ', 'T')}+07:00`
      const auditFilters = {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        sites: sites.map((site) => site.code),
        employeeTypes: input.employeeType,
        attendanceStatuses: input.attendanceStatus,
        hasEmployeeSearch: Boolean(input.query),
      }
      const workbook = await buildAttendanceRecapWorkbook({
        groups,
        details,
        completeness: projection.completeness,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        generatedAt,
        generatedBy: auth.name,
        filters: auditFilters,
      })
      const checksumSha256 = createHash('sha256').update(workbook).digest('hex')
      const filename = `rekap-attendance-${input.dateFrom}-${input.dateTo}-${sites
        .map((site) => site.code.toLowerCase())
        .join('-')}.xlsx`
      const suppliedRequestId = req.get('x-request-id')
      const requestId =
        suppliedRequestId && /^[A-Za-z0-9._:-]{1,100}$/.test(suppliedRequestId)
          ? suppliedRequestId
          : randomUUID()
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        for (const site of sites) {
          await writeAudit(
            {
              auth,
              request: req,
              requestId,
              module: 'ATTENDANCE',
              siteId: site.id,
              action: 'EXPORT',
              table: 'attendance_records',
              description: `Mengekspor Rekap Attendance ${site.code} periode ${input.dateFrom} sampai ${input.dateTo}.`,
              afterData: {
                ...auditFilters,
                filename,
                summaryRows: groups.filter((group) => group.site === site.code).length,
                detailRows: details.filter((row) => row.site === site.code).length,
                virtualWeeklyOffRows: details.filter(
                  (row) => row.site === site.code && row.virtual
                ).length,
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
