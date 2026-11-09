import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { productionFoundationRouter } from './production-foundation.js'
import { productionStructureRouter } from './production-structure.js'
import { productionQcRouter } from './production-qc.js'
import { productionRecapsRouter } from './production-recaps.js'
import { dashboardRouter } from './dashboard.js'

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), getConnection: vi.fn() }))
vi.mock('../db.js', () => ({ pool: mocks }))
vi.mock('../lib/audit.js', () => ({ writeAudit: vi.fn() }))
vi.mock('../config.js', () => ({ env: { ATTENDANCE_GO_LIVE_DATE: '2026-08-31' } }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requirePermission: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))
const moduleUid = '11111111-1111-4111-8111-111111111111'
const context = (overrides: Partial<AuthContext> = {}): AuthContext => ({
  id: 7, uid: 'qc-user', name: 'QC', email: null, roles: ['QC'],
  permissions: ['production.view', 'production.scan', 'production.correct'],
  siteAccess: ['KLATEN'], productionModuleAccess: [moduleUid], ...overrides,
})

async function request(path: string, auth = context(), method = 'GET') {
  const app = express()
  app.use((_req, res, next) => { res.locals.auth = auth; next() })
  // Keep the real application's mount order: the scanner options must pass the first two routers.
  app.use('/api/production-structure', productionFoundationRouter)
  app.use('/api/production-structure', productionStructureRouter)
  app.use('/api/production-structure', productionQcRouter)
  app.use('/api/production', productionRecapsRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  try {
    const result = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, { method })
    return { status: result.status, body: await result.json() as { data: { capabilities: { production: boolean }; kpis: { productionTransactions: number | null }; sites: Array<{ productionTransactions: number | null }> } } }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

beforeEach(() => { vi.clearAllMocks(); mocks.query.mockReset().mockResolvedValue([[]]) })

describe('QC adjacent endpoint isolation', () => {
  it.each([
    '/api/production-structure/work-units',
    '/api/production-structure/rates',
    '/api/production-structure/assignments',
    '/api/production-structure/assignment-readiness',
    '/api/production-structure/readiness',
    '/api/production-structure/modules',
    '/api/production-structure/module-sections',
    '/api/production-structure/sections',
    '/api/production-structure/positions',
    '/api/production-structure/departments',
    '/api/production-structure/brands',
    '/api/production-structure/defects',
    '/api/production/recaps',
    '/api/production/recaps/matrix',
    `/api/production/recaps/employees/${moduleUid}`,
    `/api/production/recaps/jobs/${moduleUid}`,
  ])('denies %s before any database operation even if permission middleware permits it', async path => {
    expect((await request(path)).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })

  it.each([
    '/api/production-structure/brands',
    '/api/production-structure/jobs',
    '/api/production-structure/eligible-employees',
    '/api/production-structure/rates',
    '/api/production/recaps/export',
  ])('denies mutation/export %s before database operations', async path => {
    expect((await request(path, context(), 'POST')).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })

  it.each(['/qc-options?site=KLATEN', '/QC-OPTIONS/?site=KLATEN'])('allows scanner metadata through shared router mounts: %s', async suffix => {
    mocks.query.mockResolvedValueOnce([[{ allowed: 1 }]])
    const result = await request('/api/production-structure' + suffix)
    expect(result).toEqual({ status: 200, body: { brands: [], defects: [] } })
    expect(mocks.query.mock.calls[0][1]).toEqual(['KLATEN', moduleUid])
    expect(mocks.query.mock.calls[1][1]).toEqual(['KLATEN'])
    expect(mocks.query).toHaveBeenCalledTimes(3)
  })

  it('allows scoped job filter metadata without exposing sitewide master counts', async () => {
    const result = await request('/api/production-structure/jobs')
    expect(result.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledTimes(2)
    for (const [sql, values] of mocks.query.mock.calls) {
      expect(sql).toContain('job_mapping.production_module_id')
      expect(sql).toContain('job_transaction.production_module_id')
      expect(sql).toContain("job_history.status='ACTIVE'")
      expect(values).toEqual(expect.arrayContaining(['KLATEN', moduleUid]))
      expect(String(sql).match(/\?/g)?.length ?? 0).toBe(values.length)
    }
  })

  it('scopes eligible correction workers and their count to ACTIVE allowed module placement', async () => {
    const result = await request('/api/production-structure/eligible-employees?site=KLATEN&asOf=2026-11-09&query=Sample')
    expect(result.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledTimes(2)
    for (const [sql, values] of mocks.query.mock.calls) {
      expect(sql).toContain('pms.production_module_id')
      expect(sql).toContain("eh.status='ACTIVE'")
      expect(sql).toContain("active_history.status='ACTIVE'")
      expect(values).toEqual(expect.arrayContaining(['KLATEN', moduleUid, '%Sample%']))
      expect(String(sql).match(/\?/g)?.length ?? 0).toBe(values.length)
    }
  })

  it('denies scanner metadata with no module access without querying database', async () => {
    expect((await request('/api/production-structure/qc-options?site=KLATEN', context({ productionModuleAccess: [] }))).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('does not expose brand/defect metadata when no allowed module belongs to the requested site', async () => {
    expect((await request('/api/production-structure/qc-options?site=KLATEN')).status).toBe(403)
    expect(mocks.query).toHaveBeenCalledOnce()
    expect(mocks.query.mock.calls[0][0]).toContain('m.site_id')
  })

  it('denies scanner metadata outside site scope before querying database', async () => {
    expect((await request('/api/production-structure/qc-options?site=SEMARANG')).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('does not fetch or expose sitewide production metrics, readiness, or audit on the QC dashboard', async () => {
    mocks.query.mockResolvedValueOnce([[{ id: 11, uid: 'site-klaten', code: 'KLATEN', name: 'Klaten' }]])
    const result = await request('/api/dashboard/overview')
    expect(result.status).toBe(200)
    expect(result.body.data.capabilities.production).toBe(false)
    expect(result.body.data.kpis.productionTransactions).toBeNull()
    expect(result.body.data.sites[0].productionTransactions).toBeNull()
    expect(mocks.query).toHaveBeenCalledOnce()
  })

  it('keeps legacy QC plus Director constrained to granted sites', async () => {
    const legacy = context({ roles: ['QC', 'DIRECTOR'] })
    expect((await request('/api/production-structure/eligible-employees?site=SEMARANG', legacy)).status).toBe(403)
    expect((await request('/api/production-structure/qc-options?site=SEMARANG', legacy)).status).toBe(403)
    expect((await request('/api/dashboard/overview?site=SEMARANG', legacy)).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('preserves Super Admin access even if a legacy account also carries QC', async () => {
    mocks.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]])
    expect((await request('/api/production-structure/brands', context({ roles: ['SUPER_ADMIN', 'QC'] }))).status).toBe(200)
    expect(mocks.query).toHaveBeenCalledTimes(2)
  })
})
