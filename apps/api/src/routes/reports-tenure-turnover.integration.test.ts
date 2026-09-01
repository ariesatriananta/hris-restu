import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { reportsRouter } from './reports.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  audit: vi.fn(),
  begin: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    getConnection: vi.fn(async () => ({
      beginTransaction: mocks.begin,
      commit: mocks.commit,
      rollback: mocks.rollback,
      release: mocks.release,
    })),
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../config.js', () => ({ env: { ATTENDANCE_GO_LIVE_DATE: '2026-08-01' } }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!res.locals.auth) return res.status(401).json({ message: 'Sesi tidak tersedia.' })
    next()
  },
  requirePermission: (permission: string) =>
    (_req: express.Request, res: express.Response, next: express.NextFunction) => {
      const auth = res.locals.auth as AuthContext
      if (!auth.roles.includes('SUPER_ADMIN') && !auth.permissions.includes(permission)) {
        return res.status(403).json({ message: 'Izin ditolak.' })
      }
      next()
    },
}))

const hr: AuthContext = {
  id: 7,uid: 'hr-jepara',name: 'HR Jepara',email: null,
  roles: ['HR_OFFICER'],permissions: ['reports.view','employees.view'],siteAccess: ['JEPARA'],
}

async function request(path: string, auth: AuthContext = hr, options?: RequestInit) {
  const app = express()
  app.use(express.json())
  app.use((_req,res,next) => { res.locals.auth=auth; next() })
  app.use('/api/reports',reportsRouter)
  app.use(errorHandler)
  const server=app.listen(0)
  await new Promise<void>((resolve)=>server.once('listening',resolve))
  try {
    const port=(server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/reports${path}`,options)
  } finally {
    await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))
  }
}

const activeEmployee = {
  employeeUid:'11111111-1111-4111-8111-111111111111',employeeNumber:'PKDS-001',employeeName:'SITI',
  joinDate:'2023-08-01',siteUid:'22222222-2222-4222-8222-222222222222',siteCode:'JEPARA',siteName:'Site Jepara',
  employeeTypeUid:'33333333-3333-4333-8333-333333333333',employeeTypeCode:'BORONGAN',employeeTypeName:'Borongan',
  productionSectionUid:null,productionSectionCode:null,productionSectionName:null,statusCode:'ACTIVE',
  tenureDays:1096,tenureMonths:36,tenureBand:'Y3_TO_5',historyCount:1,
}
const resignedEmployee = {
  ...activeEmployee,historyUid:'44444444-4444-4444-8444-444444444444',exitDate:'2026-08-21',
  tenureDays:1116,tenureMonths:36,referenceNumber:'RESIGN-001',
}

function mockSummary() {
  mocks.query
    .mockResolvedValueOnce([[{activeHeadcount:400,ambiguousHistories:1}]])
    .mockResolvedValueOnce([[{activeHeadcount:406,ambiguousHistories:0}]])
    .mockResolvedValueOnce([[{averageTenureMonths:26,lessThanOneYear:20,oneToThreeYears:100,threeToFiveYears:150,fiveYearsOrMore:136}]])
    .mockResolvedValueOnce([[{joined:10}]])
    .mockResolvedValueOnce([[{resigned:4}]])
}

describe('Laporan Masa Kerja & Turnover API', () => {
  beforeEach(() => Object.values(mocks).forEach((mock)=>mock.mockReset()))

  it('mewajibkan permission laporan dan karyawan', async () => {
    const response=await request('/tenure-turnover?dateFrom=2026-01-01&dateTo=2026-08-31',{...hr,permissions:['reports.view']})
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengembalikan masa kerja dan rumus turnover yang dapat diaudit', async () => {
    mockSummary()
    mocks.query.mockResolvedValueOnce([[{total:1}]]).mockResolvedValueOnce([[activeEmployee]])
    const response=await request('/tenure-turnover?dateFrom=2026-01-01&dateTo=2026-08-31&site=JEPARA&tenureBand=Y3_TO_5')
    const body=await response.json() as {summary:Record<string,number>;items:Array<Record<string,unknown>>}
    expect(response.status).toBe(200)
    expect(body.summary).toMatchObject({openingHeadcount:400,closingHeadcount:406,joined:10,resigned:4})
    expect(body.summary.turnoverRate).toBeCloseTo(4/403*100)
    expect(body.items[0]).toMatchObject({employeeName:'SITI',tenureMonths:36,site:{code:'JEPARA'}})
    expect(body.items[0]).not.toHaveProperty('reason')
    expect(body.items[0]).not.toHaveProperty('notes')
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain("historyCount=1 AND statusCode='ACTIVE'")
    expect(String(mocks.query.mock.calls[4]?.[0])).toContain("target_status.code='RESIGNED'")
  })

  it('menolak site di luar akses dan periode terlalu panjang', async () => {
    expect((await request('/tenure-turnover?dateFrom=2026-01-01&dateTo=2026-08-31&site=KLATEN')).status).toBe(403)
    expect((await request('/tenure-turnover?dateFrom=2026-01-01&dateTo=2027-01-02')).status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengekspor dua lembar aman dan mencatat audit per site', async () => {
    mockSummary()
    mocks.query
      .mockResolvedValueOnce([[activeEmployee]])
      .mockResolvedValueOnce([[resignedEmployee]])
      .mockResolvedValueOnce([[{id:11,code:'JEPARA'}]])
    mocks.audit.mockResolvedValue(undefined)
    const response=await request('/tenure-turnover/export',hr,{
      method:'POST',headers:{'Content-Type':'application/json','X-Request-ID':'tenure-report-test'},
      body:JSON.stringify({dateFrom:'2026-01-01',dateTo:'2026-08-31',site:['JEPARA']}),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('spreadsheetml')
    expect(response.headers.get('x-request-id')).toBe('tenure-report-test')
    expect(mocks.audit).toHaveBeenCalledOnce()
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({module:'REPORTS',action:'EXPORT',siteId:11,requestId:'tenure-report-test'})
    expect(mocks.audit.mock.calls[0]?.[0]?.afterData).toMatchObject({activeRowCount:1,turnoverRowCount:1})
    expect(mocks.audit.mock.calls[0]?.[0]?.afterData).not.toHaveProperty('reason')
    expect(mocks.commit).toHaveBeenCalledOnce()
  })
})
