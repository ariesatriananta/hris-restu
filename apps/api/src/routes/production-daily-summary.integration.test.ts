import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { productionDailySummaryRouter } from './production-daily-summary.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  today: vi.fn(() => '2026-11-10'),
  authenticate: vi.fn(),
}))
vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))
vi.mock('../lib/contract-lifecycle.js', () => ({ businessDate: mocks.today }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    mocks.authenticate()
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
      )
        return res.status(403).json({ message: 'Izin ditolak.' })
      next()
    },
}))
const jobUid = '11111111-1111-4111-8111-111111111111'
const moduleUid = '22222222-2222-4222-8222-222222222222'
const employeeUid = '33333333-3333-4333-8333-333333333333'
const siteUid = '44444444-4444-4444-8444-444444444444'
const unitUid = '55555555-5555-4555-8555-555555555555'
const transactionUid = '66666666-6666-4666-8666-666666666666'
const auth = (override: Partial<AuthContext> = {}): AuthContext => ({
  id: 1,
  uid: 'user',
  name: 'Test',
  email: null,
  roles: ['QC'],
  permissions: ['production.view'],
  siteAccess: ['KLATEN'],
  productionModuleAccess: [moduleUid],
  ...override,
})
type UnitTotals = {
  unitCode: string
  quantity: string
  grossAmount?: string
  decimalPrecision: number
}
type TestBody = {
  tabs: {
    employeeCount: number
    transactionCount: number
    units: UnitTotals[]
  }[]
  items: {
    uid: string
    quantity: string
    payableQuantity: string
    unit: { decimalPrecision: number }
    lastSubmittedAt: string
    modules: { uid: string; code: string; name: string }[]
    qc: unknown
  }[]
  summary: { units: UnitTotals[] }
}
async function request(path: string, context = auth()) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.auth = context
    next()
  })
  app.use('/api/production', productionDailySummaryRouter)
  app.get('/api/production/other', (_req, res) => res.json({ untouched: true }))
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/production${path}`
    )
    return {
      status: response.status,
      body: (await response.json()) as TestBody,
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}
const aggregate = {
  jobUid,
  jobCode: 'LINTING',
  jobName: 'Linting',
  unitUid,
  unitCode: 'PCS',
  unitName: 'Pcs',
  decimalPrecision: 0,
  employeeCount: 1,
  transactionCount: 2,
  quantity: '1000.0000',
  payableQuantity: '970.0000',
  rejectOccurrences: '12',
  grossAmount: '12345.67',
}
const worker = {
  ...aggregate,
  employeeUid,
  employeeNumber: 'TEST-001',
  fullName: 'Pegawai Uji',
  siteUid,
  siteCode: 'KLATEN',
  siteName: 'Klaten',
  lastSubmittedAt: '2026-11-10T12:00:00+07:00',
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.today.mockReturnValue('2026-11-10')
  mocks.query.mockResolvedValue([[]])
})

describe('Ringkasan Produksi: scope and date authorization', () => {
  it('does not reauthenticate unrelated production routes', async () => {
    expect((await request('/other')).body).toEqual({ untouched: true })
    expect(mocks.authenticate).not.toHaveBeenCalled()
  })
  it('requires production.view even for HR', async () => {
    expect(
      (
        await request(
          '/daily-summary',
          auth({ roles: ['HR_OFFICER'], permissions: [] })
        )
      ).status
    ).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it.each([
    'QC',
    'DIRECTOR',
    'PRODUCTION_ADMIN',
    'PAYROLL_FINANCE',
    'SITE_SUPERVISOR',
  ])(
    '%s cannot select yesterday or tomorrow through any endpoint',
    async (role) => {
      for (const path of [
        '/daily-summary',
        '/daily-summary/employees',
        `/daily-summary/employees/${employeeUid}/transactions`,
      ]) {
        for (const date of ['2026-11-09', '2026-11-11']) {
          expect(
            (
              await request(
                `${path}?date=${date}&jobUid=${jobUid}`,
                auth({ roles: [role] })
              )
            ).status
          ).toBe(403)
        }
      }
      expect(mocks.query).not.toHaveBeenCalled()
    }
  )
  it.each(['HR_OFFICER', 'SUPER_ADMIN'])(
    '%s can choose a valid historical date',
    async (role) => {
      const response = await request(
        '/daily-summary?date=2026-10-01',
        auth({ roles: [role] })
      )
      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        effectiveDate: '2026-10-01',
        serverToday: '2026-11-10',
        canChangeDate: true,
        canViewWages: true,
      })
      expect(mocks.query.mock.calls[0][1][0]).toBe('2026-10-01')
    }
  )
  it('enforces site intersection, denies an explicit inaccessible site before querying', async () => {
    expect((await request('/daily-summary?site=SEMARANG')).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it.each([
    'date=2026-02-30',
    'moduleUid=not-a-uuid',
    'site=OTHER',
    'page=0',
    'pageSize=501',
    'page=1.2',
    'date=2026-11-10&date=2026-11-10',
  ])('rejects invalid query %s', async (query) => {
    expect((await request(`/daily-summary?${query}`)).status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('fails closed for empty site/module access and uses frozen module plus inaccessible peer protections', async () => {
    const result = await request(
      '/daily-summary',
      auth({ siteAccess: [], productionModuleAccess: [] })
    )
    expect(result.status).toBe(200)
    expect(result.body.tabs).toEqual([])
    const [sql, params] = mocks.query.mock.calls[0]
    expect(sql).toContain('s.code IN (NULL)')
    expect(sql).toContain('(1=0 AND NOT EXISTS')
    expect(sql).toContain('production_transaction_pairs')
    expect(sql).toContain('production_transaction_revisions')
    expect(sql).not.toContain('employee_employment_histories')
    expect(params).toEqual(['2026-11-10'])
  })
  it('binds all date/site/QC/module placeholders and omits financial SELECT for QC', async () => {
    await request(`/daily-summary?site=KLATEN&moduleUid=${moduleUid}`)
    for (const [sql, values] of mocks.query.mock.calls) {
      expect(values).toEqual([
        '2026-11-10',
        'KLATEN',
        'KLATEN',
        moduleUid,
        moduleUid,
        moduleUid,
        moduleUid,
      ])
      expect(sql.match(/\?/g)?.length).toBe(values.length)
      expect(sql).toContain('permitted_module.id=pt.production_module_id')
      expect(sql).toContain("pt.status='POSTED'")
      expect(sql).not.toContain('gross_amount')
      expect(sql).not.toContain('rate_snapshot')
    }
  })
  it('QC plus Director still cannot escape assigned sites through role combinations', async () => {
    const context = auth({ roles: ['QC', 'DIRECTOR'] })
    expect(
      (await request('/daily-summary?site=SEMARANG', context)).status
    ).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
    await request('/daily-summary', context)
    expect(mocks.query.mock.calls[0][0]).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0][1]).toContain('KLATEN')
  })
  it('supports repeated site/module filters with deduplication and literal parameter binding', async () => {
    const response = await request(
      `/daily-summary?site=KLATEN&site=KLATEN&moduleUid=${moduleUid}&moduleUid=${moduleUid}`
    )
    expect(response.status).toBe(200)
    expect(mocks.query.mock.calls[0][1]).toEqual([
      '2026-11-10',
      'KLATEN',
      'KLATEN',
      moduleUid,
      moduleUid,
      moduleUid,
      moduleUid,
    ])
  })
  it('Director retains global site visibility but not wages or date-changing capability', async () => {
    const response = await request(
      '/daily-summary?site=SEMARANG',
      auth({ roles: ['DIRECTOR'] })
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      canChangeDate: false,
      canViewWages: false,
    })
    expect(mocks.query.mock.calls[0][1]).toEqual(['2026-11-10', 'SEMARANG'])
  })
})

describe('Ringkasan Produksi: grouped totals and pagination', () => {
  it('keeps job tabs stable under search, separates units, counts each worker once', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          aggregate,
          {
            ...aggregate,
            unitUid: transactionUid,
            unitCode: 'KG',
            unitName: 'Kg',
            quantity: '2.0000',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ jobUid, employeeCount: 1 }]])
    const result = await request(
      `/daily-summary?query=absent&jobUid=${transactionUid}`
    )
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      canChangeDate: false,
      canViewWages: false,
    })
    expect(result.body.tabs).toHaveLength(1)
    expect(result.body.tabs[0]).toMatchObject({
      employeeCount: 1,
      transactionCount: 4,
    })
    expect(
      result.body.tabs[0].units.map((row: { unitCode: string }) => row.unitCode)
    ).toEqual(['PCS', 'KG'])
    expect(result.body.tabs[0].units[0].quantity).toBe('1000.0000')
    expect(result.body.tabs[0].units[0].decimalPrecision).toBe(0)
    expect(result.body.tabs[0].units[0]).not.toHaveProperty('grossAmount')
    expect(mocks.query.mock.calls[0][0]).not.toContain('LIKE')
    expect(mocks.query.mock.calls[0][1]).not.toContain(transactionUid)
    expect(mocks.query.mock.calls[1][0]).toContain(
      'COUNT(DISTINCT pt.employee_id)'
    )
  })
  it('returns HR wage decimals without precision loss', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [{ ...aggregate, grossAmount: '9999999999999999.99' }],
      ])
      .mockResolvedValueOnce([[{ jobUid, employeeCount: 1 }]])
    const response = await request(
      '/daily-summary',
      auth({ roles: ['HR_OFFICER'] })
    )
    expect(response.body.tabs[0].units[0].grossAmount).toBe(
      '9999999999999999.99'
    )
    expect(mocks.query.mock.calls[0][0]).toContain('SUM(pt.gross_amount)')
  })
  it('requires a job for the worker and detail queries', async () => {
    expect((await request('/daily-summary/employees')).status).toBe(422)
    expect(
      (await request(`/daily-summary/employees/${employeeUid}/transactions`))
        .status
    ).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('paginates in SQL and maintains scoped site/unit-specific module badges', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 120 }]])
      .mockResolvedValueOnce([[aggregate]])
      .mockResolvedValueOnce([[worker]])
      .mockResolvedValueOnce([
        [
          {
            employeeUid,
            siteUid,
            unitUid,
            moduleUid,
            moduleCode: 'M1',
            moduleName: 'Modul 1',
          },
          {
            employeeUid,
            siteUid,
            unitUid: transactionUid,
            moduleUid,
            moduleCode: 'OTHER',
            moduleName: 'Other unit',
          },
        ],
      ])
    const response = await request(
      `/daily-summary/employees?jobUid=${jobUid}&moduleUid=${moduleUid}&page=2&pageSize=50&query=A%25_!`
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ total: 120, page: 2, pageSize: 50 })
    expect(response.body.items[0]).toMatchObject({
      employee: {
        uid: employeeUid,
        employeeNumber: 'TEST-001',
        fullName: 'Pegawai Uji',
      },
      quantity: '1000.0000',
      rejectOccurrences: 12,
    })
    expect(response.body.items[0].modules).toEqual([
      { uid: moduleUid, code: 'M1', name: 'Modul 1' },
    ])
    expect(response.body.items[0].lastSubmittedAt).toBe(
      '2026-11-10T12:00:00+07:00'
    )
    expect(response.body.items[0].unit.decimalPrecision).toBe(0)
    expect(response.body.items[0]).not.toHaveProperty('id')
    expect(response.body.items[0]).not.toHaveProperty('grossAmount')
    expect(response.body.summary.units[0].quantity).toBe('1000.0000')
    for (const [sql, values] of mocks.query.mock.calls) {
      expect(sql).toContain("pt.status='POSTED'")
      expect(sql).toContain('production_transaction_pairs')
      expect(sql.match(/\?/g)?.length).toBe(values.length)
      expect(values).toContain('%A!%!_!!%')
    }
    const [pageSql, pageValues] = mocks.query.mock.calls[2]
    expect(pageSql).toContain(
      'GROUP BY e.uid,e.employee_number,e.full_name,s.uid'
    )
    expect(pageSql).toContain('LIMIT ? OFFSET ?')
    expect(pageSql).toContain(
      'ORDER BY e.full_name,e.employee_number,e.uid,s.uid,u.uid'
    )
    expect(pageValues.slice(-2)).toEqual([50, 50])
    expect(pageSql).toContain('SUM((SELECT COALESCE(SUM(d.quantity),0)')
    expect(pageSql).not.toMatch(/LEFT JOIN production_transaction_qc_defects/)
  })
  it('returns empty list with default pagination and no module expansion query', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
    const result = await request(`/daily-summary/employees?jobUid=${jobUid}`)
    expect(result.body).toMatchObject({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      summary: { units: [] },
    })
    expect(mocks.query).toHaveBeenCalledTimes(3)
  })
})

describe('Ringkasan Produksi: paged setoran details', () => {
  it('returns 404 for inaccessible/missing employee/job/date without revealing existence', async () => {
    mocks.query.mockResolvedValueOnce([[{ total: 0 }]])
    expect(
      (
        await request(
          `/daily-summary/employees/${employeeUid}/transactions?jobUid=${jobUid}`
        )
      ).status
    ).toBe(404)
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(mocks.query.mock.calls[0][1]).toContain(employeeUid)
    expect(mocks.query.mock.calls[0][0]).toContain(
      'production_transaction_revisions'
    )
  })
  it('returns only public identifiers, stored QC snapshots and page-local weights/defects', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([
        [
          {
            ...worker,
            id: 11,
            uid: transactionUid,
            transactionNumber: 'TEST-PRD',
            transactionAt: worker.lastSubmittedAt,
            deductionPercentage: '3.0000',
            rateSnapshot: '9',
            moduleUid,
            moduleCode: 'M1',
            moduleName: 'Modul 1',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 20,
            transactionId: 11,
            brandUid: jobUid,
            brandCode: 'B01',
            brandName: 'Brand snapshot',
            weight1Grams: '72.50',
            weight2Grams: '73.00',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            qcId: 20,
            uid: unitUid,
            code: 'D01',
            name: 'Defect snapshot',
            sortOrder: 1,
            quantity: 5,
          },
        ],
      ])
    const response = await request(
      `/daily-summary/employees/${employeeUid}/transactions?jobUid=${jobUid}&unitUid=${unitUid}&pageSize=1`
    )
    expect(response.status).toBe(200)
    const item = response.body.items[0]
    expect(item).toMatchObject({
      uid: transactionUid,
      quantity: '1000.0000',
      payableQuantity: '970.0000',
      deductionPercentage: '3.0000',
      status: 'POSTED',
      qc: {
        weight1Grams: '72.50',
        weight2Grams: '73.00',
        brand: { name: 'Brand snapshot' },
        defects: [{ name: 'Defect snapshot', quantity: 5 }],
      },
    })
    expect(item).not.toHaveProperty('id')
    expect(item).not.toHaveProperty('grossAmount')
    expect(item).not.toHaveProperty('rateSnapshot')
    expect(item.qc).not.toHaveProperty('id')
    expect(mocks.query.mock.calls[2][1]).toEqual([11])
    expect(mocks.query.mock.calls[3][1]).toEqual([20])
    expect(mocks.query.mock.calls[0][1].slice(-3)).toEqual([
      jobUid,
      unitUid,
      employeeUid,
    ])
  })
  it('HR detail keeps financial snapshots and remains site restricted', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([
        [
          {
            ...worker,
            id: 11,
            uid: transactionUid,
            deductionPercentage: '3',
            rateSnapshot: '12.3456',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
    const response = await request(
      `/daily-summary/employees/${employeeUid}/transactions?jobUid=${jobUid}&date=2026-11-01`,
      auth({ roles: ['HR_OFFICER'] })
    )
    expect(response.body.items[0]).toMatchObject({
      grossAmount: '12345.67',
      rateSnapshot: '12.3456',
      qc: null,
    })
    expect(mocks.query.mock.calls[0][1]).toEqual([
      '2026-11-01',
      'KLATEN',
      jobUid,
      employeeUid,
    ])
  })
})
