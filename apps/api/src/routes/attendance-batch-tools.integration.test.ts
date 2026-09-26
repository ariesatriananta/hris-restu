import type { AddressInfo } from 'node:net'
import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  connectionQuery: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}))

vi.mock('../config.js', () => ({
  env: {
    ATTENDANCE_GO_LIVE_DATE: '2026-08-01',
    ATTENDANCE_BATCH_TOOLS_ENABLED: true,
  },
}))
vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    getConnection: mocks.getConnection,
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: vi.fn() }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  requirePermission:
    (permission: string) =>
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const actor = res.locals.auth as ReturnType<typeof auth>
      if (!actor.permissions.includes(permission)) {
        return res.status(403).json({ message: 'Izin ditolak.' })
      }
      next()
    },
}))

import { errorHandler } from '../lib/errors.js'
import { attendanceBatchToolsRouter } from './attendance-batch-tools.js'

function auth(role = 'SUPER_ADMIN') {
  return {
    id: 7,
    uid: 'user-super-admin',
    name: 'Super Admin',
    email: null,
    roles: [role],
    permissions: ['attendance.correct'],
    siteAccess: ['JEPARA', 'SEMARANG', 'KLATEN'],
  }
}

async function post(path: string, body: unknown, role = 'SUPER_ADMIN') {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth(role)
    next()
  })
  app.use('/api/attendance', attendanceBatchToolsRouter)
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

const candidate = {
  employeeId: 10,
  siteId: 1,
  site: 'JEPARA',
  siteName: 'Site Jepara',
  siteActive: 1,
  employmentCount: 1,
  assignmentCount: 1,
  validAssignmentCount: 1,
  deviceId: 5,
}

