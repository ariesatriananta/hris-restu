import type { AddressInfo } from 'node:net'
import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  writeAudit: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: { query: mocks.query, getConnection: mocks.getConnection },
}))

vi.mock('../config.js', () => ({
  env: { ATTENDANCE_GO_LIVE_DATE: '2026-08-01' },
}))

vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.writeAudit }))

vi.mock('../middleware/authenticate.js', () => ({
  requirePermission:
    (permission: string) =>
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      const auth = res.locals.auth as AuthContext
      if (!auth.roles.includes('SUPER_ADMIN') && !auth.permissions.includes(permission)) {
        return res.status(403).json({ message: 'Anda tidak memiliki izin untuk aksi ini.' })
      }
      next()
    },
}))

import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { attendanceShiftHistoryRouter } from './attendance-shift-history.js'

const body = {
  employeeUid: '11111111-1111-4111-8111-111111111111',
  shiftUid: '22222222-2222-4222-8222-222222222222',
  effectiveFrom: '2026-08-03',
  effectiveTo: '2026-08-07',
  workDays: [1, 2, 3, 4, 5],
}

function auth(allowed = true): AuthContext {
  return {
    id: 7,
    uid: 'hr-jepara',
    name: 'HR Jepara',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: allowed ? ['attendance.manage_shift'] : [],
    siteAccess: ['JEPARA'],
  }
}

function queryResult(sqlValue: unknown) {
  const sql = String(sqlValue)
  if (sql.includes('FROM employees e WHERE e.uid=')) {
    return [[{ id: 11, uid: body.employeeUid, employeeNumber: 'EMP-001', fullName: 'Budi' }]]
  }
  if (sql.includes('FROM shifts sh JOIN sites')) {
    return [[{
      id: 22, uid: body.shiftUid, name: 'Shift Pagi', siteId: 1,
      startTime: '06:00:00', endTime: '15:00:00', crossesMidnight: 0,
      lateToleranceMinutes: 15, earlyLeaveToleranceMinutes: 15,
      isActive: 1, site: 'JEPARA', siteName: 'Site Jepara',
    }]]
  }
  if (sql.includes('FROM employee_employment_histories eh')) {
    return [[{
      id: 31, siteId: 1, status: 'ACTIVE', allowsAttendance: 1,
      effectiveFrom: '2026-08-01', effectiveTo: null,
    }]]
  }
  if (sql.includes('FROM employee_shift_assignments esa')) return [[]]
  if (sql.includes('SELECT\n       (SELECT COUNT(*) FROM attendance_records')) {
    return [[{
      attendanceRecords: 0, rawScans: 0, approvedClassifications: 0,
      approvedCorrections: 0, postedProduction: 0, lockedPayrollPeriods: 0,
      runningFinalizations: 0, finalizationsToInvalidate: 0,
    }]]
  }
  if (sql.includes('SELECT id FROM production_transactions')) return [[]]
  if (sql.includes('SELECT id FROM payroll_periods')) return [[]]
  if (sql.includes('SELECT id,status FROM attendance_daily_finalization_runs')) return [[]]
  if (sql.includes('FROM attendance_records ar')) return [[]]
  throw new Error(`Query test belum dimock: ${sql.slice(0, 120)}`)
}

async function post(path: string, requestBody: unknown, allowed = true) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth(allowed)
    next()
  })
  app.use('/api/attendance', attendanceShiftHistoryRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/attendance${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Attendance historical shift API', () => {
  beforeEach(() => {
    mocks.query.mockReset().mockImplementation(queryResult)
    mocks.getConnection.mockReset()
    mocks.writeAudit.mockReset().mockResolvedValue(undefined)
  })

  it('menolak preview tanpa permission sebelum mengakses database', async () => {
    const response = await post('/shift-assignments/history/preview', body, false)
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengembalikan preview terstruktur yang dapat diterapkan', async () => {
    const response = await post('/shift-assignments/history/preview', body)
    const result = await response.json() as Record<string, unknown>
    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      employee: { uid: body.employeeUid, site: 'JEPARA' },
      replacement: { shiftUid: body.shiftUid, effectiveFrom: '2026-08-03' },
      impact: { affectedAssignmentCount: 0, rawScanCount: 0 },
      blockers: [],
      canApply: true,
    })
    expect(result.timeline).toEqual([
      expect.objectContaining({ change: 'REPLACEMENT', sourceUid: null }),
    ])
  })

  it('apply membuat assignment langsung dan mencatat hasil atomik', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation(queryResult),
      execute: vi.fn().mockImplementation(async (sqlValue: unknown) => {
        const sql = String(sqlValue)
        if (sql.includes('INSERT INTO employee_shift_assignments')) {
          return [{ insertId: 100, affectedRows: 1 }]
        }
        if (sql.includes('INSERT INTO attendance_daily_finalization_runs')) {
          return [{ insertId: 0, affectedRows: 0 }]
        }
        if (sql.includes('UPDATE attendance_classification_details')) {
          return [{ affectedRows: 0 }]
        }
        throw new Error(`Execute test belum dimock: ${sql.slice(0, 120)}`)
      }),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }
    mocks.getConnection.mockResolvedValue(conn)
    const response = await post('/shift-assignments/history/apply', {
      ...body,
      reason: 'Memperbaiki histori Shift yang salah input.',
    })
    const result = await response.json() as Record<string, unknown>
    expect(response.status).toBe(201)
    expect(result).toMatchObject({
      adjustedAssignmentCount: 0,
      deletedAssignmentCount: 0,
      reconciledAttendanceCount: 0,
      invalidatedFinalizationCount: 0,
    })
    expect(conn.commit).toHaveBeenCalledOnce()
    expect(mocks.writeAudit).toHaveBeenCalledOnce()
  })
})
