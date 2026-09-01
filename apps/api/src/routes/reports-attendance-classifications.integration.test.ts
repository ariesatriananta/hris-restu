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
    if (!res.locals.auth) return res.status(401).json({ message: 'Sesi tidak tersedia.' })
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
  classificationUid: '11111111-1111-4111-8111-111111111111',
  employeeUid: '22222222-2222-4222-8222-222222222222',
  employeeNumber: 'PKDS-001',
  employeeName: 'Siti',
  siteUid: '33333333-3333-4333-8333-333333333333',
  siteCode: 'JEPARA',
  siteName: 'Site Jepara',
  employeeTypeUid: '44444444-4444-4444-8444-444444444444',
  employeeTypeCode: 'BORONGAN',
  employeeTypeName: 'Borongan',
  productionModuleUid: null,
  productionModuleName: null,
  productionSectionUid: null,
  productionSectionCode: null,
  productionSectionName: null,
  classificationType: 'SICK',
  startDate: '2026-08-10',
  endDate: '2026-08-11',
  calendarDays: 2,
  approvalStatus: 'APPROVED',
  requestedAt: '2026-08-09T09:00:00.000+07:00',
  requestedByName: 'HR Jepara',
  reviewedAt: '2026-08-09T10:00:00.000+07:00',
  reviewedByName: 'HR Jepara',
  cancelledAt: null,
  cancelledByName: null,
  effectiveHistoryCount: 1,
  detailCount: 2,
  appliedCount: 2,
  pendingCount: 0,
  skippedCount: 0,
  reversedCount: 0,
}

describe('Laporan Cuti, Sakit & Izin API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('mewajibkan permission laporan dan Attendance', async () => {
    const response = await request(
      '/attendance-classifications?dateFrom=2026-08-01&dateTo=2026-08-31',
      { ...attendanceUser, permissions: ['reports.view'] }
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('membaca pengajuan yang overlap tanpa mengekspos data sensitif', async () => {
    mocks.query
      .mockResolvedValueOnce([[
        {
          total: 1,
          pending: 0,
          approved: 1,
          rejected: 0,
          cancelled: 0,
          totalCalendarDays: 2,
          appliedDays: 2,
        },
      ]])
      .mockResolvedValueOnce([[reportRow]])

    const response = await request(
      '/attendance-classifications?dateFrom=2026-08-10&dateTo=2026-08-10&site=JEPARA'
    )
    const body = (await response.json()) as Record<string, unknown> & {
      items: Array<Record<string, unknown>>
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      summary: { total: 1, approved: 1, totalCalendarDays: 2, appliedDays: 2 },
    })
    expect(body.items[0]).toMatchObject({
      classificationType: 'SICK',
      historyStatus: 'VALID',
      outcomes: { total: 2, applied: 2, pending: 0, skipped: 0, reversed: 0 },
    })
    const payload = JSON.stringify(body)
    expect(payload).not.toContain('reason')
    expect(payload).not.toContain('reviewNotes')
    expect(payload).not.toContain('attachment')
    expect(body.items[0]).not.toHaveProperty('id')

    const summarySql = String(mocks.query.mock.calls[0]?.[0])
    expect(summarySql).toContain('endDate>=?')
    expect(summarySql).toContain('startDate<=?')
    expect(summarySql).toContain('siteCode IN (?)')
    expect(summarySql).toContain('LEFT JOIN employee_employment_histories eh ON eh.id=(')
    expect(summarySql).not.toContain('acr.reason')
    expect(summarySql).not.toContain('attachment_file_id')
  })

  it('menolak site di luar akses dan rentang lebih dari 366 hari', async () => {
    const deniedSite = await request(
      '/attendance-classifications?dateFrom=2026-08-01&dateTo=2026-08-31&site=KLATEN'
    )
    expect(deniedSite.status).toBe(403)

    const tooLong = await request(
      '/attendance-classifications?dateFrom=2026-01-01&dateTo=2027-01-02'
    )
    expect(tooLong.status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mewajibkan attendance.export untuk ekspor', async () => {
    const response = await request(
      '/attendance-classifications/export',
      { ...attendanceUser, permissions: ['reports.view', 'attendance.view'] },
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom: '2026-08-01', dateTo: '2026-08-31' }),
      }
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengekspor data aman dan mencatat audit per site', async () => {
    mocks.query
      .mockResolvedValueOnce([[reportRow]])
      .mockResolvedValueOnce([[{ id: 11, code: 'JEPARA', name: 'Site Jepara' }]])
    mocks.audit.mockResolvedValue(undefined)

    const response = await request(
      '/attendance-classifications/export',
      attendanceUser,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'classification-report-test',
        },
        body: JSON.stringify({
          dateFrom: '2026-08-01',
          dateTo: '2026-08-31',
          site: ['JEPARA'],
        }),
      }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml')
    expect(response.headers.get('x-request-id')).toBe('classification-report-test')
    expect(mocks.audit).toHaveBeenCalledTimes(1)
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({
      module: 'REPORTS',
      action: 'EXPORT',
      table: 'attendance_classification_requests',
      siteId: 11,
      requestId: 'classification-report-test',
    })
    expect(mocks.commit).toHaveBeenCalledTimes(1)
  })
})
