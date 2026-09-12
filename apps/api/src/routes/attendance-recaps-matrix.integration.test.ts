import type { AddressInfo } from 'node:net'
import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  loadProjection: vi.fn(),
  getConnection: vi.fn(),
  writeAudit: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: { query: mocks.query, getConnection: mocks.getConnection },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.writeAudit }))
vi.mock('../config.js', () => ({
  env: { ATTENDANCE_GO_LIVE_DATE: '2026-08-01' },
}))
vi.mock('../middleware/authenticate.js', () => ({
  requirePermission:
    () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}))
vi.mock('../lib/attendance-recap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/attendance-recap.js')>()
  return { ...actual, loadAttendanceRecapProjection: mocks.loadProjection }
})

import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { attendanceRecapsRouter } from './attendance-recaps.js'

const baseDetail = {
  employeeUid: '11111111-1111-4111-8111-111111111111',
  employeeNumber: 'JPR-001',
  employeeName: 'Karyawan Uji',
  dayName: 'Senin',
  site: 'JEPARA',
  siteName: 'Jepara',
  employeeType: 'BORONGAN',
  department: 'Produksi',
  position: 'Operator',
  productionModule: null,
  productionSectionUid: null,
  productionSection: null,
  workGroup: null,
  shiftUid: null,
  shiftCode: null,
  shiftName: null,
  shiftStartTime: null,
  shiftEndTime: null,
  virtual: false,
  calendarDayType: 'WORKDAY' as const,
  calendarReasonType: 'SHIFT_WEEKDAY',
  calendarName: null,
  clockInAt: null,
  clockOutAt: null,
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  workedMinutes: null,
  clockInSource: null,
  clockOutSource: null,
  isCorrected: false,
  notes: null,
  qualityStatus: 'NORMAL' as const,
  abnormalReasons: [],
}

function auth(): AuthContext {
  return {
    id: 7,
    uid: 'hr-jepara',
    name: 'HR Jepara',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: ['attendance.view'],
    siteAccess: ['JEPARA'],
  }
}

async function get(path: string) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.auth = auth()
    next()
  })
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

async function post(path: string, body: unknown) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth()
    next()
  })
  app.use('/api/attendance', attendanceRecapsRouter)
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

describe('Attendance recap matrix API', () => {
  beforeEach(() => {
    mocks.query.mockReset()
    mocks.loadProjection.mockReset()
    mocks.getConnection.mockReset()
    mocks.writeAudit.mockReset().mockResolvedValue(undefined)
    mocks.getConnection.mockResolvedValue({
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    })
    mocks.query.mockResolvedValueOnce([
      [{ id: 1, uid: 'site-jepara', code: 'JEPARA', name: 'Jepara' }],
    ])
    mocks.loadProjection.mockResolvedValue({
      details: [
        { ...baseDetail, businessDate: '2026-08-31', status: 'PRESENT' },
        {
          ...baseDetail,
          businessDate: '2026-09-01',
          dayName: 'Selasa',
          status: 'SICK',
        },
      ],
      completeness: {
        official: true,
        exportAllowed: true,
        blockedReasons: [],
        sites: [],
      },
    })
  })

  it('mengembalikan satu baris dengan semua tanggal saat difilter status', async () => {
    const response = await get(
      '/recaps/matrix?dateFrom=2026-08-31&dateTo=2026-09-02&site=JEPARA&attendanceStatus=SICK'
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      dates: Array<{ date: string; dayName: string }>
      items: Array<{
        site: string
        days: Record<string, { status: string } | null>
      }>
    }
    expect(body.dates).toHaveLength(3)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].site).toBe('JEPARA')
    expect(body.items[0].days['2026-08-31']?.status).toBe('PRESENT')
    expect(body.items[0].days['2026-09-01']?.status).toBe('SICK')
    expect(body.items[0].days['2026-09-02']).toBeNull()
  })

  it('tetap mengekspor data belum lengkap sebagai workbook draft', async () => {
    mocks.loadProjection.mockResolvedValueOnce({
      details: [
        { ...baseDetail, businessDate: '2026-08-31', status: 'PRESENT' },
      ],
      completeness: {
        official: true,
        exportAllowed: false,
        blockedReasons: ['Finalisasi belum selesai.'],
        sites: [
          {
            site: 'JEPARA',
            date: '2026-08-31',
            status: 'PARTIAL',
            reasons: ['Finalisasi belum selesai.'],
          },
        ],
      },
    })

    const response = await post('/recaps/export', {
      dateFrom: '2026-08-31',
      dateTo: '2026-08-31',
      site: ['JEPARA'],
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain(
      'DRAFT_Rekap_Attendance_JEPARA_2026-08-31_sd_2026-08-31.xlsx'
    )
    expect(response.headers.get('x-attendance-recap-status')).toBe('DRAFT')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        afterData: expect.objectContaining({
          documentStatus: 'DRAFT',
          completenessReasons: ['Finalisasi belum selesai.'],
        }),
      }),
      expect.anything()
    )
  })
})
