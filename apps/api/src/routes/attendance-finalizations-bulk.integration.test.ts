import type { AddressInfo } from 'node:net'
import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  finalizeAttendanceDay: vi.fn(),
  getRequirement: vi.fn(),
  getDueState: vi.fn(),
}))

vi.mock('../config.js', () => ({
  env: { ATTENDANCE_GO_LIVE_DATE: '2026-08-01' },
}))
vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))
vi.mock('../lib/attendance-finalization.js', () => ({
  finalizeAttendanceDay: mocks.finalizeAttendanceDay,
  getAttendanceFinalizationRequirement: mocks.getRequirement,
  getAttendanceShiftDueState: mocks.getDueState,
  hasDueAttendanceShift: vi.fn(),
}))
vi.mock('../middleware/authenticate.js', () => ({
  requirePermission:
    (permission: string) =>
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const actor = res.locals.auth as ReturnType<typeof auth>
      if (!actor.permissions.includes(permission)) {
        return res
          .status(403)
          .json({ message: 'Anda tidak memiliki izin untuk aksi ini.' })
      }
      next()
    },
}))

import { ApiError, errorHandler } from '../lib/errors.js'
import { attendanceFinalizationsRouter } from './attendance-finalizations.js'

function auth() {
  return {
    id: 7,
    uid: 'user-hr-jepara',
    name: 'HR Jepara',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: ['attendance.finalize'],
    siteAccess: ['JEPARA'],
  }
}

function mockReadQueries() {
  mocks.query.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue)
    if (sql.includes('SELECT id,code FROM sites')) {
      return [[{ id: 1, code: 'JEPARA' }]]
    }
    if (sql.includes('MAX(LEAST')) {
      return [[{ latestDate: '2026-08-03' }]]
    }
    if (sql.includes('FROM attendance_daily_finalization_runs r')) return [[]]
    if (sql.includes('FROM attendance_classification_requests')) {
      return [[{ dateFrom: '2026-08-08', dateTo: '2026-08-08' }]]
    }
    if (sql.includes('FROM attendance_corrections')) return [[]]
    if (sql.includes('FROM payroll_periods pp')) return [[]]
    throw new Error(`Query test belum dimock: ${sql.slice(0, 100)}`)
  })
}

async function post(path: string, body: unknown) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth()
    next()
  })
  app.use('/api/attendance', attendanceFinalizationsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/attendance${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Attendance bulk finalization API', () => {
  beforeEach(() => {
    mocks.query.mockReset()
    mocks.finalizeAttendanceDay.mockReset()
    mocks.getRequirement.mockReset().mockResolvedValue({
      required: true,
      effectiveTargets: 1,
      resolvedNonWorkdayTargets: 0,
      unresolvedTargets: 0,
    })
    mocks.getDueState.mockReset().mockResolvedValue({
      hasEligibleShift: true,
      allDue: true,
    })
    mockReadQueries()
  })

  it('menampilkan tanggal siap dan menahan tindak lanjut pending', async () => {
    const response = await post('/finalizations/bulk/preview', {
      siteCode: 'JEPARA',
      mode: 'RANGE',
      dateFrom: '2026-08-07',
      dateTo: '2026-08-09',
    })

    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      summary: { ready: number; blocked: number; skipped: number }
      executableDates: string[]
      items: Array<Record<string, unknown>>
      defaultReason: string
    }
    expect(payload.summary).toEqual({ ready: 2, blocked: 1, skipped: 0 })
    expect(payload.executableDates).toEqual(['2026-08-07', '2026-08-09'])
    expect(payload.items[1]).toEqual({
      businessDate: '2026-08-08',
      status: 'BLOCKED',
      code: 'PENDING_FOLLOW_UP',
      message: 'Masih ada koreksi atau klasifikasi yang menunggu keputusan.',
    })
    expect(payload.defaultReason).toBe(
      'Finalisasi periode Attendance oleh pengguna.'
    )
  })

  it('menentukan batas semua tanggal tertunda dari shift efektif terakhir', async () => {
    const response = await post('/finalizations/bulk/preview', {
      siteCode: 'JEPARA',
      mode: 'ALL_PENDING',
    })

    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      dateFrom: string
      dateTo: string
      executableDates: string[]
    }
    expect(payload).toEqual(
      expect.objectContaining({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-03',
        executableDates: ['2026-08-01', '2026-08-02', '2026-08-03'],
      })
    )
  })

  it('melanjutkan tanggal berikutnya jika satu finalisasi gagal', async () => {
    mocks.finalizeAttendanceDay
      .mockRejectedValueOnce(new ApiError(409, 'Tanggal pertama terkunci.'))
      .mockResolvedValueOnce({
        uid: 'run-2',
        site: 'JEPARA',
        businessDate: '2026-08-09',
        rawStatus: 'SUCCEEDED',
        source: 'MANUAL',
        counts: {
          eligible: 1,
          absent: 1,
          holiday: 0,
          preserved: 0,
          weeklyOff: 0,
          missingAssignment: 0,
          ambiguousAssignment: 0,
          ambiguousEmployment: 0,
          pendingDue: 0,
        },
        warnings: [],
        finishedAt: '2026-08-10 08:00:00',
      })

    const response = await post('/finalizations/bulk/run', {
      siteCode: 'JEPARA',
      mode: 'RANGE',
      dateFrom: '2026-08-07',
      dateTo: '2026-08-09',
      confirmedDates: ['2026-08-09', '2026-08-08', '2026-08-07'],
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        requested: 3,
        processed: 2,
        succeeded: 1,
        failed: 1,
        skipped: 1,
      })
    )
    expect(mocks.finalizeAttendanceDay.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({
        businessDate: '2026-08-07',
        reason: 'Finalisasi periode Attendance oleh pengguna.',
        blockPendingFollowUps: true,
      }),
      expect.objectContaining({ businessDate: '2026-08-09' }),
    ])
  })

  it('menolak site di luar akses pengguna', async () => {
    const response = await post('/finalizations/bulk/preview', {
      siteCode: 'KLATEN',
      mode: 'RANGE',
      dateFrom: '2026-08-07',
      dateTo: '2026-08-09',
    })
    expect(response.status).toBe(403)
  })
})
