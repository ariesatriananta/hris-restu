import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  resolveCalendar: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: { getConnection: mocks.getConnection },
}))

vi.mock('../lib/attendance-calendar.js', () => ({
  resolveAttendanceCalendarDay: mocks.resolveCalendar,
}))

vi.mock('../middleware/authenticate.js', () => ({
  requirePermission:
    (permission: string) =>
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      const auth = res.locals.auth as AuthContext
      if (
        !auth.roles.includes('SUPER_ADMIN') &&
        !auth.permissions.includes(permission)
      ) {
        return res
          .status(403)
          .json({ message: 'Anda tidak memiliki izin untuk aksi ini.' })
      }
      next()
    },
}))

import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { attendanceTerminalRouter } from './attendance-terminal.js'

const scanBody = {
  eventType: 'CLOCK_OUT',
  barcode: 'PSMG-2604-03001',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
}
const deviceToken = 'attendance-device-token-that-is-long-enough-123456'

type FakeConnection = {
  beginTransaction: ReturnType<typeof vi.fn>
  query: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
  rollback: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
}

function connection(): FakeConnection {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  }
}

async function postScan(auth: AuthContext) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth
    next()
  })
  app.use('/api/attendance', attendanceTerminalRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/attendance/terminal/scan`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-attendance-device-token': deviceToken,
      },
      body: JSON.stringify(scanBody),
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    id: 7,
    uid: 'user-hr-semarang',
    name: 'HR Semarang',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: ['attendance.scan'],
    siteAccess: ['SEMARANG'],
    ...overrides,
  }
}

describe('Attendance terminal API integration', () => {
  beforeEach(() => {
    mocks.getConnection.mockReset()
    mocks.resolveCalendar.mockReset()
  })

  afterEach(() => vi.restoreAllMocks())

  it('menolak request sebelum akses database ketika permission scan tidak ada', async () => {
    const response = await postScan(auth({ permissions: [] }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      message: 'Anda tidak memiliki izin untuk aksi ini.',
    })
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })

  it('menolak terminal dari site di luar cakupan user dan rollback transaksi', async () => {
    const conn = connection()
    conn.query
      .mockResolvedValueOnce([[
        {
          scanTimestamp: '2026-08-07 15:05:00.000000',
          scannedAt: '2026-08-07T15:05:00+07:00',
          currentDate: '2026-08-07',
          previousDate: '2026-08-06',
          currentTime: '15:05:00',
        },
      ]])
      .mockResolvedValueOnce([[
        { id: 10, uid: 'device-smg', siteId: 2, isActive: 1, site: 'SEMARANG' },
      ]])
    mocks.getConnection.mockResolvedValue(conn)

    const response = await postScan(auth({ siteAccess: ['JEPARA'] }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: 'Akses site perangkat ditolak.' })
    expect(conn.rollback).toHaveBeenCalledOnce()
    expect(conn.commit).not.toHaveBeenCalled()
    expect(conn.release).toHaveBeenCalledOnce()
  })

  it('menerima clock out tanpa clock in dan mengembalikan status abnormal', async () => {
    const conn = connection()
    conn.query.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('scanTimestamp')) {
        return [[{
          scanTimestamp: '2026-08-07 15:05:00.000000',
          scannedAt: '2026-08-07T15:05:00+07:00',
          currentDate: '2026-08-07',
          previousDate: '2026-08-06',
          currentTime: '15:05:00',
        }]]
      }
      if (sql.includes('FROM scan_devices d')) {
        return [[{
          id: 10,
          uid: 'device-smg',
          code: 'ATT-SMG-01',
          name: 'Terminal Semarang',
          siteId: 2,
          isActive: 1,
          site: 'SEMARANG',
        }]]
      }
      if (sql.includes('FROM attendance_scan_events ase')) return [[]]
      if (sql.includes('FROM employees e')) {
        return [[{
          id: 20,
          uid: 'employee-20',
          employeeNumber: scanBody.barcode,
          fullName: 'Karyawan Demo',
          employeeStatus: 'ACTIVE',
          allowsAttendance: 1,
          siteId: 2,
          site: 'SEMARANG',
        }]]
      }
      if (sql.includes('ar.clock_in_at IS NOT NULL')) return [[]]
      if (sql.includes('FROM employee_shift_assignments esa')) {
        return [[{
          effectiveFrom: '2026-08-01',
          effectiveTo: null,
          workDays: '[1,2,3,4,5]',
          shiftId: 30,
          startTime: '06:00:00',
          endTime: '15:00:00',
          crossesMidnight: 0,
          lateToleranceMinutes: 15,
          earlyLeaveToleranceMinutes: 15,
        }]]
      }
      if (sql.includes('FROM attendance_records\n')) return [[]]
      if (sql.includes('earlyMinutes')) return [[{ earlyMinutes: 0 }]]
      if (sql.includes('FROM attendance_records ar')) {
        return [[{
          uid: 'attendance-88',
          businessDate: '2026-08-07',
          clockInAt: null,
          clockOutAt: '2026-08-07T15:05:00+07:00',
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          workedMinutes: null,
          attendanceStatus: 'PRESENT',
          asOf: '2026-08-07 15:05:00',
          scheduledEndAt: '2026-08-07 15:00:00',
          employeeUid: 'employee-20',
          employeeNumber: scanBody.barcode,
          fullName: 'Karyawan Demo',
        }]]
      }
      throw new Error(`Query test belum dimock: ${sql.slice(0, 80)}`)
    })
    conn.execute.mockImplementation(async (sqlValue: unknown) =>
      String(sqlValue).includes('INSERT INTO attendance_records')
        ? [{ insertId: 88, affectedRows: 1 }]
        : [{ affectedRows: 1 }]
    )
    mocks.getConnection.mockResolvedValue(conn)
    mocks.resolveCalendar.mockResolvedValue({
      dayType: 'WORKDAY',
      reasonType: 'SHIFT_WEEKDAY',
      eventId: null,
      siteRuleId: null,
    })

    const response = await postScan(auth())
    const body = await response.json() as {
      result: string
      eventType: string
      attendance: { qualityStatus: string; clockInAt: string | null }
      warnings: Array<{ code: string; message: string }>
    }

    // Memastikan respons HTTP berasal dari pembacaan record yang baru dibuat.
    expect(body.attendance).toMatchObject({
      clockInAt: null,
      clockOutAt: '2026-08-07T15:05:00+07:00',
    })

    expect(response.status).toBe(200)
    expect(body.result).toBe('SUCCESS')
    expect(body.eventType).toBe('CLOCK_OUT')
    expect(body.attendance.clockInAt).toBeNull()
    expect(body.attendance.qualityStatus).toBe('ABNORMAL')
    expect(body.warnings).toContainEqual({
      code: 'MISSING_CLOCK_IN',
      message: 'Clock out tersimpan, tetapi clock in belum tercatat. Ajukan koreksi ke HR.',
    })
    expect(conn.commit).toHaveBeenCalledOnce()
    expect(conn.rollback).not.toHaveBeenCalled()
    expect(conn.release).toHaveBeenCalledOnce()
    expect(
      conn.execute.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO attendance_records')
      )
    ).toBe(true)
  })
})
