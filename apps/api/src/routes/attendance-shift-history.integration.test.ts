import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { attendanceShiftHistoryRouter } from './attendance-shift-history.js'

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
        return res
          .status(403)
          .json({ message: 'Anda tidak memiliki izin untuk aksi ini.' })
      }
      next()
    },
}))

const body = {
  employeeUid: '11111111-1111-4111-8111-111111111111',
  shiftUid: '22222222-2222-4222-8222-222222222222',
  effectiveFrom: '2026-08-03',
  effectiveTo: '2026-08-07',
  workDays: [1, 2, 3, 4, 5],
}

function auth(
  allowed = true,
  siteAccess: AuthContext['siteAccess'] = ['JEPARA']
): AuthContext {
  return {
    id: 7,
    uid: 'hr-jepara',
    name: 'HR Jepara',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: allowed ? ['attendance.manage_shift'] : [],
    siteAccess,
  }
}

function queryResult(sqlValue: unknown) {
  const sql = String(sqlValue)
  if (sql.includes('FROM employees e WHERE e.uid=')) {
    return [
      [
        {
          id: 11,
          uid: body.employeeUid,
          employeeNumber: 'EMP-001',
          fullName: 'Budi',
        },
      ],
    ]
  }
  if (sql.includes('FROM shifts sh JOIN sites')) {
    return [
      [
        {
          id: 22,
          uid: body.shiftUid,
          name: 'Shift Pagi',
          siteId: 1,
          startTime: '06:00:00',
          endTime: '15:00:00',
          crossesMidnight: 0,
          lateToleranceMinutes: 15,
          earlyLeaveToleranceMinutes: 15,
          isActive: 1,
          site: 'JEPARA',
          siteName: 'Site Jepara',
        },
      ],
    ]
  }
  if (sql.includes('FROM employee_employment_histories eh')) {
    return [
      [
        {
          id: 31,
          siteId: 1,
          status: 'ACTIVE',
          allowsAttendance: 1,
          effectiveFrom: '2026-08-01',
          effectiveTo: null,
        },
      ],
    ]
  }
  if (sql.includes('FROM employee_shift_assignments esa')) return [[]]
  if (sql.includes('FROM scheduled_employee_mutations')) return [[]]
  if (sql.includes('FROM scheduled_employee_status_changes')) return [[]]
  if (sql.includes('SELECT ar.id,ar.site_id siteId,s.code site')) return [[]]
  if (sql.includes('SELECT\n       (SELECT COUNT(*) FROM attendance_records')) {
    return [
      [
        {
          attendanceRecords: 0,
          rawScans: 0,
          approvedClassifications: 0,
          approvedCorrections: 0,
          postedProduction: 0,
          lockedPayrollPeriods: 0,
          payrollAttendanceSnapshots: 0,
          runningFinalizations: 0,
          finalizationsToInvalidate: 0,
        },
      ],
    ]
  }
  if (sql.includes('SELECT id FROM production_transactions')) return [[]]
  if (sql.includes('SELECT id FROM payroll_periods')) return [[]]
  if (sql.includes('FROM payroll_attendance_summaries')) return [[]]
  if (sql.includes('SELECT id,status FROM attendance_daily_finalization_runs'))
    return [[]]
  if (sql.includes('FROM attendance_records ar')) return [[]]
  throw new Error(`Query test belum dimock: ${sql.slice(0, 120)}`)
}

