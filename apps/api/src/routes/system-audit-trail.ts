import { z } from 'zod'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { pool } from '../db.js'
import { ApiError } from '../lib/errors.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const actions = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'VOID',
  'APPROVE',
  'REJECT',
  'LOGIN',
  'LOGOUT',
  'EXPORT',
  'PRINT',
  'CLOSE',
  'OTHER',
] as const
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const listInput = z.object({
  search: z.string().trim().max(150).default(''),
  module: z.string().trim().max(500).optional(),
  action: z.string().trim().max(500).optional(),
  site: z.string().trim().max(500).optional(),
  userUid: z.string().uuid().optional(),
  dateFrom: date.optional(),
  dateTo: date.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
})

function csv(value?: string) {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ]
}
function json(value: unknown): unknown {
  if (value == null) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown
    } catch {
      return value
    }
  }
  return value
}
const sensitiveKey =
  /(password|passwd|password_hash|hash|token|secret|cookie|authorization|credential|api[_-]?key|private[_-]?key|session)/i
function redact(value: unknown, key = ''): unknown {
  if (sensitiveKey.test(key)) return '[DISEMBUNYIKAN]'
  const parsed = json(value)
  if (Array.isArray(parsed)) return parsed.map((item) => redact(item))
  if (parsed && typeof parsed === 'object')
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(
        ([childKey, child]) => [childKey, redact(child, childKey)]
      )
    )
  return parsed
}
function formatRow(row: RowDataPacket, detail = false) {
  const base = {
    uid: String(row.uid),
    module: String(row.module),
    action: String(row.action),
    tableName: String(row.tableName),
    recordUid: row.recordUid ? String(row.recordUid) : null,
    description: row.description ? String(row.description) : null,
    reason: row.reason ? String(row.reason) : null,
    occurredAt: row.occurredAt,
    actor: row.userUid
      ? {
          uid: String(row.userUid),
          name: String(row.userName),
          username: String(row.username),
        }
      : null,
    site: row.siteUid
      ? {
          uid: String(row.siteUid),
          code: String(row.siteCode),
          name: String(row.siteName),
        }
      : null,
  }
  return detail
    ? {
        ...base,
        requestId: row.requestId ? String(row.requestId) : null,
        ipAddress: row.ipAddress ? String(row.ipAddress) : null,
        userAgent: row.userAgent ? String(row.userAgent) : null,
        beforeData: redact(row.beforeData),
        afterData: redact(row.afterData),
      }
    : base
}

const select = `SELECT al.uid,al.module,al.action,al.table_name tableName,al.record_uid recordUid,al.description,al.reason,
  al.before_data beforeData,al.after_data afterData,al.request_id requestId,al.ip_address ipAddress,al.user_agent userAgent,
  DATE_FORMAT(al.occurred_at,'%Y-%m-%dT%H:%i:%s+07:00') occurredAt,
  u.uid userUid,u.full_name userName,u.username,s.uid siteUid,s.code siteCode,s.name siteName
  FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id LEFT JOIN sites s ON s.id=al.site_id`

export const systemAuditTrailRouter = Router()
systemAuditTrailRouter.use(authenticate, requirePermission('audit.view'))

function scope(auth: AuthContext, alias = 's') {
  if (auth.roles.includes('SUPER_ADMIN'))
    return { sql: '1=1', params: [] as string[] }
  if (!auth.siteAccess.length) return { sql: '1=0', params: [] as string[] }
  return {
    sql: `${alias}.code IN (${auth.siteAccess.map(() => '?').join(',')})`,
    params: auth.siteAccess,
  }
}

