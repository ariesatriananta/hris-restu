import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  auth: {
    id: 7, uid: 'hr-user', name: 'HR', email: null,
    roles: ['HR_OFFICER'], permissions: ['employees.view'], siteAccess: ['JEPARA'],
  } as AuthContext,
}))
vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))
vi.mock('../config.js', () => ({ env: { R2_PUBLIC_BASE_URL: 'https://files.example.test' } }))
vi.mock('../lib/audit.js', () => ({ writeAudit: vi.fn() }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.locals.auth = mocks.auth
    next()
  },
  requirePermission: (permission: string) => (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!mocks.auth.roles.includes('SUPER_ADMIN') && !mocks.auth.permissions.includes(permission)) {
      res.status(403).json({ message: 'Izin ditolak.' })
      return
    }
    next()
  },
}))
import { employeesRouter } from './employees.js'

async function request(query: string) {
  const app = express()
  app.use('/api/employees', employeesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    return await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/employees?${query}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

describe('Employee list production filters', () => {
  beforeEach(() => {
    mocks.query.mockReset()
    mocks.auth.roles = ['HR_OFFICER']
    mocks.auth.permissions = ['employees.view']
    mocks.auth.siteAccess = ['JEPARA']
  })

  it('menerapkan UID modul/bagian yang sama ke count dan daftar beserta scope site', async () => {
    mocks.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]])
    const response = await request('site=JEPARA&productionModule=module-a,module-b&productionSection=section-a&page=2&pageSize=50')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ items: [], total: 0, page: 2, pageSize: 50 })
    for (const [sql] of mocks.query.mock.calls) {
      expect(sql).toContain('pm.uid IN (?,?)')
      expect(sql).toContain('ps.uid IN (?)')
      expect(sql).toContain('LEFT JOIN production_module_sections')
      expect(sql).toContain('LEFT JOIN production_modules')
      expect(sql).toContain('LEFT JOIN production_sections')
      expect(sql).toContain('s.code IN (?)')
    }
    expect(mocks.query.mock.calls[0][1]).toEqual(['JEPARA', 'module-a', 'module-b', 'section-a', 'JEPARA'])
    expect(mocks.query.mock.calls[1][1]).toEqual(['JEPARA', 'module-a', 'module-b', 'section-a', 'JEPARA', 50, 50])
  })

  it('filter modul site lain tetap dibatasi site access server', async () => {
    mocks.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]])
    expect((await request('site=KLATEN&productionModule=module-klaten')).status).toBe(200)
    expect(mocks.query.mock.calls[0][1]).toEqual(['KLATEN', 'module-klaten', 'JEPARA'])
  })

  it('tanpa filter tetap memakai LEFT JOIN agar penempatan kosong tidak hilang', async () => {
    mocks.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]])
    expect((await request('')).status).toBe(200)
    expect(mocks.query.mock.calls[0][0]).not.toContain('pm.uid IN')
    expect(mocks.query.mock.calls[0][1]).toEqual(['JEPARA'])
  })

  it('menolak akun tanpa permission sebelum membaca data', async () => {
    mocks.auth.permissions = []
    expect((await request('productionModule=module-a')).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
