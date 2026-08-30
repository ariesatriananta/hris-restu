import { z } from 'zod'
import argon2 from 'argon2'
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import { authenticate, type AuthContext } from '../middleware/authenticate.js'

const nullableText = (max: number) =>
  z.string().trim().max(max).nullable().optional()
const password = z
  .string()
  .min(8)
  .max(128)
  .regex(
    /^(?=.*[A-Za-z])(?=.*\d).+$/,
    'Kata sandi wajib memiliki huruf dan angka.'
  )
const userMutation = z.object({
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
  email: z.string().trim().email().max(191).nullable().optional(),
  phone: nullableText(30),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']),
  roleUids: z.array(z.string().uuid()).min(1),
  siteUids: z.array(z.string().uuid()).default([]),
  defaultSiteUid: z.string().uuid().nullable().optional(),
})
const createUserInput = userMutation.extend({ initialPassword: password })
const resetPasswordInput = z.object({ newPassword: password })
const rolePermissionsInput = z.object({
  permissionUids: z.array(z.string().uuid()),
})
const listInput = z.object({
  search: z.string().trim().max(150).default(''),
  status: z.string().trim().max(100).default(''),
  role: z.string().trim().max(1000).optional(),
  roleUid: z.string().uuid().optional(),
  siteUid: z.string().trim().max(1000).optional(),
  site: z.string().trim().max(1000).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
})

