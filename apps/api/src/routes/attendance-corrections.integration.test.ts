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
  attendanceStatus: 'ABSENT' | 'PRESENT' | 'LEAVE' | 'SICK' | 'PERMISSION'
  clockInAt: string | null
  clockOutAt: string | null
  correctionUid: string | null
  correctionStatus: 'PENDING' | 'APPROVED' | null
  correctionNewStatus: string | null
  finalizationLockAcquired?: boolean
  lockedPayroll?: boolean
  payrollSnapshot?: boolean
  finalized?: boolean
  hasAppliedClassification?: boolean
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
    if (sql.includes('GET_LOCK')) {
      return [[{ acquired: state.finalizationLockAcquired === false ? 0 : 1 }]]
    }
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]]
    if (sql.includes('FROM attendance_classification_details')) {
      return [state.hasAppliedClassification ? [{ id: 101 }] : []]
    }
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
    if (sql.includes('FROM payroll_periods')) {
      return [state.lockedPayroll ? [{ id: 70 }] : []]
    }
    if (sql.includes('FROM payroll_attendance_summaries')) {
      return [state.payrollSnapshot ? [{ id: 80 }] : []]
    }
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
      if (sql.includes('INSERT INTO attendance_daily_finalization_runs')) {
        return [{ affectedRows: state.finalized ? 1 : 0 }]
      }
      throw new Error(`Execute test belum dimock: ${sql.slice(0, 100)}`)
    }
  )

  return conn
}

