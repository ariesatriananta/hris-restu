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
  deviceUid: '11111111-1111-4111-8111-111111111111',
  deviceCode: 'ATT-JPR-01',
  deviceName: 'Terminal Jepara',
  siteUid: '22222222-2222-4222-8222-222222222222',
  siteCode: 'JEPARA',
  siteName: 'Site Jepara',
  deviceType: 'TERMINAL',
  locationDescription: 'Pintu masuk',
  isActive: 1,
  isAttendanceActivated: 1,
  activatedAt: '2026-08-01T08:00:00.000+07:00',
  lastSeenAt: '2026-08-21T15:00:00.000+07:00',
  firstScanAt: '2026-08-01T06:00:00.000+07:00',
  lastScanAt: '2026-08-21T15:00:00.000+07:00',
  totalScans: 10,
  clockInScans: 5,
  clockOutScans: 5,
  successfulScans: 8,
  rejectedScans: 1,
  errorScans: 1,
  uniqueEmployees: 5,
  activityStatus: 'ATTENTION',
}

describe('Laporan Perangkat dan Aktivitas Scan API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('mewajibkan permission laporan dan Attendance', async () => {
    const response = await request(
      '/device-scans?dateFrom=2026-08-01&dateTo=2026-08-31',
      { ...attendanceUser, permissions: ['reports.view'] }
    )
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengembalikan ringkasan scan publik dan membatasi site', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            totalDevices: 1,
            healthyDevices: 0,
            attentionDevices: 1,
            noActivityDevices: 0,
            notActivatedDevices: 0,
            inactiveDevices: 0,
            totalScans: 10,
            successfulScans: 8,
            rejectedScans: 1,
            errorScans: 1,
          },
        ],
      ])
      .mockResolvedValueOnce([[reportRow]])

    const response = await request(
      '/device-scans?dateFrom=2026-08-01&dateTo=2026-08-31&site=JEPARA&resultStatus=ERROR'
    )
    const body = (await response.json()) as {
      summary: Record<string, number>
      items: Array<Record<string, unknown>>
    }
    expect(response.status).toBe(200)
    expect(body.summary).toMatchObject({
      totalDevices: 1,
      attentionDevices: 1,
      totalScans: 10,
    })
    expect(body.items[0]).toMatchObject({
      deviceUid: reportRow.deviceUid,
      activityStatus: 'ATTENTION',
      scans: {
        total: 10,
        successful: 8,
        rejected: 1,
        error: 1,
      },
    })
    expect(body.items[0]).not.toHaveProperty('id')
    const sql = String(mocks.query.mock.calls[0]?.[0])
    expect(sql).toContain('siteCode IN (?)')
    expect(sql).toContain('errorScans>0')
    expect(sql).toContain("ase.result_status='ERROR'")
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      '2026-08-01',
      '2026-08-31',
      'JEPARA',
    ])
  })

  it('menolak site di luar akses, periode panjang, dan ekspor tanpa izin', async () => {
    const deniedSite = await request(
      '/device-scans?dateFrom=2026-08-01&dateTo=2026-08-31&site=KLATEN'
    )
    expect(deniedSite.status).toBe(403)
    const tooLong = await request(
      '/device-scans?dateFrom=2026-01-01&dateTo=2027-01-02'
    )
    expect(tooLong.status).toBe(422)
    const deniedExport = await request(
      '/device-scans/export',
      { ...attendanceUser, permissions: ['reports.view', 'attendance.view'] },
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateFrom: '2026-08-01',
          dateTo: '2026-08-31',
        }),
      }
    )
    expect(deniedExport.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengekspor Excel dan mencatat Audit Trail per site', async () => {
    mocks.query
      .mockResolvedValueOnce([[reportRow]])
      .mockResolvedValueOnce([
        [{ id: 11, code: 'JEPARA', name: 'Site Jepara' }],
      ])
    mocks.audit.mockResolvedValue(undefined)

    const response = await request(
      '/device-scans/export',
      attendanceUser,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'device-scan-report-test',
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
    expect(response.headers.get('x-request-id')).toBe(
      'device-scan-report-test'
    )
    expect(mocks.audit).toHaveBeenCalledTimes(1)
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({
      module: 'REPORTS',
      action: 'EXPORT',
      table: 'scan_devices',
      siteId: 11,
      requestId: 'device-scan-report-test',
    })
    expect(mocks.commit).toHaveBeenCalledTimes(1)
  })
})
