import { z } from 'zod'
import argon2 from 'argon2'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { randomUUID } from 'node:crypto'
import { env } from '../config.js'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  clientInfo,
  hashToken,
  newRefreshToken,
  setAuthCookies,
  signAccessToken,
} from '../lib/auth.js'
import { ApiError } from '../lib/errors.js'
import { authenticate, type AuthContext } from '../middleware/authenticate.js'

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})
const profileInput = z.object({
  fullName: z.string().trim().min(2).max(150),
  username: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      'Username hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.'
    ),
  email: z.string().trim().email().max(191).nullable(),
  phone: z.string().trim().max(30).nullable(),
})
const passwordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d).+$/,
      'Kata sandi baru wajib memiliki huruf dan angka.'
    ),
})
async function issue(
  req: Parameters<typeof clientInfo>[0],
  res: Parameters<typeof setAuthCookies>[0],
  user: { id: number; uid: string }
) {
  const refresh = newRefreshToken(),
    sessionUid = randomUUID(),
    info = clientInfo(req)
  await pool.execute(
    `INSERT INTO user_sessions(uid,user_id,refresh_token_hash,device_name,ip_address,user_agent,expires_at) VALUES(?,?,?,?,?,?,DATE_ADD(NOW(3), INTERVAL ? DAY))`,
    [
      sessionUid,
      user.id,
      hashToken(refresh),
      info.device ?? null,
      info.ip ?? null,
      info.userAgent ?? null,
      env.REFRESH_TOKEN_TTL_DAYS,
    ]
  )
  setAuthCookies(res, await signAccessToken(user.uid, sessionUid), refresh)
}
export const authRouter = Router()
authRouter.post('/sign-in', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body)
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id,uid,email,username,password_hash,status,(locked_until IS NOT NULL AND locked_until > NOW(3)) is_locked FROM users WHERE username=? LIMIT 1',
      [input.username]
    )
    const user = rows[0]
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.is_locked ||
      !(await argon2.verify(user.password_hash, input.password))
    )
      throw new ApiError(401, 'Username atau kata sandi tidak sesuai.')
    await issue(req, res, { id: user.id, uid: user.uid })
    await pool.execute(
      'UPDATE users SET failed_login_attempts=0,last_login_at=NOW(3) WHERE id=?',
      [user.id]
    )
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (!token) throw new ApiError(401, 'Refresh session tidak tersedia.')
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT us.id session_id,u.id user_id,u.uid user_uid,u.status FROM user_sessions us JOIN users u ON u.id=us.user_id WHERE us.refresh_token_hash=? AND us.revoked_at IS NULL AND us.expires_at>NOW(3) LIMIT 1',
      [hashToken(token)]
    )
    const row = rows[0]
    if (!row || row.status !== 'ACTIVE')
      throw new ApiError(401, 'Refresh session tidak valid.')
    await pool.execute(
      'UPDATE user_sessions SET revoked_at=NOW(3),revoke_reason=? WHERE id=?',
      ['ROTATED', row.session_id]
    )
    await issue(req, res, { id: row.user_id, uid: row.user_uid })
    res.status(204).end()
  } catch (e) {
    clearAuthCookies(res)
    next(e)
  }
})
authRouter.post('/sign-out', async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (token)
      await pool.execute(
        'UPDATE user_sessions SET revoked_at=NOW(3),revoke_reason=? WHERE refresh_token_hash=? AND revoked_at IS NULL',
        ['LOGOUT', hashToken(token)]
      )
    clearAuthCookies(res)
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})
authRouter.get('/me', authenticate, (_req, res) => {
  const auth = res.locals.auth as AuthContext
  const primaryRole = auth.roles.includes('SUPER_ADMIN')
    ? 'SUPER_ADMIN'
    : (auth.roles[0] ?? 'USER')
  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    DIRECTOR: 'Direksi / Owner',
    HR_OFFICER: 'HR Officer',
    PRODUCTION_ADMIN: 'Admin Produksi',
    PAYROLL_FINANCE: 'Finance / Payroll',
    SITE_SUPERVISOR: 'Supervisor / PIC Site',
    USER: 'User',
  }
  res.json({
    user: {
      uid: auth.uid,
      name: auth.name,
      email: auth.email,
      role: primaryRole,
      roleLabel: roleLabels[primaryRole] ?? primaryRole,
      roles: auth.roles,
      siteAccess: auth.siteAccess,
      mustChangePassword: Boolean(auth.mustChangePassword),
    },
    permissions: auth.permissions,
  })
})

