import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { productionTransactionsRouter } from './production-transactions.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  release: vi.fn(),
  beginTransaction: vi.fn(),
  rollback: vi.fn(),
  commit: vi.fn(),
}))
vi.mock('../db.js', () => ({
  pool: { ...mocks, getConnection: async () => mocks },
}))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: vi.fn() }))
const moduleUid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const transactionUid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const qc: AuthContext = {
  id: 7,
  uid: moduleUid,
  name: 'QC test',
  email: null,
  roles: ['QC'],
  permissions: [
    'production.view',
    'production.scan',
    'production.correct',
    'production.export',
  ],
  siteAccess: ['KLATEN'],
  productionModuleAccess: [moduleUid],
}

async function request(
  path: string,
  method = 'GET',
  context = qc,
  body?: unknown
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = context
    next()
  })
  app.use('/api/production', productionTransactionsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/production${path}`,
      {
        method,
        headers: {
          'content-type': 'application/json',
          'X-Production-Device-Token': 'a'.repeat(43),
          connection: 'close',
        },
        body: body ? JSON.stringify(body) : undefined,
      }
    )
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

const businessDate = '2026-11-09'
function terminalQuery(sql: string) {
  if (sql.includes('FROM scan_devices'))
    return [
      [
        {
          id: 9,
          siteId: 1,
          site: 'KLATEN',
          siteName: 'Klaten',
          isActive: 1,
          activatedAt: businessDate,
        },
      ],
    ]
  if (sql.includes('UTC_TIMESTAMP'))
    return [
      [
        {
          businessDate,
          transactionTimestamp: `${businessDate} 09:00:00.000`,
          serverTime: `${businessDate}T09:00:00+07:00`,
        },
      ],
    ]
  if (sql.includes('INFORMATION_SCHEMA.COLUMNS'))
    return [[{ hasHistoryStatus: 1 }]]
  return [[]]
}
function assertPlaceholdersMatch() {
  for (const [sql, values] of mocks.query.mock.calls) {
    expect(String(sql).match(/\?/g)?.length ?? 0, String(sql)).toBe(
      (values as unknown[] | undefined)?.length ?? 0
    )
  }
}

describe('QC transaction module boundaries', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.query.mockResolvedValue([[]])
  })
  it.each([
    ['/transactions/export', 'GET'],
    ['/transactions/EXPORT/', 'GET'],
    ['/transactions/batch-delete/summary', 'POST'],
    ['/transactions/batch-delete', 'POST'],
    ['/transactions/import/preview', 'POST'],
    ['/transactions/import/template-employees', 'GET'],
    ['/transactions/import', 'POST'],
    ['/transactions/historical-preview', 'POST'],
    ['/transactions/historical', 'POST'],
  ])(
    'denies %s even with stale excessive permissions',
    async (path, method) => {
      expect((await request(path, method)).status).toBe(403)
      expect(mocks.query).not.toHaveBeenCalled()
      expect(mocks.execute).not.toHaveBeenCalled()
    }
  )
  it.each([true, false])(
    'limits list and every aggregate to site, snapshot, pair and revision scope (modules=%s)',
    async (assigned) => {
      const context = {
        ...qc,
        productionModuleAccess: assigned ? [moduleUid] : [],
      }
      expect(
        (await request('/transactions?site=KLATEN', 'GET', context)).status
      ).toBe(200)
      expect(mocks.query).toHaveBeenCalledTimes(4)
      for (const [sql, values] of mocks.query.mock.calls) {
        expect(sql).toContain('s.code IN (?)')
        expect(sql).toContain('production_transaction_pairs qc_pair')
        expect(sql).toContain('production_transaction_revisions qc_revision')
        expect(sql).toContain(assigned ? 'pt.production_module_id' : '1=0')
        expect(values).toContain('KLATEN')
        expect(String(sql).match(/\?/g)?.length).toBe(values.length)
      }
      expect(mocks.execute).not.toHaveBeenCalled()
    }
  )
  it('only offers assigned module options and denies a foreign site before reading', async () => {
    expect(
      (await request('/transactions/module-options?site=KLATEN')).status
    ).toBe(200)
    expect(mocks.query.mock.calls[0][1]).toEqual([
      'KLATEN',
      moduleUid,
      'KLATEN',
    ])
    mocks.query.mockClear()
    expect(
      (await request('/transactions/module-options?site=SEMARANG')).status
    ).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it.each(['/terminal/lookup', '/terminal/post'])(
    'rejects a scanned worker outside permitted modules before attendance and writes: %s',
    async (path) => {
      mocks.query
        .mockResolvedValueOnce([
          [
            {
              id: 9,
              siteId: 1,
              site: 'KLATEN',
              isActive: 1,
              activatedAt: '2026-11-09',
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              businessDate: '2026-11-09',
              transactionTimestamp: '2026-11-09 09:00:00',
            },
          ],
        ])
      if (path.endsWith('/post')) mocks.query.mockResolvedValueOnce([[]])
      mocks.query
        .mockResolvedValueOnce([[{ id: 21, uid: transactionUid }]])
        .mockResolvedValueOnce([
          [
            {
              siteId: 1,
              allowsProduction: 1,
              payrollBasis: 'PIECE_RATE',
              productionModuleUid: transactionUid,
            },
          ],
        ])
      const response = await request(
        path,
        'POST',
        qc,
        path.endsWith('/lookup')
          ? { barcode: 'TEST-WORKER' }
          : {
              barcode: 'TEST-WORKER',
              jobUid: moduleUid,
              quantity: '500',
              idempotencyKey: transactionUid,
            }
      )
      expect(response.status, JSON.stringify(response.body)).toBe(403)
      expect(mocks.execute).not.toHaveBeenCalled()
      expect(mocks.commit).not.toHaveBeenCalled()
      expect(mocks.rollback).toHaveBeenCalledOnce()
      expect(
        mocks.query.mock.calls.some(([sql]) =>
          String(sql).includes('FROM attendance_records')
        )
      ).toBe(false)
    }
  )
  it('filters recent deposits before returning paired metadata', async () => {
    mocks.query.mockImplementation(terminalQuery)
    expect((await request('/terminal/recent')).status).toBe(200)
    const recent = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('LIMIT 5')
    )
    expect(recent?.[0]).toContain('pt.production_module_id')
    expect(recent?.[1]).toEqual([9, 1, moduleUid, moduleUid, moduleUid])
    assertPlaceholdersMatch()
  })

  it('keeps card summary placeholders ordered across snapshot and attendance module predicates', async () => {
    mocks.query.mockImplementation(terminalQuery)
    expect((await request('/terminal/daily-summary')).status).toBe(200)
    const summary = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('presentEmployees')
    )
    expect(summary?.[1]).toEqual([
      moduleUid,
      moduleUid,
      moduleUid,
      businessDate,
      businessDate,
      businessDate,
      1,
      businessDate,
      businessDate,
      moduleUid,
    ])
    assertPlaceholdersMatch()
  })

  it.each(['PRESENT', 'PENDING', 'SUBMITTED'])(
    'scopes %s employee drilldown count and items with correct SQL placeholders',
    async (condition) => {
      mocks.query.mockImplementation(terminalQuery)
      expect(
        (
          await request(
            `/terminal/daily-summary/employees?sectionUid=${transactionUid}&condition=${condition}&search=Sample`
          )
        ).status
      ).toBe(200)
      const membership = mocks.query.mock.calls.filter(([sql]) =>
        String(sql).includes('FROM attendance_records attendance')
      )
      expect(membership).toHaveLength(2)
      for (const [sql, values] of membership) {
        expect(sql).toContain('mapping.production_module_id')
        expect(values).toEqual(
          expect.arrayContaining([moduleUid, transactionUid, '%Sample%'])
        )
        if (condition !== 'PRESENT')
          expect(sql).toContain('transaction_row.production_module_id')
        if (condition === 'SUBMITTED' && String(sql).includes('LIMIT ?'))
          expect(sql).toContain('pt.production_module_id')
      }
      assertPlaceholdersMatch()
    }
  )

  it.each([
    ['GET', `/transactions/${transactionUid}`],
    ['GET', `/transactions/${transactionUid}/correction-context`],
    ['POST', `/transactions/${transactionUid}/correction-preview`],
    ['POST', `/transactions/${transactionUid}/void-preview`],
  ])(
    'denies inaccessible managed transaction before payroll/revision reads: %s %s',
    async (method, path) => {
      mocks.query.mockImplementation((sql: string) =>
        sql.includes('WHERE pt.uid=?')
          ? [[{ id: 21, uid: transactionUid }]]
          : terminalQuery(sql)
      )
      const response = await request(
        path,
        method,
        qc,
        method === 'POST'
          ? path.endsWith('/void-preview')
            ? {}
            : { jobUid: moduleUid, quantity: '10' }
          : undefined
      )
      expect(response.status).toBe(404)
      expect(
        mocks.query.mock.calls.some(([sql]) =>
          String(sql).includes(
            'SELECT pt.id FROM production_transactions pt WHERE pt.id=?'
          )
        )
      ).toBe(true)
      expect(
        mocks.query.mock.calls.some(([sql]) =>
          String(sql).includes('FROM payroll_')
        )
      ).toBe(false)
      expect(mocks.execute).not.toHaveBeenCalled()
      assertPlaceholdersMatch()
    }
  )
})
