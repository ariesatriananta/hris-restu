import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  buildAuditActivityReportWorkbook,
  type AuditActivityReportExportRow,
} from '../lib/report-workbooks.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const actions = [
  'CREATE', 'UPDATE', 'DELETE', 'VOID', 'APPROVE', 'REJECT',
  'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT', 'CLOSE', 'OTHER',
] as const
const action = z.enum(actions)
const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
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
      context.addIssue({ code: 'custom', path: ['dateTo'], message: 'Tanggal akhir tidak boleh sebelum tanggal awal.' })
    } else if (days > 366) {
      context.addIssue({ code: 'custom', path: ['dateTo'], message: 'Rentang laporan aktivitas pengguna maksimal 366 hari kalender.' })
    }
  })

function csv<T extends string>(raw: unknown, schema: z.ZodType<T>) {
  return [...new Set(String(raw ?? '').split(',').map((value) => value.trim()).filter(Boolean))]
    .map((value) => schema.parse(value))
}
function moduleList(raw: unknown) {
  return [...new Set(String(raw ?? '').split(',').map((value) => value.trim()).filter(Boolean))]
    .map((value) => z.string().min(1).max(50).regex(/^[A-Za-z0-9_:-]+$/).parse(value))
}
function parseQuery(raw: Record<string, unknown>) {
  return {
    ...baseInput.parse({ dateFrom: raw.dateFrom, dateTo: raw.dateTo, query: String(raw.query ?? '').trim() || undefined }),
    sites: csv(raw.site, siteCode),
    actions: csv(raw.action, action),
    modules: moduleList(raw.module),
    actorUids: csv(raw.actorUid, z.string().uuid()),
  }
}
const exportInput = baseInput.extend({
  site: z.array(siteCode).default([]),
  action: z.array(action).default([]),
  module: z.array(z.string().min(1).max(50).regex(/^[A-Za-z0-9_:-]+$/)).default([]),
  actorUid: z.array(z.string().uuid()).default([]),
})
type Input = ReturnType<typeof parseQuery>

function pagination(page: unknown, pageSize: unknown) {
  const currentPage = Number(page ?? 1), size = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(currentPage) && currentPage > 0 ? currentPage : 1,
    pageSize: Number.isInteger(size) && size > 0 ? Math.min(size, 500) : 50,
  }
}
function ensureSiteAccess(auth: AuthContext, requested: string[]) {
  if (!auth.roles.includes('SUPER_ADMIN') && requested.some((site) => !auth.siteAccess.includes(site))) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}
function predicate(input: Input, auth: AuthContext) {
  ensureSiteAccess(auth, input.sites)
  const where = ['al.occurred_at>=TIMESTAMP(?)', 'al.occurred_at<DATE_ADD(TIMESTAMP(?),INTERVAL 1 DAY)']
  const values: unknown[] = [input.dateFrom, input.dateTo]
  const allowedSites = auth.roles.includes('SUPER_ADMIN') ? input.sites : input.sites.length ? input.sites : auth.siteAccess
  if (allowedSites.length) {
    where.push(`s.code IN (${allowedSites.map(() => '?').join(',')})`)
    values.push(...allowedSites)
  } else if (!auth.roles.includes('SUPER_ADMIN')) where.push('1=0')
  if (input.actions.length) {
    where.push(`al.action IN (${input.actions.map(() => '?').join(',')})`)
    values.push(...input.actions)
  }
  if (input.modules.length) {
    where.push(`al.module IN (${input.modules.map(() => '?').join(',')})`)
    values.push(...input.modules)
  }
  if (input.actorUids.length) {
    where.push(`u.uid IN (${input.actorUids.map(() => '?').join(',')})`)
    values.push(...input.actorUids)
  }
  if (input.query) {
    const term = `%${input.query}%`
    where.push('(al.description LIKE ? OR al.reason LIKE ? OR al.table_name LIKE ? OR al.record_uid LIKE ? OR u.full_name LIKE ? OR u.username LIKE ?)')
    values.push(term, term, term, term, term, term)
  }
  return { where, values }
}

const select = `SELECT al.uid activityUid,al.module,al.action,al.table_name tableName,
  al.record_uid recordUid,al.description,al.reason,al.request_id requestId,
  CONCAT(DATE_FORMAT(al.occurred_at,'%Y-%m-%dT%H:%i:%s.'),LPAD(MICROSECOND(al.occurred_at) DIV 1000,3,'0'),'+07:00') occurredAt,
  u.uid actorUid,u.full_name actorName,u.username actorUsername,
  s.uid siteUid,s.code siteCode,s.name siteName
  FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id LEFT JOIN sites s ON s.id=al.site_id`
