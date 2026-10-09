import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import {
  productionImportPostInput,
  productionImportPreviewInput,
} from '../lib/production-transaction-policy.js'
import type { AuthContext } from '../middleware/authenticate.js'
import {
  productionTransactionsRouter,
  writeProductionImportAudits,
} from './production-transactions.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
}))

const connection = {
  query: mocks.query,
  execute: mocks.execute,
  beginTransaction: mocks.beginTransaction,
  commit: mocks.commit,
  rollback: mocks.rollback,
  release: mocks.release,
}

vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    execute: mocks.execute,
    getConnection: vi.fn(async () => connection),
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
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
      const context = res.locals.auth as AuthContext
      if (
        !context.roles.includes('SUPER_ADMIN') &&
        !context.permissions.includes(permission)
      ) {
        return res.status(403).json({ message: 'Izin ditolak.' })
      }
      next()
    },
}))

const token = 'a'.repeat(43)
const employeeUid = '11111111-1111-4111-8111-111111111111'
const jobUid = '22222222-2222-4222-8222-222222222222'
const transactionUid = '33333333-3333-4333-8333-333333333333'

function auth(options: { permissions?: string[]; sites?: string[] } = {}): AuthContext {
  return {
    id: 7,
    uid: 'production-user',
    name: 'Production User',
    email: null,
    roles: ['PRODUCTION_ADMIN'],
    permissions: options.permissions ?? ['production.scan', 'production.view'],
    siteAccess: options.sites ?? ['JEPARA'],
  }
}

async function request(
  path: string,
  options: {
    method?: string
    body?: unknown
    auth?: AuthContext
    withToken?: boolean
  } = {}
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = options.auth ?? auth()
    next()
  })
  app.use('/api/production', productionTransactionsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/production${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(options.withToken === false
          ? {}
          : { 'X-Production-Device-Token': token }),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

function deviceRow() {
  return {
    id: 9,
    uid: '44444444-4444-4444-8444-444444444444',
    code: 'PROD-01',
    name: 'Scanner Produksi',
    deviceType: 'USB_SCANNER',
    siteId: 1,
    isActive: 1,
    activatedAt: '2026-08-21 08:00:00',
    site: 'JEPARA',
    siteName: 'Site Jepara',
  }
}

function transactionRow() {
  return {
    id: 21,
    uid: transactionUid,
    transactionNumber: 'PRD-20260821-JEPARA-ABC',
    businessDate: '2026-08-21',
    transactionAt: '2026-08-21T09:00:00+07:00',
    quantity: '3.0000',
    rateSnapshot: '1175.0000',
    grossAmount: '3525.00',
    status: 'POSTED',
    notes: null,
    employeeUid,
    employeeNumber: 'J2608-001',
    fullName: 'Ariel Peterpan',
    site: 'JEPARA',
    siteName: 'Site Jepara',
    jobUid,
    jobCode: 'BORONGAN-LINTING',
    jobName: 'Linting',
    unitUid: '55555555-5555-4555-8555-555555555555',
    unitCode: 'PCS',
    unitName: 'Pcs / Batang',
    decimalPrecision: 0,
    rateUid: '66666666-6666-4666-8666-666666666666',
    rateCurrency: 'IDR',
    deviceUid: deviceRow().uid,
    deviceCode: 'PROD-01',
    deviceName: 'Scanner Produksi',
  }
}

function managedTransactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    uid: transactionUid,
    transaction_number: 'PRD-20260821-JEPARA-ABC',
    employee_id: 11,
    site_id: 1,
    work_group_id: 4,
    production_job_id: 15,
    unit_id: 17,
    job_rate_id: 16,
    attendance_record_id: 13,
    scan_device_id: 9,
    businessDateKey: '2026-08-21',
    transactionTimestamp: '2026-08-21 09:00:00.000000',
    quantity: '3.0000',
    rate_snapshot: '1175.0000',
    gross_amount: '3525.00',
    status: 'POSTED',
    payroll_locked_at: null,
    site: 'JEPARA',
    siteName: 'Site Jepara',
    jobUid,
    jobCode: 'BORONGAN-LINTING',
    jobName: 'Linting',
    unitUid: '55555555-5555-4555-8555-555555555555',
    unitCode: 'PCS',
    unitName: 'Pcs',
    decimalPrecision: 0,
    employeeUid,
    employeeNumber: 'J2608-001',
    fullName: 'Ariel Peterpan',
    ...overrides,
  }
}

