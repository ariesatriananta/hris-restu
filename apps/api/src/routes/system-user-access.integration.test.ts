import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { systemUserAccessRouter } from './system-user-access.js'

const mocks = vi.hoisted(() => ({
  moduleQuery: vi.fn(),
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
      query: (sql: string, params: unknown[]) =>
        sql.includes('user_production_module_access')
          ? mocks.moduleQuery(sql, params)
          : mocks.connectionQuery(sql, params),
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
    mocks.moduleQuery.mockResolvedValue([[]])
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
  const qcRoleUid = '00000000-0000-4000-8000-000000000011'
  const qcSiteUid = '00000000-0000-4000-8000-000000000012'
  const qcModuleUid = '00000000-0000-4000-8000-000000000013'
  const qcPayload = {
    fullName: 'QC Test',
    username: 'qc.test',
    status: 'ACTIVE',
    initialPassword: 'test12345',
    roleUids: [qcRoleUid],
    siteUids: [qcSiteUid],
    productionModuleUids: [qcModuleUid],
  }
  function qcReferences(
    modules: unknown[] = [
      {
        id: 5,
        uid: qcModuleUid,
        siteUid: qcSiteUid,
        code: 'M1',
        name: 'Module 1',
      },
    ]
  ) {
    mocks.connectionQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM roles WHERE'))
        return [[{ id: 3, uid: qcRoleUid, code: 'QC', name: 'QC' }]]
      if (sql.includes('FROM sites WHERE'))
        return [[{ id: 4, uid: qcSiteUid, code: 'KLATEN', name: 'Klaten' }]]
      if (sql.includes('FROM production_modules pm')) return [modules]
      return [[]]
    })
  }
  it('saves QC module grants atomically with user/site grants and audits public identifiers', async () => {
    qcReferences()
    mocks.execute.mockResolvedValue([{ affectedRows: 1, insertId: 9 }])
    const response = await request('/users', {
      method: 'POST',
      body: JSON.stringify(qcPayload),
    })
    expect(response.status).toBe(201)
    expect(
      mocks.execute.mock.calls.some(
        (call) =>
          String(call[0]).includes(
            'INSERT INTO user_production_module_access'
          ) &&
          call[1][1] === 9 &&
          call[1][2] === 5
      )
    ).toBe(true)
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.audit.mock.calls[0][0].afterData.productionModuleUids).toEqual(
      [qcModuleUid]
    )
  })
  it.each([
    ['empty modules', [], []],
    ['inactive/missing module', [qcModuleUid], []],
    [
      'module outside selected site',
      [qcModuleUid],
      [{ id: 5, uid: qcModuleUid, siteUid: 'other' }],
    ],
  ])(
    'rejects QC %s before saving any user data',
    async (_name, moduleUids, modules) => {
      qcReferences(modules)
      const response = await request('/users', {
        method: 'POST',
        body: JSON.stringify({
          ...qcPayload,
          productionModuleUids: moduleUids,
        }),
      })
      expect(response.status).toBe(422)
      expect(mocks.execute).not.toHaveBeenCalled()
      expect(mocks.rollback).toHaveBeenCalledOnce()
    }
  )
  it('rejects mixed QC and other roles', async () => {
    qcReferences()
    mocks.connectionQuery.mockResolvedValueOnce([
      [
        { id: 3, uid: qcRoleUid, code: 'QC' },
        { id: 4, uid: qcModuleUid, code: 'HR_OFFICER' },
      ],
    ])
    const response = await request('/users', {
      method: 'POST',
      body: JSON.stringify({
        ...qcPayload,
        roleUids: [qcRoleUid, qcModuleUid],
      }),
    })
    expect(response.status).toBe(422)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('keeps QC permissions immutable', async () => {
    mocks.connectionQuery.mockResolvedValueOnce([
      [{ id: 3, uid: qcRoleUid, code: 'QC', isSystem: 1 }],
    ])
    const response = await request(`/roles/${qcRoleUid}`, {
      method: 'PATCH',
      body: JSON.stringify({ permissionUids: [] }),
    })
    expect(response.status).toBe(422)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('requires at least one active module for EACH selected site', async () => {
    const secondSite = '00000000-0000-4000-8000-000000000014'
    mocks.connectionQuery
      .mockResolvedValueOnce([[{ id: 3, uid: qcRoleUid, code: 'QC' }]])
      .mockResolvedValueOnce([
        [
          { id: 4, uid: qcSiteUid },
          { id: 6, uid: secondSite },
        ],
      ])
      .mockResolvedValueOnce([
        [{ id: 5, uid: qcModuleUid, siteUid: qcSiteUid }],
      ])
    const response = await request('/users', {
      method: 'POST',
      body: JSON.stringify({ ...qcPayload, siteUids: [qcSiteUid, secondSite] }),
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'setiap site'
    )
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('revokes sessions when ONLY module access changes and returns existing module grants', async () => {
    const oldModule = '00000000-0000-4000-8000-000000000015'
    mocks.moduleQuery.mockResolvedValue([
      [
        {
          userId: 9,
          uid: oldModule,
          code: 'OLD',
          name: 'Old',
          siteUid: qcSiteUid,
          siteCode: 'KLATEN',
          isActive: 1,
        },
      ],
    ])
    mocks.connectionQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM users WHERE uid='))
        return [
          [
            {
              id: 9,
              uid: 'qc-user',
              fullName: 'QC Test',
              username: 'qc.test',
              status: 'ACTIVE',
            },
          ],
        ]
      if (sql.includes('FROM user_roles ur'))
        return [[{ userId: 9, uid: qcRoleUid, code: 'QC', name: 'QC' }]]
      if (sql.includes('FROM user_site_access usa'))
        return [
          [
            {
              userId: 9,
              uid: qcSiteUid,
              code: 'KLATEN',
              name: 'Klaten',
              isDefault: 0,
            },
          ],
        ]
      if (sql.includes('FROM roles WHERE'))
        return [[{ id: 3, uid: qcRoleUid, code: 'QC' }]]
      if (sql.includes('FROM sites WHERE')) return [[{ id: 4, uid: qcSiteUid }]]
      if (sql.includes('FROM production_modules pm'))
        return [[{ id: 5, uid: qcModuleUid, siteUid: qcSiteUid }]]
      return [[]]
    })
    const read = await request('/users/qc-user')
    expect(
      ((await read.json()) as { productionModuleAccess: { uid: string }[] })
        .productionModuleAccess[0].uid
    ).toBe(oldModule)
    const response = await request('/users/qc-user', {
      method: 'PATCH',
      body: JSON.stringify(qcPayload),
    })
    expect(response.status).toBe(200)
    expect(
      ((await response.json()) as { sessionsRevoked: boolean }).sessionsRevoked
    ).toBe(true)
    expect(
      mocks.execute.mock.calls.some((call) =>
        String(call[0]).includes('UPDATE user_sessions')
      )
    ).toBe(true)
    expect(
      mocks.audit.mock.calls[0][0].beforeData.productionModuleUids
    ).toEqual([oldModule])
  })
})