type RefRow = RowDataPacket & {
  id: number
  uid: string
  code: string
  name: string
}
type UserRow = RowDataPacket & {
  id: number
  uid: string
  fullName: string
  username: string
  email: string | null
  phone: string | null
  status: string
  mustChangePassword: number
  failedLoginAttempts: number
  lockedUntil: Date | null
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function assertSuperAdmin(auth: AuthContext) {
  if (!auth.roles.includes('SUPER_ADMIN'))
    throw new ApiError(
      403,
      'Kelola user dan hak akses hanya dapat digunakan Super Admin.'
    )
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function csv(value?: string) {
  return unique(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

function uuidCsv(value?: string) {
  const values = csv(value)
  if (values.some((item) => !z.uuid().safeParse(item).success))
    throw new ApiError(422, 'Filter identifier belum valid.')
  return values
}

async function references(
  conn: PoolConnection,
  input: {
    roleUids: string[]
    siteUids: string[]
    defaultSiteUid?: string | null
  }
) {
  const roleUids = unique(input.roleUids),
    siteUids = unique(input.siteUids)
  const [roles] = await conn.query<RefRow[]>(
    `SELECT id,uid,code,name FROM roles WHERE uid IN (${roleUids.map(() => '?').join(',')}) AND is_active=1`,
    roleUids
  )
  if (roles.length !== roleUids.length)
    throw new ApiError(
      422,
      'Salah satu role tidak tersedia atau sudah tidak aktif.'
    )
  if (
    roles.some(
      (role) => role.code !== 'SUPER_ADMIN' && role.code !== 'DIRECTOR'
    ) &&
    !siteUids.length
  )
    throw new ApiError(
      422,
      'Pengguna dengan role non-global wajib memiliki minimal satu akses site.'
    )
  let sites: RefRow[] = []
  if (siteUids.length) {
    const [rows] = await conn.query<RefRow[]>(
      `SELECT id,uid,code,name FROM sites WHERE uid IN (${siteUids.map(() => '?').join(',')}) AND is_active=1`,
      siteUids
    )
    sites = rows
    if (sites.length !== siteUids.length)
      throw new ApiError(
        422,
        'Salah satu site tidak tersedia atau sudah tidak aktif.'
      )
  }
  if (input.defaultSiteUid && !siteUids.includes(input.defaultSiteUid))
    throw new ApiError(
      422,
      'Site utama harus termasuk dalam akses site pengguna.'
    )
  return { roles, sites, defaultSiteUid: input.defaultSiteUid ?? null }
}

async function assignments(conn: PoolConnection, userIds: number[]) {
  const result = new Map<
    number,
    {
      roles: { uid: string; code: string; name: string }[]
      sites: { uid: string; code: string; name: string; isDefault: boolean }[]
    }
  >()
  userIds.forEach((id) => result.set(id, { roles: [], sites: [] }))
  if (!userIds.length) return result
  const placeholders = userIds.map(() => '?').join(',')
  const [roleRows] = await conn.query<RowDataPacket[]>(
    `SELECT ur.user_id userId,r.uid,r.code,r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id IN (${placeholders}) ORDER BY r.name`,
    userIds
  )
  const [siteRows] = await conn.query<RowDataPacket[]>(
    `SELECT usa.user_id userId,s.uid,s.code,s.name,usa.is_default isDefault FROM user_site_access usa JOIN sites s ON s.id=usa.site_id WHERE usa.user_id IN (${placeholders}) ORDER BY usa.is_default DESC,s.name`,
    userIds
  )
  for (const row of roleRows)
    result.get(Number(row.userId))?.roles.push({
      uid: String(row.uid),
      code: String(row.code),
      name: String(row.name),
    })
  for (const row of siteRows)
    result.get(Number(row.userId))?.sites.push({
      uid: String(row.uid),
      code: String(row.code),
      name: String(row.name),
      isDefault: Boolean(row.isDefault),
    })
  return result
}

function publicUser(
  row: UserRow,
  access: Awaited<ReturnType<typeof assignments>> extends Map<number, infer T>
    ? T
    : never
) {
  return {
    uid: row.uid,
    fullName: row.fullName,
    username: row.username,
    email: row.email,
    phone: row.phone,
    status: row.status,
    mustChangePassword: Boolean(row.mustChangePassword),
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    roles: access.roles,
    siteAccess: access.sites,
  }
}

async function loadUser(conn: PoolConnection, uid: string, forUpdate = false) {
  const [rows] = await conn.query<UserRow[]>(
    `SELECT id,uid,full_name fullName,username,email,phone,status,must_change_password mustChangePassword,failed_login_attempts failedLoginAttempts,locked_until lockedUntil,last_login_at lastLoginAt,created_at createdAt,updated_at updatedAt FROM users WHERE uid=?${forUpdate ? ' FOR UPDATE' : ''}`,
    [uid]
  )
  if (!rows[0]) throw new ApiError(404, 'Pengguna tidak ditemukan.')
  return rows[0]
}

async function activeSuperCount(conn: PoolConnection, excludeUserId?: number) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id AND r.code='SUPER_ADMIN' WHERE u.status='ACTIVE' FOR UPDATE`
  )
  return excludeUserId
    ? rows.filter((row) => Number(row.id) !== excludeUserId).length
    : rows.length
}

async function replaceAccess(
  conn: PoolConnection,
  userId: number,
  refs: Awaited<ReturnType<typeof references>>,
  actorId: number
) {
  await conn.execute('DELETE FROM user_roles WHERE user_id=?', [userId])
  for (const role of refs.roles)
    await conn.execute(
      'INSERT INTO user_roles(uid,user_id,role_id,created_by,updated_by) VALUES(?,?,?,?,?)',
      [randomUUID(), userId, role.id, actorId, actorId]
    )
  await conn.execute('DELETE FROM user_site_access WHERE user_id=?', [userId])
  for (const site of refs.sites)
    await conn.execute(
      'INSERT INTO user_site_access(uid,user_id,site_id,is_default,created_by,updated_by) VALUES(?,?,?,?,?,?)',
      [
        randomUUID(),
        userId,
        site.id,
        site.uid === refs.defaultSiteUid ? 1 : 0,
        actorId,
        actorId,
      ]
    )
}

async function revokeSessions(
  conn: PoolConnection,
  userId: number,
  reason: string,
  actorId: number,
  exceptSessionUid?: string
) {
  await conn.execute(
    `UPDATE user_sessions SET revoked_at=NOW(3),revoke_reason=?,updated_by=? WHERE user_id=? AND revoked_at IS NULL${exceptSessionUid ? ' AND uid<>?' : ''}`,
    exceptSessionUid
      ? [reason, actorId, userId, exceptSessionUid]
      : [reason, actorId, userId]
  )
}

async function assertUniqueAccount(
  conn: PoolConnection,
  input: { username: string; email?: string | null },
  excludeId?: number
) {
  const params: unknown[] = [input.username]
  let exclude = ''
  if (excludeId) {
    exclude = ' AND id<>?'
    params.push(excludeId)
  }
  const [usernameRows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM users WHERE LOWER(username)=LOWER(?)${exclude} LIMIT 1`,
    params
  )
  if (usernameRows[0])
    throw new ApiError(409, 'Username sudah digunakan akun lain.')
  if (input.email) {
    const emailParams: unknown[] = [input.email]
    if (excludeId) emailParams.push(excludeId)
    const [emailRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM users WHERE LOWER(email)=LOWER(?)${exclude} LIMIT 1`,
      emailParams
    )
    if (emailRows[0])
      throw new ApiError(409, 'Email sudah digunakan akun lain.')
  }
}

export const systemUserAccessRouter = Router()
systemUserAccessRouter.use(authenticate, (_req, res, next) => {
  try {
    assertSuperAdmin(res.locals.auth as AuthContext)
    next()
  } catch (error) {
    next(error)
  }
})

systemUserAccessRouter.get('/meta', async (_req, res, next) => {
  try {
    const [roles, sites, permissions] = await Promise.all([
      pool.query<RowDataPacket[]>(
        'SELECT uid,code,name,description,is_system isSystem,is_active isActive FROM roles ORDER BY name'
      ),
      pool.query<RowDataPacket[]>(
        'SELECT uid,code,name,is_active isActive FROM sites ORDER BY name'
      ),
      pool.query<RowDataPacket[]>(
        'SELECT uid,code,module,name,description FROM permissions ORDER BY module,name'
      ),
    ])
    res.json({
      statuses: [
        { value: 'ACTIVE', label: 'Aktif' },
        { value: 'INACTIVE', label: 'Tidak aktif' },
        { value: 'LOCKED', label: 'Terkunci' },
      ],
      roles: roles[0].map((row) => ({
        ...row,
        isSystem: Boolean(row.isSystem),
        isActive: Boolean(row.isActive),
      })),
      sites: sites[0].map((row) => ({
        ...row,
        isActive: Boolean(row.isActive),
      })),
      permissions: permissions[0],
    })
  } catch (error) {
    next(error)
  }
})

systemUserAccessRouter.get('/users', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const input = listInput.parse(req.query),
      where = ['1=1'],
      params: unknown[] = []
    const statuses = csv(input.status).filter((status) => status !== 'ALL')
    if (
      statuses.some(
        (status) => !['ACTIVE', 'INACTIVE', 'LOCKED'].includes(status)
      )
    )
      throw new ApiError(422, 'Filter status pengguna belum valid.')
    const roleUids = uuidCsv(input.role ?? input.roleUid)
    const siteUids = uuidCsv(input.siteUid)
    const siteCodes = csv(input.site)
    if (input.search) {
      where.push('(u.full_name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)')
      const term = `%${input.search}%`
      params.push(term, term, term)
    }
    if (roleUids.length) {
      where.push(
        `EXISTS(SELECT 1 FROM user_roles fur JOIN roles fr ON fr.id=fur.role_id WHERE fur.user_id=u.id AND fr.uid IN (${roleUids.map(() => '?').join(',')}))`
      )
      params.push(...roleUids)
    }
    if (siteUids.length || siteCodes.length) {
      const scopes: string[] = []
      if (siteUids.length)
        scopes.push(`fs.uid IN (${siteUids.map(() => '?').join(',')})`)
      if (siteCodes.length)
        scopes.push(`fs.code IN (${siteCodes.map(() => '?').join(',')})`)
      where.push(
        `EXISTS(SELECT 1 FROM user_site_access fusa JOIN sites fs ON fs.id=fusa.site_id WHERE fusa.user_id=u.id AND (${scopes.join(' OR ')}))`
      )
      params.push(...siteUids, ...siteCodes)
    }
    const summaryClause = where.join(' AND ')
    const [summaryRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) total,SUM(u.status='ACTIVE') active,SUM(u.status='INACTIVE') inactive,SUM(u.status='LOCKED') locked FROM users u WHERE ${summaryClause}`,
      [...params]
    )
    if (statuses.length) {
      where.push(`u.status IN (${statuses.map(() => '?').join(',')})`)
      params.push(...statuses)
    }
    const clause = where.join(' AND ')
    const [countRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) total FROM users u WHERE ${clause}`,
      params
    )
    const [rows] = await conn.query<UserRow[]>(
      `SELECT id,uid,full_name fullName,username,email,phone,status,must_change_password mustChangePassword,failed_login_attempts failedLoginAttempts,locked_until lockedUntil,last_login_at lastLoginAt,created_at createdAt,updated_at updatedAt FROM users u WHERE ${clause} ORDER BY u.created_at DESC,u.id DESC LIMIT ? OFFSET ?`,
      [...params, input.pageSize, (input.page - 1) * input.pageSize]
    )
    const access = await assignments(
      conn,
      rows.map((row) => row.id)
    )
    res.json({
      data: rows.map((row) => publicUser(row, access.get(row.id)!)),
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        total: Number(countRows[0]?.total ?? 0),
        summary: {
          total: Number(summaryRows[0]?.total ?? 0),
          active: Number(summaryRows[0]?.active ?? 0),
          inactive: Number(summaryRows[0]?.inactive ?? 0),
          locked: Number(summaryRows[0]?.locked ?? 0),
        },
      },
    })
  } catch (error) {
    next(error)
  } finally {
    conn.release()
  }
})

systemUserAccessRouter.get('/users/:uid', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const user = await loadUser(conn, req.params.uid)
    const access = await assignments(conn, [user.id])
    res.json(publicUser(user, access.get(user.id)!))
  } catch (error) {
    next(error)
  } finally {
    conn.release()
  }
})

systemUserAccessRouter.post('/users', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const input = createUserInput.parse(req.body),
      auth = res.locals.auth as AuthContext
    const passwordHash = await argon2.hash(input.initialPassword)
    await conn.beginTransaction()
    const refs = await references(conn, input)
    await assertUniqueAccount(conn, input)
    const uid = randomUUID()
    const [result] = await conn.execute<ResultSetHeader>(
      'INSERT INTO users(uid,username,email,password_hash,full_name,phone,status,must_change_password,password_changed_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,1,NOW(3),?,?)',
      [
        uid,
        input.username,
        input.email || null,
        passwordHash,
        input.fullName,
        input.phone || null,
        input.status,
        auth.id,
        auth.id,
      ]
    )
    await replaceAccess(conn, result.insertId, refs, auth.id)
    await writeAudit(
      {
        auth,
        request: req,
        module: 'SYSTEM',
        action: 'CREATE',
        table: 'users',
        recordId: result.insertId,
        recordUid: uid,
        description: 'Super Admin membuat akun pengguna.',
        afterData: {
          fullName: input.fullName,
          username: input.username,
          email: input.email || null,
          phone: input.phone || null,
          status: input.status,
          roleUids: unique(input.roleUids),
          siteUids: unique(input.siteUids),
          defaultSiteUid: input.defaultSiteUid ?? null,
          mustChangePassword: true,
        },
      },
      conn
    )
    await conn.commit()
    res.status(201).json({ uid })
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

systemUserAccessRouter.patch('/users/:uid', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const input = userMutation.parse(req.body),
      auth = res.locals.auth as AuthContext
    await conn.beginTransaction()
    const current = await loadUser(conn, req.params.uid, true),
      oldAccess = (await assignments(conn, [current.id])).get(current.id)!
    const refs = await references(conn, input),
      nextRoleCodes = refs.roles.map((role) => role.code)
    await assertUniqueAccount(conn, input, current.id)
    const wasSuper = oldAccess.roles.some(
        (role) => role.code === 'SUPER_ADMIN'
      ),
      remainsActiveSuper =
        input.status === 'ACTIVE' && nextRoleCodes.includes('SUPER_ADMIN')
    if (current.id === auth.id && input.status !== 'ACTIVE')
      throw new ApiError(
        422,
        'Akun yang sedang digunakan tidak dapat dinonaktifkan atau dikunci.'
      )
    if (
      current.id === auth.id &&
      wasSuper &&
      !nextRoleCodes.includes('SUPER_ADMIN')
    )
      throw new ApiError(
        422,
        'Role Super Admin tidak dapat dilepas dari akun yang sedang digunakan.'
      )
    if (
      wasSuper &&
      current.status === 'ACTIVE' &&
      !remainsActiveSuper &&
      (await activeSuperCount(conn, current.id)) < 1
    )
      throw new ApiError(
        422,
        'Perubahan ditolak karena sistem harus memiliki minimal satu Super Admin aktif.'
      )
    await conn.execute(
      "UPDATE users SET full_name=?,username=?,email=?,phone=?,status=?,failed_login_attempts=CASE WHEN ?='ACTIVE' THEN 0 ELSE failed_login_attempts END,locked_until=CASE WHEN ?='ACTIVE' THEN NULL ELSE locked_until END,updated_by=? WHERE id=?",
      [
        input.fullName,
        input.username,
        input.email || null,
        input.phone || null,
        input.status,
        input.status,
        input.status,
        auth.id,
        current.id,
      ]
    )
    await replaceAccess(conn, current.id, refs, auth.id)
    const oldRoleUids = oldAccess.roles.map((role) => role.uid).sort(),
      oldSiteUids = oldAccess.sites.map((site) => site.uid).sort()
    const accessChanged =
      input.status !== current.status ||
      JSON.stringify(unique(input.roleUids).sort()) !==
        JSON.stringify(oldRoleUids) ||
      JSON.stringify(unique(input.siteUids).sort()) !==
        JSON.stringify(oldSiteUids) ||
      (oldAccess.sites.find((site) => site.isDefault)?.uid ?? null) !==
        (input.defaultSiteUid ?? null)
    if (accessChanged)
      await revokeSessions(
        conn,
        current.id,
        'ACCESS_UPDATED',
        auth.id,
        current.id === auth.id ? auth.sessionUid : undefined
      )
    await writeAudit(
      {
        auth,
        request: req,
        module: 'SYSTEM',
        action: 'UPDATE',
        table: 'users',
        recordId: current.id,
        recordUid: current.uid,
        description: 'Super Admin memperbarui akun dan hak akses pengguna.',
        beforeData: {
          fullName: current.fullName,
          username: current.username,
          email: current.email,
          phone: current.phone,
          status: current.status,
          roleUids: oldRoleUids,
          siteUids: oldSiteUids,
        },
        afterData: {
          fullName: input.fullName,
          username: input.username,
          email: input.email || null,
          phone: input.phone || null,
          status: input.status,
          roleUids: unique(input.roleUids),
          siteUids: unique(input.siteUids),
          defaultSiteUid: input.defaultSiteUid ?? null,
        },
      },
      conn
    )
    await conn.commit()
    res.json({ updated: true, sessionsRevoked: accessChanged })
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

systemUserAccessRouter.post(
  '/users/:uid/reset-password',
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = resetPasswordInput.parse(req.body),
        auth = res.locals.auth as AuthContext,
        hash = await argon2.hash(input.newPassword)
      await conn.beginTransaction()
      const user = await loadUser(conn, req.params.uid, true)
      if (user.id === auth.id)
        throw new ApiError(
          422,
          'Gunakan menu Profil Saya untuk mengganti kata sandi akun yang sedang digunakan.'
        )
      await conn.execute(
        'UPDATE users SET password_hash=?,must_change_password=1,password_changed_at=NOW(3),failed_login_attempts=0,locked_until=NULL,updated_by=? WHERE id=?',
        [hash, auth.id, user.id]
      )
      await revokeSessions(conn, user.id, 'PASSWORD_RESET_BY_ADMIN', auth.id)
      await writeAudit(
        {
          auth,
          request: req,
          module: 'SYSTEM',
          action: 'UPDATE',
          table: 'users',
          recordId: user.id,
          recordUid: user.uid,
          description:
            'Super Admin mereset kata sandi pengguna. Pengguna wajib mengganti kata sandi saat login berikutnya.',
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
  }
)

systemUserAccessRouter.get('/roles', async (_req, res, next) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT r.uid,r.code,r.name,r.description,r.is_system isSystem,r.is_active isActive,COUNT(DISTINCT ur.user_id) userCount,CASE WHEN r.code='SUPER_ADMIN' THEN (SELECT COUNT(*) FROM permissions) ELSE COUNT(DISTINCT rp.permission_id) END permissionCount FROM roles r LEFT JOIN user_roles ur ON ur.role_id=r.id LEFT JOIN role_permissions rp ON rp.role_id=r.id GROUP BY r.id ORDER BY r.name`
    )
    res.json(
      rows.map((row) => ({
        ...row,
        isSystem: Boolean(row.isSystem),
        isActive: Boolean(row.isActive),
        permissionsImmutable: row.code === 'SUPER_ADMIN',
      }))
    )
  } catch (error) {
    next(error)
  }
})