authRouter.get('/profile', authenticate, async (_req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.uid,u.full_name fullName,u.username,u.email,u.phone,u.status,u.must_change_password mustChangePassword,
              u.last_login_at lastLoginAt,r.code roleCode,r.name roleName,
              s.code siteCode,s.name siteName
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id=u.id
       LEFT JOIN roles r ON r.id=ur.role_id AND r.is_active=1
       LEFT JOIN user_site_access usa ON usa.user_id=u.id
       LEFT JOIN sites s ON s.id=usa.site_id
       WHERE u.id=?`,
      [auth.id]
    )
    const user = rows[0]
    if (!user) throw new ApiError(404, 'Profil pengguna tidak ditemukan.')

    const roles = [
      ...new Map(
        rows
          .filter((row) => row.roleCode)
          .map((row) => [
            String(row.roleCode),
            { code: String(row.roleCode), name: String(row.roleName) },
          ])
      ).values(),
    ]
    const siteAccess = [
      ...new Map(
        rows
          .filter((row) => row.siteCode)
          .map((row) => [
            String(row.siteCode),
            { code: String(row.siteCode), name: String(row.siteName) },
          ])
      ).values(),
    ]

    res.json({
      uid: String(user.uid),
      fullName: String(user.fullName),
      username: String(user.username),
      email: user.email ? String(user.email) : null,
      phone: user.phone ? String(user.phone) : null,
      status: String(user.status),
      mustChangePassword: Boolean(user.mustChangePassword),
      lastLoginAt: user.lastLoginAt ?? null,
      roles,
      siteAccess,
    })
  } catch (error) {
    next(error)
  }
})

authRouter.patch('/profile', authenticate, async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const input = profileInput.parse(req.body)
    const auth = res.locals.auth as AuthContext
    await conn.beginTransaction()
    const [currentRows] = await conn.query<RowDataPacket[]>(
      'SELECT id,uid,full_name fullName,username,email,phone FROM users WHERE id=? FOR UPDATE',
      [auth.id]
    )
    const current = currentRows[0]
    if (!current) throw new ApiError(404, 'Profil pengguna tidak ditemukan.')

    const email = input.email || null
    const phone = input.phone || null
    const [duplicates] = await conn.query<RowDataPacket[]>(
      `SELECT
         EXISTS(SELECT 1 FROM users WHERE id<>? AND username=?) usernameTaken,
         EXISTS(SELECT 1 FROM users WHERE id<>? AND ? IS NOT NULL AND email=?) emailTaken`,
      [auth.id, input.username, auth.id, email, email]
    )
    if (duplicates[0]?.usernameTaken)
      throw new ApiError(409, 'Username sudah digunakan akun lain.')
    if (duplicates[0]?.emailTaken)
      throw new ApiError(409, 'Email sudah digunakan akun lain.')

    await conn.execute(
      `UPDATE users SET full_name=?,username=?,email=?,phone=?,updated_by=?
       WHERE id=?`,
      [input.fullName, input.username, email, phone, auth.id, auth.id]
    )
    await writeAudit(
      {
        auth,
        request: req,
        module: 'SYSTEM',
        action: 'UPDATE',
        table: 'users',
        recordId: auth.id,
        recordUid: String(current.uid),
        description: 'Pengguna memperbarui profil akunnya sendiri.',
        beforeData: {
          fullName: current.fullName,
          username: current.username,
          email: current.email,
          phone: current.phone,
        },
        afterData: { ...input, email, phone },
      },
      conn
    )
    await conn.commit()
    res.json({ updated: true })
  } catch (error) {
    await conn.rollback()
    next(
      (error as { code?: string }).code === 'ER_DUP_ENTRY'
        ? new ApiError(409, 'Username atau email sudah digunakan akun lain.')
        : error
    )
  } finally {
    conn.release()
  }
})

authRouter.patch('/profile/password', authenticate, async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const input = passwordInput.parse(req.body)
    const auth = res.locals.auth as AuthContext
    if (!auth.sessionUid) throw new ApiError(401, 'Sesi tidak valid.')
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT uid,password_hash passwordHash FROM users WHERE id=? FOR UPDATE',
      [auth.id]
    )
    const user = rows[0]
    if (!user) throw new ApiError(404, 'Profil pengguna tidak ditemukan.')
    if (
      !(await argon2.verify(String(user.passwordHash), input.currentPassword))
    )
      throw new ApiError(422, 'Kata sandi saat ini tidak sesuai.')
    if (await argon2.verify(String(user.passwordHash), input.newPassword))
      throw new ApiError(
        422,
        'Kata sandi baru harus berbeda dari kata sandi saat ini.'
      )

    const passwordHash = await argon2.hash(input.newPassword)
    await conn.execute(
      `UPDATE users SET password_hash=?,password_changed_at=NOW(3),
              must_change_password=0,updated_by=? WHERE id=?`,
      [passwordHash, auth.id, auth.id]
    )
    await conn.execute(
      `UPDATE user_sessions SET revoked_at=NOW(3),revoke_reason='PASSWORD_CHANGED'
       WHERE user_id=? AND uid<>? AND revoked_at IS NULL`,
      [auth.id, auth.sessionUid]
    )
    await writeAudit(
      {
        auth,
        request: req,
        module: 'SYSTEM',
        action: 'UPDATE',
        table: 'users',
        recordId: auth.id,
        recordUid: String(user.uid),
        description: 'Pengguna mengganti kata sandi akunnya sendiri.',
      },
      conn
    )
    await conn.commit()
    res.status(204).end()
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally {
    conn.release()
  }
})
