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
vi.mock('../config.js', () => ({
  env: {
    ATTENDANCE_GO_LIVE_DATE: '2026-08-01',
    R2_PUBLIC_BASE_URL: 'https://files.example.test',
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.writeAudit }))
vi.mock('../middleware/authenticate.js', () => ({
  requirePermission:
    (permission: string) =>
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      const actor = res.locals.auth as ReturnType<typeof auth>
      if (!actor.permissions.includes(permission)) {
        return res
          .status(403)
          .json({ message: 'Anda tidak memiliki izin untuk aksi ini.' })
      }
      next()
    },
}))

import { errorHandler } from '../lib/errors.js'
import { attendanceClassificationsRouter } from './attendance-classifications.js'

const classificationUid = '77777777-7777-4777-8777-777777777777'

function auth() {
  return {
    id: 7,
    uid: 'user-hr-jepara',
    name: 'HR Jepara',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: ['attendance.approve'],
    siteAccess: ['JEPARA'],
  }
}

function connection(
  attendanceStatus = 'SICK',
  obstacles: { successfulScan?: boolean; lockedPayroll?: boolean } = {}
) {
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    execute: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  }
  conn.query.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue)
    if (sql.includes('FROM attendance_classification_requests acr')) {
      return [[{
        id: 41,
        uid: classificationUid,
        employee_id: 20,
        site_id: 1,
        classification_type: 'SICK',
        approval_status: 'APPROVED',
        startDate: '2026-08-08',
        endDate: '2026-08-08',
        site: 'JEPARA',
      }]]
    }
    if (sql.includes('FROM attendance_classification_details')) {
      return [[{
        id: 51,
        employeeId: 20,
        businessDate: '2026-08-08',
        attendanceRecordId: 61,
        outcome: 'APPLIED',
      }]]
    }
    if (sql.includes('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
    if (sql.includes('FROM attendance_records')) {
      return [[{
        id: 61,
        employeeId: 20,
        siteId: 1,
        businessDate: '2026-08-08',
        attendanceStatus,
        clockInAt: null,
        clockOutAt: null,
        clockInDeviceId: null,
        clockOutDeviceId: null,
        clockInSource: null,
        clockOutSource: null,
        clockInPhotoFileId: null,
        clockOutPhotoFileId: null,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        workedMinutes: null,
        isCorrected: 0,
      }]]
    }
    if (sql.includes('FROM attendance_scan_events')) {
      return [obstacles.successfulScan ? [{ id: 71 }] : []]
    }
    if (sql.includes('FROM production_transactions')) return [[]]
    if (sql.includes('FROM payroll_periods')) {
      return [obstacles.lockedPayroll ? [{ id: 81 }] : []]
    }
    if (sql.includes('FROM payroll_attendance_summaries')) return [[]]
    if (sql.includes('SELECT RELEASE_LOCK')) return [[{ released: 1 }]]
    throw new Error(`Query test belum dimock: ${sql.slice(0, 120)}`)
  })
  conn.execute.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue)
    if (sql.includes('INSERT INTO attendance_daily_finalization_runs')) {
      return [{ affectedRows: 1 }]
    }
    return [{ affectedRows: 1 }]
  })
  return conn
}

async function reverse(body: unknown) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth()
    next()
  })
  app.use('/api/attendance', attendanceClassificationsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(
      `http://127.0.0.1:${port}/api/attendance/classifications/${classificationUid}/reverse`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Attendance classification reversal API', () => {
  beforeEach(() => {
    mocks.getConnection.mockReset()
    mocks.writeAudit.mockReset().mockResolvedValue(undefined)
  })

  it('membatalkan klasifikasi applied dan mengembalikan Attendance menjadi Alpha', async () => {
    const conn = connection()
    mocks.getConnection.mockResolvedValue(conn)

    const response = await reverse({
      reason: 'Karyawan ternyata masuk kerja pada hari tersebut.',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      uid: classificationUid,
      approvalStatus: 'CANCELLED',
      reversedCount: 1,
    })
    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET attendance_status='ABSENT'"),
      [
        'SICK',
        'Karyawan ternyata masuk kerja pada hari tersebut.',
        7,
        61,
      ]
    )
    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET outcome='REVERSED'"),
      expect.any(Array)
    )
    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining('invalidatedByClassificationReversal'),
      expect.any(Array)
    )
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        recordUid: classificationUid,
        reason: 'Karyawan ternyata masuk kerja pada hari tersebut.',
      }),
      conn
    )
    expect(conn.commit).toHaveBeenCalledOnce()
    expect(conn.query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [
      'hris:attendance:finalize:1:2026-08-08',
    ])
  })

  it('menolak reversal bila Attendance sudah berubah setelah klasifikasi', async () => {
    const conn = connection('PRESENT')
    mocks.getConnection.mockResolvedValue(conn)

    const response = await reverse({
      reason: 'Karyawan ternyata masuk kerja pada hari tersebut.',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      message: 'Attendance tanggal 2026-08-08 sudah berubah setelah klasifikasi diterapkan.',
    })
    expect(conn.rollback).toHaveBeenCalledOnce()
    expect(conn.commit).not.toHaveBeenCalled()
  })

  it('menolak reversal bila sudah ada scan Attendance berhasil', async () => {
    const conn = connection('SICK', { successfulScan: true })
    mocks.getConnection.mockResolvedValue(conn)

    const response = await reverse({
      reason: 'Karyawan ternyata masuk kerja pada hari tersebut.',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      message:
        'Klasifikasi tidak dapat dibatalkan karena sudah ada scan Attendance berhasil.',
    })
    expect(conn.rollback).toHaveBeenCalledOnce()
  })

  it('menolak reversal bila periode payroll sudah terkunci', async () => {
    const conn = connection('SICK', { lockedPayroll: true })
    mocks.getConnection.mockResolvedValue(conn)

    const response = await reverse({
      reason: 'Karyawan ternyata masuk kerja pada hari tersebut.',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      message:
        'Attendance menyentuh periode Payroll yang sudah dihitung, disetujui, atau ditutup.',
    })
    expect(conn.rollback).toHaveBeenCalledOnce()
  })

  it('menolak alasan pembatalan yang terlalu pendek sebelum membuka koneksi', async () => {
    const response = await reverse({ reason: 'Salah' })

    expect(response.status).toBe(422)
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })
})