systemUserAccessRouter.get('/roles/:uid', async (req, res, next) => {
  try {
    const [roles] = await pool.query<RowDataPacket[]>(
      'SELECT r.id,r.uid,r.code,r.name,r.description,r.is_system isSystem,r.is_active isActive,(SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id=r.id) userCount FROM roles r WHERE r.uid=?',
      [req.params.uid]
    )
    const role = roles[0]
    if (!role) throw new ApiError(404, 'Role tidak ditemukan.')
    const [permissions] = await pool.query<RowDataPacket[]>(
      role.code === 'SUPER_ADMIN'
        ? 'SELECT uid,code,module,name,description FROM permissions ORDER BY module,name'
        : 'SELECT p.uid,p.code,p.module,p.name,p.description FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=? ORDER BY p.module,p.name',
      role.code === 'SUPER_ADMIN' ? [] : [role.id]
    )
    res.json({
      uid: role.uid,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: Boolean(role.isSystem),
      isActive: Boolean(role.isActive),
      permissionsImmutable: role.code === 'SUPER_ADMIN',
      userCount: Number(role.userCount ?? 0),
      permissionCount: permissions.length,
      permissions,
    })
  } catch (error) {
    next(error)
  }
})

systemUserAccessRouter.patch('/roles/:uid', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const input = rolePermissionsInput.parse(req.body),
      auth = res.locals.auth as AuthContext
    await conn.beginTransaction()
    const [roles] = await conn.query<RowDataPacket[]>(
      'SELECT id,uid,code,name,is_system isSystem FROM roles WHERE uid=? FOR UPDATE',
      [req.params.uid]
    )
    const role = roles[0]
    if (!role) throw new ApiError(404, 'Role tidak ditemukan.')
    if (!role.isSystem)
      throw new ApiError(422, 'Hak akses hanya dapat diatur untuk role sistem.')
    if (role.code === 'SUPER_ADMIN')
      throw new ApiError(
        422,
        'Hak akses Super Admin selalu penuh dan tidak dapat diubah.'
      )
    const permissionUids = unique(input.permissionUids)
    let permissions: RowDataPacket[] = []
    if (permissionUids.length) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id,uid,code FROM permissions WHERE uid IN (${permissionUids.map(() => '?').join(',')})`,
        permissionUids
      )
      permissions = rows
      if (rows.length !== permissionUids.length)
        throw new ApiError(422, 'Salah satu izin tidak ditemukan.')
    }
    const [oldRows] = await conn.query<RowDataPacket[]>(
      'SELECT p.uid,p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?',
      [role.id]
    )
    await conn.execute('DELETE FROM role_permissions WHERE role_id=?', [
      role.id,
    ])
    for (const permission of permissions)
      await conn.execute(
        'INSERT INTO role_permissions(uid,role_id,permission_id,created_by,updated_by) VALUES(?,?,?,?,?)',
        [randomUUID(), role.id, permission.id, auth.id, auth.id]
      )
    await conn.execute(
      `UPDATE user_sessions us JOIN user_roles ur ON ur.user_id=us.user_id SET us.revoked_at=NOW(3),us.revoke_reason='ROLE_PERMISSIONS_UPDATED',us.updated_by=? WHERE ur.role_id=? AND us.revoked_at IS NULL${auth.sessionUid ? ' AND us.uid<>?' : ''}`,
      auth.sessionUid ? [auth.id, role.id, auth.sessionUid] : [auth.id, role.id]
    )
    await writeAudit(
      {
        auth,
        request: req,
        module: 'SYSTEM',
        action: 'UPDATE',
        table: 'roles',
        recordId: Number(role.id),
        recordUid: String(role.uid),
        description: `Super Admin memperbarui hak akses role ${String(role.name)}.`,
        beforeData: { permissionUids: oldRows.map((row) => String(row.uid)) },
        afterData: { permissionUids },
      },
      conn
    )
    await conn.commit()
    res.json({ updated: true })
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally {
    conn.release()
  }
})
