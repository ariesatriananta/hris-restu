import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { payrollHandoverRouter } from './payroll-handover.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connQuery: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
}))
vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    getConnection: vi.fn(async () => ({
      query: mocks.connQuery,
      beginTransaction: mocks.beginTransaction,
      commit: mocks.commit,
      rollback: mocks.rollback,
      release: mocks.release,
    })),
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requirePermission: (permission: string) =>
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      const auth = res.locals.auth as AuthContext
      if (!auth.permissions.includes(permission)) {
        res.status(403).json({ message: 'Izin ditolak.' })
        return
      }
      next()
    },
}))

const auth: AuthContext = {
  id: 7,
  uid: 'user',
  name: 'Payroll',
  email: null,
  roles: ['PAYROLL_FINANCE'],
  permissions: ['payroll.view', 'payroll.export', 'payroll.print'],
  siteAccess: ['JEPARA'],
}
const runUid = '11111111-1111-4111-8111-111111111111'
const moduleUid = '22222222-2222-4222-8222-222222222222'
const sectionUid = '77777777-7777-4777-8777-777777777777'
const run = {
  id: 10, runId: 10, uid: runUid, runNumber: 2, runType: 'SIMULATION',
  runStatus: 'COMPLETED', periodId: 5, periodCode: 'PAY-JEPARA-1',
  periodName: 'Payroll Jepara', periodStart: '2026-09-01',
  periodEnd: '2026-09-02', periodStatus: 'CALCULATED', currentRunId: 10,
  employeeType: 'BORONGAN', payrollBasis: 'PIECE_RATE',
  siteId: 1, siteCode: 'JEPARA', siteName: 'Site Jepara',
}
const employee = {
  resultId: '50', employeeUid: '33333333-3333-4333-8333-333333333333',
  employeeNumber: 'PKDS-001', fullName: 'Budi', employeeType: 'BORONGAN',
  workGroupName: 'Linting', moduleUid, moduleName: 'Modul A', sectionUid, sectionName: 'Linting',
  pieceRateAmount: '100.00', additionalEarnings: '20.00',
  totalDeductions: '10.00', bpjsEmployeeDeduction: '10.00', netPay: '110.00',
}

async function request(path: string, options: {
  method?: string
  body?: unknown
  auth?: AuthContext
} = {}) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => { res.locals.auth = options.auth ?? auth; next() })
  app.use('/api/payroll', payrollHandoverRouter)
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
      server.close((error) => error ? reject(error) : resolve()))
  }
}

