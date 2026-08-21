import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { productionRecapsRouter } from './production-recaps.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    execute: mocks.execute,
    getConnection: vi.fn(async () => ({
      execute: mocks.execute,
      beginTransaction: mocks.beginTransaction,
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
  requirePermission:
    (permission: string) =>
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const context = res.locals.auth as AuthContext
      if (
        !context.roles.includes('SUPER_ADMIN') &&
        !context.permissions.includes(permission)
      ) {
        return res.status(403).json({ message: 'Izin ditolak.' })
      }
      next()
    },
}))

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    id: 7,
    uid: 'production-user',
    name: 'Production User',
    email: null,
    roles: ['PRODUCTION_ADMIN'],
    permissions: ['production.view'],
    siteAccess: ['JEPARA'],
    ...overrides,
  }
}

async function request(
  path: string,
  options: { method?: string; body?: unknown; auth?: AuthContext } = {}
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = options.auth ?? auth()
    next()
  })
  app.use('/api/production', productionRecapsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/production${path}`, {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

const transactionRow = {
  id: 1,
  uid: '11111111-1111-4111-8111-111111111111',
  transactionNumber: 'PRD-001',
  businessDate: '2026-08-21',
  transactionAt: '2026-08-21T08:00:00+07:00',
  quantity: '34.0000',
  rateSnapshot: '925.0000',
  grossAmount: '31450.00',
  payrollSnapshotted: 0,
  employeeId: 9,
  employeeUid: '22222222-2222-4222-8222-222222222222',
  employeeNumber: 'PSLO-001',
  employeeName: 'Budi Produksi',
  siteId: 1,
  siteCode: 'JEPARA',
  siteName: 'Site Jepara',
  jobUid: '33333333-3333-4333-8333-333333333333',
  jobCode: 'BORONGAN-LINTING',
  jobName: 'Linting',
  unitUid: '44444444-4444-4444-8444-444444444444',
  unitCode: 'PCS',
  unitName: 'Pcs',
  decimalPrecision: 0,
  employeeTypeCode: 'BORONGAN',
  employeeTypeName: 'Pekerja Borongan',
}

describe('Production recaps API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM production_transactions pt')) {
        return [[transactionRow]]
      }
      if (statement.includes('FROM sites s')) {
        return [[{ value: 'JEPARA', label: 'Site Jepara' }]]
      }
      if (statement.includes('FROM production_jobs')) {
        return [[{ value: transactionRow.jobUid, label: 'Linting' }]]
      }
      if (statement.includes('FROM employee_types')) {
        return [[{ value: 'BORONGAN', label: 'Pekerja Borongan' }]]
      }
      return [[]]
    })
  })

  it('mengembalikan rekap hybrid hanya dari transaksi POSTED dan site user', async () => {
    const response = await request(
      '/recaps?dateFrom=2026-08-01&dateTo=2026-08-21&site=JEPARA'
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      summary: { employeeCount: number; totalGrossAmount: string }
      quantityTotals: Array<{ quantity: string; unit: { code: string } }>
      employees: { total: number }
      jobs: unknown[]
    }
    expect(body.summary).toMatchObject({
      employeeCount: 1,
      totalGrossAmount: '31450.00',
    })
    expect(body.quantityTotals).toEqual([
      expect.objectContaining({
        quantity: '34',
        unit: expect.objectContaining({ code: 'PCS' }),
      }),
    ])
    expect(body.employees.total).toBe(1)
    expect(body.jobs).toHaveLength(1)
    const recapSql = String(mocks.query.mock.calls[0]?.[0])
    expect(recapSql).toContain("pt.status='POSTED'")
    expect(recapSql).toContain('s.code IN (?)')
    expect(recapSql).toContain('wg.id=pt.work_group_id')
  })

  it('menolak periode di atas 31 hari sebelum query database', async () => {
    const response = await request(
      '/recaps?dateFrom=2026-07-01&dateTo=2026-08-21'
    )
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'maksimal 31 hari'
    )
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menolak filter site di luar akses user sebelum membaca data', async () => {
    const response = await request(
      '/recaps?dateFrom=2026-08-21&dateTo=2026-08-21&site=KLATEN'
    )
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('melindungi export dengan production.export', async () => {
    const response = await request('/recaps/export', {
      method: 'POST',
      body: { dateFrom: '2026-08-21', dateTo: '2026-08-21' },
    })
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menyediakan drawer pekerjaan dengan kontribusi dan kronologi POSTED', async () => {
    const response = await request(
      `/recaps/jobs/${transactionRow.jobUid}?dateFrom=2026-08-21&dateTo=2026-08-21&site=JEPARA`
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      job: { uid: string }
      summary: { employeeCount: number }
      employees: unknown[]
      transactions: unknown[]
    }
    expect(body.job.uid).toBe(transactionRow.jobUid)
    expect(body.summary.employeeCount).toBe(1)
    expect(body.employees).toHaveLength(1)
    expect(body.transactions).toHaveLength(1)
  })

  it('menyediakan drawer karyawan dan membaca kelompok dari histori penempatan', async () => {
    const response = await request(
      `/recaps/employees/${transactionRow.employeeUid}?dateFrom=2026-08-21&dateTo=2026-08-21&site=JEPARA`
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      employee: { uid: string }
      summary: { transactionCount: number }
      placementTimeline: unknown[]
      transactions: unknown[]
    }
    expect(body.employee.uid).toBe(transactionRow.employeeUid)
    expect(body.summary.transactionCount).toBe(1)
    expect(body.transactions).toHaveLength(1)

    const placementSql = mocks.query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('FROM employee_employment_histories eh'))
    expect(placementSql).toContain('wg.id=eh.work_group_id')
    expect(placementSql).not.toContain('wg.id=pt.work_group_id')
  })
})
