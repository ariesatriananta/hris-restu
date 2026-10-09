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
  if (sql.includes('history.change_type historyChangeType')) {
    return [
      [
        {
          id: 11,
          uid: body.employeeUid,
          employeeNumber: 'EMP-001',
          fullName: 'Budi',
          employeeType: 'BORONGAN',
          employeeStatus: 'ACTIVE',
          allowsAttendance: 1,
          siteId: 1,
          site: 'JEPARA',
          productionModule: 'Modul A',
          productionSection: 'Linting',
          historyEffectiveFrom: '2026-08-01',
          historyChangeType: 'INITIAL',
          activeContractStart: '2026-08-01',
          isRenewal: 0,
        },
      ],
    ]
  }
  if (sql.includes('FROM shifts shift') && sql.includes('shift.is_active=1')) {
    return [
      [
        {
          id: 22,
          uid: body.shiftUid,
          siteId: 1,
          code: 'BORONGAN_DEFAULT',
          name: 'Shift Pagi',
          startTime: '06:00',
          endTime: '15:00',
          site: 'JEPARA',
        },
      ],
    ]
  }
  if (sql.includes('assignment.employee_id employeeId')) return [[]]
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

  const batch = { shiftUid: body.shiftUid, employeeUids: [body.employeeUid], effectiveFrom: body.effectiveFrom, effectiveTo: body.effectiveTo, workDays: [1, 3, 5] }
  function batchQuery(sqlValue: unknown) {
    const sql = String(sqlValue)
    if (sql.includes('SELECT run.id') || sql.includes('SELECT correction.id') || sql.includes('SELECT detail.id')) return [[]]
    return queryResult(sql)
  }
  function batchConnection(query = vi.fn().mockImplementation(batchQuery)) {
    return {
      query, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
      execute: vi.fn().mockImplementation(async (sql: unknown, _values?: unknown[]) => [{ insertId: String(sql).includes('INSERT INTO employee_shift_assignments') ? 100 : 0, affectedRows: 0 }]),
    }
  }

  it('backdate memeriksa permission dan mewajibkan preview sebelum apply', async () => {
    expect((await post('/shift-assignments/backdate/preview', batch, false)).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
    expect((await post('/shift-assignments/backdate/apply', { ...batch, reason: 'Perubahan hari kerja.' })).status).toBe(422)
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })

  it('backdate tiga hari kerja memakai preview dan alasan tanpa mengubah hari menjadi lima', async () => {
    mocks.query.mockImplementation(batchQuery)
    const preview = await post('/shift-assignments/backdate/preview', batch)
    expect(preview.status).toBe(200)
    const data = await preview.json() as { previewToken: string; canApply: boolean }
    expect(data.canApply).toBe(true)
    const conn = batchConnection()
    mocks.getConnection.mockResolvedValue(conn)
    const response = await post('/shift-assignments/backdate/apply', { ...batch, previewToken: data.previewToken, reason: 'Perubahan jadwal menjadi tiga hari kerja.' })
    expect(response.status).toBe(201)
    expect(conn.commit).toHaveBeenCalledOnce()
    expect(conn.rollback).not.toHaveBeenCalled()
    const insert = conn.execute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO employee_shift_assignments'))
    expect(insert?.[1]).toContain(JSON.stringify([1, 3, 5]))
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Perubahan jadwal menjadi tiga hari kerja.' }), conn)
  })

  it.each([false, true])('batch dua karyawan menjaga atomisitas saat gagal tulis: %s', async failSecond => {
    const secondUid = '33333333-3333-4333-8333-333333333333'
    const input = { ...batch, employeeUids: [body.employeeUid, secondUid] }
    const query = (sql: unknown, values: unknown[]) => String(sql).includes('FROM employees e WHERE e.uid=')
      ? [[{ id: values[0] === secondUid ? 12 : 11, uid: values[0], employeeNumber: String(values[0]), fullName: 'Karyawan Uji' }]]
      : batchQuery(sql)
    mocks.query.mockImplementation(query)
    const preview = await post('/shift-assignments/backdate/preview', input)
    const data = await preview.json() as { previewToken: string; canApply: boolean }
    expect(data.canApply).toBe(true)
    const conn = batchConnection(vi.fn().mockImplementation(query))
    let insertCount = 0
    conn.execute.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('INSERT INTO employee_shift_assignments')) {
        insertCount += 1
        if (failSecond && insertCount === 2) throw new Error('Simulasi gagal menyimpan karyawan kedua')
        return [{ insertId: 100 + insertCount, affectedRows: 1 }]
      }
      return [{ insertId: 0, affectedRows: String(sql).includes('INSERT INTO attendance_daily_finalization_runs') ? 4 : 0 }]
    })
    mocks.getConnection.mockResolvedValue(conn)
    const response = await post('/shift-assignments/backdate/apply', { ...input, previewToken: data.previewToken, reason: 'Perubahan jadwal massal tiga hari kerja.' })
    expect(response.status).toBe(failSecond ? 500 : 201)
    if (failSecond) {
      expect(conn.rollback).toHaveBeenCalledOnce()
      expect(conn.commit).not.toHaveBeenCalled()
    } else {
      expect(await response.json()).toMatchObject({ createdCount: 2, invalidatedFinalizationCount: 4 })
      expect(conn.commit).toHaveBeenCalledOnce()
      expect(conn.rollback).not.toHaveBeenCalled()
      expect(conn.execute.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO attendance_daily_finalization_runs'))).toHaveLength(1)
    }
  })

  it.each([0, 1])('backdate tidak menghapus Attendance hari libur yang punya referensi: %s', async hasLinkedRecord => {
    mocks.query.mockImplementation(batchQuery)
    const preview = await post('/shift-assignments/backdate/preview', batch)
    const data = await preview.json() as { previewToken: string }
    const query = vi.fn().mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('SELECT ar.id,ar.attendance_status')) {
        expect(sql).toContain('FROM production_transactions production')
        expect(sql).toContain('FROM payroll_time_details payroll_time')
        expect(sql).toContain('FROM payroll_monthly_daily_details payroll_daily')
        return [[{ id: 91, attendanceStatus: 'HOLIDAY', businessDate: '2026-08-04', hasRawScan: 0, hasCorrection: 0, hasClassification: 0, hasLinkedRecord }]]
      }
      if (sql.includes('FROM attendance_calendar_events')) return [[]]
      return batchQuery(sql)
    })
    const conn = batchConnection(query)
    mocks.getConnection.mockResolvedValue(conn)
    const response = await post('/shift-assignments/backdate/apply', { ...batch, previewToken: data.previewToken, reason: 'Perubahan jadwal tiga hari kerja.' })
    expect(response.status).toBe(201)
    const deleted = conn.execute.mock.calls.filter(([sql]) => String(sql).includes('DELETE FROM attendance_records'))
    const updated = conn.execute.mock.calls.filter(([sql]) => String(sql).includes('UPDATE attendance_records'))
    expect(deleted).toHaveLength(hasLinkedRecord ? 0 : 1)
    expect(updated).toHaveLength(hasLinkedRecord ? 1 : 0)
    if (hasLinkedRecord) expect(updated[0]?.[1]?.[2]).toBe('ABSENT')
  })

  it.each(['production', 'payroll', 'snapshot', 'finalization', 'processing', 'pending'])('backdate preview dan apply mempertahankan blocker: %s', async blocker => {
    const guardedQuery = (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if ((blocker === 'processing' && sql.includes('SELECT run.id')) || (blocker === 'pending' && sql.includes('SELECT correction.id'))) return [[{ id: 99 }]]
      if ((blocker === 'production' && sql.includes('SELECT id FROM production_transactions')) ||
        (blocker === 'payroll' && sql.includes('SELECT id FROM payroll_periods')) ||
        (blocker === 'snapshot' && sql.includes('SELECT pas.id'))) return [[{ id: 99 }]]
      if (blocker === 'finalization' && sql.includes('SELECT id,status FROM attendance_daily_finalization_runs')) return [[{ id: 99, status: 'RUNNING' }]]
      const result = batchQuery(sql)
      if (sql.includes('SELECT\n       (SELECT COUNT(*) FROM attendance_records')) {
        Object.assign(result[0][0], { postedProduction: blocker === 'production' ? 1 : 0, lockedPayrollPeriods: blocker === 'payroll' ? 1 : 0, payrollAttendanceSnapshots: blocker === 'snapshot' ? 1 : 0, runningFinalizations: blocker === 'finalization' ? 1 : 0 })
      }
      return result
    }
    mocks.query.mockImplementation(guardedQuery)
    const preview = await post('/shift-assignments/backdate/preview', batch)
    const data = await preview.json() as { previewToken: string; canApply: boolean }
    expect(data.canApply).toBe(false)
    const conn = batchConnection(vi.fn().mockImplementation(guardedQuery))
    mocks.getConnection.mockResolvedValue(conn)
    expect((await post('/shift-assignments/backdate/apply', { ...batch, previewToken: data.previewToken, reason: 'Perubahan jadwal tiga hari kerja.' })).status).toBe(409)
    expect(conn.execute).not.toHaveBeenCalled()
    expect(conn.rollback).toHaveBeenCalledOnce()
    expect(conn.commit).not.toHaveBeenCalled()
  })

  it('menolak preview lama bila assignment berubah sebelum apply', async () => {
    mocks.query.mockImplementation(batchQuery)
    const preview = await post('/shift-assignments/backdate/preview', batch)
    const data = await preview.json() as { previewToken: string }
    const conn = batchConnection(vi.fn().mockImplementation((sql: unknown) => String(sql).includes('FROM employee_shift_assignments esa') ? [[{ id: 55, uid: 'assignment', shiftId: 22, shiftUid: body.shiftUid, shiftName: 'Shift Pagi', effectiveFrom: '2026-08-01', effectiveTo: null, workDays: '[1,2,3,4,5]' }]] : batchQuery(sql)))
    mocks.getConnection.mockResolvedValue(conn)
    const response = await post('/shift-assignments/backdate/apply', { ...batch, previewToken: data.previewToken, reason: 'Perubahan jadwal tiga hari kerja.' })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { message: string }).message).toContain('Data berubah')
    expect(conn.execute).not.toHaveBeenCalled()
    expect(conn.rollback).toHaveBeenCalledOnce()
  })

  it('seluruh batch batal jika satu karyawan baru eligible setelah tanggal pilihan', async () => {
    const secondUid = '33333333-3333-4333-8333-333333333333'
    let employeeId = 11
    const query = vi.fn().mockImplementation((sqlValue: unknown, values: unknown[]) => {
      const sql = String(sqlValue)
      if (sql.includes('FROM employees e WHERE e.uid=')) {
        employeeId = values[0] === secondUid ? 12 : 11
        return [[{ id: employeeId, uid: values[0], employeeNumber: `EMP-${employeeId}`, fullName: 'Karyawan Uji' }]]
      }
      if (employeeId === 12 && sql.includes('FROM employee_employment_histories eh')) return [[{ id: 32, siteId: 1, status: 'ACTIVE', allowsAttendance: 1, effectiveFrom: '2026-08-05', effectiveTo: null }]]
      return batchQuery(sql)
    })
    const conn = batchConnection(query)
    mocks.getConnection.mockResolvedValue(conn)
    const response = await post('/shift-assignments/backdate/apply', { ...batch, employeeUids: [body.employeeUid, secondUid], previewToken: 'a'.repeat(64), reason: 'Perubahan jadwal tiga hari kerja.' })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { message: string }).message).toContain('EMP-12')
    expect(conn.execute).not.toHaveBeenCalled()
    expect(conn.rollback).toHaveBeenCalledOnce()
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

  it('menyiapkan rencana Shift massal dengan rekomendasi per karyawan', async () => {
    const response = await post('/shift-assignment-plans/preview', {
      employeeUids: [body.employeeUid],
    })
    const result = (await response.json()) as {
      validCount: number
      invalidCount: number
      items: Array<Record<string, unknown>>
    }

    expect(response.status).toBe(200)
    expect(result.validCount).toBe(1)
    expect(result.invalidCount).toBe(0)
    expect(result.items).toEqual([
      expect.objectContaining({
        employeeUid: body.employeeUid,
        source: 'NEW_HIRE',
        shiftUid: body.shiftUid,
        shiftCode: 'BORONGAN_DEFAULT',
        effectiveFrom: '2026-08-01',
        valid: true,
        issues: [],
      }),
    ])
  })

  it('planner menerima tanggal mulai berbeda di masa depan tanpa melonggarkan koreksi histori', async () => {
    const response = await post('/shift-assignment-plans/preview', {
      employeeUids: [body.employeeUid],
      items: [
        {
          ...body,
          effectiveFrom: '2099-01-01',
          effectiveTo: null,
        },
      ],
    })
    const result = (await response.json()) as {
      validCount: number
      items: Array<{ effectiveFrom: string; valid: boolean; issues: string[] }>
    }

    expect(response.status).toBe(200)
    expect(result.validCount).toBe(1)
    expect(result.items[0]).toMatchObject({
      effectiveFrom: '2099-01-01',
      valid: true,
      issues: [],
    })
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

  it('mengizinkan realign satu hari untuk Shift sama tanpa membuat overlap', async () => {
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
              effectiveFrom: '2026-08-04',
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
      impact: { affectedAssignmentCount: number }
      timeline: Array<{
        shiftUid: string
        effectiveFrom: string
        effectiveTo: string | null
        change: string
      }>
    }

    expect(response.status).toBe(200)
    expect(result.canApply).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.impact.affectedAssignmentCount).toBe(1)
    expect(result.timeline).toEqual([
      expect.objectContaining({
        shiftUid: body.shiftUid,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: null,
        change: 'REPLACEMENT',
      }),
    ])
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

  it('menerapkan rencana Shift massal secara atomik', async () => {
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

    const response = await post('/shift-assignment-plans/apply', {
      items: [body],
    })
    const result = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(201)
    expect(result).toMatchObject({
      createdCount: 1,
      closedPreviousCount: 0,
      backdatedCount: 1,
      invalidatedFinalizationCount: 0,
      employeeUids: [body.employeeUid],
    })
    expect(conn.commit).toHaveBeenCalledOnce()
    expect(conn.rollback).not.toHaveBeenCalled()
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
