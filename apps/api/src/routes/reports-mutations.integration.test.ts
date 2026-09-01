import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { reportsRouter } from './reports.js'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))
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

async function request(path: string, auth: AuthContext = hr) {
  const app = express()
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
    return await fetch(`http://127.0.0.1:${port}/api/reports${path}`)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Laporan Mutasi API', () => {
  beforeEach(() => mocks.query.mockReset())

  it('mewajibkan permission laporan dan karyawan', async () => {
    const response = await request(
      '/mutations?dateFrom=2026-08-01&dateTo=2026-08-31',
      { ...hr, permissions: ['reports.view'] }
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menggabungkan histori dan jadwal tanpa menggandakan jadwal APPLIED', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            total: 1,
            applied: 1,
            scheduled: 0,
            failed: 0,
            cancelled: 0,
            transfer: 1,
            promotion: 0,
            demotion: 0,
            statusChange: 0,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            mutationUid: '11111111-1111-4111-8111-111111111111',
            recordSource: 'HISTORY',
            employeeUid: '22222222-2222-4222-8222-222222222222',
            employeeNumber: 'PKDS-001',
            employeeName: 'Siti',
            changeType: 'TRANSFER',
            mutationStatus: 'APPLIED',
            effectiveDate: '2026-08-08',
            sourceSiteUid: '33333333-3333-4333-8333-333333333333',
            sourceSiteCode: 'KLATEN',
            sourceSiteName: 'Site Klaten',
            sourceEmployeeTypeUid: '44444444-4444-4444-8444-444444444444',
            sourceEmployeeTypeCode: 'TRAINING',
            sourceEmployeeTypeName: 'Training',
            targetSiteUid: '55555555-5555-4555-8555-555555555555',
            targetSiteCode: 'JEPARA',
            targetSiteName: 'Site Jepara',
            targetEmployeeTypeUid: '66666666-6666-4666-8666-666666666666',
            targetEmployeeTypeCode: 'BORONGAN',
            targetEmployeeTypeName: 'Borongan',
          },
        ],
      ])

    const response = await request(
      '/mutations?dateFrom=2026-08-01&dateTo=2026-08-31&site=JEPARA&changeType=TRANSFER'
    )
    const body = (await response.json()) as {
      items: Array<{
        mutationUid: string
        source: { site: { code: string } }
        target: { site: { code: string } }
      }>
      summary: { total: number; transfer: number }
    }

    expect(response.status).toBe(200)
    expect(body.summary).toMatchObject({ total: 1, transfer: 1 })
    expect(body.items[0]).toMatchObject({
      mutationUid: '11111111-1111-4111-8111-111111111111',
      source: { site: { code: 'KLATEN' } },
      target: { site: { code: 'JEPARA' } },
    })
    expect(body.items[0]).not.toHaveProperty('id')

    const summarySql = String(mocks.query.mock.calls[0]?.[0])
    expect(summarySql).toContain("h.change_type<>'INITIAL'")
    expect(summarySql).toContain("sm.status<>'APPLIED'")
    expect(summarySql).toContain('effectiveDateValue BETWEEN ? AND ?')
    expect(summarySql).toContain('targetSiteCode IN (?)')
  })

  it('menolak site tujuan di luar akses sebelum menjalankan query', async () => {
    const response = await request(
      '/mutations?dateFrom=2026-08-01&dateTo=2026-08-31&site=KLATEN'
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menolak periode lebih dari 366 hari sebelum menjalankan query', async () => {
    const response = await request(
      '/mutations?dateFrom=2026-01-01&dateTo=2027-01-02'
    )

    expect(response.status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
