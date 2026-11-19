import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { buildAttendanceRate } from '../lib/attendance-rate.js'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { attendanceRateRouter } from './attendance-rate.js'

const mock = vi.hoisted(() => ({
  query: vi.fn(),
  connectionQuery: vi.fn(),
  getConnection: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}))
vi.mock('../db.js', () => ({
  pool: { query: mock.query, getConnection: mock.getConnection },
}))
vi.mock('../lib/contract-lifecycle.js', () => ({
  businessDate: () => '2026-11-19',
}))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}))
const context = (patch: Partial<AuthContext> = {}): AuthContext => ({
  id: 1,
  uid: 'user',
  name: 'Test',
  email: null,
  roles: ['HR_OFFICER'],
  permissions: ['attendance.view', 'production.view'],
  siteAccess: ['KLATEN'],
  ...patch,
})
async function request(path: string, auth = context()) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.auth = auth
    next()
  })
  app.use('/api/attendance-rate', attendanceRateRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/attendance-rate${path}`
    )
    return {
      status: response.status,
      cache: response.headers.get('cache-control'),
      body: (await response.json()) as {
        sites: Array<{ uid: string; code: string; name: string }>
        data: ReturnType<typeof buildAttendanceRate>
        meta: { serverToday: string }
      },
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}
function fixtures(sql: string) {
  if (sql.startsWith('SELECT id,uid,code,name FROM sites'))
    return [{ id: 3, uid: 'site-public', code: 'KLATEN', name: 'Klaten' }]
  if (sql.startsWith('SELECT id,uid,code,name FROM production_jobs'))
    return [
      { id: 10, uid: 'job-public', code: 'BORONGAN-LINTING', name: 'Linting' },
    ]
  if (sql.startsWith('SELECT id,site_id siteId'))
    return [
      { id: 20, siteId: 3, uid: 'module-public', code: 'A', name: 'Modul A' },
    ]
  if (sql.includes('FROM employee_employment_histories h'))
    return [
      {
        id: 30,
        employeeId: 40,
        siteId: 3,
        employeeType: 'TRAINING',
        employeeStatus: 'ACTIVE',
        status: 'ACTIVE',
        effectiveFrom: '2026-11-01',
        effectiveTo: null,
        moduleId: 20,
        moduleSiteId: 3,
      },
    ]
  if (sql.includes('FROM employee_job_assignments a'))
    return [
      {
        id: 50,
        employeeId: 40,
        siteId: 3,
        jobId: 10,
        status: 'ACTIVE',
        isPrimary: 1,
        effectiveFrom: '2026-11-01',
        effectiveTo: null,
      },
    ]
  if (sql.includes('FROM attendance_records\n'))
    return [
      { employeeId: 40, siteId: 3, date: '2026-11-19', status: 'PRESENT' },
      { employeeId: 40, siteId: 3, date: '2026-11-09', status: 'PRESENT' },
    ]
  if (sql.includes('FROM production_transactions pt'))
    return [
      {
        id: 60,
        employeeId: 40,
        siteId: 3,
        date: '2026-11-09',
        jobId: 10,
        moduleId: 20,
        brandId: 70,
        brandSiteId: 3,
        quantity: '9600.0000',
        unitCode: 'PCS',
        status: 'POSTED',
      },
    ]
  if (sql.includes("SELECT 'MODULE' kind"))
    return [
      {
        kind: 'MODULE',
        entityId: 20,
        category: 'REGULER',
        effectiveFrom: '2026-11-01',
        effectiveTo: null,
      },
      {
        kind: 'BRAND',
        entityId: 70,
        category: 'REGULER',
        effectiveFrom: '2026-11-01',
        effectiveTo: null,
      },
    ]
  return []
}
beforeEach(() => {
  vi.clearAllMocks()
  mock.query.mockResolvedValue([
    [{ uid: 'site-public', code: 'KLATEN', name: 'Klaten' }],
  ])
  mock.getConnection.mockResolvedValue({
    query: mock.connectionQuery,
    commit: mock.commit,
    rollback: mock.rollback,
    release: mock.release,
  })
  mock.connectionQuery.mockImplementation(async (sql: string) => [
    fixtures(sql),
  ])
  mock.commit.mockResolvedValue(undefined)
  mock.rollback.mockResolvedValue(undefined)
})
describe('Attendance Rate access and source contract', () => {
  it.each([
    { roles: ['QC'], permissions: ['attendance.view', 'production.view'] },
    { roles: ['HR_OFFICER', 'QC'] },
    { roles: ['PRODUCTION_ADMIN'] },
    { roles: ['DIRECTOR'] },
    { permissions: ['attendance.view'] },
    { permissions: ['production.view'] },
  ])(
    'rejects unauthorized role/permission before any source query (%j)',
    async (patch) => {
      const result = await request('?site=KLATEN', context(patch))
      expect(result.status).toBe(403)
      expect(mock.getConnection).not.toHaveBeenCalled()
      expect(mock.query).not.toHaveBeenCalled()
    }
  )
  it.each([
    '',
    '?site=KLATEN,SEMARANG',
    '?site=KLATEN&site=SEMARANG',
    '?site=OTHER',
    '?site=KLATEN&date=2026-02-30',
    '?site=KLATEN&date=2026-11-20',
    '?site=KLATEN&date=1000-01-01',
  ])('rejects invalid query without fetching sources: %s', async (path) => {
    expect((await request(path)).status).toBe(422)
    expect(mock.getConnection).not.toHaveBeenCalled()
  })
  it('denies HR outside site scope', async () => {
    expect((await request('?site=SEMARANG')).status).toBe(403)
    expect(mock.getConnection).not.toHaveBeenCalled()
  })
  it('filters options to active sites granted to HR', async () => {
    const result = await request('/options')
    expect(result.status).toBe(200)
    expect(result.body.sites).toEqual([
      { uid: 'site-public', code: 'KLATEN', name: 'Klaten' },
    ])
    expect(mock.query.mock.calls[0][0]).toContain('is_active=1 AND code IN (?)')
    expect(mock.query.mock.calls[0][1]).toEqual(['KLATEN'])
    expect(result.cache).toBe('private, no-store')
  })
  it('returns no HR options with an empty site grant', async () => {
    mock.query.mockResolvedValue([[]])
    const result = await request('/options', context({ siteAccess: [] }))
    expect(result.body.sites).toEqual([])
    expect(mock.query.mock.calls[0][0]).toContain('code IN (NULL)')
  })
  it('allows superadmin without per-site grants or permissions', async () => {
    const result = await request(
      '?site=KLATEN',
      context({ roles: ['SUPER_ADMIN', 'QC'], siteAccess: [], permissions: [] })
    )
    expect(result.status).toBe(200)
    expect(result.body.meta.serverToday).toBe('2026-11-19')
  })
  it('reads bounded historical sources in a single read-only consistent transaction', async () => {
    const result = await request('?site=KLATEN')
    expect(result.status).toBe(200)
    expect(result.cache).toBe('private, no-store')
    expect(
      result.body.data.totals.find((row) => row.employeeType === 'TOTAL')
    ).toMatchObject({ present: 1, roster: 1, ratePercent: '100.00' })
    expect(
      result.body.data.averages.find(
        (row) =>
          row.job.code === 'BORONGAN-LINTING' &&
          row.employeeType === 'TRAINING' &&
          row.category === 'REGULER'
      )
    ).toMatchObject({
      quantityPcs: '9600.0000',
      presentDays: 1,
      averagePcs: '9600.0000',
    })
    expect(
      result.body.data.estimates
        .find((row) => row.job.code === 'BORONGAN-LINTING')
        ?.categories.find((row) => row.category === 'REGULER')
    ).toMatchObject({ present: 1, estimatedPcs: '9600.0000', boxes: '1.00' })
    const calls = mock.connectionQuery.mock.calls
    expect(calls[0][0]).toBe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    expect(calls[1][0]).toBe(
      'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY'
    )
    expect(calls).toHaveLength(10)
    const employmentSql = calls.find(([sql]) =>
      sql.includes('FROM employee_employment_histories h')
    )![0]
    expect(employmentSql).not.toContain('h.site_id=?')
    expect(employmentSql).not.toContain('current_')
    const assignmentSql = calls.find(([sql]) =>
      sql.includes('FROM employee_job_assignments a')
    )![0]
    expect(assignmentSql).not.toContain('a.site_id=?')
    const productionCall = calls.find(([sql]) =>
      sql.includes('FROM production_transactions pt')
    )!
    expect(productionCall[1]).toEqual([3, '2026-11-09', '2026-11-15'])
    expect(productionCall[0]).toContain("pt.status='POSTED'")
    expect(productionCall[0]).toContain('CAST(pt.quantity AS CHAR)')
    expect(productionCall[0]).not.toContain('payable_quantity')
    expect(productionCall[0]).not.toContain('gross_amount')
    expect(
      calls.find(([sql]) => sql.includes("SELECT 'MODULE' kind"))![0]
    ).not.toContain('is_active')
    expect(mock.commit).toHaveBeenCalledOnce()
    expect(mock.rollback).not.toHaveBeenCalled()
    expect(mock.release).toHaveBeenCalledOnce()
    const serialized = JSON.stringify(result.body)
    expect(serialized).not.toContain('employeeId')
    expect(serialized).not.toContain('siteId')
    expect(serialized).not.toContain('moduleId')
  })
  it('uses the preceding full week even when selected date is Sunday', async () => {
    expect((await request('?site=KLATEN&date=2026-11-15')).status).toBe(200)
    expect(
      mock.connectionQuery.mock.calls.find(([sql]) =>
        sql.includes('FROM production_transactions pt')
      )![1]
    ).toEqual([3, '2026-11-02', '2026-11-08'])
  })
  it('rolls back and releases on inactive/missing site', async () => {
    mock.connectionQuery.mockImplementation(async (sql: string) => [
      sql.startsWith('SELECT id,uid,code,name FROM sites') ? [] : fixtures(sql),
    ])
    expect((await request('?site=KLATEN')).status).toBe(404)
    expect(mock.rollback).toHaveBeenCalledOnce()
    expect(mock.release).toHaveBeenCalledOnce()
    expect(mock.commit).not.toHaveBeenCalled()
  })
  it('rolls back and releases after a source query fails', async () => {
    mock.connectionQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM production_transactions pt'))
        throw new Error('mock query failure')
      return [fixtures(sql)]
    })
    const result = await request('?site=KLATEN')
    expect(result.status).toBe(500)
    expect(mock.rollback).toHaveBeenCalledOnce()
    expect(mock.release).toHaveBeenCalledOnce()
    expect(mock.commit).not.toHaveBeenCalled()
    expect(JSON.stringify(result.body)).not.toContain('mock query failure')
  })
})