describe('Attendance batch tools API', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getConnection.mockResolvedValue({
      query: mocks.connectionQuery,
      execute: mocks.execute,
      beginTransaction: mocks.beginTransaction,
      commit: mocks.commit,
      rollback: mocks.rollback,
      release: mocks.release,
    })
  })

  it('menampilkan kesiapan input saat histori, shift, dan perangkat valid', async () => {
    mocks.query
      .mockResolvedValueOnce([[candidate]])
      .mockResolvedValueOnce([
        [
          {
            recordCount: 0,
            finalizationCount: 0,
            classificationCount: 0,
            orphanScanCount: 0,
            productionCount: 0,
            processedPayrollCount: 0,
            payrollSnapshotCount: 0,
          },
        ],
      ])

    const response = await post('/batch-input/preview', {
      businessDate: '2026-09-03',
      site: 'JEPARA',
      mode: 'FULL_PRESENT',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: expect.objectContaining({
        businessDate: '2026-09-03',
        eligibleEmployeeCount: 1,
        siteCount: 1,
        canCreate: true,
        blockers: [],
      }),
    })
  })

  it('menjelaskan blocker sebelum input dijalankan', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ ...candidate, validAssignmentCount: 0 }]])
      .mockResolvedValueOnce([
        [
          {
            recordCount: 2,
            finalizationCount: 0,
            classificationCount: 0,
            orphanScanCount: 0,
            productionCount: 1,
            processedPayrollCount: 0,
            payrollSnapshotCount: 0,
          },
        ],
      ])

    const response = await post('/batch-input/preview', {
      businessDate: '2026-09-03',
      site: 'JEPARA',
      mode: 'RANDOM',
    })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      data: { canCreate: boolean; blockers: string[] }
    }
    expect(payload.data.canCreate).toBe(false)
    expect(payload.data.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('penugasan shift'),
        expect.stringContaining('Tanggal belum bersih'),
        expect.stringContaining('Produksi'),
      ])
    )
  })

  it('menolak pengguna selain Super Admin', async () => {
    const response = await post(
      '/batch-input/preview',
      {
        businessDate: '2026-09-03',
        site: 'JEPARA',
        mode: 'RANDOM',
      },
      'HR_OFFICER'
    )
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('memvalidasi import jam tidak lengkap sebagai abnormal yang siap diproses', async () => {
    mocks.connectionQuery.mockImplementation(async (sql: string) => {
      if (
        sql.includes('FROM tmp_attendance_import_rows input') &&
        sql.includes('LEFT JOIN employees employee')
      ) {
        return [
          [
            {
              rowNumber: 2,
              employeeId: 10,
              employeeUid: 'employee-uid',
              employeeNumber: 'PKDS-001',
              employeeName: 'Siti',
              historyId: 20,
              siteId: 1,
              allowsAttendance: 1,
              site: 'JEPARA',
              siteName: 'Site Jepara',
              siteActive: 1,
              assignmentId: 30,
              workDays: '[1,2,3,4,5,6]',
              shiftId: 40,
              shiftName: 'Shift Borongan',
              shiftSiteId: 1,
              startTime: '07:00',
              endTime: '15:00',
              crossesMidnight: 0,
              lateToleranceMinutes: 10,
              earlyLeaveToleranceMinutes: 10,
              shiftActive: 1,
              recordCount: 0,
              classificationCount: 0,
              finalizationCount: 0,
              productionCount: 0,
              processedPayrollCount: 0,
              payrollSnapshotCount: 0,
            },
          ],
        ]
      }
      return [[]]
    })

    const response = await post('/import/preview', {
      rows: [
        {
          rowNumber: 2,
          businessDate: '2026-09-03',
          employeeNumber: 'PKDS-001',
          employeeName: 'Siti',
          status: 'HADIR',
          clockIn: '07:05',
          clockOut: '',
          notes: '',
        },
      ],
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: expect.objectContaining({
        total: 1,
        valid: 1,
        invalid: 0,
        warnings: 1,
        rows: [
          expect.objectContaining({
            valid: true,
            attendanceStatus: 'PRESENT',
            warning: expect.stringContaining('abnormal'),
          }),
        ],
      }),
    })
  })

  it('menyimpan jam import sebagai koreksi yang langsung disetujui', async () => {
    mocks.connectionQuery.mockImplementation(
      async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT after_data afterData FROM audit_logs')) {
          return [[]]
        }
        if (
          sql.includes('FROM tmp_attendance_import_rows input') &&
          sql.includes('LEFT JOIN employees employee')
        ) {
          return [
            [
              {
                rowNumber: 2,
                employeeId: 10,
                employeeUid: 'employee-uid',
                employeeNumber: 'PKDS-001',
                employeeName: 'Siti',
                historyId: 20,
                siteId: 1,
                allowsAttendance: 1,
                site: 'JEPARA',
                siteName: 'Site Jepara',
                siteActive: 1,
                assignmentId: 30,
                workDays: '[1,2,3,4,5,6]',
                shiftId: 40,
                shiftName: 'Shift Borongan',
                shiftSiteId: 1,
                startTime: '07:00',
                endTime: '15:00',
                crossesMidnight: 0,
                lateToleranceMinutes: 10,
                earlyLeaveToleranceMinutes: 10,
                shiftActive: 1,
                recordCount: 0,
                classificationCount: 0,
                finalizationCount: 0,
                productionCount: 0,
                processedPayrollCount: 0,
                payrollSnapshotCount: 0,
              },
            ],
          ]
        }
        if (sql.includes('SELECT id,uid FROM attendance_records')) {
          return [[{ id: 100, uid: String(params?.[0]) }]]
        }
        return [[]]
      }
    )

    const response = await post('/import', {
      rows: [
        {
          rowNumber: 2,
          businessDate: '2026-09-03',
          employeeNumber: 'PKDS-001',
          employeeName: 'Siti',
          status: 'HADIR',
          clockIn: '07:05',
          clockOut: '',
          notes: '',
        },
      ],
      reason: 'Import rekap darurat HR.',
      idempotencyKey: '7f387995-1ef6-471f-b5c9-646f674fe4c1',
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      data: expect.objectContaining({
        imported: 1,
        attendanceRecords: 1,
        corrections: 1,
        classificationRequests: 0,
      }),
    })
    expect(
      mocks.connectionQuery.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO attendance_corrections')
      )
    ).toBe(true)
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('menampilkan setiap tanggal beserta blocker reset', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          businessDate: '2026-09-03',
          siteCount: 1,
          employeeCount: 2,
          recordCount: 2,
          scanEventCount: 4,
          correctionCount: 0,
          classificationCount: 0,
          finalizationCount: 1,
          hasMultiDayClassification: 0,
          hasProduction: 0,
          hasProcessedPayroll: 0,
          hasPayrollSnapshot: 0,
          hasTimeDetail: 0,
          hasMonthlyDetail: 0,
          hasRunningFinalization: 0,
        },
        {
          businessDate: '2026-09-02',
          siteCount: 1,
          employeeCount: 2,
          recordCount: 2,
          scanEventCount: 4,
          correctionCount: 0,
          classificationCount: 0,
          finalizationCount: 0,
          hasMultiDayClassification: 0,
          hasProduction: 1,
          hasProcessedPayroll: 0,
          hasPayrollSnapshot: 0,
          hasTimeDetail: 0,
          hasMonthlyDetail: 0,
          hasRunningFinalization: 0,
        },
      ],
    ])

    const response = await post('/batch-delete/summary', {
      dateFrom: '2026-09-02',
      dateTo: '2026-09-03',
      site: 'JEPARA',
    })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      data: { rows: Array<{ businessDate: string; canDelete: boolean }> }
    }
    expect(payload.data.rows).toEqual([
      expect.objectContaining({ businessDate: '2026-09-03', canDelete: true }),
      expect.objectContaining({ businessDate: '2026-09-02', canDelete: false }),
    ])
  })

  it('membatalkan seluruh reset jika salah satu tanggal berubah menjadi terblokir', async () => {
    mocks.connectionQuery
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            businessDate: '2026-09-03',
            siteCount: 1,
            employeeCount: 2,
            recordCount: 2,
            scanEventCount: 4,
            correctionCount: 0,
            classificationCount: 0,
            finalizationCount: 0,
            hasMultiDayClassification: 0,
            hasProduction: 1,
            hasProcessedPayroll: 0,
            hasPayrollSnapshot: 0,
            hasTimeDetail: 0,
            hasMonthlyDetail: 0,
            hasRunningFinalization: 0,
          },
        ],
      ])

    const response = await post('/batch-delete', {
      businessDates: ['2026-09-03'],
      site: 'JEPARA',
      reason: 'Mengulang data demo.',
      confirmation: 'HAPUS',
    })

    expect(response.status).toBe(409)
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledOnce()
  })
})
