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
  correctionUid: '11111111-1111-4111-8111-111111111111',
  attendanceUid: '22222222-2222-4222-8222-222222222222',
  employeeUid: '33333333-3333-4333-8333-333333333333',
  employeeNumber: 'PKDS-001',
  employeeName: 'Siti',
  siteUid: '44444444-4444-4444-8444-444444444444',
  siteCode: 'JEPARA',
  siteName: 'Site Jepara',
  employeeTypeUid: '55555555-5555-4555-8555-555555555555',
  employeeTypeCode: 'BORONGAN',
  employeeTypeName: 'Borongan',
  productionModuleUid: null,
  productionModuleName: null,
  productionSectionUid: null,
  productionSectionCode: null,
  productionSectionName: null,
  businessDate: '2026-08-10',
  correctionType: 'CLOCK_IN',
  oldClockInAt: null,
  newClockInAt: '2026-08-10T06:00:00.000+07:00',
  oldClockOutAt: '2026-08-10T15:00:00.000+07:00',
  newClockOutAt: null,
  oldStatus: 'PRESENT',
  newStatus: null,
  approvalStatus: 'APPROVED',
  requestedAt: '2026-08-11T09:00:00.000+07:00',
  requestedByName: 'HR Jepara',
  reviewedAt: '2026-08-11T10:00:00.000+07:00',
  reviewedByName: 'HR Jepara',
  appliedAt: '2026-08-11T10:00:00.000+07:00',
  historySiteMatches: 1,
  effectiveHistoryCount: 1,
}

describe('Laporan Koreksi Attendance API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('mewajibkan permission laporan dan Attendance', async () => {
    const response = await request(
      '/attendance-corrections?dateFrom=2026-08-01&dateTo=2026-08-31',
      { ...attendanceUser, permissions: ['reports.view'] }
    )
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengembalikan perubahan tanpa alasan dan catatan pemeriksaan', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            total: 1,
            pending: 0,
            approved: 1,
            rejected: 0,
            cancelled: 0,
            applied: 1,
          },
        ],
      ])
      .mockResolvedValueOnce([[reportRow]])

    const response = await request(
      '/attendance-corrections?dateFrom=2026-08-10&dateTo=2026-08-10&site=JEPARA'
    )
    const body = (await response.json()) as {
      summary: Record<string, number>
      items: Array<Record<string, unknown>>
    }
    expect(response.status).toBe(200)
    expect(body.summary).toMatchObject({ total: 1, approved: 1, applied: 1 })
    expect(body.items[0]).toMatchObject({
      correctionUid: reportRow.correctionUid,
      attendanceUid: reportRow.attendanceUid,
      correctionType: 'CLOCK_IN',
      historyStatus: 'VALID',
      changes: {
        clockIn: { before: null, after: reportRow.newClockInAt },
        status: { before: 'PRESENT', after: null },
      },
    })
    const payload = JSON.stringify(body)
    expect(payload).not.toContain('reason')
    expect(payload).not.toContain('reviewNotes')
    expect(body.items[0]).not.toHaveProperty('id')

    const summarySql = String(mocks.query.mock.calls[0]?.[0])
    expect(summarySql).toContain('businessDate BETWEEN ? AND ?')
    expect(summarySql).toContain('siteCode IN (?)')
    expect(summarySql).toContain(
      'LEFT JOIN employee_employment_histories eh ON eh.id=('
    )
    expect(summarySql).toContain('(eh.site_id=ar.site_id) historySiteMatches')
    expect(summarySql).not.toContain('ac.reason')
    expect(summarySql).not.toContain('review_notes')
  })

  it('menandai histori satu baris yang berbeda site sebagai tidak ditemukan', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ ...reportRow, historySiteMatches: 0 }]])
    const response = await request(
      '/attendance-corrections?dateFrom=2026-08-10&dateTo=2026-08-10'
    )
    const body = (await response.json()) as {
      items: Array<{ historyStatus: string }>
    }
    expect(response.status).toBe(200)
    expect(body.items[0]?.historyStatus).toBe('MISSING')
  })

  it('menolak site di luar akses dan rentang lebih dari 366 hari', async () => {
    const deniedSite = await request(
      '/attendance-corrections?dateFrom=2026-08-01&dateTo=2026-08-31&site=KLATEN'
    )
    expect(deniedSite.status).toBe(403)
    const tooLong = await request(
      '/attendance-corrections?dateFrom=2026-01-01&dateTo=2027-01-02'
    )
    expect(tooLong.status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mewajibkan attendance.export untuk ekspor', async () => {
    const response = await request(
      '/attendance-corrections/export',
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
      .mockResolvedValueOnce([
        [{ id: 11, code: 'JEPARA', name: 'Site Jepara' }],
      ])
    mocks.audit.mockResolvedValue(undefined)

    const response = await request(
      '/attendance-corrections/export',
      attendanceUser,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'correction-report-test',
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
    expect(response.headers.get('x-request-id')).toBe('correction-report-test')
    expect(mocks.audit).toHaveBeenCalledTimes(1)
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({
      module: 'REPORTS',
      action: 'EXPORT',
      table: 'attendance_corrections',
      siteId: 11,
      requestId: 'correction-report-test',
    })
    expect(mocks.commit).toHaveBeenCalledTimes(1)
  })
})
