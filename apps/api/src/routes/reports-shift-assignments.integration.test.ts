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
    if (!res.locals.auth)
      return res.status(401).json({ message: 'Sesi tidak tersedia.' })
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

const attendanceUser: AuthContext = {
  id: 7,
  uid: 'hr-jepara',
  name: 'HR Jepara',
  email: null,
  roles: ['HR_OFFICER'],
  permissions: ['reports.view', 'attendance.view', 'attendance.export'],
  siteAccess: ['JEPARA'],
}

async function request(
  path: string,
  auth: AuthContext = attendanceUser,
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

const reportRow = {
  referenceDate: '2026-08-21',
  employeeUid: '11111111-1111-4111-8111-111111111111',
  employeeNumber: 'PKDS-001',
  employeeName: 'Siti',
  siteUid: '22222222-2222-4222-8222-222222222222',
  siteCode: 'JEPARA',
  siteName: 'Site Jepara',
  employeeTypeUid: '33333333-3333-4333-8333-333333333333',
  employeeTypeCode: 'BORONGAN',
  employeeTypeName: 'Borongan',
  productionModuleUid: null,
  productionModuleName: null,
  productionSectionUid: null,
  productionSectionCode: null,
  productionSectionName: null,
  assignmentUid: '44444444-4444-4444-8444-444444444444',
  shiftUid: '55555555-5555-4555-8555-555555555555',
  shiftCode: 'BORONGAN',
  shiftName: 'Shift Borongan',
  shiftSiteUid: '22222222-2222-4222-8222-222222222222',
  shiftSiteCode: 'JEPARA',
  shiftSiteName: 'Site Jepara',
  startTime: '06:00:00',
  endTime: '15:00:00',
  crossesMidnight: 0,
  effectiveFrom: '2026-08-01',
  effectiveTo: null,
  workDaysJson: '[1,2,3,4,5]',
  readinessStatus: 'READY',
}

describe('Laporan Penugasan Shift API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('mewajibkan permission laporan dan Attendance', async () => {
    const response = await request(
      '/shift-assignments?referenceDate=2026-08-21',
      { ...attendanceUser, permissions: ['reports.view'] }
    )
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengembalikan snapshot publik dan membatasi site pengguna', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            total: 1,
            ready: 1,
            attention: 0,
            noAssignment: 0,
            ended: 0,
            overlap: 0,
            siteMismatch: 0,
          },
        ],
      ])
      .mockResolvedValueOnce([[reportRow]])

    const response = await request(
      '/shift-assignments?referenceDate=2026-08-21&site=JEPARA'
    )
    const body = (await response.json()) as {
      summary: Record<string, number>
      items: Array<Record<string, unknown>>
    }
    expect(response.status).toBe(200)
    expect(body.summary).toMatchObject({ total: 1, ready: 1, attention: 0 })
    expect(body.items[0]).toMatchObject({
      employeeUid: reportRow.employeeUid,
      assignmentUid: reportRow.assignmentUid,
      readinessStatus: 'READY',
      workDays: [1, 2, 3, 4, 5],
    })
    expect(body.items[0]).not.toHaveProperty('id')
    const sql = String(mocks.query.mock.calls[0]?.[0])
    expect(sql).toContain('siteCode IN (?)')
    expect(sql).toContain("effectiveHistoryCount<>1")
    expect(sql).toContain("activeAssignmentCount>1")
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      '2026-08-21',
      'JEPARA',
    ])
  })

  it('menolak site di luar akses dan mewajibkan izin ekspor', async () => {
    const deniedSite = await request(
      '/shift-assignments?referenceDate=2026-08-21&site=KLATEN'
    )
    expect(deniedSite.status).toBe(403)
    const deniedExport = await request(
      '/shift-assignments/export',
      { ...attendanceUser, permissions: ['reports.view', 'attendance.view'] },
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceDate: '2026-08-21' }),
      }
    )
    expect(deniedExport.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengekspor Excel dan mencatat audit per site', async () => {
    mocks.query
      .mockResolvedValueOnce([[reportRow]])
      .mockResolvedValueOnce([
        [{ id: 11, code: 'JEPARA', name: 'Site Jepara' }],
      ])
    mocks.audit.mockResolvedValue(undefined)

    const response = await request(
      '/shift-assignments/export',
      attendanceUser,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'shift-report-test',
        },
        body: JSON.stringify({
          referenceDate: '2026-08-21',
          site: ['JEPARA'],
        }),
      }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml')
    expect(response.headers.get('x-request-id')).toBe('shift-report-test')
    expect(mocks.audit).toHaveBeenCalledTimes(1)
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({
      module: 'REPORTS',
      action: 'EXPORT',
      table: 'employee_shift_assignments',
      siteId: 11,
      requestId: 'shift-report-test',
    })
    expect(mocks.commit).toHaveBeenCalledTimes(1)
  })
})
