import type { NextFunction, Request, Response } from 'express'
import type { RowDataPacket } from 'mysql2'
import { pool } from '../db.js'
import { ACCESS_COOKIE, verifyAccessToken } from '../lib/auth.js'
import { ApiError } from '../lib/errors.js'

export type AuthContext = { id: number; uid: string; name: string; email: string | null; roles: string[]; permissions: string[]; siteAccess: string[] }
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined
    if (!token) throw new ApiError(401, 'Sesi tidak tersedia.')
    const verified = await verifyAccessToken(token)
    const sessionUid = verified.payload.sid
    if (!verified.payload.sub || typeof sessionUid !== 'string')
      throw new ApiError(401, 'Sesi tidak valid.')
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT u.id,u.uid,u.full_name,u.email,u.status,r.code role_code,p.code permission_code,s.code site_code FROM users u JOIN user_sessions sess ON sess.user_id=u.id AND sess.uid=? AND sess.revoked_at IS NULL AND sess.expires_at>NOW(3) LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id AND r.is_active=1 LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id LEFT JOIN user_site_access usa ON usa.user_id=u.id LEFT JOIN sites s ON s.id=usa.site_id WHERE u.uid=?`, [sessionUid, verified.payload.sub])
    if (!rows[0] || rows[0].status !== 'ACTIVE') throw new ApiError(401, 'User tidak aktif.')
    res.locals.auth = { id: rows[0].id, uid: rows[0].uid, name: rows[0].full_name, email: rows[0].email, roles: [...new Set(rows.map((r) => r.role_code).filter(Boolean))], permissions: [...new Set(rows.map((r) => r.permission_code).filter(Boolean))], siteAccess: [...new Set(rows.map((r) => r.site_code).filter(Boolean))] } satisfies AuthContext
    next()
  } catch (error) { next(error instanceof ApiError ? error : new ApiError(401, 'Sesi tidak valid atau kedaluwarsa.')) }
}
export const requirePermission = (permission: string) => (_req: Request, res: Response, next: NextFunction) => { const auth = res.locals.auth as AuthContext; if (!auth.roles.includes('SUPER_ADMIN') && !auth.permissions.includes(permission)) return next(new ApiError(403, 'Anda tidak memiliki izin untuk aksi ini.')); next() }
