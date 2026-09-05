import type { AddressInfo } from 'node:net'
import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../db.js', () => ({
  pool: { query: mocks.query },
}))

vi.mock('../config.js', () => ({
  env: {
    ATTENDANCE_GO_LIVE_DATE: '2026-08-01',
    R2_PUBLIC_BASE_URL: 'https://files.example.test',
  },
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
        return res.status(403).json({ message: 'Anda tidak memiliki izin untuk aksi ini.' })
      }
      next()
    },
}))

import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { attendanceClassificationsRouter } from './attendance-classifications.js'
import { attendanceCorrectionsRouter } from './attendance-corrections.js'
import { attendanceRecapsRouter } from './attendance-recaps.js'

const sectionUid = '11111111-1111-4111-8111-111111111111'
const otherSectionUid = '22222222-2222-4222-8222-222222222222'

function auth(): AuthContext {
  return {
    id: 7,
    uid: 'hr-jepara',
    name: 'HR Jepara',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: ['attendance.view', 'attendance.correct', 'attendance.approve'],
    siteAccess: ['JEPARA'],
  }
}

async function get(path: string) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.auth = auth()
    next()
  })
  app.use('/api/attendance', attendanceCorrectionsRouter)
  app.use('/api/attendance', attendanceClassificationsRouter)
  app.use('/api/attendance', attendanceRecapsRouter)
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