function nullable(value: unknown) { return value == null || value === '' ? null : String(value) }
function mapRow(row: RowDataPacket) {
  return {
    activityUid: String(row.activityUid), module: String(row.module), action: String(row.action),
    tableName: String(row.tableName), recordUid: nullable(row.recordUid), description: nullable(row.description),
    reason: nullable(row.reason), requestId: nullable(row.requestId), occurredAt: String(row.occurredAt),
    actor: row.actorUid ? { uid: String(row.actorUid), name: String(row.actorName), username: String(row.actorUsername) } : null,
    site: row.siteUid ? { uid: String(row.siteUid), code: String(row.siteCode), name: String(row.siteName) } : null,
  }
}

async function loadMeta(input: Input, auth: AuthContext) {
  const { where, values } = predicate(input, auth), condition = where.join(' AND ')
  const siteScope = auth.roles.includes('SUPER_ADMIN') ? { sql: '1=1', values: [] as string[] } : {
    sql: auth.siteAccess.length ? `s.code IN (${auth.siteAccess.map(() => '?').join(',')})` : '1=0', values: auth.siteAccess,
  }
  const [siteRows, moduleRows, actorRows] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT s.uid,s.code,s.name FROM sites s WHERE s.is_active=1 AND ${siteScope.sql} ORDER BY s.name`, siteScope.values),
    pool.query<RowDataPacket[]>(`SELECT DISTINCT al.module code FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id LEFT JOIN sites s ON s.id=al.site_id WHERE ${condition} ORDER BY al.module`, values),
    pool.query<RowDataPacket[]>(`SELECT DISTINCT u.uid,u.full_name name,u.username FROM audit_logs al JOIN users u ON u.id=al.user_id LEFT JOIN sites s ON s.id=al.site_id WHERE ${condition} ORDER BY u.full_name,u.username`, values),
  ])
  return {
    sites: siteRows[0], modules: moduleRows[0].map((row) => ({ code: String(row.code), name: moduleLabel(String(row.code)) })),
    actions: actions.map((code) => ({ code, name: actionLabel(code) })), actors: actorRows[0], canExport: true,
  }
}

async function auditExport(input: { auth: AuthContext; request: Parameters<typeof writeAudit>[0]['request']; requestId: string; selectedSites: string[]; data: Record<string, unknown> }) {
  const available = input.auth.roles.includes('SUPER_ADMIN') ? input.selectedSites : input.selectedSites.length ? input.selectedSites : input.auth.siteAccess
  const where = ['s.is_active=1'], values: unknown[] = []
  if (available.length) { where.push(`s.code IN (${available.map(() => '?').join(',')})`); values.push(...available) }
  else if (!input.auth.roles.includes('SUPER_ADMIN')) where.push('1=0')
  const [siteRows] = await pool.query<RowDataPacket[]>(`SELECT s.id,s.code FROM sites s WHERE ${where.join(' AND ')}`, values)
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const targets = siteRows.length ? siteRows : [{ id: null, code: 'GLOBAL' }]
    for (const site of targets) {
      await writeAudit({ auth: input.auth, request: input.request, requestId: input.requestId, module: 'REPORTS',
        siteId: site.id == null ? null : Number(site.id), action: 'EXPORT', table: 'audit_logs',
        description: `Mengekspor Laporan Audit Aktivitas Pengguna untuk cakupan ${String(site.code)}.`, afterData: input.data }, conn)
    }
    await conn.commit()
  } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
}

export const auditActivityReportRouter = Router()
auditActivityReportRouter.use(requirePermission('reports.view'), requirePermission('audit.view'))

auditActivityReportRouter.get('/meta', async (req, res, next) => {
  try { const input = parseQuery(req.query as Record<string, unknown>); res.json(await loadMeta(input, res.locals.auth as AuthContext)) }
  catch (error) { next(error) }
})
auditActivityReportRouter.get('/', async (req, res, next) => {
  try {
    const input = parseQuery(req.query as Record<string, unknown>), auth = res.locals.auth as AuthContext
    const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
    const { where, values } = predicate(input, auth), condition = where.join(' AND ')
    const [summaryResult, listResult] = await Promise.all([
      pool.query<RowDataPacket[]>(`SELECT COUNT(*) totalActivities,COUNT(DISTINCT al.user_id) uniqueActors,COUNT(DISTINCT al.module) uniqueModules,
        COALESCE(SUM(al.action IN ('CREATE','UPDATE','DELETE','VOID')),0) dataChanges,
        COALESCE(SUM(al.action IN ('APPROVE','REJECT','CLOSE')),0) decisions,
        COALESCE(SUM(al.action IN ('EXPORT','PRINT')),0) outputs,
        COALESCE(SUM(al.action IN ('LOGIN','LOGOUT')),0) accountActivities
        FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id LEFT JOIN sites s ON s.id=al.site_id WHERE ${condition}`, values),
      pool.query<RowDataPacket[]>(`${select} WHERE ${condition} ORDER BY al.occurred_at DESC,al.id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize]),
    ])
    const summary = summaryResult[0][0] ?? {}
    res.json({ items: listResult[0].map(mapRow), summary: {
      totalActivities: Number(summary.totalActivities ?? 0), uniqueActors: Number(summary.uniqueActors ?? 0), uniqueModules: Number(summary.uniqueModules ?? 0),
      dataChanges: Number(summary.dataChanges ?? 0), decisions: Number(summary.decisions ?? 0), outputs: Number(summary.outputs ?? 0), accountActivities: Number(summary.accountActivities ?? 0),
    }, total: Number(summary.totalActivities ?? 0), page, pageSize, dateFrom: input.dateFrom, dateTo: input.dateTo })
  } catch (error) { next(error) }
})
auditActivityReportRouter.post('/export', async (req, res, next) => {
  try {
    const parsed = exportInput.parse(req.body)
    const input: Input = { dateFrom: parsed.dateFrom, dateTo: parsed.dateTo, query: parsed.query, sites: parsed.site, actions: parsed.action, modules: parsed.module, actorUids: parsed.actorUid }
    const auth = res.locals.auth as AuthContext, { where, values } = predicate(input, auth)
    const [rows] = await pool.query<RowDataPacket[]>(`${select} WHERE ${where.join(' AND ')} ORDER BY al.occurred_at DESC,al.id DESC`, values)
    const mapped = rows.map(mapRow), filters = { dateFrom: input.dateFrom, dateTo: input.dateTo, sites: input.sites, modules: input.modules, actions: input.actions, actorUids: input.actorUids, hasSearch: Boolean(input.query) }
    const workbook = await buildAuditActivityReportWorkbook({ title: 'Audit Aktivitas Pengguna', periodLabel: `${input.dateFrom} s.d. ${input.dateTo}`,
      generatedAt: new Date().toISOString(), generatedBy: auth.name, filters, rows: mapped.map((row): AuditActivityReportExportRow => ({
        occurredAt: row.occurredAt, actorName: row.actor?.name ?? 'Sistem', actorUsername: row.actor?.username ?? null, siteName: row.site?.name ?? 'Global',
        module: row.module, action: row.action, tableName: row.tableName, recordUid: row.recordUid, description: row.description, reason: row.reason, requestId: row.requestId,
      })) })
    const fileName = `laporan-audit-aktivitas-${input.dateFrom}-${input.dateTo}.xlsx`
    const supplied = req.get('x-request-id'), requestId = supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : randomUUID()
    await auditExport({ auth, request: req, requestId, selectedSites: input.sites, data: { ...filters, fileName, rowCount: mapped.length, checksumSha256: createHash('sha256').update(workbook).digest('hex') } })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`); res.setHeader('X-Request-ID', requestId); res.send(workbook)
  } catch (error) { next(error) }
})

function moduleLabel(value: string) {
  return ({ SYSTEM: 'Administrasi Sistem', AUTH: 'Akun', ATTENDANCE: 'Attendance', EMPLOYEES: 'Karyawan', PRODUCTION: 'Produksi Borongan', PAYROLL: 'Payroll', DOCUMENTS: 'Dokumen', REPORTS: 'Laporan' } as Record<string, string>)[value.toUpperCase()] ?? value
}
function actionLabel(value: string) {
  return ({ CREATE: 'Membuat', UPDATE: 'Mengubah', DELETE: 'Menghapus', VOID: 'Membatalkan', APPROVE: 'Menyetujui', REJECT: 'Menolak', LOGIN: 'Masuk', LOGOUT: 'Keluar', EXPORT: 'Ekspor', PRINT: 'Mencetak', CLOSE: 'Menutup periode/proses', OTHER: 'Aktivitas lain' } as Record<string, string>)[value] ?? value
}
