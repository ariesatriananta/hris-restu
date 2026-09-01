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

const payrollUser: AuthContext = {
  id: 9,
  uid: 'payroll-jepara',
  name: 'Payroll Jepara',
  email: null,
  roles: ['PAYROLL_FINANCE'],
  permissions: ['reports.view', 'payroll.view', 'payroll.export'],
  siteAccess: ['JEPARA'],
}

async function request(
  path: string,
  auth: AuthContext = payrollUser,
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

describe('Laporan Payroll Final API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('mewajibkan permission laporan dan Payroll', async () => {
    const response = await request(
      '/payroll-final?dateFrom=2026-08-01&dateTo=2026-08-31',
      { ...payrollUser, permissions: ['reports.view'] }
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('hanya membaca current run FINAL COMPLETED dan menyamarkan rekening', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            total: 1,
            periodCount: 1,
            siteCount: 1,
            employeeCount: 1,
            totalPieceRate: '0.00',
            totalBasicSalary: '5000000.00',
            totalAdditionalEarnings: '250000.00',
            totalGrossEarnings: '5250000.00',
            totalDeductions: '100000.00',
            totalNetPay: '5150000.00',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            periodUid: '11111111-1111-4111-8111-111111111111',
            periodCode: 'PAY-202608',
            periodName: 'Payroll Agustus',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31',
            paymentDate: '2026-09-01',
            closedAt: '2026-09-01T09:00:00.000+07:00',
            payrollBasis: 'TIME_BASED',
            payFrequency: 'MONTHLY',
            periodEmployeeType: 'BULANAN',
            siteUid: '22222222-2222-4222-8222-222222222222',
            siteCode: 'JEPARA',
            siteName: 'Site Jepara',
            runUid: '33333333-3333-4333-8333-333333333333',
            runNumber: 2,
            calculationFinishedAt: '2026-09-01T08:30:00.000+07:00',
            resultUid: '44444444-4444-4444-8444-444444444444',
            employeeUid: '55555555-5555-4555-8555-555555555555',
            employeeNumber: 'PKDS-001',
            employeeName: 'Siti',
            employeeType: 'BULANAN',
            attendanceDays: 20,
            productionTransactionCount: 0,
            pieceRateAmount: '0.00',
            basicSalaryAmount: '5000000.00',
            additionalEarnings: '250000.00',
            grossEarnings: '5250000.00',
            totalDeductions: '100000.00',
            netPay: '5150000.00',
            bankName: 'Bank Demo',
            accountLast4: '6789',
          },
        ],
      ])

    const response = await request(
      '/payroll-final?dateFrom=2026-08-01&dateTo=2026-08-31&site=JEPARA'
    )
    const body = (await response.json()) as Record<string, unknown> & {
      items: Array<Record<string, unknown>>
      summary: Record<string, unknown>
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      official: true,
      closedDoesNotMeanPaid: true,
      summary: { total: 1, totalNetPay: '5150000.00' },
    })
    expect(body.items[0]).toMatchObject({
      bank: { name: 'Bank Demo', accountLast4: '6789' },
      run: { type: 'FINAL', status: 'COMPLETED' },
    })
    expect(JSON.stringify(body)).not.toContain('123456789')
    expect(body.items[0]).not.toHaveProperty('id')

    const summarySql = String(mocks.query.mock.calls[0]?.[0])
    expect(summarySql).toContain("pp.status='CLOSED'")
    expect(summarySql).toContain("run.run_type='FINAL'")
    expect(summarySql).toContain("run.status='COMPLETED'")
    expect(summarySql).toContain('run.id=pp.current_run_id')
    expect(summarySql).toContain('periodEnd BETWEEN ? AND ?')
    expect(summarySql).toContain('siteCode IN (?)')
  })

  it('menolak site di luar akses sebelum menjalankan query', async () => {
    const response = await request(
      '/payroll-final?dateFrom=2026-08-01&dateTo=2026-08-31&site=KLATEN'
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menolak rentang lebih dari 366 hari sebelum menjalankan query', async () => {
    const response = await request(
      '/payroll-final?dateFrom=2026-01-01&dateTo=2027-01-02'
    )

    expect(response.status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mewajibkan payroll.export untuk ekspor', async () => {
    const response = await request(
      '/payroll-final/export',
      { ...payrollUser, permissions: ['reports.view', 'payroll.view'] },
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateFrom: '2026-08-01',
          dateTo: '2026-08-31',
        }),
      }
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengekspor snapshot final yang tersamarkan dan mencatat audit per site', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            periodUid: '11111111-1111-4111-8111-111111111111',
            periodCode: 'PAY-202608',
            periodName: 'Payroll Agustus',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31',
            paymentDate: '2026-09-01',
            closedAt: '2026-09-01T09:00:00.000+07:00',
            payrollBasis: 'TIME_BASED',
            payFrequency: 'MONTHLY',
            periodEmployeeType: 'BULANAN',
            siteUid: '22222222-2222-4222-8222-222222222222',
            siteCode: 'JEPARA',
            siteName: 'Site Jepara',
            runUid: '33333333-3333-4333-8333-333333333333',
            runNumber: 2,
            calculationFinishedAt: '2026-09-01T08:30:00.000+07:00',
            resultUid: '44444444-4444-4444-8444-444444444444',
            employeeUid: '55555555-5555-4555-8555-555555555555',
            employeeNumber: 'PKDS-001',
            employeeName: 'Siti',
            employeeType: 'BULANAN',
            attendanceDays: 20,
            productionTransactionCount: 0,
            pieceRateAmount: '0.00',
            basicSalaryAmount: '5000000.00',
            additionalEarnings: '250000.00',
            grossEarnings: '5250000.00',
            totalDeductions: '100000.00',
            netPay: '5150000.00',
            bankName: 'Bank Demo',
            accountLast4: '6789',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ id: 11, code: 'JEPARA', name: 'Site Jepara' }],
      ])
    mocks.audit.mockResolvedValue(undefined)

    const response = await request('/payroll-final/export', payrollUser, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': 'payroll-final-export-test',
      },
      body: JSON.stringify({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        site: ['JEPARA'],
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml')
    expect(response.headers.get('x-request-id')).toBe(
      'payroll-final-export-test'
    )
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain(
      "run.run_type='FINAL'"
    )
    expect(mocks.begin).toHaveBeenCalledOnce()
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.audit).toHaveBeenCalledOnce()
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({
      action: 'EXPORT',
      module: 'REPORTS',
      table: 'payroll_employee_results',
      siteId: 11,
      requestId: 'payroll-final-export-test',
    })
    expect(mocks.audit.mock.calls[0]?.[0]?.afterData).toMatchObject({
      rowCount: 1,
      sites: ['JEPARA'],
    })
    expect(
      mocks.audit.mock.calls[0]?.[0]?.afterData?.checksumSha256
    ).toMatch(/^[a-f0-9]{64}$/)
  })
})
