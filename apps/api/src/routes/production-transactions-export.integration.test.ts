import ExcelJS from 'exceljs'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { productionTransactionsRouter } from './production-transactions.js'

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
    getConnection: vi.fn(async () => mocks),
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
      if (!(res.locals.auth as AuthContext).permissions.includes(permission))
        return res.status(403).json({ message: 'Izin ditolak' })
      next()
    },
}))
const jobUid = '22222222-2222-4222-8222-222222222222'
const context: AuthContext = {
  id: 7,
  uid: 'user',
  name: 'Bos',
  email: null,
  roles: ['PRODUCTION_ADMIN'],
  permissions: ['production.view', 'production.export'],
  siteAccess: ['JEPARA'],
}
async function request(path: string, permissions = context.permissions) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.auth = { ...context, permissions }
    next()
  })
  app.use('/production', productionTransactionsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    return await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/production${path}`
    )
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}
const transaction = {
  id: 21,
  uid: jobUid,
  transactionNumber: 'PRD-001',
  businessDate: '2026-10-09',
  transactionAt: '2026-10-09T09:00:00+07:00',
  employeeUid: jobUid,
  employeeNumber: 'J-001',
  fullName: 'Test worker',
  site: 'JEPARA',
  siteName: 'Jepara',
  jobUid,
  jobCode: 'BORONGAN-LINTING',
  jobName: 'Linting',
  unitUid: jobUid,
  unitCode: 'PCS',
  unitName: 'Pcs',
  decimalPrecision: 0,
  quantity: '500',
  payableQuantity: '490',
  deductionPercentage: '2',
  rateSnapshot: '125',
  grossAmount: '61250',
  status: 'POSTED',
}

describe('all-filtered production transaction Excel export', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })
  it.each([
    { permissions: [] },
    { permissions: ['production.view'] },
    { permissions: ['production.export'] },
  ])(
    'requires both view and export permissions: $permissions',
    async ({ permissions }) => {
      expect((await request('/transactions/export', permissions)).status).toBe(
        403
      )
      expect(mocks.query).not.toHaveBeenCalled()
    }
  )
  it('rejects foreign sites before any data read', async () => {
    expect((await request('/transactions/export?site=SEMARANG')).status).toBe(
      403
    )
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('exports every matching row ignoring pagination, preserving filters and auditing checksum', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ hasHistoryStatus: 1 }]])
      .mockResolvedValueOnce([
        [{ transactionCount: 2, totalGrossAmount: '122500' }],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [transaction, { ...transaction, id: 22, transactionNumber: 'PRD-002' }],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 81,
            transactionId: 21,
            brandUid: jobUid,
            brandCode: 'BR-OLD',
            brandName: 'Brand snapshot',
            weight1Grams: '71.29',
            weight2Grams: null,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            qcId: 81,
            uid: jobUid,
            code: 'DF-OLD',
            name: 'Defect snapshot',
            sortOrder: 2,
            quantity: 9,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            transactionId: 21,
            uid: jobUid,
            code: 'OLD',
            name: 'Historical module',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ id: 1, code: 'JEPARA' }]])
    const response = await request(
      `/transactions/export?dateFrom=2026-09-01&dateTo=2026-10-09&site=JEPARA&jobUid=${jobUid}&moduleUid=${jobUid}&employeeType=BORONGAN&status=POSTED&query=Test&page=2&pageSize=1`
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('.xlsx')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await response.arrayBuffer())
    const sheet = workbook.worksheets[0]
    expect(sheet.rowCount).toBe(3)
    expect(sheet.getCell('G2').value).toBe('Brand snapshot')
    expect(sheet.getCell('M1').value).toBe('Defect snapshot')
    expect(sheet.getCell('M2').value).toBe(9)
    const selectCall = mocks.query.mock.calls[3]
    expect(String(selectCall[0])).not.toContain('OFFSET')
    expect(selectCall[1]).toEqual([
      '2026-09-01',
      '2026-10-09',
      'JEPARA',
      'JEPARA',
      '%Test%',
      '%Test%',
      '%Test%',
      jobUid,
      jobUid,
      'BORONGAN',
      'POSTED',
    ])
    for (const index of [1, 2, 3]) {
      const sql = String(mocks.query.mock.calls[index][0])
      expect(sql).toContain('module_history.site_id=pt.site_id')
      expect(sql).toContain("module_history.status='ACTIVE'")
      expect(sql).toContain('conflicting_history.id<>module_history.id')
      expect(sql).toContain('pt.status IN (?)')
    }
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        siteId: 1,
        action: 'EXPORT',
        afterData: expect.objectContaining({
          transactionRows: 2,
          checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
      mocks
    )
    expect(mocks.commit).toHaveBeenCalledOnce()
  })
  it('returns header-only export and still audits the selected site', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ transactionCount: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 1, code: 'JEPARA' }]])
    const response = await request('/transactions/export?site=JEPARA')
    expect(response.status).toBe(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await response.arrayBuffer())
    expect(workbook.worksheets[0].rowCount).toBe(1)
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        siteId: 1,
        afterData: expect.objectContaining({ transactionRows: 0 }),
      }),
      mocks
    )
  })
  it('rejects oversized exports explicitly without a partial file or audit', async () => {
    mocks.query.mockResolvedValueOnce([[{ transactionCount: 100001 }]])
    const response = await request('/transactions/export')
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining('100.000'),
    })
    expect(mocks.query).toHaveBeenCalledOnce()
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('enriches exports beyond 500 rows in bounded chunks without truncating', async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({
      ...transaction,
      id: index + 1,
      transactionNumber: `PRD-${index + 1}`,
    }))
    mocks.query
      .mockResolvedValueOnce([[{ transactionCount: 501 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([rows])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ hasHistoryStatus: 1 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 1, code: 'JEPARA' }]])
    const response = await request('/transactions/export?pageSize=1')
    expect(response.status).toBe(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await response.arrayBuffer())
    expect(workbook.worksheets[0].rowCount).toBe(502)
    const qcCalls = mocks.query.mock.calls.filter(([sql]) =>
      String(sql).includes('FROM production_transaction_qc qc')
    )
    expect(qcCalls).toHaveLength(2)
    expect(qcCalls[0][1]).toHaveLength(500)
    expect(qcCalls[1][1]).toEqual([501])
    expect(
      mocks.query.mock.calls.filter(([sql]) =>
        String(sql).includes('INFORMATION_SCHEMA.COLUMNS')
      )
    ).toHaveLength(1)
  })
  it('rolls back failed export audit and sends no workbook', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ transactionCount: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 1, code: 'JEPARA' }]])
    mocks.audit.mockRejectedValueOnce(new Error('Audit unavailable'))
    const response = await request('/transactions/export?site=JEPARA')
    expect(response.status).toBe(500)
    expect(response.headers.get('content-disposition')).toBeNull()
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledOnce()
  })
})
