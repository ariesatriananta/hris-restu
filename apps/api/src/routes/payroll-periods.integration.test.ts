import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { payrollPeriodsRouter } from './payroll-periods.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
  readiness: vi.fn(),
}))

const connection = {
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
    getConnection: vi.fn(async () => connection),
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../lib/payroll-readiness.js', () => ({
  evaluatePayrollReadiness: mocks.readiness,
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

const readiness = {
  status: 'READY',
  evaluatedAt: '2026-08-28T00:00:00.000Z',
  populationCount: 12,
  productionEmployeeCount: 12,
  componentOnlyEmployeeCount: 0,
  blockerCount: 0,
  warningCount: 0,
  blockers: [],
  warnings: [],
  facts: {
    periodFinished: true,
    expectedAttendanceDays: 5,
    finalizedAttendanceDays: 5,
    pendingAttendanceCorrections: 0,
    pendingAttendanceClassifications: 0,
    ambiguousEmploymentEmployees: 0,
    conflictingProductionTransactions: 0,
    unsupportedFormulaComponents: 0,
    missingBankAccounts: 0,
    postedTransactionCount: 20,
    productionGrossAmount: 500000,
    activeComponentCount: 2,
    recurringComponentCount: 2,
    missingEmploymentHistoryEmployees: 0,
    attendance: { absent: 0, late: 0, earlyLeave: 0 },
  },
}

function auth(input: Partial<AuthContext> = {}): AuthContext {
  return {
    id: 7,
    uid: 'user-uid',
    name: 'Payroll User',
    email: null,
    roles: ['PAYROLL_FINANCE'],
    permissions: ['payroll.view', 'payroll.calculate'],
    siteAccess: ['JEPARA'],
    ...input,
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
  app.use('/api/payroll', payrollPeriodsRouter)
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

const periodRow = {
  id: 15,
  uid: '77be2e0a-3551-44df-8b5e-949e517bd31a',
  siteId: 2,
  siteUid: '5234ecda-810a-4f24-8353-b2c39e90e825',
  siteCode: 'JEPARA',
  siteName: 'Jepara',
  periodCode: 'PAY-JEPARA-20260801-20260807-ABCD1234',
  periodName: 'Payroll Jepara 1-7 Agustus',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-07',
  paymentDate: '2026-08-08',
  payrollBasis: 'PIECE_RATE',
  status: 'DRAFT',
  notes: null,
  createdAt: '2026-08-28T00:00:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
}

describe('Payroll periods API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readiness.mockResolvedValue(structuredClone(readiness))
    mocks.beginTransaction.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined)
    mocks.release.mockReturnValue(undefined)
  })

  it('membatasi metadata site untuk Payroll Finance', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ uid: periodRow.siteUid, code: 'JEPARA', name: 'Jepara' }],
    ])
    const response = await request('/periods/meta')
    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(['JEPARA'])
  })

  it('membuat DRAFT PIECE_RATE dengan lock site dan audit', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM sites WHERE uid=?'))
        return [
          [{ id: 2, uid: periodRow.siteUid, code: 'JEPARA', name: 'Jepara' }],
        ]
      if (
        statement.includes('FROM payroll_periods') &&
        statement.includes('LIMIT 1 FOR UPDATE')
      )
        return [[]]
      if (statement.includes('WHERE pp.uid=?')) return [[periodRow]]
      return [[]]
    })
    mocks.execute.mockResolvedValueOnce([{ insertId: 15 }])
    const response = await request('/periods', {
      method: 'POST',
      body: {
        siteUid: periodRow.siteUid,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-07',
        paymentDate: '2026-08-08',
      },
    })
    expect(response.status).toBe(201)
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('FOR UPDATE')
    expect(String(mocks.execute.mock.calls[0]?.[0])).toContain(
      "'PIECE_RATE','DRAFT'"
    )
    expect(mocks.audit).toHaveBeenCalledOnce()
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('menolak site di luar akses saat membuat periode', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ id: 3, uid: periodRow.siteUid, code: 'KLATEN', name: 'Klaten' }],
    ])
    const response = await request('/periods', {
      method: 'POST',
      body: {
        siteUid: periodRow.siteUid,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-07',
      },
    })
    expect(response.status).toBe(403)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })

  it('hanya mengizinkan pembatalan periode DRAFT', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ ...periodRow, status: 'CALCULATED' }],
    ])
    const response = await request(`/periods/${periodRow.uid}/cancel`, {
      method: 'POST',
      body: { reason: 'Periode salah dibuat.' },
    })
    expect(response.status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })

  it('SUPER_ADMIN melewati permission dan akses site', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ uid: periodRow.siteUid, code: 'KLATEN', name: 'Klaten' }],
    ])
    const response = await request('/periods/meta', {
      auth: auth({ roles: ['SUPER_ADMIN'], permissions: [], siteAccess: [] }),
    })
    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain('s.code IN')
  })
})
