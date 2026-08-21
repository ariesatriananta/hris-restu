import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { attendanceInsightsRouter } from './attendance-insights.js'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))

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
        return res.status(403).json({
          message: 'Anda tidak memiliki izin untuk aksi ini.',
        })
      }
      next()
    },
}))

function auth(allowed = true): AuthContext {
  return {
    id: 7,
    uid: 'hr-jepara',
    name: 'HR Jepara',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: allowed ? ['attendance.view'] : [],
    siteAccess: ['JEPARA'],
  }
}

async function get(path: string, context = auth()) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.auth = context
    next()
  })
  app.use('/api/attendance', attendanceInsightsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/attendance${path}`)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Attendance insights API', () => {
  beforeEach(() => {
    mocks.query.mockReset()
  })

  it('menolak readiness tanpa permission sebelum mengakses database', async () => {
    const response = await get('/readiness', auth(false))
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('meringkas kesiapan hanya untuk site yang boleh diakses', async () => {
    mocks.query.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('FROM sites s')) {
        return [[{ id: 1, site: 'JEPARA', siteName: 'Site Jepara' }]]
      }
      if (sql.includes('FROM attendance_calendar_events')) {
        return [
          [{ nationalHolidayCount: 17, collectiveLeaveAvailableCount: 8 }],
        ]
      }
      if (sql.includes('FROM employee_employment_histories h')) {
        return [
          [
            {
              eligibleEmployeeCount: 10,
              withoutAssignmentCount: 2,
              ambiguousAssignmentCount: 1,
            },
          ],
        ]
      }
      if (sql.includes('FROM scan_devices')) {
        return [[{ totalCount: 2, readyCount: 1, notReadyCount: 1 }]]
      }
      if (sql.includes('FROM attendance_calendar_site_rules')) {
        return [[{ selectedCount: 3 }]]
      }
      if (sql.includes('FROM attendance_daily_finalization_runs latest')) {
        return [
          [
            { businessDate: '2026-08-17' },
            { businessDate: '2026-08-16' },
          ],
        ]
      }
      if (sql.includes('FROM attendance_corrections ac')) {
        return [[{ pendingCorrectionCount: 4, pendingClassificationCount: 5 }]]
      }
      throw new Error(`Query belum dimock: ${sql.slice(0, 100)}`)
    })

    const response = await get('/readiness?site=JEPARA')
    const result = (await response.json()) as {
      items: Array<Record<string, unknown>>
      totals: Record<string, unknown>
    }
    expect(response.status).toBe(200)
    expect(result.items).toEqual([
      expect.objectContaining({
        site: 'JEPARA',
        shift: expect.objectContaining({
          eligibleEmployeeCount: 10,
          withoutAssignmentCount: 2,
          ambiguousAssignmentCount: 1,
          ready: false,
        }),
        devices: expect.objectContaining({
          totalCount: 2,
          readyCount: 1,
          notReadyCount: 1,
          hasReadyDevice: true,
        }),
        finalization: {
          rerunRequiredCount: 2,
          rerunRequiredDates: ['2026-08-17', '2026-08-16'],
        },
        followUp: {
          pendingCorrectionCount: 4,
          pendingClassificationCount: 5,
          totalCount: 9,
        },
      }),
    ])
    expect(result.totals).toMatchObject({
      siteCount: 1,
      withoutAssignmentCount: 2,
      finalizationRerunCount: 2,
      pendingFollowUpCount: 9,
    })
  })

  it('menolak timeline record milik site lain', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          id: 99,
          uid: 'attendance-semarang',
          employeeId: 10,
          employeeUid: 'employee-10',
          employeeNumber: 'EMP-010',
          employeeName: 'Siti',
          siteId: 2,
          site: 'SEMARANG',
          businessDate: '2026-08-07',
          status: 'PRESENT',
          shiftName: 'Shift Pagi',
        },
      ],
    ])
    const response = await get('/records/attendance-semarang/timeline')
    expect(response.status).toBe(403)
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })

  it('mengembalikan timeline lintas sumber dan mengurutkan terbaru', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 11,
            uid: 'attendance-jepara',
            employeeId: 10,
            employeeUid: 'employee-10',
            employeeNumber: 'EMP-010',
            employeeName: 'Siti',
            siteId: 1,
            site: 'JEPARA',
            businessDate: '2026-08-07',
            status: 'PRESENT',
            shiftName: 'Shift Pagi',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            uid: 'scan-1',
            eventType: 'CLOCK_IN',
            status: 'SUCCESS',
            description: 'Masuk tercatat.',
            occurredAt: '2026-08-07T06:01:00+07:00',
            deviceUid: 'device-1',
            deviceCode: 'TERM-01',
            deviceName: 'Terminal 1',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            uid: 'correction-1',
            correctionType: 'CLOCK_OUT',
            status: 'APPROVED',
            description: 'Lupa scan pulang.',
            occurredAt: '2026-08-08T08:00:00+07:00',
            actorName: 'HR Jepara',
            reviewNotes: 'Terverifikasi.',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])

    const response = await get('/records/attendance-jepara/timeline')
    const result = (await response.json()) as {
      attendance: Record<string, unknown>
      items: Array<Record<string, unknown>>
    }
    expect(response.status).toBe(200)
    expect(result.attendance).toMatchObject({
      uid: 'attendance-jepara',
      employeeUid: 'employee-10',
      site: 'JEPARA',
    })
    expect(
      result.items.map((item: Record<string, unknown>) => item.type)
    ).toEqual(['CORRECTION', 'SCAN'])
  })
})
