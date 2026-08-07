import type { AddressInfo } from 'node:net'
import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  writeAudit: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: { getConnection: mocks.getConnection },
}))

vi.mock('../lib/audit.js', () => ({
  writeAudit: mocks.writeAudit,
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
import { attendanceCorrectionsRouter } from './attendance-corrections.js'

type FakeConnection = {
  beginTransaction: ReturnType<typeof vi.fn>
  query: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
  rollback: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
}

type TestState = {
  attendanceStatus: 'ABSENT' | 'PRESENT'
  clockInAt: string | null
  clockOutAt: string | null
  correctionUid: string | null
  correctionStatus: 'PENDING' | 'APPROVED' | null
  correctionNewStatus: string | null
}

const attendanceUid = '11111111-1111-4111-8111-111111111111'

function auth(): AuthContext {
  return {
    id: 7,
    uid: 'user-hr-jepara',
    name: 'HR Jepara',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: ['attendance.correct', 'attendance.approve'],
    siteAccess: ['JEPARA'],
  }
}

function connection(state: TestState): FakeConnection {
  const conn: FakeConnection = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    execute: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  }

  conn.query.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue)
    if (sql.includes('WHERE ar.uid=?')) {
      return [[{
        id: 88,
        uid: attendanceUid,
        employeeId: 20,
        siteId: 1,
        businessDate: '2026-08-07',
        attendanceStatus: state.attendanceStatus,
        clockInAt: state.clockInAt,
        clockOutAt: state.clockOutAt,
        site: 'JEPARA',
      }]]
    }
    if (sql.includes("approval_status='PENDING'") && !sql.includes('JOIN')) {
      return [[]]
    }
    if (sql.includes('FROM attendance_corrections ac')) {
      return [[{
        id: 99,
        uid: state.correctionUid,
        attendanceRecordId: 88,
        correctionType: 'BOTH',
        newClockInAt: '2026-08-07 07:00:00',
        newClockOutAt: '2026-08-07 17:00:00',
        newStatus: state.correctionNewStatus,
        reason: 'Scanner tidak merekam jam masuk dan pulang.',
        approvalStatus: state.correctionStatus,
        attendanceUid,
        siteId: 1,
        businessDate: '2026-08-07',
        attendanceStatus: state.attendanceStatus,
        clockInAt: state.clockInAt,
        clockOutAt: state.clockOutAt,
        shiftId: 30,
        site: 'JEPARA',
        startTime: '06:00:00',
        endTime: '15:00:00',
        crossesMidnight: 0,
        lateToleranceMinutes: 15,
        earlyLeaveToleranceMinutes: 15,
      }]]
    }
    if (sql.includes('FROM payroll_periods')) return [[]]
    if (sql.includes('rawLate')) {
      return [[{ rawLate: 60, rawEarly: 0, workedMinutes: 600 }]]
    }
    throw new Error(`Query test belum dimock: ${sql.slice(0, 100)}`)
  })

  conn.execute.mockImplementation(
    async (sqlValue: unknown, paramsValue?: unknown) => {
      const sql = String(sqlValue)
      const params = (paramsValue ?? []) as unknown[]
      if (sql.includes('INSERT INTO attendance_corrections')) {
        state.correctionUid = String(params[0])
        state.correctionStatus = 'PENDING'
        state.correctionNewStatus = String(params[8])
        return [{ insertId: 99, affectedRows: 1 }]
      }
      if (sql.includes('UPDATE attendance_records')) {
        state.attendanceStatus = String(params[0]) as TestState['attendanceStatus']
        state.clockInAt = String(params[1])
        state.clockOutAt = String(params[2])
        return [{ affectedRows: 1 }]
      }
      if (sql.includes('UPDATE attendance_corrections')) {
        state.correctionStatus = 'APPROVED'
        return [{ affectedRows: 1 }]
      }
      throw new Error(`Execute test belum dimock: ${sql.slice(0, 100)}`)
    }
  )

  return conn
}

async function post(path: string, body: unknown) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth()
    next()
  })
  app.use('/api/attendance', attendanceCorrectionsRouter)
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

describe('Attendance correction API integration', () => {
  beforeEach(() => {
    mocks.getConnection.mockReset()
    mocks.writeAudit.mockReset().mockResolvedValue(undefined)
  })

  it('mengubah Alpha menjadi Hadir setelah koreksi jam disetujui', async () => {
    const state: TestState = {
      attendanceStatus: 'ABSENT',
      clockInAt: null,
      clockOutAt: null,
      correctionUid: null,
      correctionStatus: null,
      correctionNewStatus: null,
    }
    const conn = connection(state)
    mocks.getConnection.mockResolvedValue(conn)

    const createResponse = await post('/corrections', {
      attendanceUid,
      correctionType: 'BOTH',
      newClockInAt: '2026-08-07T07:00',
      newClockOutAt: '2026-08-07T17:00',
      reason: 'Scanner tidak merekam jam masuk dan pulang.',
    })
    const created = await createResponse.json() as {
      uid: string
      approvalStatus: string
    }

    expect(createResponse.status).toBe(201)
    expect(created.approvalStatus).toBe('PENDING')
    expect(state.correctionNewStatus).toBe('PRESENT')

    const reviewResponse = await post(`/corrections/${created.uid}/review`, {
      decision: 'APPROVED',
      reviewNotes: 'Jam kerja telah diverifikasi.',
    })

    expect(reviewResponse.status).toBe(200)
    expect(await reviewResponse.json()).toMatchObject({
      uid: created.uid,
      approvalStatus: 'APPROVED',
      applied: true,
    })
    expect(state).toMatchObject({
      attendanceStatus: 'PRESENT',
      clockInAt: '2026-08-07 07:00:00',
      clockOutAt: '2026-08-07 17:00:00',
      correctionStatus: 'APPROVED',
    })
    expect(conn.commit).toHaveBeenCalledTimes(2)
    expect(conn.rollback).not.toHaveBeenCalled()
  })
})