describe('Production transactions API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.beginTransaction.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined)
    mocks.release.mockReturnValue(undefined)
    mocks.execute.mockResolvedValue([{ affectedRows: 1, insertId: 21 }])
  })

  it('menerima tepat 3.000 baris import dan menolak baris ke-3.001', () => {
    const rows = Array.from({ length: 3_001 }, (_, index) => ({
      rowNumber: index + 2,
      businessDate: '2026-09-21',
      employeeNumber: `J${String(index + 1).padStart(6, '0')}`,
      employeeName: `Karyawan ${index + 1}`,
      quantity: '10',
    }))

    expect(
      productionImportPreviewInput.safeParse({ rows: rows.slice(0, 3_000) })
        .success
    ).toBe(true)
    expect(
      productionImportPostInput.safeParse({
        rows: rows.slice(0, 3_000),
        reason: 'Import operasional tiga ribu baris.',
        idempotencyKey: '79777777-7777-4777-8777-777777777777',
      }).success
    ).toBe(true)
    expect(productionImportPreviewInput.safeParse({ rows }).success).toBe(false)
  })

  it('menulis 3.000 audit dalam chunk tanpa keluar dari koneksi transaksi', async () => {
    const auditEntries = Array.from({ length: 3_000 }, (_, index) => ({
      siteId: 1,
      recordId: index + 1,
      recordUid: `audit-record-${index + 1}`,
      description: `Import transaksi ${index + 1}.`,
      afterData: { rowNumber: index + 2 },
    }))
    const auditRequest = {
      ip: '127.0.0.1',
      get: () => 'Production Import Test',
    } as unknown as express.Request

    await writeProductionImportAudits(
      connection as never,
      auth({ permissions: ['production.correct'] }),
      auditRequest,
      'Import operasional.',
      auditEntries
    )

    const auditCalls = mocks.execute.mock.calls.filter((call) =>
      String(call[0]).includes('INSERT INTO audit_logs')
    )
    expect(auditCalls).toHaveLength(12)
    expect(
      auditCalls.map((call) => (call[1] as unknown[]).length / 17)
    ).toEqual(Array.from({ length: 12 }, () => 250))
    const auditedRecordIds = auditCalls.flatMap((call) => {
      const params = call[1] as unknown[]
      return Array.from(
        { length: params.length / 17 },
        (_, index) => params[index * 17 + 6]
      )
    })
    expect(auditedRecordIds).toEqual(
      Array.from({ length: 3_000 }, (_, index) => index + 1)
    )
  })

  it.each(['success', 'legacy-schema', 'empty', 'no-token', 'inactive', 'outside-site', 'no-permission'])('ringkasan harian terminal seluruh site read-only: %s', async variant => {
    mocks.query.mockResolvedValueOnce([variant==='inactive' ? [] : [deviceRow()]])
      .mockResolvedValueOnce([[{businessDate:'2026-10-08',transactionTimestamp:'2026-10-09 00:05:00.000000',serverTime:'2026-10-09T00:05:00+07:00'}]])
      .mockResolvedValueOnce([[{hasHistoryStatus:variant==='legacy-schema' ? 0 : 1}]])
      .mockResolvedValueOnce([variant==='empty' ? [] : [
        {uid:'section-linting',name:'Linting',presentEmployees:'315',submittedEmployees:'200'},
        {uid:'section-slop',name:'Slop',presentEmployees:'0',submittedEmployees:'0'},
      ]])
    const response = await request('/terminal/daily-summary', {
      withToken:variant!=='no-token',
      auth:auth({permissions:variant==='no-permission' ? ['production.view'] : ['production.scan'],sites:variant==='outside-site' ? ['KLATEN'] : ['JEPARA']}),
    })
    expect(response.status).toBe(variant==='inactive' || variant==='no-token' ? 401 : variant==='outside-site' || variant==='no-permission' ? 403 : 200)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.beginTransaction).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
    if (variant==='success' || variant==='legacy-schema' || variant==='empty') {
      const body = await response.json() as {
        businessDate: string
        siteName: string
        sections: Array<{uid:string;name:string;presentEmployees:number;submittedEmployees:number;pendingEmployees:number}>
      }
      expect(body).toMatchObject({businessDate:'2026-10-09',siteName:'Site Jepara'})
      expect(body.sections).toHaveLength(variant==='empty' ? 0 : 2)
      if (variant==='success' || variant==='legacy-schema') expect(body.sections).toEqual([
        {uid:'section-linting',name:'Linting',presentEmployees:315,submittedEmployees:200,pendingEmployees:115},
        {uid:'section-slop',name:'Slop',presentEmployees:0,submittedEmployees:0,pendingEmployees:0},
      ])
      const [sql,params] = mocks.query.mock.calls[3]
      if (variant==='legacy-schema') {
        expect(sql).not.toContain('history.status')
      } else {
        expect(sql).toContain("history.status='ACTIVE'")
        expect(sql).toContain("other_history.status='ACTIVE'")
      }
      expect(params).toEqual(['2026-10-09','2026-10-09','2026-10-09',1,'2026-10-09','2026-10-09'])
      expect(sql).toContain('COUNT(DISTINCT attendance.employee_id)')
      expect(sql).toContain("transaction_row.status='POSTED'")
      expect(sql).toContain('transaction_row.business_date=attendance.business_date')
      expect(sql).toContain('transaction_row.site_id=attendance.site_id')
      expect(sql).toContain("attendance.attendance_status='PRESENT'")
      expect(sql).toContain('GROUP BY mapping.production_section_id')
      expect(sql).toContain('other_history.id<>history.id')
      expect(sql).not.toContain('scan_device_id')
      expect(JSON.stringify(body)).not.toMatch(/grossAmount|rateSnapshot|payroll|employeeNumber|"id"/)
    }
  })

  it.each(['PRESENT','SUBMITTED','PENDING','legacy-schema','search','pagination','empty','no-token','inactive','outside-site','no-permission','invalid-section','invalid-condition','too-large'])('daftar pegawai ringkasan mengikuti cakupan card dan tidak membocorkan upah: %s', async variant => {
    const sectionUid='55555555-5555-4555-8555-555555555555'
    const condition=variant==='SUBMITTED' || variant==='PENDING' ? variant : 'PRESENT'
    const employeeRow={uid:employeeUid,employeeNumber:'TEST-001',fullName:'Pekerja Uji',sectionUid,sectionName:'Linting',moduleUid:jobUid,moduleName:'Modul Uji',clockInAt:'2026-10-09T07:00:00+07:00',clockOutAt:null,depositCount:'2',quantityPcs:'500.0000',lastTransactionAt:'2026-10-09T08:00:00+07:00'}
    mocks.query.mockResolvedValueOnce([variant==='inactive' ? [] : [deviceRow()]])
      .mockResolvedValueOnce([[{transactionTimestamp:'2026-10-09 08:00:00',businessDate:'2026-10-09'}]])
      .mockResolvedValueOnce([[{hasHistoryStatus:variant==='legacy-schema' ? 0 : 1}]])
      .mockResolvedValueOnce([[{total:variant==='empty' ? 0 : variant==='pagination' ? 51 : 1}]])
      .mockResolvedValueOnce([variant==='empty' ? [] : [employeeRow]])
    const query=new URLSearchParams({sectionUid:variant==='invalid-section' ? 'internal-1' : sectionUid,condition:variant==='invalid-condition' ? 'ALL' : condition})
    if (variant==='search') query.set('search','Pekerja')
    if (variant==='pagination') query.set('page','9')
    if (variant==='too-large') query.set('pageSize','501')
    const response=await request(`/terminal/daily-summary/employees?${query}`,{
      withToken:variant!=='no-token',
      auth:auth({permissions:variant==='no-permission' ? ['production.view'] : ['production.scan'],sites:variant==='outside-site' ? ['KLATEN'] : ['JEPARA']}),
    })
    const rejected=variant==='no-token' || variant==='inactive' ? 401 : variant==='outside-site' || variant==='no-permission' ? 403 : ['invalid-section','invalid-condition','too-large'].includes(variant) ? 422 : 200
    expect(response.status).toBe(rejected)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.beginTransaction).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
    if (rejected!==200) return
    const body=await response.json() as {items:Array<Record<string,unknown>>;pagination:Record<string,number>}
    expect(body.pagination).toMatchObject({page:variant==='pagination' ? 2 : 1,pageSize:50,total:variant==='empty' ? 0 : variant==='pagination' ? 51 : 1})
    expect(body.items).toHaveLength(variant==='empty' ? 0 : 1)
    const [countSql,countValues]=mocks.query.mock.calls[3]
    const [sql,values]=mocks.query.mock.calls[4]
    expect(countValues.slice(0,7)).toEqual(['2026-10-09','2026-10-09','2026-10-09',1,'2026-10-09','2026-10-09',sectionUid])
    expect(countSql).toContain('COUNT(DISTINCT attendance.employee_id)')
    expect(countSql).toContain("attendance.attendance_status='PRESENT'")
    expect(countSql).toContain('employee_section.uid=?')
    expect(sql).not.toContain('scan_device_id')
    if (variant==='legacy-schema') expect(sql).not.toContain('history.status')
    if (variant==='PENDING') expect(countSql).toContain('AND NOT EXISTS')
    if (variant==='SUBMITTED') {
      expect(countSql).toContain('AND EXISTS')
      expect(sql).toContain("pt.status='POSTED'")
      expect(sql).toContain("unit.code='PCS'")
      expect(values.slice(0,6)).toEqual(['2026-10-09','2026-10-09','2026-10-09',1,'2026-10-09',1])
    }
    if (variant==='search') expect(countValues.slice(-2)).toEqual(['%Pekerja%','%Pekerja%'])
    if (variant!=='empty') {
      expect(body.items[0]).toMatchObject({uid:employeeUid,section:{name:'Linting'},module:{name:'Modul Uji'},attendance:{status:'PRESENT',clockOutAt:null}})
      expect(body.items[0].deposits).toEqual(variant==='SUBMITTED' ? {count:2,quantityPcs:'500.0000',lastTransactionAt:'2026-10-09T08:00:00+07:00'} : null)
    }
    expect(JSON.stringify(body)).not.toMatch(/grossAmount|rateSnapshot|payableQuantity|payroll|"id"|nik|salary|deviceToken/i)
  })

  it.each(['all','site','multiple','invalid','outside','denied'])('opsi modul transaksi dibatasi site dan izin: %s', async variant => {
    mocks.query.mockResolvedValueOnce([[{uid:jobUid,name:'Modul Uji',site:'JEPARA',siteName:'Jepara'}]])
    const suffix=variant==='site' ? '?site=JEPARA' : variant==='multiple' ? '?site=JEPARA&site=KLATEN' : variant==='invalid' ? '?site=UNKNOWN' : variant==='outside' ? '?site=KLATEN' : ''
    const response=await request(`/transactions/module-options${suffix}`,{
      auth:auth({permissions:variant==='denied' ? [] : ['production.view'],sites:variant==='multiple' ? ['JEPARA','KLATEN'] : ['JEPARA']}),
    })
    expect(response.status).toBe(variant==='invalid' ? 422 : variant==='outside' || variant==='denied' ? 403 : 200)
    expect(mocks.execute).not.toHaveBeenCalled()
    if (response.status!==200) {expect(mocks.query).not.toHaveBeenCalled();return}
    const [sql,values]=mocks.query.mock.calls[0]
    expect(sql).toContain('FROM production_modules module')
    expect(sql).toContain(variant==='multiple' ? 's.code IN (?,?)' : 's.code IN (?)')
    expect(values).toEqual(variant==='multiple' ? ['JEPARA','KLATEN','JEPARA','KLATEN'] : variant==='site' ? ['JEPARA','JEPARA'] : ['JEPARA'])
    expect(await response.json()).toEqual({items:[{uid:jobUid,name:'Modul Uji',site:'JEPARA',siteName:'Jepara'}]})
  })

  it.each(['legacy','status','invalid'])('filter modul berlaku pada list dan semua total dengan penempatan historis: %s', async variant => {
    mocks.query.mockResolvedValueOnce([[{hasHistoryStatus:variant==='status' ? 1 : 0}]])
      .mockResolvedValueOnce([[{transactionCount:0,employeeCount:0,totalGrossAmount:0}]])
      .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]])
    const response=await request(`/transactions?site=JEPARA&moduleUid=${variant==='invalid' ? '1' : jobUid}`)
    expect(response.status).toBe(variant==='invalid' ? 422 : 200)
    if (variant==='invalid') {expect(mocks.query).not.toHaveBeenCalled();return}
    expect(mocks.query).toHaveBeenCalledTimes(4)
    for (const [sql,values] of mocks.query.mock.calls.slice(1)) {
      expect(sql).toContain('module_history.site_id=pt.site_id')
      expect(sql).toContain('module_history.effective_from<=pt.business_date')
      expect(sql).toContain('module.uid IN (?)')
      expect(sql).toContain('conflicting_history.id<>module_history.id')
      expect(values).toContain(jobUid)
      if (variant==='status') expect(sql).toContain("module_history.status='ACTIVE'")
      else expect(sql).not.toContain('module_history.status')
    }
  })

  it.each(['BORONGAN','TRAINING','combined','invalid'])('jenis karyawan memakai histori transaksi dan bisa digabung dengan modul: %s', async variant => {
    mocks.query.mockResolvedValueOnce([[{hasHistoryStatus:0}]])
      .mockResolvedValueOnce([[{transactionCount:0,employeeCount:0,totalGrossAmount:0}]])
      .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]])
    const type=variant==='invalid' ? 'OTHER' : variant==='TRAINING' ? 'TRAINING' : 'BORONGAN'
    const response=await request(`/transactions?employeeType=${type}${variant==='combined' ? `&moduleUid=${jobUid}` : ''}`)
    expect(response.status).toBe(variant==='invalid' ? 422 : 200)
    if (variant==='invalid') {expect(mocks.query).not.toHaveBeenCalled();return}
    for (const [sql,values] of mocks.query.mock.calls.slice(1)) {
      expect(sql).toContain('historical_type.id=module_history.employee_type_id')
      expect(sql).toContain('historical_type.code IN (?)')
      expect(values).toContain(type)
      expect(sql.includes('module.uid IN (?)')).toBe(variant==='combined')
    }
  })

  it('menolak Terminal tanpa production.scan sebelum membuka transaksi', async () => {
    const response = await request('/terminal/lookup', {
      method: 'POST',
      body: { barcode: 'J2608-001' },
      auth: auth({ permissions: ['production.view'] }),
    })
    expect(response.status).toBe(403)
    expect(mocks.beginTransaction).not.toHaveBeenCalled()
  })
  it.each(['qc', 'legacy', 'other-device', 'inactive', 'outside-site', 'no-permission', 'no-token'])('detail terminal hanya informasi operasional dan milik perangkat: %s', async variant => {
    mocks.query.mockResolvedValueOnce([variant==='inactive' ? [] : [deviceRow()]])
      .mockResolvedValueOnce([variant==='other-device' ? [] : [{ id:21,uid:transactionUid,transactionNumber:'TEST-DETAIL-001',businessDate:'2026-08-21',transactionAt:'2026-08-21T09:00:00+07:00',status:'POSTED',entrySource:'TERMINAL',quantity:'500.0000',employeeUid,employeeNumber:'TEST-001',fullName:'Pekerja Uji',jobUid,jobCode:'BORONGAN-LINTING',jobName:'Linting',unitUid:'unit',unitCode:'PCS',unitName:'Pcs',decimalPrecision:0 }]])
      .mockResolvedValueOnce([variant==='legacy' ? [] : [{id:61,brandUid:'brand',brandCode:'BR-1',brandName:'Brand Snapshot',weight1Grams:'80.00',weight2Grams:'81.32'}]])
      .mockResolvedValueOnce([[{uid:'defect',code:'DF-1',name:'Cowong Snapshot',sortOrder:0,quantity:10}]])
    const response = await request(`/terminal/transactions/${transactionUid}`, {
      withToken:variant!=='no-token',
      auth:auth({permissions:variant==='no-permission' ? ['production.view'] : ['production.scan'],sites:variant==='outside-site' ? ['KLATEN'] : ['JEPARA']}),
    })
    expect(response.status).toBe(variant==='other-device' ? 404 : variant==='inactive' || variant==='no-token' ? 401 : variant==='outside-site' || variant==='no-permission' ? 403 : 200)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.beginTransaction).not.toHaveBeenCalled()
    if (variant==='qc' || variant==='legacy' || variant==='other-device') {
      expect(mocks.query.mock.calls[1][1]).toEqual([transactionUid,9,1])
      expect(mocks.query.mock.calls[1][0]).toContain('pt.uid=? AND pt.scan_device_id=? AND pt.site_id=?')
    }
    if (variant==='qc' || variant==='legacy') {
      const body = await response.json() as {transaction:Record<string,unknown>}
      expect(body.transaction).toMatchObject({quantity:'500.0000',employee:{fullName:'Pekerja Uji'},device:{uid:deviceRow().uid}})
      expect(JSON.stringify(body)).not.toMatch(/grossAmount|rateSnapshot|payableQuantity|deduction|payroll|"id"/i)
      if (variant==='qc') expect(body.transaction.qc).toMatchObject({brand:{name:'Brand Snapshot'},defects:[{name:'Cowong Snapshot',quantity:10}]})
      else expect(body.transaction.qc).toBeNull()
    }
  })
  it.each(['success', 'empty', 'no-token', 'inactive', 'outside-site', 'no-permission'])('riwayat terminal read-only dan terbatas perangkat aktif: %s', async variant => {
    mocks.query.mockResolvedValueOnce([variant==='inactive' ? [] : [deviceRow()]])
      .mockResolvedValueOnce([variant==='empty' ? [] : [{ uid: transactionUid, transactionNumber:'TEST-001', transactionAt:'2026-08-21T09:00:00+07:00', quantity:'500.0000', employeeUid, fullName:'Pekerja Uji', employeeNumber:'TEST-001', jobUid, jobCode:'BORONGAN-LINTING', jobName:'Linting', unitUid:'unit', unitCode:'PCS', unitName:'Pcs', decimalPrecision:0, brandUid:'brand', brandName:'Brand Snapshot',qcId:61,weight1Grams:'80.00',weight2Grams:'81.32',totalDefects:'10' }]])
    const response = await request('/terminal/recent', {
      withToken: variant!=='no-token',
      auth:auth({ permissions:variant==='no-permission' ? ['production.view'] : ['production.scan'], sites:variant==='outside-site' ? ['KLATEN'] : ['JEPARA'] }),
    })
    expect(response.status).toBe(variant==='no-token' || variant==='inactive' ? 401 : variant==='outside-site' || variant==='no-permission' ? 403 : 200)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.beginTransaction).not.toHaveBeenCalled()
    if (variant==='success' || variant==='empty') {
      const body = await response.json() as { items: unknown[] }
      expect(body.items).toHaveLength(variant==='empty' ? 0 : 1)
      const [sql,params] = mocks.query.mock.calls[1]
      expect(params).toEqual([9,1])
      expect(sql).toContain("pt.scan_device_id=? AND pt.site_id=? AND pt.status='POSTED'")
      expect(sql).toContain('ORDER BY pt.transaction_at DESC,pt.id DESC LIMIT 5')
      expect(sql).not.toContain('gross_amount')
      if (variant==='success') expect(body.items[0]).toMatchObject({ quantity:'500.0000',brand:{name:'Brand Snapshot'},qcSummary:{weight1Grams:'80.00',weight2Grams:'81.32',totalDefects:10} })
    } else expect(mocks.query).toHaveBeenCalledTimes(variant==='no-token' || variant==='no-permission' ? 0 : 1)
  })

  it('preview import memberi error per baris untuk tanggal tidak valid', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          businessDate: '2026-09-21',
          transactionTimestamp: '2026-09-21 08:00:00.000',
        },
      ],
    ])
    const response = await request('/transactions/import/preview', {
      method: 'POST',
      auth: auth({ permissions: ['production.correct'] }),
      body: {
        rows: [
          {
            rowNumber: 2,
            businessDate: '21-09-2026',
            employeeNumber: 'J2608-001',
            employeeName: 'Ariel Peterpan',
            quantity: '10',
          },
        ],
      },
    })
    expect(response.status).toBe(200)
    expect((await response.json()) as object).toMatchObject({
      data: {
        total: 1,
        valid: 0,
        invalid: 1,
        rows: [
          {
            rowNumber: 2,
            valid: false,
            message: 'Tanggal wajib menggunakan format YYYY-MM-DD.',
          },
        ],
      },
    })
  })

  it('preview import menolak site hasil histori di luar akses user', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            businessDate: '2026-09-21',
            transactionTimestamp: '2026-09-21 08:00:00.000',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ uid: employeeUid, siteId: 2, site: 'SEMARANG' }],
      ])
    const response = await request('/transactions/import/preview', {
      method: 'POST',
      auth: auth({ permissions: ['production.correct'], sites: ['JEPARA'] }),
      body: {
        rows: [
          {
            rowNumber: 2,
            businessDate: '2026-09-20',
            employeeNumber: 'J2608-001',
            employeeName: 'Ariel Peterpan',
            quantity: '10',
          },
        ],
      },
    })
    expect(response.status).toBe(200)
    expect((await response.json()) as object).toMatchObject({
      data: {
        invalid: 1,
        rows: [{ valid: false, message: 'Akses site Produksi ditolak.' }],
      },
    })
  })

  it.each([
    {percentage:'0.0000',payable:'100.0000',deduction:'0.0000',gross:'4500.00',existingZero:false,sectionId:3,jobCode:'BORONGAN-LINTING',hasPolicy:true},
    {percentage:'3.0000',payable:'97.0000',deduction:'3.0000',gross:'4365.00',existingZero:false,sectionId:99,jobCode:'BORONGAN-LINTING',hasPolicy:true},
    {percentage:'3.0000',payable:'97.0000',deduction:'3.0000',gross:'4365.00',existingZero:false,sectionId:null,jobCode:'BORONGAN-LINTING',hasPolicy:true},
    {percentage:'3.0000',payable:'100.0000',deduction:'0.0000',gross:'4500.00',existingZero:true,sectionId:3,jobCode:'BORONGAN-LINTING',hasPolicy:true},
    {percentage:'3.0000',payable:'100.0000',deduction:'0.0000',gross:'4500.00',existingZero:false,sectionId:99,jobCode:'BORONGAN-PACKING',hasPolicy:true},
    {percentage:'3.0000',payable:'100.0000',deduction:'0.0000',gross:'4500.00',existingZero:false,sectionId:99,jobCode:'BORONGAN-LINTING',hasPolicy:false},
  ])('preview import: policy $percentage, bagian $sectionId (99=SLOP), job $jobCode, snapshot lama $existingZero', async ({percentage,payable,deduction,gross,existingZero,sectionId,jobCode,hasPolicy}) => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes("DATE_FORMAT(CURDATE()")) {
        return [[{
          businessDate: '2026-09-21',
          transactionTimestamp: '2026-09-21 08:00:00.000',
        }]]
      }
      if (statement.includes('SELECT e.uid,s.id siteId')) {
        return [[{ uid: employeeUid, siteId: 1, site: 'JEPARA' }]]
      }
      if (statement.includes('FROM payroll_periods pp')) return [[]]
      if (statement.includes('SELECT id,name FROM sites')) {
        return [[{ id: 1, name: 'Site Jepara' }]]
      }
      if (statement.includes('SELECT barcode FROM employees WHERE uid')) {
        return [[{ barcode: 'J2608-001' }]]
      }
      if (statement.includes('FROM employees WHERE barcode')) {
        return [[{
          id: 11,
          uid: employeeUid,
          employeeNumber: 'J2608-001',
          fullName: 'Ariel Peterpan',
          barcode: 'J2608-001',
        }]]
      }
      if (statement.includes('FROM employee_employment_histories eh')) {
        return [[{
          id: 31,
          siteId: 1,
          workGroupId: 4,
          allowsProduction: 1,
          employeeStatus: 'ACTIVE',
          employeeType: 'BORONGAN',
          employeeTypeName: 'Borongan',
          payrollBasis: 'PIECE_RATE',
          site: 'JEPARA',
          siteName: 'Site Jepara',
        }]]
      }
      if(statement.includes('mapping.production_section_id sectionId')) return [[{sectionId}]]
      if(statement.includes('SELECT production_section_id productionSectionId')) return [existingZero ? [{productionSectionId:3,deductionPolicyId:null,deductionPercentage:'0.0000'}] : []]
      if(statement.includes('FROM production_quantity_deduction_policies')) {
        expect(statement).not.toContain('production_section_id')
        return [hasPolicy ? [{id:5,percentage}] : []]
      }
      if (statement.includes('FROM attendance_records ar')) {
        return [[{
          id: 13,
          uid: '88888888-8888-4888-8888-888888888888',
          attendanceStatus: 'PRESENT',
          clockInAt: '2026-09-20T07:00:00+07:00',
        }]]
      }
      if (statement.includes('FROM attendance_scan_events ase')) {
        return [[]]
      }
      if (statement.includes('FROM attendance_corrections ac')) {
        return [[{ id: 14 }]]
      }
      if (statement.includes('SELECT a.id assignmentId')) {
        return [[{
          assignmentId: 14,
          isPrimary: 1,
          jobId: 15,
          jobUid,
          jobCode,
          jobName: 'Linting',
          rateId: 16,
          rateUid: '66666666-6666-4666-8666-666666666666',
          rateAmount: '45.0000',
          currency: 'IDR',
          tierCount: 2,
          unitId: 17,
          unitUid: '55555555-5555-4555-8555-555555555555',
          unitCode: 'PCS',
          unitName: 'Pcs',
          decimalPrecision: 0,
        }]]
      }
      if (statement.includes('SELECT a.production_job_id jobId')) {
        return [[{ jobId: 15, rateId: 16, unitId: 17 }]]
      }
      if (statement.includes('precedingQuantity')) {
        return [[{ precedingQuantity: '0.0000' }]]
      }
      if (statement.includes('FROM production_job_rate_tiers')) {
        return [[
          { id: 1, minQuantity: '1.0000', rateAmount: '45.0000' },
          { id: 2, minQuantity: '3201.0000', rateAmount: '47.0000' },
        ]]
      }
      if (statement.includes('COUNT(*) transactionCount')) {
        return [[{ transactionCount: 0, totalQuantity: '0.0000' }]]
      }
      return [[]]
    })
    const response = await request('/transactions/import/preview', {
      method: 'POST',
      auth: auth({ permissions: ['production.correct'], sites: ['JEPARA'] }),
      body: {
        rows: [
          {
            rowNumber: 2,
            businessDate: '2026-09-20',
            employeeNumber: 'J2608-001',
            employeeName: 'Nama dari Excel boleh diabaikan',
            quantity: '100',
          },
        ],
      },
    })
    expect(response.status).toBe(200)
    expect((await response.json()) as object).toMatchObject({
      data: {
        valid: 1,
        invalid: 0,
        rows: [
          {
            businessDate: '2026-09-20',
            employeeNumber: 'J2608-001',
            employeeName: 'Ariel Peterpan',
            site: 'JEPARA',
            job: { code: jobCode, name: 'Linting' },
            quantity: '100.0000',
            deductionQuantity:deduction,
            payableQuantity:payable,
            estimatedGrossAmount:gross,
            valid: true,
          },
        ],
      },
    })
    const correctionSql = String(
      mocks.query.mock.calls.find((call) =>
        String(call[0]).includes('FROM attendance_corrections ac')
      )?.[0]
    )
    expect(correctionSql).toContain("ar.clock_in_source='CORRECTION'")
    expect(correctionSql).toContain("ac.correction_type IN ('CLOCK_IN','BOTH')")
    expect(correctionSql).toContain("ac.approval_status='APPROVED'")
    expect(correctionSql).toContain('ac.applied_at IS NOT NULL')
    expect(correctionSql).toContain('ac.new_clock_in_at=ar.clock_in_at')
  })

  it.each([
    {sameEmployee:false,percentage:'0.0000',existingZero:false,secondPayable:'1.0000',secondGross:'45.00'},
    {sameEmployee:true,percentage:'3.0000',existingZero:false,secondPayable:'0.0000',secondGross:'0.00'},
    {sameEmployee:true,percentage:'3.0000',existingZero:true,secondPayable:'1.0000',secondGross:'45.00'},
  ])('preview batch policy $percentage, karyawan sama $sameEmployee, snapshot lama $existingZero', async ({sameEmployee,percentage,existingZero,secondPayable,secondGross}) => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('DATE_FORMAT(CURDATE()')) {
        return [[{ businessDate: '2026-09-21', transactionTimestamp: '2026-09-21 08:00:00.000' }]]
      }
      if (statement.includes('CREATE TEMPORARY TABLE')) return [[]]
      if (statement.includes('INSERT INTO tmp_production_import_rows')) return [[]]
      if (statement.includes('DROP TEMPORARY TABLE')) return [[]]
      if (statement.includes('SELECT input.import_row_number rowNumber') && statement.includes('attendance.id')) {
        return [[
          ...[2, 3].map((rowNumber) => ({
            rowNumber,
            employeeId: rowNumber === 2 || sameEmployee ? 11 : 12,
            employeeUid: rowNumber === 2 ? employeeUid : '11111111-1111-4111-8111-111111111112',
            employeeNumber: rowNumber === 2 ? 'J2608-001' : 'J2608-002',
            fullName: rowNumber === 2 ? 'Ariel Peterpan' : 'Siti',
            barcode: rowNumber === 2 ? 'J2608-001' : 'J2608-002',
            historyId: rowNumber,
            siteId: 1,
            workGroupId: 4,
            allowsProduction: 1,
            employeeStatus: 'ACTIVE',
            employeeType: 'BORONGAN',
            employeeTypeName: 'Borongan',
            payrollBasis: 'PIECE_RATE',
            site: 'JEPARA',
            siteName: 'Site Jepara',
            siteActive: 1,
            attendanceId: rowNumber + 20,
            attendanceUid: `attendance-${rowNumber}`,
            attendanceStatus: 'PRESENT',
            clockInAt: '2026-09-21T07:00:00+07:00',
            hasSuccessfulClockIn: 1,
            hasApprovedClockInCorrection: 0,
          })),
        ]]
      }
      if (statement.includes('SELECT input.import_row_number rowNumber') && statement.includes('assignment.id')) {
        return [[
          ...[2, 3].map((rowNumber) => ({
            rowNumber,
            assignmentId: rowNumber,
            isPrimary: 1,
            jobId: 15,
            jobUid,
            jobCode: 'BORONGAN-LINTING',
            jobName: 'Linting',
            rateId: 16,
            rateUid: 'rate',
            rateAmount: '45.0000',
            currency: 'IDR',
            unitId: 17,
            unitUid: 'unit',
            unitCode: 'PCS',
            unitName: 'Pcs',
            decimalPrecision: 0,
          })),
        ]]
      }
      if (statement.includes('SELECT input.import_row_number rowNumber') && statement.includes('period.status')) return [[]]
      if (statement.includes('SELECT input.import_row_number rowNumber') && statement.includes('transaction.production_job_id')) return [existingZero ? [2,3].map(rowNumber=>({rowNumber,jobId:15,quantity:'100.0000',payableQuantity:'100.0000',deductionPercentage:'0.0000'})) : []]
      if(statement.includes('FROM production_quantity_deduction_policies') || statement.includes('JOIN production_quantity_deduction_policies')) {
        expect(statement).not.toContain('production_section_id')
        expect(statement).not.toContain('JOIN production_module_sections')
        return [[... [2,3].map(rowNumber=>({rowNumber,jobId:15,policyId:5,percentage}))]]
      }
      if (statement.includes('SELECT rate.id rateId')) {
        return [[{ rateId: 16, tierId: null, minQuantity: null, rateAmount: '45.0000' }]]
      }
      return [[]]
    })

    const response = await request('/transactions/import/preview', {
      method: 'POST',
      auth: auth({ permissions: ['production.correct'], sites: ['JEPARA'] }),
      body: {
        rows: [
          { rowNumber: 2, businessDate: '2026-09-21', employeeNumber: 'J2608-001', employeeName: 'Ariel', quantity: '16' },
          { rowNumber: 3, businessDate: '2026-09-21', employeeNumber: sameEmployee ? 'J2608-001' : 'J2608-002', employeeName: 'Siti', quantity: '1' },
        ],
      },
    })
    expect(response.status).toBe(200)
    expect((await response.json()) as object).toMatchObject({
      data: { total: 2, valid: 2, invalid: 0, rows: [{ rowNumber: 2,payableQuantity:'16.0000',estimatedGrossAmount:'720.00' }, { rowNumber: 3,payableQuantity:secondPayable,estimatedGrossAmount:secondGross }] },
    })
    const temporaryTableSql = String(
      mocks.query.mock.calls.find((call) =>
        String(call[0]).includes('CREATE TEMPORARY TABLE')
      )?.[0] ?? ''
    )
    expect(temporaryTableSql).toContain('import_row_number')
    expect(temporaryTableSql).not.toMatch(/\brow_number\b/)
    expect(mocks.query.mock.calls.filter((call) => String(call[0]).includes('FROM employees WHERE barcode')).length).toBe(0)
  })

  it('import bersifat atomik ketika validasi terbaru gagal', async () => {
    mocks.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            businessDate: '2026-09-21',
            transactionTimestamp: '2026-09-21 08:00:00.000',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ uid: employeeUid, siteId: 2, site: 'SEMARANG' }],
      ])
    const response = await request('/transactions/import', {
      method: 'POST',
      auth: auth({ permissions: ['production.correct'], sites: ['JEPARA'] }),
      body: {
        rows: [
          {
            rowNumber: 2,
            businessDate: '2026-09-20',
            employeeNumber: 'J2608-001',
            employeeName: 'Ariel Peterpan',
            quantity: '10',
          },
        ],
        reason: 'Import hasil Produksi darurat.',
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      },
    })
    expect(response.status).toBe(422)
    expect(mocks.rollback).toHaveBeenCalledTimes(1)
    expect(
      mocks.execute.mock.calls.some((call) =>
        String(call[0]).includes('INSERT INTO production_transactions')
      )
    ).toBe(false)
  })

  it('template QC hanya mengembalikan brand pada site akses user dan defect global', async () => {
    mocks.query.mockResolvedValueOnce([[{total:1}]])
      .mockResolvedValueOnce([[{employeeNumber:'TEST-1',employeeName:'Karyawan'}]])
      .mockResolvedValueOnce([[{uid:'brand-uid',code:'BR-TEST',name:'Brand',sortOrder:1,siteCode:'JEPARA',siteName:'Site Jepara'}]])
      .mockResolvedValueOnce([[{uid:'defect-uid',code:'DF-TEST',name:'Cowong',sortOrder:2}]])
    const response = await request('/transactions/import/template-employees?businessDate=2026-09-19', {
      auth:auth({permissions:['production.correct'],sites:['JEPARA']}),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({qcOptions:{brands:[{code:'BR-TEST',site:{code:'JEPARA'}}],defects:[{code:'DF-TEST',sortOrder:2}]}})
    expect(String(mocks.query.mock.calls[2][0])).toContain('site.code IN (?)')
    expect(mocks.query.mock.calls[2][1]).toEqual(['JEPARA'])
    expect(mocks.query.mock.calls).toHaveLength(4)
  })

  it.each([
    {percentage:'0.0000',quantity:'100.0000',payable:'100.0000',deduction:'0.0000',gross:'4500.00',oldSnapshot:false,qcCase:'none'},
    {percentage:'3.0000',quantity:'100.0000',payable:'97.0000',deduction:'3.0000',gross:'4365.00',oldSnapshot:false,qcCase:'none'},
    {percentage:'90.0000',quantity:'1.0000',payable:'0.0000',deduction:'1.0000',gross:'0.00',oldSnapshot:false,qcCase:'none'},
    {percentage:'3.0000',quantity:'100.0000',payable:'100.0000',deduction:'0.0000',gross:'4500.00',oldSnapshot:true,qcCase:'none'},
    {percentage:'0.0000',quantity:'100.0000',payable:'100.0000',deduction:'0.0000',gross:'4500.00',oldSnapshot:false,qcCase:'valid'},
    {percentage:'3.0000',quantity:'100.0000',payable:'97.0000',deduction:'3.0000',gross:'4365.00',oldSnapshot:false,qcCase:'valid'},
    {percentage:'3.0000',quantity:'100.0000',payable:'97.0000',deduction:'3.0000',gross:'4365.00',oldSnapshot:false,qcCase:'wrong-site'},
    {percentage:'3.0000',quantity:'100.0000',payable:'97.0000',deduction:'3.0000',gross:'4365.00',oldSnapshot:false,qcCase:'write-failure'},
  ])('import disimpan sesuai preview, policy $percentage dan snapshot lama $oldSnapshot QC $qcCase', async ({percentage,quantity,payable,deduction,gross,oldSnapshot,qcCase}) => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM production_brands')) return [[{id:51,uid:'11111111-1111-4111-8111-111111111111',code:'BR-TEST',name:'Brand',siteId:qcCase==='wrong-site'?2:1}]]
      if (statement.includes('FROM production_defects')) return [[{id:52,uid:'22222222-2222-4222-8222-222222222222',code:'DF-TEST',name:'Cowong',sortOrder:0}]]
      if (statement.includes('FROM production_transaction_qc')) return [[{id:61,transactionId:21}]]
      if (statement.includes('FROM production_transactions transaction')) {
        return [[]]
      }
      if (statement.includes("DATE_FORMAT(CURDATE()")) {
        return [[{
          businessDate: '2026-09-21',
          transactionTimestamp: '2026-09-21 08:00:00.000',
        }]]
      }
      if (statement.includes('SELECT e.uid,s.id siteId')) {
        return [[{ uid: employeeUid, siteId: 1, site: 'JEPARA' }]]
      }
      if (statement.includes('FROM payroll_periods pp')) return [[]]
      if (statement.includes('SELECT id,name FROM sites')) {
        return [[{ id: 1, name: 'Site Jepara' }]]
      }
      if (statement.includes('SELECT barcode FROM employees WHERE uid')) {
        return [[{ barcode: 'J2608-001' }]]
      }
      if (statement.includes('FROM employees WHERE barcode')) {
        return [[{
          id: 11,
          uid: employeeUid,
          employeeNumber: 'J2608-001',
          fullName: 'Ariel Peterpan',
          barcode: 'J2608-001',
        }]]
      }
      if (statement.includes('FROM employee_employment_histories eh')) {
        return [[{
          id: 31,
          siteId: 1,
          workGroupId: 4,
          allowsProduction: 1,
          employeeStatus: 'ACTIVE',
          employeeType: 'BORONGAN',
          employeeTypeName: 'Borongan',
          payrollBasis: 'PIECE_RATE',
          site: 'JEPARA',
          siteName: 'Site Jepara',
        }]]
      }
      if (statement.includes('FROM attendance_records ar')) {
        return [[{
          id: 13,
          uid: '88888888-8888-4888-8888-888888888888',
          attendanceStatus: 'PRESENT',
          clockInAt: '2026-09-20T07:00:00+07:00',
        }]]
      }
      if (statement.includes('FROM attendance_scan_events ase')) {
        return [[{ id: 14 }]]
      }
      if (statement.includes('SELECT a.id assignmentId')) {
        return [[{
          assignmentId: 14,
          isPrimary: 1,
          jobId: 15,
          jobUid,
          jobCode: 'BORONGAN-LINTING',
          jobName: 'Linting',
          rateId: 16,
          rateUid: '66666666-6666-4666-8666-666666666666',
          rateAmount: '45.0000',
          currency: 'IDR',
          tierCount: 1,
          unitId: 17,
          unitUid: '55555555-5555-4555-8555-555555555555',
          unitCode: 'PCS',
          unitName: 'Pcs',
          decimalPrecision: 0,
        }]]
      }
      if (statement.includes('SELECT a.production_job_id jobId')) {
        return [[{ jobId: 15, rateId: 16, unitId: 17 }]]
      }
      if (statement.includes('precedingQuantity')) {
        return [[{ precedingQuantity: '0.0000' }]]
      }
      if (statement.includes('FROM production_job_rate_tiers')) {
        return [[{ id: 1, minQuantity: '1.0000', rateAmount: '45.0000' }]]
      }
      if (statement.includes('COUNT(*) transactionCount')) {
        return [[{ transactionCount: 0, totalQuantity: '0.0000' }]]
      }
      if (statement.includes('SELECT id FROM employees WHERE id')) {
        return [[{ id: 11 }]]
      }
      if (statement.includes('ORDER BY pt.transaction_at,pt.id FOR UPDATE')) {
        const newRow={
          id: 21,
          uid: transactionUid,
          rateId: 16,
          quantity,
          rateSnapshot: '45.0000',
          grossAmount: '4500.00',
          payrollLockedAt: null,
          payrollSnapshot: 0,
          trainingSnapshot: 0,
          jobCode: 'BORONGAN-LINTING',
          decimalPrecision: 0,
          deductedQuantity: '0.0000',
          payableQuantity: '100.0000',
          deductionPercentage: '0.0000',
          productionSectionId: 3,
          deductionPolicyId: null,
        }
        return [oldSnapshot ? [{...newRow,id:20,uid:'old-transaction',deductionPercentage:'0.0000'},newRow] : [newRow]]
      }
      if (statement.includes('SELECT production_section_id productionSectionId')) return [oldSnapshot ? [{productionSectionId:3,deductionPolicyId:null,deductionPercentage:'0.0000'}] : []]
      if (statement.includes('mapping.production_section_id sectionId')) {
        return [[{ sectionId: 3 }]]
      }
      if (statement.includes('FROM production_quantity_deduction_policies')) {
        return percentage==='0.0000' ? [[]] : [[{id:5,percentage}]]
      }
      if (statement.includes('FROM production_transaction_rate_details')) {
        return [[]]
      }
      if (statement.includes('idempotency_key rowKey')) {
        return [[{
          id: 21,
          uid: transactionUid,
          rowKey: 'PRD-IMPORT-79777777-7777-4777-8777-777777777777-2',
          transactionNumber: 'PRD-IMP-20260920-JEPARA-ABC',
          grossAmount: gross,
        }]]
      }
      if (statement.includes('SELECT pt.id,pt.uid')) {
        return [[{
          ...transactionRow(),
          id: 21,
          transactionNumber: 'PRD-IMP-20260920-JEPARA-ABC',
          businessDate: '2026-09-20',
          transactionAt: '2026-09-21T08:00:00+07:00',
          quantity,
          rateSnapshot: '45.0000',
          grossAmount: gross,
          entrySource: 'HISTORICAL',
          notes: 'Import Excel: Import hasil Produksi darurat.',
        }]]
      }
      return [[]]
    })
    if (qcCase==='write-failure') mocks.execute.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('INSERT INTO production_transaction_qc')) throw new Error('QC write failure')
      return [{affectedRows:1,insertId:21}]
    })
    const response = await request('/transactions/import', {
      method: 'POST',
      auth: auth({ permissions: ['production.correct'], sites: ['JEPARA'] }),
      body: {
        rows: [
          {
            rowNumber: 2,
            businessDate: '2026-09-20',
            employeeNumber: 'J2608-001',
            employeeName: 'Ariel Peterpan',
            quantity:quantity.split('.')[0],
            ...(qcCase==='none'?{}:{qc:{brandCode:'BR-TEST',weight1Grams:'71,29',weight2Grams:'70.05',defects:[{defectCode:'DF-TEST',quantity:999}]}}),
          },
        ],
        reason: 'Import hasil Produksi darurat.',
        idempotencyKey: '79777777-7777-4777-8777-777777777777',
      },
    })
    if (qcCase==='wrong-site' || qcCase==='write-failure') {
      expect(response.status).toBe(qcCase==='wrong-site'?422:500)
      expect(mocks.rollback).toHaveBeenCalledTimes(1)
      expect(mocks.commit).not.toHaveBeenCalled()
      expect(mocks.execute.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_logs'))).toBe(false)
      return
    }
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      data: { total: 1, imported: 1, replayed: 0 },
    })
    expect(
      mocks.execute.mock.calls.some((call) =>
        String(call[0]).includes('INSERT INTO production_transactions')
      )
    ).toBe(true)
    const auditInsert = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO audit_logs')
    )
    expect(auditInsert).toBeDefined()
    expect((auditInsert?.[1] as unknown[]).length).toBe(17)
    expect(mocks.audit.mock.calls.every(call=>(call[0] as {action:string}).action==='UPDATE')).toBe(true)
    expect(mocks.commit).toHaveBeenCalledTimes(1)
    const repriced=mocks.execute.mock.calls.filter(call=>String(call[0]).includes('payable_quantity=?,gross_amount=?'))
    if(Number(deduction)>0) expect(repriced.some(call=>{
      const values=call[1] as unknown[]
      return values[3]===deduction && values[4]===payable && values[5]===gross
    })).toBe(true)
    else expect(repriced).toHaveLength(0)
    if(oldSnapshot) expect(mocks.query.mock.calls.some(call=>String(call[0]).includes('FROM production_quantity_deduction_policies'))).toBe(false)
  })

  it('mengaktifkan Terminal hanya dengan kode Produksi atau kode legacy', async () => {
    mocks.query.mockResolvedValueOnce([[deviceRow()]])

    const response = await request('/terminal/activate', {
      method: 'POST',
      body: { activationCode: '0123-4567-89AB' },
      withToken: false,
    })

    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain('activation_code_expires_at>')
    const update = mocks.execute.mock.calls.find(([sql]) => String(sql).includes('UPDATE scan_devices'))
    expect(String(update?.[0])).toContain('activation_code_hash=NULL')
    const lookupParams = mocks.query.mock.calls[0]?.[1] as string[]
    expect(lookupParams[0]).toMatch(/^PRODUCTION:[a-f0-9]{64}$/)
    expect(lookupParams[1]).toMatch(/^[a-f0-9]{64}$/)
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('mewajibkan token perangkat Produksi pada lookup', async () => {
    const response = await request('/terminal/lookup', {
      method: 'POST',
      body: { barcode: 'J2608-001' },
      withToken: false,
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({code:'DEVICE_SESSION_INVALID'})
    expect(mocks.rollback).toHaveBeenCalled()
  })
  it('lookup pekerjaan non-Linting tetap memuat brand site dan default terakhir perangkat', async () => {
    const brandUid = '11111111-1111-4111-8111-111111111111'
    mocks.query
      .mockResolvedValueOnce([[deviceRow()]])
      .mockResolvedValueOnce([[{ businessDate: '2026-08-21', serverTime: '2026-08-21T09:00:00+07:00' }]])
      .mockResolvedValueOnce([[{ id: 11, uid: employeeUid, employeeNumber: 'TEST-001', fullName: 'Pekerja Uji' }]])
      .mockResolvedValueOnce([[{ id: 12, siteId: 1, allowsProduction: 1, payrollBasis: 'PIECE_RATE', site: 'JEPARA' }]])
      .mockResolvedValueOnce([[{ id: 13, uid: 'attendance', attendanceStatus: 'PRESENT', clockInAt: '2026-08-21T06:00:00+07:00' }]])
      .mockResolvedValueOnce([[{ id: 14 }]])
      .mockResolvedValueOnce([[{ assignmentId: 14, isPrimary: 1, jobId: 15, jobUid, jobCode: 'BORONGAN-PACKING', jobName: 'Packing', rateId: 16, rateUid: 'rate', rateAmount: '1175.0000', currency: 'IDR', unitId: 17, unitUid: 'unit', unitCode: 'PCS', unitName: 'Pcs', decimalPrecision: 0 }]])
      .mockResolvedValueOnce([[{ uid: brandUid, code: 'BR-A', name: 'Brand A', sortOrder: 0 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ uid: brandUid }]])
    const response = await request('/terminal/lookup', { method: 'POST', body: { barcode: 'TEST-001' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ jobs: [{ code: 'BORONGAN-PACKING' }], qcOptions: { brands: [{ uid: brandUid }], defects: [] }, lastBrandUid: brandUid })
    expect(mocks.query.mock.calls.at(-1)?.[1]).toEqual([9, 1])
  })

  it('menolak setoran bila Attendance bukan Hadir meski record tersedia', async () => {
    mocks.query
      .mockResolvedValueOnce([[deviceRow()]])
      .mockResolvedValueOnce([[
        {
          businessDate: '2026-08-21',
          transactionTimestamp: '2026-08-21 09:00:00.000',
          serverTime: '2026-08-21T09:00:00+07:00',
        },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        { id: 11, uid: employeeUid, employeeNumber: 'J2608-001', fullName: 'Ariel Peterpan', barcode: 'J2608-001' },
      ]])
      .mockResolvedValueOnce([[
        { id: 12, siteId: 1, allowsProduction: 1, payrollBasis: 'PIECE_RATE', site: 'JEPARA' },
      ]])
      .mockResolvedValueOnce([[
        { id: 13, uid: 'attendance', attendanceStatus: 'SICK', clockInAt: null },
      ]])

    const response = await request('/terminal/post', {
      method: 'POST',
      body: {
        barcode: 'J2608-001',
        jobUid,
        quantity: '3',
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
      },
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'belum berstatus Hadir'
    )
    expect(mocks.execute.mock.calls.some((call) => String(call[0]).includes('INSERT INTO production_transactions'))).toBe(false)
  })

  it('menolak replay idempotency dengan payload berbeda', async () => {
    mocks.query
      .mockResolvedValueOnce([[deviceRow()]])
      .mockResolvedValueOnce([[
        {
          businessDate: '2026-08-21',
          transactionTimestamp: '2026-08-21 09:00:00.000',
          serverTime: '2026-08-21T09:00:00+07:00',
        },
      ]])
      .mockResolvedValueOnce([[
        { id: 21, deviceId: 9, quantity: '2.0000', barcode: 'J2608-001', jobUid },
      ]])

    const response = await request('/terminal/post', {
      method: 'POST',
      body: {
        barcode: 'J2608-001',
        jobUid,
        quantity: '3',
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
      },
    })
    expect(response.status).toBe(409)
    expect(mocks.rollback).toHaveBeenCalled()
  })

  it('menolak status Hadir tanpa scan Masuk sukses atau koreksi Masuk approved', async () => {
    mocks.query
      .mockResolvedValueOnce([[deviceRow()]])
      .mockResolvedValueOnce([[
        {
          businessDate: '2026-08-21',
          transactionTimestamp: '2026-08-21 09:00:00.000',
          serverTime: '2026-08-21T09:00:00+07:00',
        },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        { id: 11, uid: employeeUid, employeeNumber: 'J2608-001', fullName: 'Ariel Peterpan', barcode: 'J2608-001' },
      ]])
      .mockResolvedValueOnce([[
        { id: 12, siteId: 1, allowsProduction: 1, payrollBasis: 'PIECE_RATE', site: 'JEPARA' },
      ]])
      .mockResolvedValueOnce([[
        { id: 13, uid: 'attendance', attendanceStatus: 'PRESENT', clockInAt: '2026-08-21T06:00:00+07:00' },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])

    const response = await request('/terminal/post', {
      method: 'POST',
      body: {
        barcode: 'J2608-001',
        jobUid,
        quantity: '3',
        idempotencyKey: '67666666-6666-4666-8666-666666666666',
      },
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'koreksi jam Masuk yang disetujui'
    )
  })

  it('menolak assignment aktif untuk pekerjaan yang sama bila overlap', async () => {
    mocks.query
      .mockResolvedValueOnce([[deviceRow()]])
      .mockResolvedValueOnce([[
        {
          businessDate: '2026-08-21',
          transactionTimestamp: '2026-08-21 09:00:00.000',
          serverTime: '2026-08-21T09:00:00+07:00',
        },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        { id: 11, uid: employeeUid, employeeNumber: 'J2608-001', fullName: 'Ariel Peterpan', barcode: 'J2608-001' },
      ]])
      .mockResolvedValueOnce([[
        { id: 12, siteId: 1, allowsProduction: 1, payrollBasis: 'PIECE_RATE', site: 'JEPARA' },
      ]])
      .mockResolvedValueOnce([[
        { id: 13, uid: 'attendance', attendanceStatus: 'PRESENT', clockInAt: '2026-08-21T06:00:00+07:00' },
      ]])
      .mockResolvedValueOnce([[{ id: 14 }]])
      .mockResolvedValueOnce([[
        { assignmentId: 30, isPrimary: 1, isJobActive: 1, jobId: 15, jobUid, jobName: 'Linting' },
        { assignmentId: 31, isPrimary: 0, isJobActive: 1, jobId: 15, jobUid, jobName: 'Linting' },
      ]])

    const response = await request('/terminal/post', {
      method: 'POST',
      body: {
        barcode: 'J2608-001',
        jobUid,
        quantity: '3',
        idempotencyKey: '68666666-6666-4666-8666-666666666666',
      },
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'bertumpang-tindih'
    )
  })

  it.each(['legacy','qc','brand-only','invalid-brand','invalid-defect','qc-write-failure'])('setoran atomik dan QC tidak mengubah PCS/upah: %s', async (variant) => {
    const brandUid = '11111111-1111-4111-8111-111111111111'
    const defectUid = '22222222-2222-4222-8222-222222222222'
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM production_brands')) {
        return [variant==='invalid-brand' ? [] : [{id:81,uid:brandUid,code:'BR-A',name:'Brand A'}]]
      }
      if (statement.includes('FROM production_defects')) {
        return [variant==='invalid-defect' ? [] : [{id:82,uid:defectUid,code:'DF-A',name:'Cowong',sortOrder:1}]]
      }
      if (statement.includes('SELECT pt.id,pt.uid') && statement.includes('WHERE pt.id=?')) {
        return [[transactionRow()]]
      }
      if (statement.includes('SELECT rate_amount rateAmount FROM production_job_rates')) {
        return [[{ rateAmount: '1175.0000' }]]
      }
      return [[]]
    })
    mocks.query
      .mockResolvedValueOnce([[deviceRow()]])
      .mockResolvedValueOnce([[
        {
          businessDate: '2026-08-21',
          transactionTimestamp: '2026-08-21 09:00:00.000',
          serverTime: '2026-08-21T09:00:00+07:00',
        },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        { id: 11, uid: employeeUid, employeeNumber: 'J2608-001', fullName: 'Ariel Peterpan', barcode: 'J2608-001' },
      ]])
      .mockResolvedValueOnce([[
        { id: 12, siteId: 1, workGroupId: 4, allowsProduction: 1, payrollBasis: 'PIECE_RATE', site: 'JEPARA' },
      ]])
      .mockResolvedValueOnce([[
        { id: 13, uid: '77777777-7777-4777-8777-777777777777', attendanceStatus: 'PRESENT', clockInAt: '2026-08-21T06:00:00+07:00' },
      ]])
      .mockResolvedValueOnce([[{ id: 14 }]])
      .mockResolvedValueOnce([[
        { assignmentId: 14, isPrimary: 1, isJobActive: 1, jobId: 15, jobUid, jobCode: variant==='brand-only' ? 'BORONGAN-PACKING' : 'BORONGAN-LINTING', jobName: 'Pekerjaan' },
      ]])
      .mockResolvedValueOnce([[
        { rateId: 16, rateUid: 'rate', rateAmount: '1175.0000', currency: 'IDR', unitId: 17, unitUid: 'unit', unitCode: 'PCS', unitName: 'Pcs', decimalPrecision: 0 },
      ]])
      .mockResolvedValueOnce([[]])
    mocks.execute.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('INSERT INTO production_transaction_qc(')) {
        if (variant==='qc-write-failure') throw new Error('QC write failed')
        return [{affectedRows:1,insertId:91}]
      }
      return String(sql).includes('INSERT INTO production_transactions')
        ? [{ affectedRows: 1, insertId: 21 }]
        : [{ affectedRows: 1 }]
    })

    const response = await request('/terminal/post', {
      method: 'POST',
      body: {
        barcode: 'J2608-001',
        jobUid,
        quantity: '3',
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
        ...(variant==='brand-only' ? {qc:{brandUid}} : variant!=='legacy' ? {qc:{brandUid,weight1Grams:'71,29',weight2Grams:'70.05',defects:[{defectUid,quantity:10}]}} : {}),
      },
    })
    if (variant==='invalid-brand' || variant==='invalid-defect' || variant==='qc-write-failure') {
      expect(response.status).toBe(variant==='qc-write-failure' ? 500 : 422)
      expect(mocks.commit).not.toHaveBeenCalled()
      expect(mocks.rollback).toHaveBeenCalledOnce()
      expect(mocks.audit).not.toHaveBeenCalled()
      return
    }
    expect(response.status).toBe(201)
    expect(
      ((await response.json()) as { transaction: { grossAmount: string } })
        .transaction.grossAmount
    ).toBe('3525.00')
    const insert = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO production_transactions')
    )
    expect(insert?.[1]).toEqual(expect.arrayContaining(['3.0000', '1175.0000', '3525.00']))
    expect(mocks.audit).toHaveBeenCalledTimes(1)
    expect(mocks.commit).toHaveBeenCalledTimes(1)
    const qcHeader = mocks.execute.mock.calls.find(call=>String(call[0]).includes('INSERT INTO production_transaction_qc('))
    if (variant==='qc') {
      expect(qcHeader?.[1]).toEqual(expect.arrayContaining([21,81,'BR-A','Brand A','71.29','70.05']))
      expect(mocks.execute.mock.calls.some(call=>String(call[0]).includes('INSERT INTO production_transaction_qc_defects'))).toBe(true)
    } else if (variant==='brand-only') {
      expect(qcHeader?.[1]).toEqual(expect.arrayContaining([21,81,'BR-A','Brand A',null]))
      expect(mocks.execute.mock.calls.some(call=>String(call[0]).includes('INSERT INTO production_transaction_qc_defects'))).toBe(false)
    } else expect(qcHeader).toBeUndefined()
  })

  it.each(['legacy', 'status'])('enriches list QC snapshots and unique historic module without changing totals: %s', async variant => {
    mocks.query
      .mockResolvedValueOnce([[{transactionCount:2,employeeCount:1,totalGrossAmount:'3525.00'}]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[transactionRow(),{...transactionRow(),id:22,uid:jobUid}]])
      .mockResolvedValueOnce([[{id:81,transactionId:21,brandUid:employeeUid,brandCode:'BR-OLD',brandName:'Snapshot brand',weight1Grams:'71.29',weight2Grams:null}]])
      .mockResolvedValueOnce([[{qcId:81,uid:jobUid,code:'DF-OLD',name:'Snapshot defect',sortOrder:3,quantity:9}]])
      .mockResolvedValueOnce([[{hasHistoryStatus:variant==='status' ? 1 : 0}]])
      .mockResolvedValueOnce([[{transactionId:21,uid:jobUid,code:'MOD-OLD',name:'Historical module'}]])
    const response = await request('/transactions?site=JEPARA')
    expect(response.status).toBe(200)
    const body = await response.json() as {
      total: number
      summary: { totalGrossAmount: string }
      items: Array<Record<string, unknown>>
    }
    expect(body.total).toBe(2)
    expect(body.summary.totalGrossAmount).toBe('3525.00')
    expect(body.items[0]).toMatchObject({productionModule:{uid:jobUid,code:'MOD-OLD',name:'Historical module'},qc:{brand:{code:'BR-OLD',name:'Snapshot brand'},weight1Grams:'71.29',defects:[{name:'Snapshot defect',quantity:9}]}})
    expect(body.items[1]).toMatchObject({productionModule:null,qc:null})
    expect(body.items[0]).not.toHaveProperty('id')
    expect(mocks.query).toHaveBeenCalledTimes(7)
    const moduleSql = String(mocks.query.mock.calls[6][0])
    expect(moduleSql).toContain('module_history.site_id=pt.site_id')
    expect(moduleSql).toContain('module_history.effective_from<=pt.business_date')
    expect(moduleSql).toContain('conflicting_history.id<>module_history.id')
    expect(moduleSql.includes("module_history.status='ACTIVE'")).toBe(variant==='status')
    expect(mocks.query.mock.calls[6][1]).toEqual([21,22])
  })

  it('membatasi list ke site user dan menghitung KPI hanya dari POSTED', async () => {
    mocks.query
      .mockResolvedValueOnce([[
        { transactionCount: 1, employeeCount: 1, totalGrossAmount: '3525.00' },
      ]])
      .mockResolvedValueOnce([[
        {
          uid: '55555555-5555-4555-8555-555555555555',
          code: 'PCS',
          name: 'Pcs',
          decimalPrecision: 0,
          quantity: '3.0000',
        },
      ]])
      .mockResolvedValueOnce([[transactionRow()]])

      .mockResolvedValueOnce([[]]) // No QC on legacy transactions.
      .mockResolvedValueOnce([[{hasHistoryStatus:1}]])
      .mockResolvedValueOnce([[]]) // No unique historical module placement.

    const response = await request(
      `/transactions?site=JEPARA&jobUid=${jobUid}&status=POSTED&pageSize=500`
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      summary: {
        totalGrossAmount: string
        totalQuantity: string | null
        quantityTotals: Array<{ quantity: string; unit: { code: string } }>
      }
      pageSize: number
    }
    expect(body.summary.totalGrossAmount).toBe('3525.00')
    expect(body.summary.totalQuantity).toBe('3.0000')
    expect(body.summary.quantityTotals).toEqual([
      expect.objectContaining({
        quantity: '3.0000',
        unit: expect.objectContaining({ code: 'PCS' }),
      }),
    ])
    expect(body.pageSize).toBe(500)
    const summarySql = String(mocks.query.mock.calls[0]?.[0])
    expect(summarySql).toContain("CASE WHEN pt.status='POSTED' THEN pt.gross_amount")
    expect(summarySql).toContain('s.code IN (?)')
    expect(String(mocks.query.mock.calls[1]?.[0])).toContain("pt.status='POSTED'")
  })

  it('tidak menghasilkan total kuantitas palsu ketika satuannya bercampur', async () => {
    mocks.query
      .mockResolvedValueOnce([[
        { transactionCount: 2, employeeCount: 1, totalGrossAmount: '5000.00' },
      ]])
      .mockResolvedValueOnce([[
        {
          uid: '55555555-5555-4555-8555-555555555555',
          code: 'PCS',
          name: 'Pcs',
          decimalPrecision: 0,
          quantity: '3.0000',
        },
        {
          uid: '88888888-8888-4888-8888-888888888888',
          code: 'KG',
          name: 'Kilogram',
          decimalPrecision: 2,
          quantity: '1.5000',
        },
      ]])
      .mockResolvedValueOnce([[]])

    const response = await request('/transactions')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      summary: { totalQuantity: string | null; quantityTotals: unknown[] }
    }
    expect(body.summary.totalQuantity).toBeNull()
    expect(body.summary.quantityTotals).toHaveLength(2)
  })

  it('mewajibkan production.correct tetapi SUPER_ADMIN selalu dapat melewati permission', async () => {
    const denied = await request(`/transactions/${transactionUid}/void-preview`, {
      method: 'POST',
      body: {},
      auth: auth({ permissions: ['production.view'] }),
    })
    expect(denied.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()

    mocks.query
      .mockResolvedValueOnce([[managedTransactionRow()]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[transactionRow()]])
      .mockResolvedValueOnce([[]])
    const superAdmin = {
      ...auth({ permissions: [] }),
      roles: ['SUPER_ADMIN'],
      siteAccess: [],
    }
    mocks.query.mockResolvedValueOnce([[]]) // optional legacy QC header
    const allowed = await request(`/transactions/${transactionUid}/void-preview`, {
      method: 'POST',
      body: {},
      auth: superAdmin,
    })
    expect(allowed.status).toBe(200)
  })

  it.each([
    {percentage:'0.0000',firstGross:'48400.00',secondGross:'27900.00',delta:'-52100.00'},
    {percentage:'3.0000',firstGross:'46948.00',secondGross:'26508.00',delta:'-49982.00'},
  ])('preview void menghitung ulang tier dan potongan harian $percentage', async ({percentage,firstGross,secondGross,delta}) => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement=String(sql)
      if (statement.includes('SELECT pt.*')) {
        return [[managedTransactionRow({quantity:'400.0000',gross_amount:'48400.00'})]]
      }
      if (statement.includes('SELECT id,job_rate_id rateId,quantity')) {
        return [[
          {id:21,rateId:16,quantity:'400.0000',transactionAt:'2026-08-21 09:00:00.000000',grossAmount:firstGross,deductionPercentage:percentage,decimalPrecision:0},
          {id:22,rateId:16,quantity:'200.0000',transactionAt:'2026-08-21 10:00:00.000000',grossAmount:secondGross,deductionPercentage:percentage,decimalPrecision:0},
        ]]
      }
      if (statement.includes('FROM production_job_rate_tiers')) {
        return [[
          {id:1,minQuantity:'1.0000',rateAmount:'121.0000'},
          {id:2,minQuantity:'501.0000',rateAmount:'158.0000'},
        ]]
      }
      if (statement.includes('WHERE pt.id=?')) return [[transactionRow()]]
      return [[]]
    })
    const response=await request(`/transactions/${transactionUid}/void-preview`,{
      method:'POST',body:{},auth:auth({permissions:['production.correct']}),
    })
    expect(response.status).toBe(200)
    expect((await response.json()) as object).toMatchObject({
      impact:{grossAmount:delta},
    })
    expect(mocks.query.mock.calls.some(call=>String(call[0]).includes('FROM production_quantity_deduction_policies'))).toBe(false)
  })

  it('preview koreksi memakai snapshot 3% dan nominal setelah potongan', async () => {
    mocks.query.mockImplementation(async (sql:unknown)=>{
      const statement=String(sql)
      if(statement.includes('SELECT pt.*')) return [[managedTransactionRow({quantity:'500.0000',gross_amount:'48500.00',rate_snapshot:'100.0000',quantity_deduction_percentage:'3.0000'})]]
      if(statement.includes('SELECT production_section_id productionSectionId')) return [[{productionSectionId:3,deductionPolicyId:5,deductionPercentage:'3.0000'}]]
      if(statement.includes('precedingQuantity')) return [[{precedingQuantity:'500.0000'}]]
      if(statement.includes('SELECT id,job_rate_id rateId,quantity')) return [[
        {id:21,rateId:16,quantity:'500.0000',transactionAt:'2026-08-21 09:00:00.000000',grossAmount:'48500.00',deductionPercentage:'3.0000',decimalPrecision:0},
        {id:22,rateId:16,quantity:'500.0000',transactionAt:'2026-08-21 09:00:00.000000',grossAmount:'48500.00',deductionPercentage:'3.0000',decimalPrecision:0},
      ]]
      if(statement.includes('FROM production_job_rate_tiers')) return [[{id:1,minQuantity:'1.0000',rateAmount:'100.0000'}]]
      if(statement.includes('WHERE pt.id=?')) return [[{...transactionRow(),quantity:'500.0000',grossAmount:'48500.00'}]]
      return [[]]
    })
    const response=await request(`/transactions/${transactionUid}/correction-preview`,{method:'POST',auth:auth({permissions:['production.correct']}),body:{jobUid,quantity:'1000'}})
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({proposed:{deductionPercentage:'3.0000',deductionQuantity:'30.0000',payableQuantity:'970.0000',grossAmount:'97000.00'},delta:{grossAmount:'48500.00'}})
    expect(mocks.query.mock.calls.some(call=>String(call[0]).includes('FROM production_quantity_deduction_policies'))).toBe(false)
  })

  it('memblokir revisi ketika payroll_locked_at sudah terisi', async () => {
    mocks.query
      .mockResolvedValueOnce([[
        managedTransactionRow({ payroll_locked_at: '2026-08-21 12:00:00' }),
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])

    const response = await request(`/transactions/${transactionUid}/void`, {
      method: 'POST',
      body: {
        reason: 'Setoran salah dicatat.',
        idempotencyKey: '67666666-6666-4666-8666-666666666666',
      },
      auth: auth({ permissions: ['production.correct'] }),
    })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { message: string }).message).toContain(
      'dikunci'
    )
    expect(
      mocks.execute.mock.calls.some((call) =>
        String(call[0]).includes('production_transaction_revisions')
      )
    ).toBe(false)
  })

  it.each([
    {
      label: 'snapshot Payroll',
      snapshots: [{ id: 90 }],
      periods: [],
      expected: 'snapshot',
    },
    {
      label: 'periode CALCULATED',
      snapshots: [],
      periods: [{ status: 'CALCULATED', processingRun: 0 }],
      expected: 'CALCULATED',
    },
    {
      label: 'run PROCESSING',
      snapshots: [],
      periods: [{ status: 'DRAFT', processingRun: 1 }],
      expected: 'sedang berjalan',
    },
  ])('memblokir preview untuk $label', async ({ snapshots, periods, expected }) => {
    mocks.query
      .mockResolvedValueOnce([[managedTransactionRow()]])
      .mockResolvedValueOnce([snapshots])
      .mockResolvedValueOnce([periods])
    const response = await request(`/transactions/${transactionUid}/void-preview`, {
      method: 'POST',
      body: {},
      auth: auth({ permissions: ['production.correct'] }),
    })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { message: string }).message).toContain(
      expected
    )
  })

  it.each(['legacy', 'qc', 'qc-write-failure'])('membuat koreksi atomik: original VOID, replacement POSTED, revision append-only QC %s', async qcCase => {
    const replacement = {
      ...transactionRow(),
      id: 22,
      uid: '77777777-7777-4777-8777-777777777777',
      transactionNumber: 'PRD-COR-20260821-JEPARA-ABC',
      quantity: '4.0000',
      grossAmount: '4700.00',
    }
    const voidedSource = { ...transactionRow(), status: 'VOID' }
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('SELECT pt.*')) return [[managedTransactionRow()]]
      if (statement.includes('FROM production_transaction_qc qc')) return qcCase==='legacy' ? [[]] : [[{id:61,brandUid:'brand-uid',brandCode:'BR-OLD',brandName:'Old snapshot',weight1Grams:'71.29',weight2Grams:'70.05'}]]
      if (statement.includes('FROM production_transaction_qc_defects detail')) return [[{uid:'defect-uid',code:'DF-OLD',name:'Old defect',sortOrder:9,quantity:10}]]
      if (statement.includes('SELECT production_section_id productionSectionId')) return [[{productionSectionId:3,deductionPercentage:'0.0000',deductionPolicyId:null}]]
      if (statement.includes('WHERE pr.idempotency_key')) return [[]]
      if (statement.includes('FROM payroll_production_details')) return [[]]
      if (statement.includes('FROM payroll_periods pp')) return [[]]
      if (statement.includes('SELECT a.id assignmentId')) {
        return [[{
          assignmentId: 14,
          isPrimary: 1,
          jobId: 15,
          jobUid,
          jobCode: 'BORONGAN-LINTING',
          jobName: 'Linting',
          rateId: 16,
          rateUid: 'rate',
          rateAmount: '1175.0000',
          currency: 'IDR',
          unitId: 17,
          unitUid: '55555555-5555-4555-8555-555555555555',
          unitCode: 'PCS',
          unitName: 'Pcs',
          decimalPrecision: 0,
        }]]
      }
      if (statement.includes('SELECT j.id jobId')) {
        return [[{ jobId: 15, rateId: 16, unitId: 17 }]]
      }
      if (statement.includes('SELECT rate_amount rateAmount FROM production_job_rates')) {
        return [[{ rateAmount: '1175.0000' }]]
      }
      if (statement.includes('MAX(revision_number)')) {
        return [[{ revisionNumber: 1 }]]
      }
      if (statement.includes('SELECT pt.id,pt.uid')) {
        if (statement.includes('ORDER BY pt.transaction_at,pt.id FOR UPDATE')) return [[]]
        const transactionId = Number((mocks.query.mock.calls.at(-1)?.[1] as unknown[])[0])
        return [[transactionId === 22 ? replacement : voidedSource]]
      }
      return [[]]
    })
    mocks.execute.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('INSERT INTO production_transactions')) {
        return [{ affectedRows: 1, insertId: 22 }]
      }
      if (statement.includes('INSERT INTO production_transaction_qc(')) {
        if (qcCase==='qc-write-failure') throw new Error('QC clone failed')
        return [{affectedRows:qcCase==='legacy'?0:1,insertId:61}]
      }
      return [{ affectedRows: 1 }]
    })

    const response = await request(`/transactions/${transactionUid}/correct`, {
      method: 'POST',
      body: {
        jobUid,
        quantity: '4',
        reason: 'Kuantitas setoran salah dicatat.',
        idempotencyKey: '68666666-6666-4666-8666-666666666666',
      },
      auth: auth({ permissions: ['production.correct'] }),
    })
    if (qcCase==='qc-write-failure') {
      expect(response.status).toBe(500)
      expect(mocks.rollback).toHaveBeenCalledTimes(1)
      expect(mocks.commit).not.toHaveBeenCalled()
      expect(mocks.execute.mock.calls.some(([sql]) => String(sql).includes("SET status='VOID'"))).toBe(false)
      return
    }
    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      sourceTransaction: { status: string }
      transaction: { status: string; quantity: string }
    }
    expect(body.sourceTransaction.status).toBe('VOID')
    expect(body.transaction).toMatchObject({ status: 'POSTED', quantity: '4.0000' })
    if (qcCase==='qc') expect(body.transaction).toMatchObject({qc:{brand:{name:'Old snapshot'},defects:[{name:'Old defect',sortOrder:9}]}})
    else expect(body.transaction).toMatchObject({qc:null})
    expect(mocks.execute.mock.calls.some(([sql]) => String(sql).includes('detail.sort_order_snapshot'))).toBe(qcCase==='qc')
    expect(
      mocks.execute.mock.calls.some((call) =>
        String(call[0]).includes('INSERT INTO production_transaction_revisions')
      )
    ).toBe(true)
    const revisionInsert = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO production_transaction_revisions')
    )
    const beforeSnapshot = JSON.parse(
      String((revisionInsert?.[1] as unknown[] | undefined)?.[5])
    ) as { job: { name: string }; unit: { code: string } }
    const afterSnapshot = JSON.parse(
      String((revisionInsert?.[1] as unknown[] | undefined)?.[6])
    ) as { job: { name: string }; unit: { code: string } }
    expect(beforeSnapshot.job.name).toBe('Linting')
    expect(beforeSnapshot.unit.code).toBe('PCS')
    expect(afterSnapshot.job.name).toBe('Linting')
    expect(afterSnapshot.unit.code).toBe('PCS')
    expect(mocks.commit).toHaveBeenCalledTimes(1)
    expect(mocks.audit).toHaveBeenCalledTimes(1)
  })

  it('mengembalikan hasil void lama untuk idempotency yang sama saat source sudah VOID', async () => {
    mocks.query
      .mockResolvedValueOnce([[managedTransactionRow({ status: 'VOID' })]])
      .mockResolvedValueOnce([[
        {
          id: 41,
          uid: '88888888-8888-4888-8888-888888888888',
          sourceId: 21,
          replacementId: null,
          revisionNumber: 1,
          revisionType: 'VOID',
          reason: 'Setoran duplikat.',
          afterData: { request: { reason: 'Setoran duplikat.' } },
          revisedAt: '2026-08-21T10:00:00+07:00',
        },
      ]])
      .mockResolvedValueOnce([[{ ...transactionRow(), status: 'VOID' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]) // optional legacy QC header

    const response = await request(`/transactions/${transactionUid}/void`, {
      method: 'POST',
      body: {
        reason: 'Setoran duplikat.',
        idempotencyKey: '69666666-6666-4666-8666-666666666666',
      },
      auth: auth({ permissions: ['production.correct'] }),
    })
    expect(response.status).toBe(200)
    expect((await response.json()) as object).toMatchObject({ duplicate: true })
    expect(mocks.commit).toHaveBeenCalledTimes(1)
  })

  it('menolak replay revision bila idempotency key dipakai untuk payload berbeda', async () => {
    mocks.query
      .mockResolvedValueOnce([[managedTransactionRow({ status: 'VOID' })]])
      .mockResolvedValueOnce([[
        {
          id: 41,
          uid: '88888888-8888-4888-8888-888888888888',
          sourceId: 21,
          replacementId: null,
          revisionNumber: 1,
          revisionType: 'VOID',
          reason: 'Alasan lama.',
          afterData: { request: { reason: 'Alasan lama.' } },
        },
      ]])
    const response = await request(`/transactions/${transactionUid}/void`, {
      method: 'POST',
      body: {
        reason: 'Alasan baru yang berbeda.',
        idempotencyKey: '71666666-6666-4666-8666-666666666666',
      },
      auth: auth({ permissions: ['production.correct'] }),
    })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { message: string }).message).toContain(
      'Idempotency key'
    )
  })

  it('menolak koreksi bila pekerjaan target tidak ditugaskan atau tidak punya tarif aktif', async () => {
    mocks.query
      .mockResolvedValueOnce([[managedTransactionRow()]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        {
          assignmentId: 14,
          isPrimary: 1,
          jobUid,
          jobCode: 'BORONGAN-LINTING',
          jobName: 'Linting',
          rateId: null,
          unitId: null,
        },
      ]])
    const response = await request(`/transactions/${transactionUid}/correction-preview`, {
      method: 'POST',
      body: {
        jobUid: '99999999-9999-4999-8999-999999999999',
        quantity: '4',
      },
      auth: auth({ permissions: ['production.correct'] }),
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'tarif aktif'
    )
  })

  it('menolak koreksi no-op pada pekerjaan dan kuantitas yang sama', async () => {
    mocks.query
      .mockResolvedValueOnce([[managedTransactionRow()]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
    const response = await request(`/transactions/${transactionUid}/correction-preview`, {
      method: 'POST',
      body: { jobUid, quantity: '3' },
      auth: auth({ permissions: ['production.correct'] }),
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { message: string }).message).toContain(
      'tidak memiliki perubahan'
    )
  })

  it('menolak aksi baru pada transaksi VOID untuk melindungi state saat request bersamaan', async () => {
    mocks.query
      .mockResolvedValueOnce([[managedTransactionRow({ status: 'VOID' })]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
    const response = await request(`/transactions/${transactionUid}/void`, {
      method: 'POST',
      body: {
        reason: 'Permintaan void kedua.',
        idempotencyKey: '70666666-6666-4666-8666-666666666666',
      },
      auth: auth({ permissions: ['production.correct'] }),
    })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { message: string }).message).toContain(
      'POSTED'
    )
  })

  it('membatasi ringkasan hapus batch hanya untuk SUPER_ADMIN', async () => {
    const response = await request('/transactions/batch-delete/summary', {
      method: 'POST',
      body: { dateFrom: '2026-08-21', dateTo: '2026-08-22', site: 'JEPARA' },
      auth: auth({ permissions: ['production.correct'] }),
    })
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengizinkan ringkasan reset transaksi dengan histori koreksi atau void', async () => {
    mocks.query.mockResolvedValueOnce([[
      {
        businessDate: '2026-08-22',
        employeeCount: 9,
        transactionCount: 12,
        totalQuantityPcs: '1500.0000',
        totalGrossAmount: '250000.00',
        hasPayrollLock: 0,
        hasRevision: 1,
        hasPayrollSnapshot: 0,
        hasProcessedPayrollPeriod: 0,
        hasProcessingPayrollRun: 0,
      },
      {
        businessDate: '2026-08-21',
        employeeCount: 7,
        transactionCount: 10,
        totalQuantityPcs: '1200.0000',
        totalGrossAmount: '200000.00',
        hasPayrollLock: 0,
        hasRevision: 0,
        hasPayrollSnapshot: 0,
        hasProcessedPayrollPeriod: 0,
        hasProcessingPayrollRun: 0,
      },
    ]])
    const response = await request('/transactions/batch-delete/summary', {
      method: 'POST',
      body: { dateFrom: '2026-08-21', dateTo: '2026-08-22', site: 'JEPARA' },
      auth: { ...auth({ permissions: [] }), roles: ['SUPER_ADMIN'], siteAccess: [] },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: { rows: Array<{ businessDate: string; canDelete: boolean; blockers: string[] }> }
    }
    expect(body.data.rows[0]).toMatchObject({
      businessDate: '2026-08-22',
      canDelete: true,
      blockers: [],
    })
    expect(body.data.rows[1]).toMatchObject({
      businessDate: '2026-08-21',
      canDelete: true,
    })
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain('site.code=?')
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      '2026-08-21',
      '2026-08-22',
      'JEPARA',
    ])
  })

  it.each(['success', 'without-revisions', 'revision-delete-failure', 'qc-delete-failure', 'outside-source', 'outside-replacement'])('menghapus transaksi beserta rantai koreksi/void secara atomik dan menulis audit: %s', async variant => {
    mocks.query
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }, { id: 3 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        {
          businessDate: '2026-08-22',
          siteId: 1,
          employeeCount: 1,
          transactionCount: 1,
          totalQuantityPcs: '300.0000',
          totalGrossAmount: '15000.00',
          hasPayrollLock: 0,
          hasRevision: 0,
          hasPayrollSnapshot: 0,
          hasProcessedPayrollPeriod: 0,
          hasProcessingPayrollRun: 0,
        },
        {
          businessDate: '2026-08-21',
          siteId: 1,
          employeeCount: 2,
          transactionCount: 2,
          totalQuantityPcs: '500.0000',
          totalGrossAmount: '25000.00',
          hasPayrollLock: 0,
          hasRevision: 0,
          hasPayrollSnapshot: 0,
          hasProcessedPayrollPeriod: 0,
          hasProcessingPayrollRun: 0,
        },
      ]])
      .mockResolvedValueOnce([variant === 'without-revisions' ? [] : [
        { id: 11, sourceId: variant === 'outside-source' ? 99 : 1, replacementId: 2 },
        { id: 12, sourceId: 2, replacementId: variant === 'outside-replacement' ? 99 : 3 },
        { id: 13, sourceId: 3, replacementId: null },
      ]])
    mocks.execute
      .mockResolvedValueOnce([{ affectedRows: 3 }])
      .mockResolvedValueOnce([{ affectedRows: 3 }])
      .mockResolvedValueOnce([{ affectedRows: 3 }])
      .mockResolvedValueOnce([{ affectedRows: 3 }])
      .mockResolvedValueOnce([{ affectedRows: 3 }])
    if (variant === 'qc-delete-failure') {
      mocks.execute.mockReset()
        .mockResolvedValueOnce([{ affectedRows: 3 }])
        .mockRejectedValueOnce(new Error('QC delete failure'))
    }
    if (variant === 'revision-delete-failure') {
      mocks.execute.mockReset().mockRejectedValueOnce(new Error('Revision delete failure'))
    }

    const response = await request('/transactions/batch-delete', {
      method: 'POST',
      body: {
        businessDates: ['2026-08-21', '2026-08-22'],
        site: 'JEPARA',
        reason: 'Data Produksi akan diimpor ulang.',
        confirmation: 'HAPUS',
      },
      auth: { ...auth({ permissions: [] }), roles: ['SUPER_ADMIN'], siteAccess: [] },
    })
    if (variant !== 'success' && variant !== 'without-revisions') {
      const outsideBatch = variant.startsWith('outside-')
      expect(response.status).toBe(outsideBatch ? 409 : 500)
      if (outsideBatch) {
        expect(((await response.json()) as { message: string }).message).toContain('di luar')
      }
      expect(mocks.rollback).toHaveBeenCalledTimes(1)
      expect(mocks.commit).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
      expect(mocks.execute).toHaveBeenCalledTimes(outsideBatch ? 0 : variant === 'qc-delete-failure' ? 2 : 1)
      return
    }
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { deletedDates: 2, deletedTransactions: 3 },
    })
    expect(
      mocks.execute.mock.calls.some((call) =>
        String(call[0]).includes('DELETE detail')
      )
    ).toBe(true)
    expect(mocks.audit).toHaveBeenCalledTimes(2)
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 1 }),
      connection
    )
    const deleteCall = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes('DELETE transaction')
    )
    expect(String(deleteCall?.[0])).toContain('site.code=?')
    const deletionStatements = mocks.execute.mock.calls.map(call => String(call[0]))
    expect(deletionStatements[0]).toContain('DELETE revision FROM production_transaction_revisions')
    expect(deletionStatements[0]).toContain('transaction.id=revision.replacement_transaction_id')
    expect(deletionStatements[0]).toContain('site.code=?')
    expect(mocks.execute.mock.calls[0]?.[1]).toEqual(['2026-08-21', '2026-08-22', 'JEPARA'])
    expect(deletionStatements[1]).toContain('production_transaction_qc_defects')
    expect(deletionStatements[2]).toContain('DELETE header FROM production_transaction_qc')
    expect(deletionStatements[3]).toContain('production_transaction_rate_details')
    expect(deletionStatements[4]).toContain('DELETE transaction')
    expect(deleteCall?.[1]).toEqual([
      '2026-08-21',
      '2026-08-22',
      'JEPARA',
    ])
    expect(mocks.commit).toHaveBeenCalledTimes(1)
  })

  it.each(['hasPayrollLock', 'hasPayrollSnapshot', 'hasProcessedPayrollPeriod', 'hasProcessingPayrollRun'])('membatalkan seluruh reset multi-tanggal meski memiliki revisi jika diblokir Payroll: %s', async blocker => {
    mocks.query
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        {
          businessDate: '2026-08-22',
          employeeCount: 1,
          transactionCount: 1,
          totalQuantityPcs: '300.0000',
          totalGrossAmount: '15000.00',
          hasPayrollLock: 0,
          hasRevision: 1,
          hasPayrollSnapshot: 0,
          hasProcessedPayrollPeriod: 0,
          hasProcessingPayrollRun: 0,
          [blocker]: 1,
        },
        {
          businessDate: '2026-08-21',
          employeeCount: 1,
          transactionCount: 1,
          totalQuantityPcs: '200.0000',
          totalGrossAmount: '10000.00',
          hasPayrollLock: 0,
          hasRevision: 0,
          hasPayrollSnapshot: 0,
          hasProcessedPayrollPeriod: 0,
          hasProcessingPayrollRun: 0,
        },
      ]])

    const response = await request('/transactions/batch-delete', {
      method: 'POST',
      body: {
        businessDates: ['2026-08-21', '2026-08-22'],
        site: 'ALL',
        reason: 'Data Produksi akan diimpor ulang.',
        confirmation: 'HAPUS',
      },
      auth: { ...auth({ permissions: [] }), roles: ['SUPER_ADMIN'], siteAccess: [] },
    })
    expect(response.status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledTimes(1)
    expect(mocks.commit).not.toHaveBeenCalled()
  })
})
