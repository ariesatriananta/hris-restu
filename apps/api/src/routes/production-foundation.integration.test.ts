import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { productionFoundationRouter } from './production-foundation.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
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

function auth(options: { permissions?: string[]; roles?: string[]; sites?: string[] } = {}): AuthContext {
  return {
    id: 7,
    uid: 'production-user',
    name: 'Production User',
    email: null,
    roles: options.roles ?? ['PRODUCTION_ADMIN'],
    permissions: options.permissions ?? ['production.view'],
    siteAccess: options.sites ?? ['JEPARA'],
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
  app.use('/api/production-structure', productionFoundationRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/production-structure${path}`, {
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

describe('Production foundation API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.beginTransaction.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined)
    mocks.release.mockReturnValue(undefined)
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }])
  })

  it('menolak pembacaan tanpa production.view sebelum query database', async () => {
    const response = await request('/work-units', {
      auth: auth({ permissions: [] }),
    })

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('memuat karyawan eligible beserta assignment tanpa fungsi JSON agregat', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([
        [
          {
            employeeId: 42,
            uid: '33333333-3333-4333-8333-333333333333',
            employeeNumber: 'J3108-001',
            fullName: 'Ariel Peterpan',
            site: 'JEPARA',
            employeeType: 'BORONGAN',
            productionSectionUid: '44444444-4444-4444-8444-444444444444',
            productionSectionCode: 'LINTING',
            productionSectionName: 'Linting',
            assignmentCount: 1,
            hasPrimary: 1,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            employeeId: 42,
            uid: '55555555-5555-4555-8555-555555555555',
            jobUid: '66666666-6666-4666-8666-666666666666',
            jobCode: 'BORONGAN-LINTING',
            jobName: 'Linting',
            isPrimary: 1,
            unitUid: '77777777-7777-4777-8777-777777777777',
            unitCode: 'PCS',
            unitName: 'Pcs / Batang',
            decimalPrecision: 0,
            rateUid: '88888888-8888-4888-8888-888888888888',
            rateAmount: '925.0000',
            currency: 'IDR',
          },
        ],
      ])

    const response = await request(
      '/eligible-employees?site=JEPARA&asOf=2026-08-21&page=1&pageSize=20',
      { auth: auth({ sites: ['JEPARA'] }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledTimes(3)
    expect(String(mocks.query.mock.calls[1]?.[0])).not.toContain('JSON_ARRAYAGG')
    expect(String(mocks.query.mock.calls[2]?.[0])).toContain(
      'a.employee_id IN (?)'
    )
    expect(mocks.query.mock.calls[2]?.[1]).toEqual([
      'JEPARA',
      '2026-08-21',
      '2026-08-21',
      42,
      '2026-08-21',
      '2026-08-21',
      '2026-08-21',
      '2026-08-21',
    ])
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      items: [
        {
          uid: '33333333-3333-4333-8333-333333333333',
          fullName: 'Ariel Peterpan',
          assignments: [
            {
              uid: '55555555-5555-4555-8555-555555555555',
              jobCode: 'BORONGAN-LINTING',
              isPrimary: true,
              unit: { code: 'PCS', decimalPrecision: 0 },
              rate: { amount: '925.0000', currency: 'IDR' },
            },
          ],
        },
      ],
    })
  })

  it('membatasi readiness ke site milik Production Admin', async () => {
    mocks.query.mockResolvedValueOnce([[]])

    const response = await request('/readiness?site=JEPARA', {
      auth: auth({ sites: ['JEPARA'] }),
    })

    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(['JEPARA', 'JEPARA'])
  })

  it('Director membaca readiness global tanpa pembatas site access', async () => {
    mocks.query.mockResolvedValueOnce([[]])

    const response = await request('/readiness', {
      auth: auth({ roles: ['DIRECTOR'], permissions: ['production.view'], sites: [] }),
    })

    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain("s.code IN ('')")
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([])
  })

  it('menolak assignment readiness tanpa production.view sebelum query database', async () => {
    const response = await request('/assignment-readiness', {
      auth: auth({ permissions: [] }),
    })

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('memfilter assignment readiness berdasarkan site, masalah, dan pencarian', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([
        [
          {
            employeeUid: '33333333-3333-4333-8333-333333333333',
            employeeNumber: 'J3108-001',
            fullName: 'Ariel Peterpan',
            employeeType: 'BORONGAN',
            site: 'JEPARA',
            siteName: 'Site Jepara',
            productionSectionUid: '44444444-4444-4444-8444-444444444444',
            productionSectionCode: 'LINTING',
            productionSectionName: 'Linting',
            assignmentCount: 0,
            primaryAssignmentCount: 0,
            primaryJobUid: null,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            employeeType: 'BORONGAN',
            site: 'JEPARA',
            productionSectionUid: '44444444-4444-4444-8444-444444444444',
            productionSectionCode: 'LINTING',
            productionSectionName: 'Linting',
          },
        ],
      ])

    const response = await request(
      '/assignment-readiness?asOf=2026-08-21&site=JEPARA&employeeType=BORONGAN&productionSectionUid=44444444-4444-4444-8444-444444444444&query=Ariel&issue=UNASSIGNED&page=2&pageSize=25',
      { auth: auth({ sites: ['JEPARA'] }) }
    )

    expect(response.status).toBe(200)
    const countSql = String(mocks.query.mock.calls[0]?.[0])
    expect(countSql).toContain('assignmentCount=0')
    expect(countSql).toContain('active_history.employee_id=eh.employee_id')
    expect(countSql.match(/s\.code IN \(\?\)/g)).toHaveLength(2)
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      '2026-08-21',
      '2026-08-21',
      '2026-08-21',
      '2026-08-21',
      '2026-08-21',
      '2026-08-21',
      'JEPARA',
      'JEPARA',
      'BORONGAN',
      '44444444-4444-4444-8444-444444444444',
      '%Ariel%',
      '%Ariel%',
      '%Ariel%',
      '%Ariel%',
      '%Ariel%',
    ])
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 25,
      asOf: '2026-08-21',
      issue: 'UNASSIGNED',
      facets: {
        employeeTypes: ['BORONGAN'],
        productionSections: [
          {
            uid: '44444444-4444-4444-8444-444444444444',
            code: 'LINTING',
            name: 'Linting',
            site: 'JEPARA',
          },
        ],
      },
      items: [
        {
          employee: {
            uid: '33333333-3333-4333-8333-333333333333',
            employeeNumber: 'J3108-001',
            fullName: 'Ariel Peterpan',
            employeeType: 'BORONGAN',
          },
          site: { code: 'JEPARA', name: 'Site Jepara' },
          productionSection: {
            uid: '44444444-4444-4444-8444-444444444444',
            code: 'LINTING',
            name: 'Linting',
          },
          assignmentCount: 0,
          primaryAssignmentCount: 0,
          currentPrimaryJob: null,
          issueCodes: ['UNASSIGNED', 'MISSING_PRIMARY'],
        },
      ],
    })
  })

  it('mengembalikan pekerjaan utama hanya ketika tepat satu assignment utama aktif', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([
        [
          {
            employeeUid: '33333333-3333-4333-8333-333333333333',
            employeeNumber: 'J3108-001',
            fullName: 'Ariel Peterpan',
            employeeType: 'TRAINING',
            site: 'JEPARA',
            siteName: 'Site Jepara',
            productionSectionUid: null,
            assignmentCount: 2,
            primaryAssignmentCount: 1,
            primaryJobUid: '11111111-1111-4111-8111-111111111111',
            primaryJobCode: 'BORONGAN-LINTING',
            primaryJobName: 'Linting',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])

    const response = await request(
      '/assignment-readiness?asOf=2026-08-21&issue=READY',
      { auth: auth({ sites: ['JEPARA'] }) }
    )

    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain(
      'assignmentCount>0 AND primaryAssignmentCount=1'
    )
    const body = (await response.json()) as {
      items: Array<Record<string, unknown>>
    }
    expect(body.items[0]).toMatchObject({
      productionSection: null,
      issueCodes: [],
      currentPrimaryJob: {
        uid: '11111111-1111-4111-8111-111111111111',
        code: 'BORONGAN-LINTING',
        name: 'Linting',
      },
    })
  })

  it('Director dapat membaca assignment readiness lintas site tanpa site access', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])

    const response = await request(
      '/assignment-readiness?asOf=2026-08-21&issue=ALL',
      {
        auth: auth({
          roles: ['DIRECTOR'],
          permissions: ['production.view'],
          sites: [],
        }),
      }
    )

    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain('s.code IN')
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      '2026-08-21',
      '2026-08-21',
      '2026-08-21',
      '2026-08-21',
      '2026-08-21',
      '2026-08-21',
    ])
  })

  it('menolak filter assignment readiness yang tidak dikenal', async () => {
    const response = await request(
      '/assignment-readiness?employeeType=BULANAN&productionSectionUid=bukan-uuid',
      { auth: auth({ sites: ['JEPARA'] }) }
    )

    expect(response.status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('detail assignment karyawan tetap dibatasi site access di SQL', async () => {
    mocks.query.mockResolvedValueOnce([[]])
    const employeeUid = '33333333-3333-4333-8333-333333333333'

    const response = await request(`/assignments/${employeeUid}`, {
      auth: auth({ permissions: ['production.view'], sites: ['KLATEN'] }),
    })

    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([employeeUid, 'KLATEN'])
  })

  it('tarif baru selalu dibuat sebagai Draft walau user punya izin master', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ siteId: 1, jobId: 2, defaultUnitId: 3, unitId: 3 }],
    ])

    const response = await request('/rates', {
      method: 'POST',
      auth: auth({ permissions: ['production.manage_master'], sites: ['JEPARA'] }),
      body: {
        site: 'JEPARA',
        jobUid: '11111111-1111-4111-8111-111111111111',
        unitUid: '22222222-2222-4222-8222-222222222222',
        effectiveFrom: '2026-08-01',
        rateAmount: '1200',
      },
    })

    expect(response.status).toBe(201)
    const insertCall = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO production_job_rates')
    )
    expect(insertCall?.[1]).toContain('DRAFT')
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('penugasan terbuka wajib berada pada histori PIECE_RATE yang juga terbuka', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ employeeId: 10, jobId: 20, siteId: 1 }]])
      .mockResolvedValueOnce([[{ id: 30 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])

    const response = await request('/assignments', {
      method: 'POST',
      auth: auth({ permissions: ['production.manage_master'], sites: ['JEPARA'] }),
      body: {
        employeeUid: '33333333-3333-4333-8333-333333333333',
        jobUid: '11111111-1111-4111-8111-111111111111',
        site: 'JEPARA',
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        isPrimary: true,
        reason: 'Penugasan awal pekerjaan Produksi.',
      },
    })

    expect(response.status).toBe(201)
    const historyCall = mocks.query.mock.calls.find((call) =>
      String(call[0]).includes('FROM employee_employment_histories')
    )
    expect(String(historyCall?.[0])).toContain("et.payroll_basis='PIECE_RATE'")
    expect(String(historyCall?.[0])).toContain('eh.effective_to IS NULL')
    expect(historyCall?.[1]).toEqual([10, 1, '2026-08-01', '2026-08-01', null, null, null])
  })
})