async function post(
  path: string,
  requestBody: unknown,
  allowed = true,
  siteAccess: AuthContext['siteAccess'] = ['JEPARA']
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth(allowed, siteAccess)
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
    const response = await post(
      '/shift-assignments/history/preview',
      body,
      false
    )
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengembalikan preview terstruktur yang dapat diterapkan', async () => {
    const response = await post('/shift-assignments/history/preview', body)
    const result = (await response.json()) as Record<string, unknown>
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

  it('preview seterusnya membatasi dampak sampai hari ini', async () => {
    const response = await post('/shift-assignments/history/preview', {
      ...body,
      effectiveTo: null,
    })
    const result = (await response.json()) as {
      replacement: { effectiveTo: string | null }
      impactThroughDate: string
      canApply: boolean
    }

    expect(response.status).toBe(200)
    expect(result.replacement.effectiveTo).toBeNull()
    expect(result.impactThroughDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.canApply).toBe(true)

    const impactQuery = mocks.query.mock.calls.find(([sqlValue]) =>
      String(sqlValue).includes('(SELECT COUNT(*) FROM attendance_records')
    )
    expect(impactQuery?.[1]).not.toContain(null)
    expect(impactQuery?.[1]).toContain(result.impactThroughDate)
  })

  it('menolak seterusnya bila masih ada assignment setelah tanggal mulai', async () => {
    mocks.query.mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('FROM employee_shift_assignments esa')) {
        return [
          [
            {
              id: 41,
              uid: '33333333-3333-4333-8333-333333333333',
              shiftId: 22,
              shiftUid: body.shiftUid,
              shiftName: 'Shift Pagi',
              effectiveFrom: '2026-08-10',
              effectiveTo: null,
              workDays: [1, 2, 3, 4, 5],
            },
          ],
        ]
      }
      return queryResult(sqlValue)
    })

    const response = await post('/shift-assignments/history/preview', {
      ...body,
      effectiveTo: null,
    })
    const result = (await response.json()) as {
      blockers: string[]
      canApply: boolean
    }

    expect(response.status).toBe(200)
    expect(result.canApply).toBe(false)
    expect(result.blockers).toContainEqual(
      expect.stringContaining('periode paling akhir')
    )
  })

  it('menolak seterusnya bila mutasi atau status kerja terjadwal masih terbuka', async () => {
    mocks.query.mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('FROM scheduled_employee_mutations'))
        return [[{ id: 71 }]]
      if (sql.includes('FROM scheduled_employee_status_changes'))
        return [[{ id: 72 }]]
      return queryResult(sqlValue)
    })

    const response = await post('/shift-assignments/history/preview', {
      ...body,
      effectiveTo: null,
    })
    const result = (await response.json()) as {
      blockers: string[]
      canApply: boolean
    }

    expect(response.status).toBe(200)
    expect(result.canApply).toBe(false)
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mutasi terjadwal'),
        expect.stringContaining('status kerja terjadwal'),
      ])
    )
  })

  it('menolak seterusnya bila histori kerja aktif masih memiliki tanggal akhir', async () => {
    mocks.query.mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('FROM employee_employment_histories eh')) {
        return [
          [
            {
              id: 31,
              siteId: 1,
              status: 'ACTIVE',
              allowsAttendance: 1,
              effectiveFrom: '2026-08-01',
              effectiveTo: '2099-12-31',
            },
          ],
        ]
      }
      return queryResult(sqlValue)
    })

    const response = await post('/shift-assignments/history/preview', {
      ...body,
      effectiveTo: null,
    })
    const result = (await response.json()) as {
      blockers: string[]
      canApply: boolean
    }

    expect(response.status).toBe(200)
    expect(result.canApply).toBe(false)
    expect(result.blockers).toContainEqual(
      expect.stringContaining('masa kerja karyawan di site shift ini')
    )
  })

  it('memblokir preview bila Attendance sudah masuk snapshot payroll', async () => {
    mocks.query.mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (
        sql.includes('SELECT\n       (SELECT COUNT(*) FROM attendance_records')
      ) {
        return [
          [
            {
              attendanceRecords: 1,
              rawScans: 0,
              approvedClassifications: 0,
              approvedCorrections: 0,
              postedProduction: 0,
              lockedPayrollPeriods: 0,
              payrollAttendanceSnapshots: 1,
              runningFinalizations: 0,
              finalizationsToInvalidate: 0,
            },
          ],
        ]
      }
      return queryResult(sqlValue)
    })

    const response = await post('/shift-assignments/history/preview', body)
    const result = (await response.json()) as {
      canApply: boolean
      blockers: string[]
      impact: { payrollAttendanceSnapshotCount: number }
    }

    expect(response.status).toBe(200)
    expect(result.canApply).toBe(false)
    expect(result.impact.payrollAttendanceSnapshotCount).toBe(1)
    expect(result.blockers).toContainEqual(
      expect.stringContaining('snapshot payroll')
    )
  })

  it('menolak koreksi lintas site bila pengguna tidak memiliki akses site asal', async () => {
    mocks.query.mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('SELECT ar.id,ar.site_id siteId,s.code site')) {
        return [[{ id: 51, siteId: 2, site: 'KLATEN' }]]
      }
      return queryResult(sqlValue)
    })

    const response = await post('/shift-assignments/history/preview', body)
    expect(response.status).toBe(403)
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
    const result = (await response.json()) as Record<string, unknown>
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

  it('apply memeriksa ulang snapshot payroll di dalam transaksi', async () => {
    const execute = vi.fn()
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sqlValue: unknown) => {
        const sql = String(sqlValue)
        if (
          sql.includes('SELECT pas.id') &&
          sql.includes('FROM payroll_attendance_summaries')
        ) {
          return [[{ id: 80 }]]
        }
        return queryResult(sqlValue)
      }),
      execute,
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }
    mocks.getConnection.mockResolvedValue(conn)

    const response = await post('/shift-assignments/history/apply', {
      ...body,
      reason: 'Memperbaiki histori Shift yang salah input.',
    })
    const result = (await response.json()) as { message: string }

    expect(response.status).toBe(409)
    expect(result.message).toContain('snapshot payroll')
    expect(execute).not.toHaveBeenCalled()
    expect(conn.rollback).toHaveBeenCalledOnce()
    expect(conn.commit).not.toHaveBeenCalled()
  })

  it('apply seterusnya menyimpan effective_to NULL', async () => {
    const execute = vi.fn().mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('INSERT INTO employee_shift_assignments')) {
        return [{ insertId: 100, affectedRows: 1 }]
      }
      return [{ insertId: 0, affectedRows: 0 }]
    })
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation(queryResult),
      execute,
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }
    mocks.getConnection.mockResolvedValue(conn)

    const response = await post('/shift-assignments/history/apply', {
      ...body,
      effectiveTo: null,
      reason: 'Mengaktifkan kembali penugasan Shift paling akhir.',
    })

    expect(response.status).toBe(201)
    const assignmentInsert = execute.mock.calls.find(([sqlValue]) =>
      String(sqlValue).includes('INSERT INTO employee_shift_assignments')
    )
    expect(assignmentInsert?.[1]?.[4]).toBeNull()
    expect(conn.commit).toHaveBeenCalledOnce()
  })

  it('apply lintas site mengunci dan menginvalidasi finalisasi site asal serta tujuan', async () => {
    const query = vi.fn().mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('SELECT ar.id,ar.site_id siteId,s.code site')) {
        return [[{ id: 51, siteId: 2, site: 'KLATEN' }]]
      }
      if (
        sql.includes('SELECT id,status FROM attendance_daily_finalization_runs')
      ) {
        return [[]]
      }
      if (
        sql.includes('SELECT\n       (SELECT COUNT(*) FROM attendance_records')
      ) {
        return queryResult(sqlValue)
      }
      if (sql.includes('FROM attendance_records ar')) return [[]]
      return queryResult(sqlValue)
    })
    const execute = vi.fn().mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('INSERT INTO employee_shift_assignments')) {
        return [{ insertId: 100, affectedRows: 1 }]
      }
      if (sql.includes('INSERT INTO attendance_daily_finalization_runs')) {
        return [{ insertId: 0, affectedRows: 2 }]
      }
      return [{ insertId: 0, affectedRows: 0 }]
    })
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query,
      execute,
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }
    mocks.getConnection.mockResolvedValue(conn)

    const response = await post(
      '/shift-assignments/history/apply',
      { ...body, reason: 'Memperbaiki penugasan setelah perpindahan site.' },
      true,
      ['JEPARA', 'KLATEN']
    )
    const result = (await response.json()) as {
      invalidatedFinalizationCount: number
    }

    expect(response.status).toBe(201)
    expect(result.invalidatedFinalizationCount).toBe(2)
    const finalizationLock = query.mock.calls.find(([sqlValue]) =>
      String(sqlValue).includes(
        'SELECT id,status FROM attendance_daily_finalization_runs'
      )
    )
    expect(finalizationLock?.[1]).toEqual([
      1,
      2,
      body.effectiveFrom,
      body.effectiveTo,
    ])
    const invalidation = execute.mock.calls.find(([sqlValue]) =>
      String(sqlValue).includes(
        'INSERT INTO attendance_daily_finalization_runs'
      )
    )
    expect(String(invalidation?.[0])).toContain('latest.site_id IN (?,?)')
    expect(invalidation?.[1]).toEqual(expect.arrayContaining([1, 2]))
    expect(conn.commit).toHaveBeenCalledOnce()
  })

  it('rekonsiliasi memakai flag numerik agar aman dari konflik collation', async () => {
    const execute = vi.fn().mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('INSERT INTO employee_shift_assignments')) {
        return [{ insertId: 100, affectedRows: 1 }]
      }
      return [{ insertId: 0, affectedRows: 1 }]
    })
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sqlValue: unknown) => {
        const sql = String(sqlValue)
        if (sql.includes('SELECT ar.id,ar.site_id siteId,s.code site')) {
          return [[{ id: 51, siteId: 1, site: 'JEPARA' }]]
        }
        if (sql.includes('FROM attendance_records ar')) {
          return [
            [
              {
                id: 51,
                attendanceStatus: 'PRESENT',
                clockInAt: '2026-08-03 06:00:00',
                clockOutAt: '2026-08-03 15:00:00',
                clockInSource: 'TERMINAL',
                clockOutSource: 'TERMINAL',
                businessDate: '2026-08-03',
                hasRawScan: 1,
                hasCorrection: 0,
                hasClassification: 0,
              },
            ],
          ]
        }
        if (sql.includes('FROM attendance_calendar_events')) return [[]]
        return queryResult(sqlValue)
      }),
      execute,
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }
    mocks.getConnection.mockResolvedValue(conn)

    const response = await post('/shift-assignments/history/apply', {
      ...body,
      reason: 'Memperbaiki histori Shift yang salah input.',
    })

    expect(response.status).toBe(201)
    const attendanceUpdate = execute.mock.calls.find(([sqlValue]) =>
      String(sqlValue).includes('UPDATE attendance_records')
    )
    expect(attendanceUpdate).toBeDefined()
    expect(String(attendanceUpdate?.[0])).toContain('WHEN ?=0')
    expect(attendanceUpdate?.[1]?.[7]).toBe(1)
    expect(attendanceUpdate?.[1]?.[11]).toBe(1)
  })

  it('apply mengembalikan tahap kegagalan dan melakukan rollback', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation(queryResult),
      execute: vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('Simulasi kegagalan database.'), {
            code: 'ER_UNKNOWN_ERROR',
            errno: 1105,
            sqlState: 'HY000',
          })
        ),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }
    mocks.getConnection.mockResolvedValue(conn)

    const response = await post('/shift-assignments/history/apply', {
      ...body,
      reason: 'Memperbaiki histori Shift yang salah input.',
    })
    const result = (await response.json()) as { message: string }

    expect(response.status).toBe(500)
    expect(result.message).toContain('menyusun ulang periode penugasan')
    expect(result.message).toContain('Tidak ada perubahan yang disimpan')
    expect(conn.rollback).toHaveBeenCalledOnce()
    expect(conn.commit).not.toHaveBeenCalled()
    expect(conn.release).toHaveBeenCalledOnce()
  })
})
