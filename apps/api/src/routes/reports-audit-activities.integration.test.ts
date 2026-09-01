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
      )
        return res.status(403).json({ message: 'Izin ditolak.' })
      next()
    },
}))

const auditUser: AuthContext = {
  id: 7,
  uid: 'audit-jepara',
  name: 'Auditor Jepara',
  email: null,
  roles: ['HR_OFFICER'],
  permissions: ['reports.view', 'audit.view'],
  siteAccess: ['JEPARA'],
}

async function request(
  path: string,
  auth: AuthContext = auditUser,
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

const activity = {
  activityUid: '11111111-1111-4111-8111-111111111111',
  module: 'ATTENDANCE',
  action: 'UPDATE',
  tableName: 'attendance_records',
  recordUid: '22222222-2222-4222-8222-222222222222',
  description: 'Memperbarui catatan Attendance.',
  reason: 'Perbaikan data.',
  requestId: 'audit-request-1',
  occurredAt: '2026-08-21T10:00:00.000+07:00',
  actorUid: '33333333-3333-4333-8333-333333333333',
  actorName: 'HR Jepara',
  actorUsername: 'hr.jepara',
  siteUid: '44444444-4444-4444-8444-444444444444',
  siteCode: 'JEPARA',
  siteName: 'Site Jepara',
}

describe('Laporan Audit Aktivitas Pengguna API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('mewajibkan permission laporan dan Audit Trail', async () => {
    const response = await request(
      '/audit-activities?dateFrom=2026-08-01&dateTo=2026-08-31',
      { ...auditUser, permissions: ['reports.view'] }
    )
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengembalikan ringkasan publik dan membatasi site di SQL', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            totalActivities: 1,
            uniqueActors: 1,
            uniqueModules: 1,
            dataChanges: 1,
            decisions: 0,
            outputs: 0,
            accountActivities: 0,
          },
        ],
      ])
      .mockResolvedValueOnce([[activity]])

    const response = await request(
      '/audit-activities?dateFrom=2026-08-01&dateTo=2026-08-31&site=JEPARA&action=UPDATE'
    )
    const body = (await response.json()) as {
      summary: Record<string, number>
      items: Array<Record<string, unknown>>
    }
    expect(response.status).toBe(200)
    expect(body.summary).toMatchObject({
      totalActivities: 1,
      uniqueActors: 1,
      dataChanges: 1,
    })
    expect(body.items[0]).toMatchObject({
      activityUid: activity.activityUid,
      action: 'UPDATE',
      actor: { name: 'HR Jepara', username: 'hr.jepara' },
      site: { code: 'JEPARA' },
    })
    expect(body.items[0]).not.toHaveProperty('id')
    expect(body.items[0]).not.toHaveProperty('ipAddress')
    expect(body.items[0]).not.toHaveProperty('beforeData')
    const sql = String(mocks.query.mock.calls[0]?.[0])
    expect(sql).toContain('s.code IN (?)')
    expect(sql).toContain('al.action IN (?)')
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      '2026-08-01',
      '2026-08-31',
      'JEPARA',
      'UPDATE',
    ])
  })

  it('menolak site di luar akses dan periode lebih dari 366 hari', async () => {
    const deniedSite = await request(
      '/audit-activities?dateFrom=2026-08-01&dateTo=2026-08-31&site=KLATEN'
    )
    expect(deniedSite.status).toBe(403)
    const tooLong = await request(
      '/audit-activities?dateFrom=2026-01-01&dateTo=2027-01-02'
    )
    expect(tooLong.status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengekspor file aman dan mencatat audit per site', async () => {
    mocks.query
      .mockResolvedValueOnce([[activity]])
      .mockResolvedValueOnce([[{ id: 11, code: 'JEPARA' }]])
    mocks.audit.mockResolvedValue(undefined)

    const response = await request('/audit-activities/export', auditUser, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': 'audit-activity-report-test',
      },
      body: JSON.stringify({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        site: ['JEPARA'],
      }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml')
    expect(response.headers.get('x-request-id')).toBe(
      'audit-activity-report-test'
    )
    expect(mocks.audit).toHaveBeenCalledOnce()
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({
      module: 'REPORTS',
      action: 'EXPORT',
      table: 'audit_logs',
      siteId: 11,
      requestId: 'audit-activity-report-test',
    })
    expect(mocks.audit.mock.calls[0]?.[0]?.afterData).not.toHaveProperty(
      'beforeData'
    )
    expect(mocks.commit).toHaveBeenCalledOnce()
  })
})