async function post(path: string, body: unknown, actor = auth()) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = actor
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
      finalized: true,
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
    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining('invalidatedByAttendanceCorrection'),
      expect.any(Array)
    )
    expect(conn.query).toHaveBeenCalledWith(
      'SELECT RELEASE_LOCK(?)',
      ['hris:attendance:finalize:1:2026-08-07']
    )
  })

  it('menolak approval saat finalisasi tanggal-site sedang berjalan', async () => {
    const uid = '22222222-2222-4222-8222-222222222222'
    const conn = connection({
      attendanceStatus: 'ABSENT',
      clockInAt: null,
      clockOutAt: null,
      correctionUid: uid,
      correctionStatus: 'PENDING',
      correctionNewStatus: 'PRESENT',
      finalizationLockAcquired: false,
    })
    mocks.getConnection.mockResolvedValue(conn)

    const response = await post(`/corrections/${uid}/review`, {
      decision: 'APPROVED',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      message:
        'Finalisasi site dan tanggal ini sedang berjalan. Coba lagi setelah proses selesai.',
    })
    expect(conn.rollback).toHaveBeenCalledOnce()
  })

  it('menolak pengajuan koreksi untuk klasifikasi yang sudah diterapkan', async () => {
    const conn = connection({
      attendanceStatus: 'SICK',
      clockInAt: null,
      clockOutAt: null,
      correctionUid: null,
      correctionStatus: null,
      correctionNewStatus: null,
      hasAppliedClassification: true,
    })
    mocks.getConnection.mockResolvedValue(conn)

    const response = await post('/corrections', {
      attendanceUid,
      correctionType: 'STATUS',
      newStatus: 'PRESENT',
      reason: 'Klasifikasi hendak diubah melalui koreksi.',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      message:
        'Attendance dengan klasifikasi Cuti, Sakit, atau Izin yang sudah diterapkan tidak dapat dikoreksi.',
    })
    expect(conn.execute).not.toHaveBeenCalled()
    expect(conn.rollback).toHaveBeenCalledOnce()
  })

  it('menolak approval jika klasifikasi diterapkan setelah koreksi diajukan', async () => {
    const uid = '22222222-2222-4222-8222-222222222222'
    const conn = connection({
      attendanceStatus: 'ABSENT',
      clockInAt: null,
      clockOutAt: null,
      correctionUid: uid,
      correctionStatus: 'PENDING',
      correctionNewStatus: 'PRESENT',
      hasAppliedClassification: true,
    })
    mocks.getConnection.mockResolvedValue(conn)

    const response = await post(`/corrections/${uid}/review`, {
      decision: 'APPROVED',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      message:
        'Attendance dengan klasifikasi Cuti, Sakit, atau Izin yang sudah diterapkan tidak dapat dikoreksi.',
    })
    expect(conn.rollback).toHaveBeenCalledOnce()
  })

  it('menolak approval bila payroll sudah dihitung', async () => {
    const uid = '22222222-2222-4222-8222-222222222222'
    const conn = connection({
      attendanceStatus: 'ABSENT',
      clockInAt: null,
      clockOutAt: null,
      correctionUid: uid,
      correctionStatus: 'PENDING',
      correctionNewStatus: 'PRESENT',
      lockedPayroll: true,
    })
    mocks.getConnection.mockResolvedValue(conn)

    const response = await post(`/corrections/${uid}/review`, {
      decision: 'APPROVED',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      message:
        'Attendance dalam periode payroll yang sudah dihitung, disetujui, atau ditutup tidak dapat dikoreksi.',
    })
    expect(conn.rollback).toHaveBeenCalledOnce()
  })

  it('menolak approval bila snapshot payroll sudah tersedia', async () => {
    const uid = '22222222-2222-4222-8222-222222222222'
    const conn = connection({
      attendanceStatus: 'ABSENT',
      clockInAt: null,
      clockOutAt: null,
      correctionUid: uid,
      correctionStatus: 'PENDING',
      correctionNewStatus: 'PRESENT',
      payrollSnapshot: true,
    })
    mocks.getConnection.mockResolvedValue(conn)

    const response = await post(`/corrections/${uid}/review`, {
      decision: 'APPROVED',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      message:
        'Attendance sudah tersimpan dalam snapshot payroll dan tidak dapat dikoreksi.',
    })
    expect(conn.rollback).toHaveBeenCalledOnce()
  })

  it('bulk approval memproses item secara terpisah dan melaporkan partial success', async () => {
    const firstUid = '22222222-2222-4222-8222-222222222222'
    const secondUid = '33333333-3333-4333-8333-333333333333'
    const successful = connection({
      attendanceStatus: 'ABSENT',
      clockInAt: null,
      clockOutAt: null,
      correctionUid: firstUid,
      correctionStatus: 'PENDING',
      correctionNewStatus: 'PRESENT',
    })
    const alreadyReviewed = connection({
      attendanceStatus: 'ABSENT',
      clockInAt: null,
      clockOutAt: null,
      correctionUid: secondUid,
      correctionStatus: 'APPROVED',
      correctionNewStatus: 'PRESENT',
    })
    mocks.getConnection
      .mockResolvedValueOnce(successful)
      .mockResolvedValueOnce(alreadyReviewed)

    const response = await post('/corrections/batch-review', {
      site: 'JEPARA',
      uids: [firstUid, secondUid],
      decision: 'APPROVED',
      reviewNotes: 'Sudah diperiksa bersama supervisor.',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      requested: 2,
      approved: 1,
      failed: 1,
      failures: [
        {
          uid: secondUid,
          message: 'Koreksi Attendance ini sudah ditinjau.',
        },
      ],
    })
    expect(successful.commit).toHaveBeenCalledOnce()
    expect(alreadyReviewed.rollback).toHaveBeenCalledOnce()
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        recordUid: firstUid,
        requestId: expect.any(String),
      }),
      successful
    )
  })

  it('menolak payload bulk duplikat sebelum membuka transaksi', async () => {
    const uid = '22222222-2222-4222-8222-222222222222'
    const response = await post('/corrections/batch-review', {
      site: 'JEPARA',
      uids: [uid, uid],
      decision: 'APPROVED',
    })

    expect(response.status).toBe(422)
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })

  it('menolak site bulk di luar scope pengguna', async () => {
    const response = await post('/corrections/batch-review', {
      site: 'SEMARANG',
      uids: ['22222222-2222-4222-8222-222222222222'],
      decision: 'APPROVED',
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: 'Akses site ditolak.' })
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })

  it('menolak item yang tidak sesuai site batch meskipun pengguna Super Admin', async () => {
    const uid = '22222222-2222-4222-8222-222222222222'
    const conn = connection({
      attendanceStatus: 'ABSENT',
      clockInAt: null,
      clockOutAt: null,
      correctionUid: uid,
      correctionStatus: 'PENDING',
      correctionNewStatus: 'PRESENT',
    })
    mocks.getConnection.mockResolvedValue(conn)
    const actor = auth()
    actor.roles = ['SUPER_ADMIN']

    const response = await post(
      '/corrections/batch-review',
      {
        site: 'SEMARANG',
        uids: [uid],
        decision: 'APPROVED',
      },
      actor
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      requested: 1,
      approved: 0,
      failed: 1,
      failures: [
        {
          uid,
          message: 'Koreksi Attendance tidak sesuai site yang dipilih.',
        },
      ],
    })
    expect(conn.rollback).toHaveBeenCalledOnce()
  })

  it('memerlukan permission attendance.approve untuk bulk approval', async () => {
    const actor = auth()
    actor.permissions = ['attendance.correct']
    const response = await post(
      '/corrections/batch-review',
      {
        site: 'JEPARA',
        uids: ['22222222-2222-4222-8222-222222222222'],
        decision: 'APPROVED',
      },
      actor
    )

    expect(response.status).toBe(403)
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })
})