describe('Attendance historical employee filters API', () => {
  beforeEach(() => mocks.query.mockReset())

  it('menerapkan jenis dan bagian historis ke monitoring serta ringkasannya', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]])

    const response = await get(
      `/monitoring?businessDate=2026-08-21&employeeType=BORONGAN&productionSection=${sectionUid}`
    )
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledTimes(3)
    for (const [sqlValue, params] of mocks.query.mock.calls) {
      const sql = String(sqlValue)
      expect(sql).toContain('JOIN employee_employment_histories eh')
      expect(sql).toContain('eh.effective_from<=ar.business_date')
      expect(sql).toContain('et.code IN (?)')
      expect(sql).toContain('ps.uid IN (?)')
      expect(params).toEqual(expect.arrayContaining(['BORONGAN', sectionUid, 'JEPARA']))
    }
    const listSql = String(mocks.query.mock.calls[1]?.[0])
    expect(listSql).toContain("applied_classification.outcome='APPLIED'")
    expect(listSql).toContain('hasAppliedClassification')
    expect(listSql).toContain('pending_correction.uid pendingCorrectionUid')
    expect(listSql).toContain("candidate.approval_status='PENDING'")
  })

  it('menolak Monitoring Harian sebelum tanggal go-live', async () => {
    const response = await get('/monitoring?businessDate=2026-07-31')

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      message: 'Attendance operasional hanya berlaku mulai 2026-08-01.',
    })
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengambil detail koreksi untuk dialog review sesuai scope site', async () => {
    const correctionUid = '66666666-6666-4666-8666-666666666666'
    mocks.query.mockResolvedValueOnce([[{
      uid: correctionUid,
      attendanceUid: '55555555-5555-4555-8555-555555555555',
      businessDate: '2026-08-21',
      employeeUid: '33333333-3333-4333-8333-333333333333',
      employeeNumber: 'JPR-010',
      employeeName: 'Karyawan Historis',
      employeeType: 'BORONGAN',
      site: 'JEPARA',
      correctionType: 'CLOCK_IN',
      approvalStatus: 'PENDING',
      reason: 'Jam masuk belum terekam.',
      requestedByName: 'HR Jepara',
      requestedAt: '2026-08-21T08:00:00+07:00',
    }]])

    const response = await get(`/corrections/${correctionUid}`)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      uid: correctionUid,
      approvalStatus: 'PENDING',
      site: 'JEPARA',
    })
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE ac.uid=? AND s.code IN (?)'),
      [correctionUid, 'JEPARA']
    )
  })

  it('menerapkan filter historis ke count dan daftar koreksi', async () => {
    mocks.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]])
    const response = await get(
      `/corrections?employeeType=HARIAN&productionSection=${sectionUid}`
    )
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledTimes(2)
    for (const [sqlValue, params] of mocks.query.mock.calls) {
      const sql = String(sqlValue)
      expect(sql).toContain('JOIN employee_employment_histories eh')
      expect(sql).toContain('eh.effective_from<=ar.business_date')
      expect(sql).toContain('ar.business_date>=?')
      expect(params).toEqual(expect.arrayContaining(['HARIAN', sectionUid, 'JEPARA']))
      expect(params).toContain('2026-08-01')
    }
  })

  it('memakai histori pada start_date untuk count dan daftar klasifikasi', async () => {
    mocks.query.mockResolvedValueOnce([[{ total: 0 }]]).mockResolvedValueOnce([[]])
    const response = await get(
      `/classifications?employeeType=TRAINING&productionSection=${sectionUid}`
    )
    expect(response.status).toBe(200)
    expect(mocks.query).toHaveBeenCalledTimes(2)
    for (const [sqlValue, params] of mocks.query.mock.calls) {
      const sql = String(sqlValue)
      expect(sql).toContain('JOIN employee_employment_histories eh')
      expect(sql).toContain('eh.effective_from<=acr.start_date')
      expect(sql).toContain('eh.effective_to>=acr.start_date')
      expect(sql).toContain('acr.end_date>=?')
      expect(params).toEqual(expect.arrayContaining(['TRAINING', sectionUid, 'JEPARA']))
      expect(params).toContain('2026-08-01')
    }
  })

  it('menolak kode jenis atau UID bagian yang tidak valid sebelum query', async () => {
    const response = await get(
      '/monitoring?businessDate=2026-08-21&employeeType=PEGAWAI&productionSection=bagian-a'
    )
    expect(response.status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('memfilter rekap berdasarkan bagian historis per hari', async () => {
    mocks.query.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('SELECT id,uid,code,name FROM sites')) {
        return [[{ id: 1, uid: 'site-jepara', code: 'JEPARA', name: 'Jepara' }]]
      }
      if (sql.includes('JOIN employee_employment_histories h')) {
        return [[{
          businessDate: '2026-08-21',
          employeeId: 10,
          employeeUid: '33333333-3333-4333-8333-333333333333',
          employeeNumber: 'JPR-010',
          employeeName: 'Karyawan Historis',
          historyId: 50,
          historySiteId: 1,
          site: 'JEPARA',
          siteName: 'Jepara',
          employeeType: 'BORONGAN',
          productionSectionUid: sectionUid,
          productionSection: 'Packing',
          allowsAttendance: 1,
          employmentCount: 1,
          assignmentCount: 1,
          assignmentId: 60,
          workDays: '[1,2,3,4,5,6,7]',
          shiftId: 70,
          shiftUid: '44444444-4444-4444-8444-444444444444',
          shiftSiteId: 1,
          crossesMidnight: 0,
          attendanceUid: '55555555-5555-4555-8555-555555555555',
          attendanceSiteId: 1,
          attendanceStatus: 'PRESENT',
          storedDayType: 'WORKDAY',
          storedReasonType: 'SHIFT_WEEKDAY',
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          workedMinutes: 480,
          isCorrected: 0,
          asOf: '2026-08-21 18:00:00',
          scheduledEndAt: '2026-08-21 15:00:00',
        }]]
      }
      return [[]]
    })

    const matching = await get(
      `/recaps?dateFrom=2026-08-21&dateTo=2026-08-21&site=JEPARA&employeeType=BORONGAN&productionSection=${sectionUid}`
    )
    expect(matching.status).toBe(200)
    expect((await matching.json()) as { total: number }).toMatchObject({ total: 1 })
    const projectionSql = String(
      mocks.query.mock.calls.find(([sql]) =>
        String(sql).includes('JOIN employee_employment_histories h')
      )?.[0]
    )
    expect(projectionSql).toContain('h.effective_from<=d.business_date')
    expect(projectionSql).toContain('ps.uid productionSectionUid')

    mocks.query.mockClear()
    const notMatching = await get(
      `/recaps?dateFrom=2026-08-21&dateTo=2026-08-21&site=JEPARA&productionSection=${otherSectionUid}`
    )
    expect(notMatching.status).toBe(200)
    expect((await notMatching.json()) as { total: number }).toMatchObject({ total: 0 })
  })
})
