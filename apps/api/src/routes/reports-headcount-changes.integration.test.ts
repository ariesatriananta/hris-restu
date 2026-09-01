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
  authenticate: (
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!res.locals.auth) {
      return res.status(401).json({ message: 'Sesi tidak tersedia.' })
    }
    next()
  },
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
  auth: AuthContext = hr,
  options?: RequestInit
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth
    next()
  })
  app.use('/api/reports', reportsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/reports${path}`, options)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

const movement = {
  historyUid: '11111111-1111-4111-8111-111111111111',
  movementType: 'TRANSFER_IN',
  effectiveDateValue: '2026-08-08',
  effectiveDate: '2026-08-08',
  employeeUid: '22222222-2222-4222-8222-222222222222',
  employeeNumber: 'PKDS-001',
  employeeName: 'ISTIQOMAH',
  eventSiteUid: '33333333-3333-4333-8333-333333333333',
  eventSiteCode: 'JEPARA',
  eventSiteName: 'Site Jepara',
  sourceSiteUid: '44444444-4444-4444-8444-444444444444',
  sourceSiteCode: 'KLATEN',
  sourceSiteName: 'Site Klaten',
  targetSiteUid: '33333333-3333-4333-8333-333333333333',
  targetSiteCode: 'JEPARA',
  targetSiteName: 'Site Jepara',
  sourceStatusUid: '55555555-5555-4555-8555-555555555555',
  sourceStatusCode: 'ACTIVE',
  sourceStatusName: 'Aktif',
  targetStatusUid: '55555555-5555-4555-8555-555555555555',
  targetStatusCode: 'ACTIVE',
  targetStatusName: 'Aktif',
  employeeTypeUid: '66666666-6666-4666-8666-666666666666',
  employeeTypeCode: 'TRAINING',
  employeeTypeName: 'Training',
  productionSectionUid: null,
  productionSectionCode: null,
  productionSectionName: null,
  referenceNumber: 'MUT-2026-001',
}

describe('Laporan Perubahan Jumlah Karyawan API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('mewajibkan permission laporan dan karyawan', async () => {
    const response = await request(
      '/headcount-changes?dateFrom=2026-08-01&dateTo=2026-08-31',
      { ...hr, permissions: ['reports.view'] }
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menghitung snapshot dan perubahan sesuai cakupan site', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [{ activeHeadcount: 400, ambiguousHistories: 1 }],
      ])
      .mockResolvedValueOnce([
        [{ activeHeadcount: 406, ambiguousHistories: 0 }],
      ])
      .mockResolvedValueOnce([
        [
          {
            totalMovements: 1,
            joined: 0,
            transferredIn: 1,
            transferredOut: 0,
            resigned: 0,
            statusChanges: 0,
          },
        ],
      ])
      .mockResolvedValueOnce([[movement]])

    const response = await request(
      '/headcount-changes?dateFrom=2026-08-01&dateTo=2026-08-31&site=JEPARA&movementType=TRANSFER_IN'
    )
    const body = (await response.json()) as {
      summary: Record<string, number>
      items: Array<Record<string, unknown>>
    }

    expect(response.status).toBe(200)
    expect(body.summary).toMatchObject({
      openingHeadcount: 400,
      closingHeadcount: 406,
      netChange: 6,
      transferredIn: 1,
      ambiguousOpening: 1,
    })
    expect(body.items[0]).toMatchObject({
      historyUid: movement.historyUid,
      movementType: 'TRANSFER_IN',
      eventSite: { code: 'JEPARA' },
      sourceSite: { code: 'KLATEN' },
      targetSite: { code: 'JEPARA' },
    })
    expect(body.items[0]).not.toHaveProperty('id')
    expect(body.items[0]).not.toHaveProperty('reason')
    expect(body.items[0]).not.toHaveProperty('notes')

    const openingSql = String(mocks.query.mock.calls[0]?.[0])
    const summarySql = String(mocks.query.mock.calls[2]?.[0])
    expect(openingSql).toContain("historyCount=1 AND employeeStatusCode='ACTIVE'")
    expect(openingSql).toContain('siteCode IN (?)')
    expect(summarySql).toContain("'TRANSFER_OUT'")
    expect(summarySql).toContain("'TRANSFER_IN'")
    expect(summarySql).toContain('eventSiteCode IN (?)')
    expect(summarySql).toContain('movementType IN (?)')
  })

  it('menolak site di luar akses dan periode lebih dari 366 hari', async () => {
    const deniedSite = await request(
      '/headcount-changes?dateFrom=2026-08-01&dateTo=2026-08-31&site=KLATEN'
    )
    expect(deniedSite.status).toBe(403)

    const tooLong = await request(
      '/headcount-changes?dateFrom=2026-01-01&dateTo=2027-01-02'
    )
    expect(tooLong.status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengekspor Excel dan mencatat audit per site', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [{ activeHeadcount: 400, ambiguousHistories: 0 }],
      ])
      .mockResolvedValueOnce([
        [{ activeHeadcount: 406, ambiguousHistories: 0 }],
      ])
      .mockResolvedValueOnce([[movement]])
      .mockResolvedValueOnce([[{ id: 11, code: 'JEPARA' }]])
    mocks.audit.mockResolvedValue(undefined)

    const response = await request('/headcount-changes/export', hr, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': 'headcount-report-test',
      },
      body: JSON.stringify({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        site: ['JEPARA'],
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml')
    expect(response.headers.get('x-request-id')).toBe('headcount-report-test')
    expect(mocks.audit).toHaveBeenCalledOnce()
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({
      module: 'REPORTS',
      action: 'EXPORT',
      table: 'employee_employment_histories',
      siteId: 11,
      requestId: 'headcount-report-test',
    })
    expect(mocks.audit.mock.calls[0]?.[0]?.afterData).toMatchObject({
      rowCount: 1,
    })
    expect(mocks.audit.mock.calls[0]?.[0]?.afterData).not.toHaveProperty(
      'reason'
    )
    expect(mocks.commit).toHaveBeenCalledOnce()
  })
})
