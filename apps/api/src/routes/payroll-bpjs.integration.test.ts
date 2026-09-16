import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { payrollBpjsRouter } from './payroll-bpjs.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  begin: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}))
const conn = {
  query: mocks.query,
  execute: mocks.execute,
  beginTransaction: mocks.begin,
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
vi.mock('../lib/audit.js', () => ({ writeAudit: vi.fn() }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  requirePermission:
    (permission: string) =>
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      const auth = res.locals.auth as AuthContext
      if (
        !auth.roles.includes('SUPER_ADMIN') &&
        !auth.permissions.includes(permission)
      )
        return res.status(403).json({ message: 'Izin ditolak.' })
      next()
    },
}))

const finance: AuthContext = {
  id: 7,
  uid: 'finance',
  name: 'Finance',
  email: null,
  roles: ['PAYROLL_FINANCE'],
  permissions: ['payroll.view', 'payroll.rate.manage'],
  siteAccess: ['JEPARA'],
}

async function request(
  path: string,
  input: { method?: string; body?: unknown } = {}
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = finance
    next()
  })
  app.use('/api/payroll', payrollBpjsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/payroll${path}`, {
      method: input.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      body: input.body ? JSON.stringify(input.body) : undefined,
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Payroll BPJS configuration API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockResolvedValue([[]])
  })

  it('memuat satu kebijakan global tanpa konfigurasi site tambahan', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          uid: 'fdcc3d10-c0dd-4d9f-806d-ab208b7c596f',
          policyYear: 2026,
          jkkEmployerEnabled: 1,
          jkkEmployerRate: '0.5400',
        },
      ],
    ])

    const response = await request('/configuration/bpjs?year=2026')
    const body = (await response.json()) as {
      data: {
        policy: { jkkEmployerEnabled: boolean; jkkEmployerRate: string }
        siteSettings?: unknown
      }
    }

    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledOnce()
    expect(String(mocks.query.mock.calls[0][0])).toContain(
      'policy.policy_year=?'
    )
    expect(mocks.query.mock.calls[0][1]).toEqual([2026])
    expect(body.data.policy.jkkEmployerEnabled).toBe(true)
    expect(body.data.policy.jkkEmployerRate).toBe('0.5400')
    expect(body.data.siteSettings).toBeUndefined()
  })

  it('menolak user non-Super Admin mengubah policy global', async () => {
    const response = await request('/configuration/bpjs/policy', {
      method: 'POST',
      body: {},
    })

    expect(response.status).toBe(403)
    expect(mocks.begin).not.toHaveBeenCalled()
  })

  it('menolak filter site di luar scope sebelum query database', async () => {
    const response = await request(
      '/configuration/bpjs?year=2026&site=KLATEN'
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('memfilter dan mempaginasikan kepesertaan BPJS Borongan', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 51 }]])
      .mockResolvedValueOnce([[]])

    const response = await request(
      '/configuration/bpjs/enrollments?site=JEPARA&query=Siti&numberStatus=INCOMPLETE&participationStatus=ANY_DISABLED&sortBy=site&sortDirection=desc&page=2&pageSize=50'
    )
    const body = (await response.json()) as {
      meta: { page: number; pageSize: number; total: number; totalPages: number }
    }

    expect(response.status).toBe(200)
    expect(body.meta).toEqual({
      page: 2,
      pageSize: 50,
      total: 51,
      totalPages: 2,
    })
    expect(mocks.query).toHaveBeenCalledTimes(2)
    const countSql = String(mocks.query.mock.calls[0][0])
    const listSql = String(mocks.query.mock.calls[1][0])
    expect(countSql).toContain('employee.full_name LIKE ?')
    expect(countSql).toContain('employee.bpjs_health_number IS NULL')
    expect(countSql).toContain('NOT (COALESCE(enrollment.health_enabled,1)=1')
    expect(listSql).toContain('ORDER BY latest.id DESC LIMIT 1')
    expect(listSql).not.toContain('latest.effective_from')
    expect(listSql).not.toContain('latest.effective_to')
    expect(listSql).toContain('ORDER BY site.name DESC')
    expect(mocks.query.mock.calls[0][1]).toEqual([
      'JEPARA',
      'JEPARA',
      '%Siti%',
      '%Siti%',
    ])
    expect(mocks.query.mock.calls[1][1]).toEqual([
      'JEPARA',
      'JEPARA',
      '%Siti%',
      '%Siti%',
      50,
      50,
    ])
  })

  it('langsung memperbarui kondisi kepesertaan terkini', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 18,
            uid: '1eb78702-8e30-4939-9872-fb9b2eea35d4',
            employeeNumber: 'PKDS-2609-0001',
            fullName: 'Karyawan Demo',
            siteId: 2,
            siteCode: 'JEPARA',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            id: 31,
            uid: '68705164-6a2a-45f7-b4a3-f76145a6fd58',
            healthEnabled: 1,
            jhtEnabled: 1,
            jkkEnabled: 1,
            jkmEnabled: 1,
            jpEnabled: 1,
            reason: 'Pengaturan awal',
          },
        ],
      ])

    const response = await request(
      '/configuration/bpjs/enrollments/1eb78702-8e30-4939-9872-fb9b2eea35d4',
      {
        method: 'POST',
        body: {
          healthEnabled: true,
          jhtEnabled: true,
          jkkEnabled: true,
          jkmEnabled: true,
          jpEnabled: false,
          reason: 'Koreksi pilihan JP',
          idempotencyKey: 'bpjs-enrollment-same-day-test',
        },
      }
    )

    expect(response.status).toBe(200)
    expect(String(mocks.execute.mock.calls[0][0])).toContain(
      'SET health_enabled=?,jht_enabled=?'
    )
    expect(mocks.execute.mock.calls[0][1]).toEqual([
      true,
      true,
      true,
      true,
      false,
      'Koreksi pilihan JP',
      finance.id,
      31,
    ])
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO employee_bpjs_enrollments(')
      )
    ).toBe(false)
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('membuat satu kepesertaan tanpa tanggal efektif', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 18,
            uid: '1eb78702-8e30-4939-9872-fb9b2eea35d4',
            employeeNumber: 'PKDS-2609-0001',
            fullName: 'Karyawan Demo',
            siteId: 2,
            siteCode: 'JEPARA',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [{ uid: '68705164-6a2a-45f7-b4a3-f76145a6fd58' }],
      ])
    mocks.execute.mockResolvedValueOnce([{ insertId: 31 }])

    const response = await request(
      '/configuration/bpjs/enrollments/1eb78702-8e30-4939-9872-fb9b2eea35d4',
      {
        method: 'POST',
        body: {
          healthEnabled: true,
          jhtEnabled: true,
          jkkEnabled: true,
          jkmEnabled: true,
          jpEnabled: false,
          reason: 'Pengaturan kepesertaan awal',
          idempotencyKey: 'bpjs-enrollment-create-test',
        },
      }
    )

    expect(response.status).toBe(201)
    const insertSql = String(mocks.execute.mock.calls[0][0])
    expect(insertSql).toContain('INSERT INTO employee_bpjs_enrollments(')
    expect(insertSql).not.toContain('effective_from')
    expect(insertSql).not.toContain('effective_to')
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('memvalidasi preview import kepesertaan tanpa mengubah data', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          id: 18,
          uid: '1eb78702-8e30-4939-9872-fb9b2eea35d4',
          employeeNumber: 'PKDS-2609-0001',
          fullName: 'Karyawan Demo',
          employeeType: 'BORONGAN',
          siteId: 2,
          siteCode: 'JEPARA',
          siteName: 'Site Jepara',
        },
      ],
    ])

    const response = await request(
      '/configuration/bpjs/enrollments/import/preview',
      {
        method: 'POST',
        body: {
          rows: [
            {
              employeeNumber: 'PKDS-2609-0001',
              healthEnabled: true,
              jhtEnabled: true,
              jkkEnabled: true,
              jkmEnabled: true,
              jpEnabled: false,
              reason: 'Pembaruan melalui import Excel',
            },
          ],
        },
      }
    )
    const body = (await response.json()) as {
      data: {
        total: number
        valid: number
        invalid: number
        rows: Array<{ employeeNumber: string; site: string; valid: boolean }>
      }
    }

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({ total: 1, valid: 1, invalid: 0 })
    expect(body.data.rows[0]).toMatchObject({
      employeeNumber: 'PKDS-2609-0001',
      site: 'Site Jepara',
      valid: true,
    })
    expect(mocks.begin).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('membatalkan seluruh import saat ada karyawan yang tidak valid', async () => {
    mocks.query.mockResolvedValueOnce([[]])

    const response = await request('/configuration/bpjs/enrollments/import', {
      method: 'POST',
      body: {
        idempotencyKey: 'bpjs-import-invalid-test',
        rows: [
          {
            employeeNumber: 'TIDAK-ADA',
            healthEnabled: true,
            jhtEnabled: true,
            jkkEnabled: true,
            jkmEnabled: true,
            jpEnabled: true,
            reason: 'Pembaruan melalui import Excel',
          },
        ],
      },
    })

    expect(response.status).toBe(422)
    expect(mocks.begin).toHaveBeenCalledOnce()
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it('menyimpan import kepesertaan secara atomik', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 18,
            uid: '1eb78702-8e30-4939-9872-fb9b2eea35d4',
            employeeNumber: 'PKDS-2609-0001',
            fullName: 'Karyawan Demo',
            employeeType: 'BORONGAN',
            siteId: 2,
            siteCode: 'JEPARA',
            siteName: 'Site Jepara',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            id: 31,
            uid: '68705164-6a2a-45f7-b4a3-f76145a6fd58',
            healthEnabled: 1,
            jhtEnabled: 1,
            jkkEnabled: 1,
            jkmEnabled: 1,
            jpEnabled: 1,
            reason: 'Pengaturan awal',
          },
        ],
      ])

    const response = await request('/configuration/bpjs/enrollments/import', {
      method: 'POST',
      body: {
        idempotencyKey: 'bpjs-import-success-test',
        rows: [
          {
            employeeNumber: 'PKDS-2609-0001',
            healthEnabled: true,
            jhtEnabled: true,
            jkkEnabled: false,
            jkmEnabled: true,
            jpEnabled: true,
            reason: 'Pembaruan melalui import Excel',
          },
        ],
      },
    })
    const body = (await response.json()) as {
      data: { total: number; changed: number; replayed: number }
    }

    expect(response.status).toBe(200)
    expect(body.data).toEqual({ total: 1, changed: 1, replayed: 0 })
    expect(mocks.begin).toHaveBeenCalledOnce()
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.rollback).not.toHaveBeenCalled()
    expect(String(mocks.execute.mock.calls[0][0])).toContain(
      'UPDATE employee_bpjs_enrollments'
    )
    expect(String(mocks.execute.mock.calls[1][0])).toContain(
      'INSERT INTO employee_bpjs_enrollment_revisions'
    )
  })
})
