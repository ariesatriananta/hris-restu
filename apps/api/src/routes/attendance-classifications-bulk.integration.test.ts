import type { AddressInfo } from 'node:net'
import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  writeAudit: vi.fn(),
  resolveCalendar: vi.fn(),
}))

vi.mock('../db.js', () => ({ pool: { getConnection: mocks.getConnection } }))
vi.mock('../config.js', () => ({
  env: { R2_PUBLIC_BASE_URL: 'https://files.example.test' },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.writeAudit }))
vi.mock('../lib/attendance-calendar.js', () => ({
  resolveAttendanceCalendarDay: mocks.resolveCalendar,
}))
vi.mock('../middleware/authenticate.js', () => ({
  requirePermission:
    (permission: string) =>
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      const actor = res.locals.auth as ReturnType<typeof auth>
      if (!actor.permissions.includes(permission)) {
        return res.status(403).json({ message: 'Anda tidak memiliki izin untuk aksi ini.' })
      }
      next()
    },
}))

import { errorHandler } from '../lib/errors.js'
import { attendanceClassificationsRouter } from './attendance-classifications.js'

const firstUid = '44444444-4444-4444-8444-444444444444'
const secondUid = '55555555-5555-4555-8555-555555555555'

function auth() {
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

function connection(uid: string, approvalStatus: 'PENDING' | 'APPROVED') {
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  }
  conn.query.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue)
    if (sql.includes('FROM attendance_classification_requests acr')) {
      return [[{
        id: uid === firstUid ? 41 : 42,
        uid,
        employee_id: 20,
        site_id: 1,
        classification_type: 'SICK',
        reason: 'Kondisi kesehatan.',
        approval_status: approvalStatus,
        start_date: '2026-08-08',
        end_date: '2026-08-08',
        startDate: '2026-08-08',
        endDate: '2026-08-08',
        employeeUid: '66666666-6666-4666-8666-666666666666',
        employeeName: 'Karyawan Demo',
        employeeNumber: 'KRY-001',
        site: 'JEPARA',
      }]]
    }
    if (sql.includes('SELECT id FROM employees')) return [[{ id: 20 }]]
    if (sql.includes('FROM employee_shift_assignments')) {
      return [[{
        id: 30,
        shiftId: 31,
        shiftSiteId: 1,
        workDays: '[1,2,3,4,5]',
        effectiveFrom: '2026-08-01',
        effectiveTo: null,
        shiftName: 'Shift Demo',
      }]]
    }
    throw new Error(`Query test belum dimock: ${sql.slice(0, 100)}`)
  })
  return conn
}

async function post(body: unknown) {
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
      `http://127.0.0.1:${port}/api/attendance/classifications/batch-review`,
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

describe('Attendance classification bulk approval API', () => {
  beforeEach(() => {
    mocks.getConnection.mockReset()
    mocks.writeAudit.mockReset().mockResolvedValue(undefined)
    mocks.resolveCalendar.mockReset().mockResolvedValue({
      dayType: 'NON_WORKDAY',
      reasonType: 'WEEKLY_OFF',
      eventId: null,
      siteRuleId: null,
      name: null,
    })
  })

  it('melanjutkan item lain ketika satu klasifikasi sudah ditinjau', async () => {
    const successful = connection(firstUid, 'PENDING')
    const alreadyReviewed = connection(secondUid, 'APPROVED')
    mocks.getConnection
      .mockResolvedValueOnce(successful)
      .mockResolvedValueOnce(alreadyReviewed)

    const response = await post({
      site: 'JEPARA',
      uids: [firstUid, secondUid],
      decision: 'APPROVED',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      requested: 2,
      approved: 1,
      failed: 1,
      failures: [{
        uid: secondUid,
        message: 'Klasifikasi Attendance ini sudah ditinjau.',
      }],
    })
    expect(successful.commit).toHaveBeenCalledOnce()
    expect(alreadyReviewed.rollback).toHaveBeenCalledOnce()
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ recordUid: firstUid, requestId: expect.any(String) }),
      successful
    )
  })
})
