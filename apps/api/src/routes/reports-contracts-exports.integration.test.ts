import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { reportsRouter } from './reports.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  audit: vi.fn(),
  begin: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    getConnection: vi.fn(async () => ({
      beginTransaction: mocks.begin,
      commit: mocks.commit,
      rollback: mocks.rollback,
      release: mocks.release,
    })),
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../config.js', () => ({
  env: { ATTENDANCE_GO_LIVE_DATE: '2026-08-01' },
}))
vi.mock('../middleware/authenticate.js', () => ({
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
      ) {
        return res.status(403).json({ message: 'Izin ditolak.' })
      }
      next()
    },
}))

const hr: AuthContext = {
  id: 7,
  uid: 'hr-jepara',
  name: 'HR Jepara',
  email: null,
  roles: ['HR_OFFICER'],
  permissions: ['reports.view', 'employees.view'],
  siteAccess: ['JEPARA'],
}

async function request(
  path: string,
  options: { method?: string; body?: unknown; auth?: AuthContext } = {}
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = options.auth ?? hr
    next()
  })
  app.use('/api/reports', reportsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/reports${path}`, {
      method: options.method,
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Reports contract dan export API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('membaca kontrak dari snapshot/histori tanpa current site dan memakai UID publik', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            total: '1',
            upcoming: '1',
            expired: '0',
            active: '1',
            scheduled: '0',
            expiredStatus: '0',
            ambiguousHistory: '0',
            missingHistory: '0',
            unresolvedSite: '0',
            unresolvedStatus: '0',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            contractUid: 'contract-public-uid',
            contractNumber: 'PKWT/001',
            employeeUid: 'employee-public-uid',
            employeeNumber: 'PKDS-001',
            employeeName: 'Siti',
            siteUid: 'site-public-uid',
            siteCode: 'JEPARA',
            siteName: 'Site Jepara',
            siteResolution: 'SNAPSHOT',
            effectiveHistoryCount: '1',
            employeeTypeUid: 'type-public-uid',
            employeeTypeCode: 'BORONGAN',
            employeeTypeName: 'Borongan',
            contractTypeUid: 'contract-type-public-uid',
            contractTypeCode: 'PKWT',
            contractTypeName: 'PKWT',
            startDate: '2026-01-01',
            endDate: '2026-09-01',
            contractStatus: 'ACTIVE',
            statusResolution: 'LIFECYCLE',
            expiryState: 'UPCOMING',
            latestLifecycleUid: 'lifecycle-public-uid',
            latestLifecycleFromStatus: 'SCHEDULED',
            latestLifecycleToStatus: 'ACTIVE',
            latestLifecycleDate: '2026-01-01',
            latestLifecycleSource: 'MANUAL',
          },
        ],
      ])

    const response = await request(
      '/contracts?referenceDate=2026-08-31&dateFrom=2026-08-01&dateTo=2026-09-30&pageSize=999'
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    const sql = String(mocks.query.mock.calls[0]?.[0])
    expect(sql).toContain('c.site_name_snapshot')
    expect(sql).toContain('employee_employment_histories effective_history')
    expect(sql).not.toContain('e.current_site_id')
    expect(sql).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[1]?.[1]).toEqual([
      '2026-08-31',
      '2026-08-31',
      '2026-08-01',
      '2026-09-30',
      'JEPARA',
      500,
      0,
    ])
    expect(body).toMatchObject({
      total: 1,
      pageSize: 500,
      items: [
        {
          contractUid: 'contract-public-uid',
          employeeUid: 'employee-public-uid',
          siteResolution: 'SNAPSHOT',
          historyStatus: 'VALID',
          statusResolution: 'LIFECYCLE',
        },
      ],
    })
    expect(JSON.stringify(body)).not.toContain('internal')
  })

  it('menolak export tanpa employees.view', async () => {
    const response = await request('/employees/export', {
      method: 'POST',
      auth: { ...hr, permissions: ['reports.view'] },
      body: { asOf: '2026-08-31' },
    })
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('mengekspor laporan karyawan dan mencatat audit per site', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            employeeUid: 'employee-public-uid',
            employeeNumber: '=PKDS-001',
            employeeName: 'Siti',
            siteUid: 'site-public-uid',
            siteCode: 'JEPARA',
            siteName: 'Site Jepara',
            employeeTypeUid: 'type-public-uid',
            employeeTypeCode: 'BORONGAN',
            employeeTypeName: 'Borongan',
            employeeStatusUid: 'status-public-uid',
            employeeStatusCode: 'ACTIVE',
            employeeStatusName: 'Aktif',
            effectiveHistoryCount: 1,
            effectiveFrom: '2026-08-01',
            effectiveTo: null,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ id: 11, code: 'JEPARA', name: 'Site Jepara' }],
      ])
    mocks.audit.mockResolvedValue(undefined)

    const response = await request('/employees/export', {
      method: 'POST',
      body: { asOf: '2026-08-31', site: ['JEPARA'] },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml')
    expect(mocks.begin).toHaveBeenCalledOnce()
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.audit).toHaveBeenCalledOnce()
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({
      action: 'EXPORT',
      module: 'REPORTS',
      table: 'employee_employment_histories',
      siteId: 11,
    })
  })
})
