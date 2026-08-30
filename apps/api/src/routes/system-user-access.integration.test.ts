import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { systemUserAccessRouter } from './system-user-access.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connectionQuery: vi.fn(),
  execute: vi.fn(),
  begin: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    getConnection: vi.fn(async () => ({
      query: mocks.connectionQuery,
      execute: mocks.execute,
      beginTransaction: mocks.begin,
      commit: mocks.commit,
      rollback: mocks.rollback,
      release: mocks.release,
    })),
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}))

const superAdmin: AuthContext = {
  id: 1,
  uid: 'admin',
  name: 'Admin',
  email: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
  siteAccess: [],
  sessionUid: 'current-session',
}

async function request(
  path: string,
  options: RequestInit = {},
  auth: AuthContext = superAdmin
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth
    next()
  })
  app.use('/api/system/access-management', systemUserAccessRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(
      `http://127.0.0.1:${port}/api/system/access-management${path}`,
      {
        ...options,
        headers: { 'content-type': 'application/json', ...options.headers },
      }
    )
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Kelola User dan Hak Akses API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.begin.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined)
    mocks.release.mockReturnValue(undefined)
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }])
    mocks.audit.mockResolvedValue(undefined)
  })

  it('menolak semua endpoint untuk pengguna non-Super Admin', async () => {
    const response = await request(
      '/users',
      {},
      { ...superAdmin, roles: ['HR_OFFICER'] }
    )
    expect(response.status).toBe(403)
    expect(mocks.connectionQuery).not.toHaveBeenCalled()
  })

  it('mendukung filter faceted, kode site, dan pagination dari tautan kesiapan', async () => {
    const roleUid = '00000000-0000-4000-8000-000000000001'
    mocks.connectionQuery
      .mockResolvedValueOnce([
        [{ total: 1, active: 1, inactive: 0, locked: 0 }],
      ])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            uid: 'user-uid',
            fullName: 'User',
            username: 'user',
            email: null,
            phone: null,
            status: 'ACTIVE',
            mustChangePassword: 0,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            userId: 9,
            uid: 'role-uid',
            code: 'HR_OFFICER',
            name: 'HR Officer',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            userId: 9,
            uid: 'site-uid',
            code: 'JEPARA',
            name: 'Jepara',
            isDefault: 1,
          },
        ],
      ])
    const response = await request(
      `/users?site=JEPARA&role=${roleUid}&status=ACTIVE,LOCKED&page=2&pageSize=10`
    )
    expect(response.status).toBe(200)
    expect(mocks.connectionQuery.mock.calls[0][0]).toContain('fs.code IN (?)')
    expect(mocks.connectionQuery.mock.calls[0][0]).toContain('fr.uid IN (?)')
    expect(mocks.connectionQuery.mock.calls[0][1]).toEqual([roleUid, 'JEPARA'])
    expect(mocks.connectionQuery.mock.calls[1][0]).toContain(
      'u.status IN (?,?)'
    )
    expect(mocks.connectionQuery.mock.calls[1][1]).toEqual([
      roleUid,
      'JEPARA',
      'ACTIVE',
      'LOCKED',
    ])
    expect(((await response.json()) as { meta: unknown }).meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 1,
      summary: { total: 1, active: 1, inactive: 0, locked: 0 },
    })
  })

  it('tidak mengizinkan Super Admin menonaktifkan akun sendiri', async () => {
    mocks.connectionQuery
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            uid: 'admin',
            fullName: 'Admin',
            username: 'admin',
            email: null,
            phone: null,
            status: 'ACTIVE',
            mustChangePassword: 0,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            userId: 1,
            uid: 'role-uid',
            code: 'SUPER_ADMIN',
            name: 'Super Admin',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [{ id: 2, uid: 'role-uid', code: 'SUPER_ADMIN', name: 'Super Admin' }],
      ])
      .mockResolvedValueOnce([[]])
    const response = await request('/users/admin', {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: 'Admin',
        username: 'admin',
        email: null,
        phone: null,
        status: 'INACTIVE',
        roleUids: ['00000000-0000-4000-8000-000000000001'],
        siteUids: [],
      }),
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'sedang digunakan'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })

  it('menolak pengosongan site untuk role non-global', async () => {
    mocks.connectionQuery
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            uid: 'user-uid',
            fullName: 'User',
            username: 'user',
            email: null,
            phone: null,
            status: 'ACTIVE',
            mustChangePassword: 0,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            userId: 9,
            uid: 'old-role',
            code: 'HR_OFFICER',
            name: 'HR Officer',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            id: 3,
            uid: '00000000-0000-4000-8000-000000000003',
            code: 'HR_OFFICER',
            name: 'HR Officer',
          },
        ],
      ])
    const response = await request('/users/user-uid', {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: 'User',
        username: 'user',
        email: null,
        phone: null,
        status: 'ACTIVE',
        roleUids: ['00000000-0000-4000-8000-000000000003'],
        siteUids: [],
      }),
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'minimal satu akses site'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('tetap mewajibkan site untuk kombinasi role global dan non-global', async () => {
    mocks.connectionQuery
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            uid: 'user-uid',
            fullName: 'User',
            username: 'user',
            email: null,
            phone: null,
            status: 'ACTIVE',
            mustChangePassword: 0,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ userId: 9, uid: 'old-role', code: 'DIRECTOR', name: 'Director' }],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            id: 3,
            uid: '00000000-0000-4000-8000-000000000003',
            code: 'DIRECTOR',
            name: 'Director',
          },
          {
            id: 4,
            uid: '00000000-0000-4000-8000-000000000004',
            code: 'HR_OFFICER',
            name: 'HR Officer',
          },
        ],
      ])
    const response = await request('/users/user-uid', {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: 'User',
        username: 'user',
        email: null,
        phone: null,
        status: 'ACTIVE',
        roleUids: [
          '00000000-0000-4000-8000-000000000003',
          '00000000-0000-4000-8000-000000000004',
        ],
        siteUids: [],
      }),
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'minimal satu akses site'
    )
  })

  it('menjaga hak Super Admin selalu penuh dan tidak dapat diedit', async () => {
    mocks.connectionQuery.mockResolvedValueOnce([
      [
        {
          id: 2,
          uid: 'role',
          code: 'SUPER_ADMIN',
          name: 'Super Admin',
          isSystem: 1,
        },
      ],
    ])
    const response = await request('/roles/role', {
      method: 'PATCH',
      body: JSON.stringify({ permissionUids: [] }),
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'selalu penuh'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('reset password mencabut sesi dan audit tidak menyimpan password', async () => {
    mocks.connectionQuery.mockResolvedValueOnce([
      [
        {
          id: 9,
          uid: 'user-uid',
          fullName: 'User',
          username: 'user',
          email: null,
          phone: null,
          status: 'ACTIVE',
          mustChangePassword: 0,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ])
    const response = await request('/users/user-uid/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'Password123' }),
    })
    expect(response.status).toBe(204)
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(String(mocks.execute.mock.calls[1][0])).toContain('user_sessions')
    const auditInput = mocks.audit.mock.calls[0][0]
    expect(
      JSON.stringify({
        description: auditInput.description,
        beforeData: auditInput.beforeData,
        afterData: auditInput.afterData,
      })
    ).not.toContain('Password123')
    expect(auditInput.beforeData).toBeUndefined()
    expect(auditInput.afterData).toBeUndefined()
  })

  it('mengarahkan reset password akun sendiri melalui Profil Saya', async () => {
    mocks.connectionQuery.mockResolvedValueOnce([
      [
        {
          id: 1,
          uid: 'admin',
          fullName: 'Admin',
          username: 'admin',
          email: null,
          phone: null,
          status: 'ACTIVE',
          mustChangePassword: 0,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ])
    const response = await request('/users/admin/reset-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'Password123' }),
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'Profil Saya'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('tetap mempertahankan sesi aktif saat akses site akun sendiri berubah', async () => {
    mocks.connectionQuery
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            uid: 'admin',
            fullName: 'Admin',
            username: 'admin',
            email: null,
            phone: null,
            status: 'ACTIVE',
            mustChangePassword: 0,
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            userId: 1,
            uid: '00000000-0000-4000-8000-000000000001',
            code: 'SUPER_ADMIN',
            name: 'Super Admin',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            id: 2,
            uid: '00000000-0000-4000-8000-000000000001',
            code: 'SUPER_ADMIN',
            name: 'Super Admin',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 3,
            uid: '00000000-0000-4000-8000-000000000002',
            code: 'JEPARA',
            name: 'Jepara',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
    const response = await request('/users/admin', {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: 'Admin',
        username: 'admin',
        email: null,
        phone: null,
        status: 'ACTIVE',
        roleUids: ['00000000-0000-4000-8000-000000000001'],
        siteUids: ['00000000-0000-4000-8000-000000000002'],
        defaultSiteUid: '00000000-0000-4000-8000-000000000002',
      }),
    })
    expect(response.status).toBe(200)
    const revokeCall = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes('user_sessions')
    )
    expect(revokeCall?.[0]).toContain('uid<>?')
    expect(revokeCall?.[1]).toEqual(['ACCESS_UPDATED', 1, 1, 'current-session'])
  })
})