describe('Payroll handover API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockReset()
    mocks.connQuery.mockReset()
  })

  it('mengambil hasil run aktif tanpa bergantung pada rekening', async () => {
    mocks.query
      .mockResolvedValueOnce([[run]])
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        { resultId: '50', businessDate: '2026-09-01', amount: '100.00' },
      ]])
      .mockResolvedValueOnce([[{ settingValue: ['Luluk'] }]])
    const response = await request(
      `/runs/${runUid}/handover-preview?moduleUid=${moduleUid}&sectionUid=${sectionUid}`
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        selectedModuleUid: moduleUid,
        selectedSectionUid: sectionUid,
        foremen: ['Luluk'],
        rows: [{ employeeNumber: 'PKDS-001', netPay: '110.00' }],
        totals: { bpjsEmployeeDeduction: '10.00', netPay: '110.00' },
      },
    })
    expect(mocks.query).toHaveBeenCalledTimes(4)
  })

  it('menampilkan semua pekerja sebagai preview default tanpa filter', async () => {
    mocks.query
      .mockResolvedValueOnce([[run]])
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        { resultId: '50', businessDate: '2026-09-01', amount: '100.00' },
      ]])
      .mockResolvedValueOnce([[{ settingValue: ['Luluk'] }]])
    const response = await request(`/runs/${runUid}/handover-preview`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        selectedSectionUid: null,
        selectedModuleUid: null,
        rows: [{ employeeNumber: 'PKDS-001', netPay: '110.00' }],
      },
    })
  })

  it('mengizinkan run historis yang selesai dihitung dengan penanda bukan aktif', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ ...run, currentRunId: 9 }]])
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        { resultId: '50', businessDate: '2026-09-01', amount: '100.00' },
      ]])
      .mockResolvedValueOnce([[{ settingValue: [] }]])
    const response = await request(`/runs/${runUid}/handover-preview`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { run: { isCurrent: false } },
    })
  })

  it('menolak run yang belum selesai dihitung', async () => {
    mocks.query.mockResolvedValueOnce([[{ ...run, runStatus: 'FAILED' }]])
    const response = await request(`/runs/${runUid}/handover-preview`)
    expect(response.status).toBe(409)
    expect(mocks.query).toHaveBeenCalledOnce()
  })

  it('menolak jenis Payroll selain Borongan', async () => {
    mocks.query.mockResolvedValueOnce([[{ ...run, employeeType: 'HARIAN', payrollBasis: 'TIME_BASED' }]])
    const response = await request(`/runs/${runUid}/handover-preview`)
    expect(response.status).toBe(409)
    expect(mocks.query).toHaveBeenCalledOnce()
  })

  it('membatasi akses site di API', async () => {
    mocks.query.mockResolvedValueOnce([[run]])
    const response = await request(`/runs/${runUid}/handover-preview`, {
      auth: { ...auth, siteAccess: ['KLATEN'] },
    })
    expect(response.status).toBe(403)
  })

  it('mencatat penerbitan cetak run historis tanpa menyimpan nama mandor dan tanggal di audit', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ ...run, currentRunId: 9 }]])
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        { resultId: '50', businessDate: '2026-09-01', amount: '100.00' },
      ]])
      .mockResolvedValueOnce([[{ settingValue: ['Luluk'] }]])
    mocks.connQuery
      .mockResolvedValueOnce([[{
        currentRunId: 9, periodStatus: 'CALCULATED', runStatus: 'COMPLETED',
      }]])
      .mockResolvedValueOnce([[]])
    const response = await request(`/runs/${runUid}/handover-print`, {
      method: 'POST',
      body: {
        moduleUid, sectionUid, foremanName: 'Luluk', handoverDate: '2026-09-03',
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
      },
    })
    expect(response.status).toBe(200)
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRINT', afterData: expect.objectContaining({ documentType: 'WAGE_HANDOVER' }) }),
      expect.anything()
    )
    expect(JSON.stringify(mocks.audit.mock.calls[0]?.[0]?.afterData)).not.toContain('Luluk')
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('mengekspor Excel dari run aktif dan mencatat audit ekspor', async () => {
    mocks.query
      .mockResolvedValueOnce([[run]])
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        { resultId: '50', businessDate: '2026-09-01', amount: '100.00' },
      ]])
      .mockResolvedValueOnce([[{ settingValue: ['Luluk'] }]])
    mocks.connQuery
      .mockResolvedValueOnce([[
        { currentRunId: 10, periodStatus: 'CALCULATED', runStatus: 'COMPLETED' },
      ]])
      .mockResolvedValueOnce([[]])
    const response = await request(`/runs/${runUid}/handover-export`, {
      method: 'POST',
      body: {
        moduleUid, sectionUid, foremanName: 'Luluk', handoverDate: '2026-09-03',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
      },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml.sheet')
    expect(response.headers.get('content-disposition')).toContain('daftar-upah-skt-linting')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000)
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT' }), expect.anything()
    )
  })

  it('mengekspor semua pekerja tanpa filter dan tanpa mandor', async () => {
    mocks.query
      .mockResolvedValueOnce([[run]])
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        { resultId: '50', businessDate: '2026-09-01', amount: '100.00' },
      ]])
      .mockResolvedValueOnce([[{ settingValue: ['Luluk'] }]])
    mocks.connQuery
      .mockResolvedValueOnce([[
        { currentRunId: 10, periodStatus: 'CALCULATED', runStatus: 'COMPLETED' },
      ]])
      .mockResolvedValueOnce([[]])
    const response = await request(`/runs/${runUid}/handover-export`, {
      method: 'POST',
      body: {
        handoverDate: '2026-09-03',
        idempotencyKey: '99999999-9999-4999-8999-999999999999',
      },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('daftar-upah-skt-semua-bagian')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000)
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT' }), expect.anything()
    )
  })

  it('tetap mewajibkan filter spesifik dan mandor untuk cetak', async () => {
    const response = await request(`/runs/${runUid}/handover-print`, {
      method: 'POST',
      body: {
        handoverDate: '2026-09-03',
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    })
    expect(response.status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menolak nama mandor yang tidak ada pada pengaturan sistem', async () => {
    mocks.query
      .mockResolvedValueOnce([[run]])
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        { resultId: '50', businessDate: '2026-09-01', amount: '100.00' },
      ]])
      .mockResolvedValueOnce([[{ settingValue: ['Luluk'] }]])
    const response = await request(`/runs/${runUid}/handover-print`, {
      method: 'POST',
      body: {
        moduleUid, sectionUid, foremanName: 'Nama lain', handoverDate: '2026-09-03',
        idempotencyKey: '88888888-8888-4888-8888-888888888888',
      },
    })
    expect(response.status).toBe(422)
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('menolak cetak tanpa hak payroll.print', async () => {
    const response = await request(`/runs/${runUid}/handover-print`, {
      method: 'POST',
      auth: { ...auth, permissions: ['payroll.view'] },
      body: {
        moduleUid, sectionUid, foremanName: 'Luluk', handoverDate: '2026-09-03',
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
      },
    })
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
