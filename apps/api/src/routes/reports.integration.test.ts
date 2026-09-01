import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { reportsRouter } from './reports.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  loadAttendanceRecapProjection: vi.fn(),
  summarizeAttendanceRecap: vi.fn(),
  aggregateAttendanceRecap: vi.fn(),
}))

vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))
vi.mock('../config.js', () => ({
  env: { ATTENDANCE_GO_LIVE_DATE: '2026-08-01' },
}))
vi.mock('../lib/attendance-recap.js', () => ({
  loadAttendanceRecapProjection: mocks.loadAttendanceRecapProjection,
  summarizeAttendanceRecap: mocks.summarizeAttendanceRecap,
  aggregateAttendanceRecap: mocks.aggregateAttendanceRecap,
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

const hr: AuthContext = {
  id: 7,
  uid: 'hr-jepara',
  name: 'HR Jepara',
  email: null,
  roles: ['HR_OFFICER'],
  permissions: ['reports.view', 'employees.view', 'attendance.view'],
  siteAccess: ['JEPARA'],
}

async function request(path: string, auth: AuthContext | null = hr) {
  const app = express()
  if (auth) {
    app.use((_req, res, next) => {
      res.locals.auth = auth
      next()
    })
  }
  app.use('/api/reports', reportsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/reports${path}`)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Reports API', () => {
  beforeEach(() => {
    mocks.query.mockReset()
    mocks.loadAttendanceRecapProjection.mockReset()
    mocks.summarizeAttendanceRecap.mockReset()
    mocks.aggregateAttendanceRecap.mockReset()
  })

  it('mewajibkan sesi login sebelum memuat laporan', async () => {
    const response = await request('/employees?asOf=2026-08-31', null)

    expect(response.status).toBe(401)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mewajibkan reports.view sebelum permission domain', async () => {
    const response = await request('/employees?asOf=2026-08-31', {
      ...hr,
      permissions: ['employees.view'],
    })

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mewajibkan employees.view untuk laporan karyawan', async () => {
    const response = await request('/employees?asOf=2026-08-31', {
      ...hr,
      permissions: ['reports.view'],
    })

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('membaca posisi karyawan dari histori efektif dan membatasi site', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [{ total: '1', active: '1', inactive: '0', resigned: '0' }],
      ])
      .mockResolvedValueOnce([
        [{ siteCode: 'JEPARA', siteName: 'Site Jepara', total: '1' }],
      ])
      .mockResolvedValueOnce([
        [
          {
            employeeUid: 'employee-public-uid',
            employeeNumber: 'PKDS-001',
            employeeName: 'Siti',
            siteUid: 'site-public-uid',
            siteCode: 'JEPARA',
            siteName: 'Site Jepara',
            employeeTypeUid: 'type-public-uid',
            employeeTypeCode: 'BORONGAN',
            employeeTypeName: 'Borongan',
            employeeStatusUid: 'status-public-uid',
            employeeStatusCode: 'ACTIVE',
            employeeStatusName: 'Aktif',
            departmentUid: null,
            departmentName: null,
            positionUid: 'position-public-uid',
            positionName: 'Operator',
            productionModuleUid: null,
            productionModuleName: null,
            productionSectionUid: null,
            productionSectionCode: null,
            productionSectionName: null,
            workGroupUid: null,
            workGroupName: null,
            effectiveHistoryCount: 1,
            effectiveFrom: '2026-08-01',
            effectiveTo: null,
          },
        ],
      ])

    const response = await request(
      '/employees?asOf=2026-08-31&query=Siti&employeeType=BORONGAN&pageSize=999'
    )
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    const countSql = String(mocks.query.mock.calls[0]?.[0])
    const values = mocks.query.mock.calls[0]?.[1]
    expect(countSql).toContain(
      'FROM employee_employment_histories effective_history'
    )
    expect(countSql).toContain('effective_history.effective_from<=?')
    expect(countSql).toContain('ROW_NUMBER() OVER')
    expect(countSql).toContain('eh.effectiveHistoryRank=1')
    expect(countSql).toContain('s.code IN (?)')
    expect(values).toEqual([
      '2026-08-31',
      '2026-08-31',
      'JEPARA',
      'BORONGAN',
      '%Siti%',
      '%Siti%',
    ])
    expect(mocks.query.mock.calls[2]?.[1]).toEqual([...values, 500, 0])
    expect(body).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 500,
      asOf: '2026-08-31',
      summary: { total: 1, active: 1 },
      items: [
        {
          employeeUid: 'employee-public-uid',
          site: {
            uid: 'site-public-uid',
            code: 'JEPARA',
            name: 'Site Jepara',
          },
          historyStatus: 'VALID',
          effectiveFrom: '2026-08-01',
          effectiveTo: null,
        },
      ],
    })
    expect(JSON.stringify(body)).not.toContain('"id"')
  })

  it('menolak filter site di luar akses pengguna', async () => {
    const response = await request(
      '/employees?asOf=2026-08-31&site=SEMARANG'
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mencakup status cuti dan menandai histori efektif yang ambigu', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            total: '1',
            active: '0',
            inactive: '0',
            resigned: '0',
            employeeLeave: '1',
            ambiguousHistory: '1',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            employeeUid: 'employee-public-uid',
            employeeNumber: 'PKDS-002',
            employeeName: 'Budi',
            siteUid: 'site-public-uid',
            siteCode: 'JEPARA',
            siteName: 'Site Jepara',
            employeeTypeUid: 'type-public-uid',
            employeeTypeCode: 'BULANAN',
            employeeTypeName: 'Bulanan',
            employeeStatusUid: 'leave-status-public-uid',
            employeeStatusCode: 'LEAVE',
            employeeStatusName: 'Cuti',
            effectiveHistoryCount: 2,
            effectiveFrom: '2026-08-15',
            effectiveTo: null,
          },
        ],
      ])

    const response = await request(
      '/employees?asOf=2026-08-31&employeeStatus=LEAVE'
    )
    const body = (await response.json()) as {
      summary: Record<string, number>
      items: Array<Record<string, unknown>>
    }

    expect(response.status).toBe(200)
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      '2026-08-31',
      '2026-08-31',
      'JEPARA',
      'LEAVE',
    ])
    expect(body.summary).toMatchObject({ leave: 1, ambiguousHistory: 1 })
    expect(body.items[0]).toMatchObject({
      historyStatus: 'AMBIGUOUS',
      employeeStatus: { code: 'LEAVE' },
    })
  })

  it('mewajibkan attendance.view untuk laporan attendance', async () => {
    const response = await request(
      '/attendance?dateFrom=2026-08-01&dateTo=2026-08-31',
      { ...hr, permissions: ['reports.view'] }
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('memakai recap engine dan menandai periode belum final sebagai sementara', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          id: 11,
          uid: 'site-public-uid',
          code: 'JEPARA',
          name: 'Site Jepara',
        },
      ],
    ])
    mocks.loadAttendanceRecapProjection.mockResolvedValueOnce({
      details: [{ employeeUid: 'employee-public-uid' }],
      completeness: {
        exportAllowed: false,
        official: true,
        blockedReasons: ['Tanggal 31 Agustus belum difinalisasi.'],
        sites: [
          {
            site: 'JEPARA',
            date: '2026-08-31',
            status: 'NOT_STARTED',
            reasons: ['Belum difinalisasi.'],
          },
        ],
      },
    })
    mocks.summarizeAttendanceRecap.mockReturnValueOnce([
      { employeeUid: 'employee-public-uid', employeeName: 'Siti' },
    ])
    mocks.aggregateAttendanceRecap.mockReturnValueOnce({ employees: 1 })

    const response = await request(
      '/attendance?dateFrom=2026-08-01&dateTo=2026-08-31'
    )
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(mocks.loadAttendanceRecapProjection).toHaveBeenCalledWith({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      goLiveDate: expect.any(String),
      sites: [
        {
          id: 11,
          uid: 'site-public-uid',
          code: 'JEPARA',
          name: 'Site Jepara',
        },
      ],
    })
    expect(body).toMatchObject({
      total: 1,
      finalization: {
        status: 'PROVISIONAL',
        exportAllowed: false,
        official: true,
      },
    })
  })
})
