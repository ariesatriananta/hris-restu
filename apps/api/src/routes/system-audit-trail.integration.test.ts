import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { systemAuditTrailRouter } from './system-audit-trail.js'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  requirePermission:
    (permission: string) =>
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const auth = res.locals.auth as AuthContext
      if (
        !auth.roles.includes('SUPER_ADMIN') &&
        !auth.permissions.includes(permission)
      )
        return res.status(403).json({ message: 'Izin ditolak.' })
      next()
    },
}))
const admin: AuthContext = {
  id: 1,
  uid: 'admin',
  name: 'Admin',
  email: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
  siteAccess: [],
}
async function request(path: string, auth: AuthContext = admin) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.auth = auth
    next()
  })
  app.use('/api/system/audit-trail', systemAuditTrailRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    return await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/system/audit-trail${path}`
    )
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Audit Trail API', () => {
  beforeEach(() => mocks.query.mockReset())

  it('menolak pengguna tanpa izin audit.view', async () => {
    const response = await request('/entries', {
      ...admin,
      roles: ['HR_OFFICER'],
      permissions: [],
      siteAccess: ['JEPARA'],
    })
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('membatasi non-Super Admin ke site akses dan mengurutkan terbaru', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
    const response = await request('/entries?page=1', {
      ...admin,
      roles: ['HR_OFFICER'],
      permissions: ['audit.view'],
      siteAccess: ['JEPARA'],
    })
    expect(response.status).toBe(200)
    expect(mocks.query.mock.calls[0][0]).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0][1]).toEqual(['JEPARA'])
    expect(mocks.query.mock.calls[1][0]).toContain(
      'ORDER BY al.occurred_at DESC,al.id DESC'
    )
    expect(mocks.query.mock.calls[1][1]).toEqual(['JEPARA', 50, 0])
  })

  it('menyamarkan data rahasia secara rekursif pada detail', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          uid: '00000000-0000-4000-8000-000000000001',
          module: 'SYSTEM',
          action: 'UPDATE',
          tableName: 'users',
          recordUid: '00000000-0000-4000-8000-000000000002',
          description: 'Update akun',
          reason: null,
          occurredAt: '2026-08-30T12:00:00+07:00',
          userUid: 'actor',
          userName: 'Admin',
          username: 'admin',
          siteUid: null,
          siteCode: null,
          siteName: null,
          requestId: 'req',
          ipAddress: '127.0.0.1',
          userAgent: 'Browser',
          beforeData: JSON.stringify({
            username: 'user',
            passwordHash: 'secret',
            nested: { refresh_token: 'token', safe: 'ok' },
          }),
          afterData: { cookie: 'abc', status: 'ACTIVE' },
        },
      ],
    ])
    const response = await request(
      '/entries/00000000-0000-4000-8000-000000000001'
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      beforeData: Record<string, unknown>
      afterData: Record<string, unknown>
    }
    expect(body.beforeData).toEqual({
      username: 'user',
      passwordHash: '[DISEMBUNYIKAN]',
      nested: { refresh_token: '[DISEMBUNYIKAN]', safe: 'ok' },
    })
    expect(body.afterData).toEqual({
      cookie: '[DISEMBUNYIKAN]',
      status: 'ACTIVE',
    })
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('recordId')
  })
})
