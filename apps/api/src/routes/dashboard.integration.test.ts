import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { dashboardRouter } from './dashboard.js'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))
vi.mock('../config.js', () => ({
  env: { ATTENDANCE_GO_LIVE_DATE: '2026-08-31' },
}))
vi.mock('../lib/attendance-shift-policy.js', () => ({
  jakartaBusinessDate: () => '2026-09-08',
}))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}))

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    id: 7,
    uid: 'hr-user',
    name: 'HR',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: [
      'employees.view',
      'attendance.view',
      'production.view',
      'recruitment.view',
    ],
    siteAccess: ['JEPARA'],
    ...overrides,
  }
}

async function request(path: string, context = auth()) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.auth = context
    next()
  })
  app.use('/api/dashboard', dashboardRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/dashboard${path}`)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Dashboard overview API', () => {
  beforeEach(() => mocks.query.mockReset())

  it('menolak site di luar akses sebelum query database', async () => {
    const response = await request('/overview?site=KLATEN')

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengagregasi data operasional tanpa payroll dan nominal uang', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 11,
            uid: 'site-jepara',
            code: 'JEPARA',
            name: 'Jepara',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ siteId: 11, activeEmployees: 10 }]])
      .mockResolvedValueOnce([
        [
          { businessDate: '2026-09-07', eligible: 9, present: 8 },
          { businessDate: '2026-09-08', eligible: 10, present: 7 },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            siteId: 11,
            eligibleToday: 10,
            presentToday: 7,
            incompleteCount: 2,
            pendingCorrectionCount: 1,
            pendingClassificationCount: 1,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ siteId: 11, productionTransactions: 14 }]])
      .mockResolvedValueOnce([
        [{ uid: 'job-1', name: 'Packing', transactions: 8 }],
      ])
      .mockResolvedValueOnce([
        [{ newCount: 2, inProgressCount: 3, passedCount: 1 }],
      ])
      .mockResolvedValueOnce([
        [{ siteId: 11, attendanceNotReady: 1, productionNotReady: 2 }],
      ])
      .mockResolvedValueOnce([
        [
          {
            uid: 'audit-1',
            module: 'PRODUCTION',
            action: 'CREATE',
            description: 'Setoran produksi tercatat.',
            occurredAt: '2026-09-08T09:30:00+07:00',
            siteName: 'Jepara',
          },
        ],
      ])

    const response = await request('/overview')
    const payload = (await response.json()) as {
      data: Record<string, unknown> & {
        kpis: Record<string, unknown>
        sites: Array<Record<string, unknown>>
        priorities: Array<Record<string, unknown>>
      }
    }

    expect(response.status).toBe(200)
    expect(payload.data.kpis).toEqual({
      activeEmployees: 10,
      presentToday: 7,
      eligibleToday: 10,
      attendanceAttention: 4,
      productionTransactions: 14,
    })
    expect(payload.data.sites[0]).toMatchObject({
      code: 'JEPARA',
      attendanceAttention: 4,
      productionTransactions: 14,
    })
    expect(payload.data.priorities).toHaveLength(3)
    expect(JSON.stringify(payload)).not.toMatch(/payroll|gross|rupiah/i)
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(['JEPARA'])
  })

  it('tidak menjalankan query domain yang tidak diizinkan', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ id: 11, uid: 'site-jepara', code: 'JEPARA', name: 'Jepara' }],
    ])

    const response = await request(
      '/overview',
      auth({ permissions: [], siteAccess: ['JEPARA'] })
    )
    const payload = (await response.json()) as {
      data: {
        capabilities: Record<string, boolean>
        kpis: Record<string, unknown>
      }
    }

    expect(response.status).toBe(200)
    expect(payload.data.capabilities).toEqual({
      employees: false,
      attendance: false,
      production: false,
      recruitment: false,
    })
    expect(payload.data.kpis).toEqual({
      activeEmployees: null,
      presentToday: null,
      eligibleToday: null,
      attendanceAttention: null,
      productionTransactions: null,
    })
    expect(mocks.query).toHaveBeenCalledOnce()
  })
})
