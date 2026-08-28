import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { payrollSimulationsRouter } from './payroll-simulations.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
  createRun: vi.fn(),
  schedule: vi.fn(),
}))
const conn = {
  query: mocks.query,
  execute: mocks.execute,
  beginTransaction: mocks.beginTransaction,
  commit: mocks.commit,
  rollback: mocks.rollback,
  release: mocks.release,
}
vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    execute: mocks.execute,
    getConnection: vi.fn(async () => conn),
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../lib/payroll-simulation.js', () => ({
  createProcessingRun: mocks.createRun,
  schedulePayrollCalculation: mocks.schedule,
  runProjection: 'SELECT run',
  runDto: (row: Record<string, unknown>) => row,
}))
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

const auth: AuthContext = {
  id: 7,
  uid: 'user',
  name: 'Payroll',
  email: null,
  roles: ['PAYROLL_FINANCE'],
  permissions: ['payroll.view', 'payroll.calculate'],
  siteAccess: ['JEPARA'],
}
async function request(
  path: string,
  options: { method?: string; body?: unknown; auth?: AuthContext } = {}
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = options.auth ?? auth
    next()
  })
  app.use('/api/payroll', payrollSimulationsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/payroll${path}`, {
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

describe('Payroll simulation API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.beginTransaction.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined)
  })
  it('mengembalikan 202 dan menjadwalkan kalkulasi baru', async () => {
    mocks.createRun.mockResolvedValueOnce({
      replay: false,
      row: {
        id: 21,
        uid: '11111111-1111-4111-8111-111111111111',
        status: 'PROCESSING',
      },
    })
    const response = await request(
      '/periods/22222222-2222-4222-8222-222222222222/calculate',
      {
        method: 'POST',
        body: { idempotencyKey: '33333333-3333-4333-8333-333333333333' },
      }
    )
    expect(response.status).toBe(202)
    expect(mocks.schedule).toHaveBeenCalledWith(21, auth)
  })
  it('DIRECTOR tidak dapat menghitung simulasi', async () => {
    const response = await request(
      '/periods/22222222-2222-4222-8222-222222222222/calculate',
      {
        method: 'POST',
        body: { idempotencyKey: '33333333-3333-4333-8333-333333333333' },
        auth: {
          ...auth,
          roles: ['DIRECTOR'],
          permissions: ['payroll.view'],
          siteAccess: [],
        },
      }
    )
    expect(response.status).toBe(403)
    expect(mocks.createRun).not.toHaveBeenCalled()
  })
  it('menolak nominal manual nol', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          id: 10,
          siteId: 2,
          status: 'DRAFT',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-07',
          siteCode: 'JEPARA',
        },
      ],
    ])
    const response = await request(
      '/periods/22222222-2222-4222-8222-222222222222/manual-components',
      {
        method: 'POST',
        body: {
          employeeUid: '44444444-4444-4444-8444-444444444444',
          componentTypeUid: '55555555-5555-4555-8555-555555555555',
          amount: '0',
          idempotencyKey: '66666666-6666-4666-8666-666666666666',
        },
      }
    )
    expect(response.status).toBe(422)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })
  it('memblokir perubahan komponen manual saat run PROCESSING', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 10,
            siteId: 2,
            status: 'DRAFT',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-07',
            siteCode: 'JEPARA',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ processingRun: 1, lockedApproval: 0 }]])
    const response = await request(
      '/periods/22222222-2222-4222-8222-222222222222/manual-components',
      {
        method: 'POST',
        body: {
          employeeUid: '44444444-4444-4444-8444-444444444444',
          componentTypeUid: '55555555-5555-4555-8555-555555555555',
          amount: '1000',
          idempotencyKey: '66666666-6666-4666-8666-666666666666',
        },
      }
    )
    expect(response.status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })
  it('memblokir perubahan komponen manual saat approval terkunci', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 10,
            siteId: 2,
            status: 'CALCULATED',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-07',
            siteCode: 'JEPARA',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ processingRun: 0, lockedApproval: 1 }]])
    const response = await request(
      '/periods/22222222-2222-4222-8222-222222222222/manual-components',
      {
        method: 'POST',
        body: {
          employeeUid: '44444444-4444-4444-8444-444444444444',
          componentTypeUid: '55555555-5555-4555-8555-555555555555',
          amount: '1000',
          idempotencyKey: '66666666-6666-4666-8666-666666666666',
        },
      }
    )
    expect(response.status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })
  it('memulihkan run PROCESSING yang stale tanpa mengubah current run', async () => {
    const run = {
      id: 21,
      uid: '77777777-7777-4777-8777-777777777777',
      siteId: 2,
      siteCode: 'JEPARA',
      status: 'PROCESSING',
      currentRunId: 20,
    }
    mocks.query
      .mockResolvedValueOnce([[run]])
      .mockResolvedValueOnce([[{ id: 21 }]])
      .mockResolvedValueOnce([[{ ...run, status: 'FAILED' }]])
    mocks.execute.mockResolvedValueOnce([{}])
    const response = await request(
      '/runs/77777777-7777-4777-8777-777777777777/recover-stale',
      { method: 'POST' }
    )
    expect(response.status).toBe(200)
    expect(String(mocks.execute.mock.calls[0]?.[0])).toContain(
      "status='FAILED'"
    )
    expect(String(mocks.execute.mock.calls[0]?.[0])).not.toContain(
      'payroll_periods'
    )
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('belum membuka hasil karyawan saat run masih PROCESSING', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          id: 21,
          uid: '77777777-7777-4777-8777-777777777777',
          siteId: 2,
          siteCode: 'JEPARA',
          status: 'PROCESSING',
        },
      ],
    ])

    const response = await request(
      '/runs/77777777-7777-4777-8777-777777777777/employees'
    )

    expect(response.status).toBe(409)
    expect(mocks.query).toHaveBeenCalledOnce()
  })
})