systemAuditTrailRouter.get('/meta', async (_req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const access = scope(auth)
    const [modules, sites, users] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT DISTINCT al.module value FROM audit_logs al LEFT JOIN sites s ON s.id=al.site_id WHERE ${access.sql} ORDER BY al.module`,
        access.params
      ),
      pool.query<RowDataPacket[]>(
        `SELECT s.uid,s.code,s.name FROM sites s WHERE s.is_active=1 AND ${access.sql} ORDER BY s.name`,
        access.params
      ),
      pool.query<RowDataPacket[]>(
        `SELECT DISTINCT u.uid,u.full_name name,u.username FROM audit_logs al JOIN users u ON u.id=al.user_id LEFT JOIN sites s ON s.id=al.site_id WHERE ${access.sql} ORDER BY u.full_name`,
        access.params
      ),
    ])
    res.json({
      modules: modules[0].map((row) => String(row.value)),
      actions,
      sites: sites[0],
      users: users[0],
    })
  } catch (error) {
    next(error)
  }
})

systemAuditTrailRouter.get('/entries', async (req, res, next) => {
  try {
    const input = listInput.parse(req.query),
      where = ['1=1'],
      params: unknown[] = []
    const auth = res.locals.auth as AuthContext,
      access = scope(auth)
    where.push(access.sql)
    params.push(...access.params)
    const modules = csv(input.module),
      selectedActions = csv(input.action),
      sites = csv(input.site)
    if (
      selectedActions.some(
        (action) => !actions.includes(action as (typeof actions)[number])
      )
    )
      throw new ApiError(422, 'Filter aksi Audit Trail belum valid.')
    if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo)
      throw new ApiError(
        422,
        'Tanggal awal tidak boleh melewati tanggal akhir.'
      )
    if (input.search) {
      const term = `%${input.search}%`
      where.push(
        '(al.description LIKE ? OR al.reason LIKE ? OR al.table_name LIKE ? OR al.record_uid LIKE ? OR u.full_name LIKE ? OR u.username LIKE ?)'
      )
      params.push(term, term, term, term, term, term)
    }
    if (modules.length) {
      where.push(`al.module IN (${modules.map(() => '?').join(',')})`)
      params.push(...modules)
    }
    if (selectedActions.length) {
      where.push(`al.action IN (${selectedActions.map(() => '?').join(',')})`)
      params.push(...selectedActions)
    }
    if (sites.length) {
      where.push(
        `(s.uid IN (${sites.map(() => '?').join(',')}) OR s.code IN (${sites.map(() => '?').join(',')}))`
      )
      params.push(...sites, ...sites)
    }
    if (input.userUid) {
      where.push('u.uid=?')
      params.push(input.userUid)
    }
    if (input.dateFrom) {
      where.push('al.occurred_at>=?')
      params.push(`${input.dateFrom} 00:00:00`)
    }
    if (input.dateTo) {
      where.push('al.occurred_at<DATE_ADD(?,INTERVAL 1 DAY)')
      params.push(`${input.dateTo} 00:00:00`)
    }
    const predicate = where.join(' AND ')
    const [count] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) total FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id LEFT JOIN sites s ON s.id=al.site_id WHERE ${predicate}`,
      params
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      `${select} WHERE ${predicate} ORDER BY al.occurred_at DESC,al.id DESC LIMIT ? OFFSET ?`,
      [...params, input.pageSize, (input.page - 1) * input.pageSize]
    )
    res.json({
      data: rows.map((row) => formatRow(row)),
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        total: Number(count[0]?.total ?? 0),
      },
    })
  } catch (error) {
    next(error)
  }
})

systemAuditTrailRouter.get('/entries/:uid', async (req, res, next) => {
  try {
    const uid = z.string().uuid().parse(req.params.uid)
    const access = scope(res.locals.auth as AuthContext)
    const [rows] = await pool.query<RowDataPacket[]>(
      `${select} WHERE al.uid=? AND ${access.sql} LIMIT 1`,
      [uid, ...access.params]
    )
    if (!rows[0])
      throw new ApiError(404, 'Catatan Audit Trail tidak ditemukan.')
    res.json(formatRow(rows[0], true))
  } catch (error) {
    next(error)
  }
})
