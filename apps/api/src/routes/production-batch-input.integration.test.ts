import express from 'express'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import { productionTransactionsRouter } from './production-transactions.js'

const m = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
  saveQc: vi.fn(),
  snapshot: vi.fn(),
}))
vi.mock('../db.js', () => ({ pool: { getConnection: async () => m } }))
vi.mock('../lib/audit.js', () => ({ writeAudit: m.audit }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (_q: unknown, _s: unknown, next: () => void) => next(),
  requirePermission: () => (_q: unknown, _s: unknown, next: () => void) =>
    next(),
}))
vi.mock('../lib/production-transaction-module.js', () => ({
  isQcUser: (auth: { roles: string[] }) => auth.roles.includes('QC'),
  assertQcEmployeeModule: vi.fn(),
  qcModulePredicate: vi.fn(),
  qcTransactionPredicate: vi.fn(),
  assertQcTransactionAccess: vi.fn(),
  assertQcDailyGroupAccess: vi.fn(),
  snapshotTransactionModule: m.snapshot,
  snapshotTransactionModules: vi.fn(),
}))
vi.mock('../lib/production-qc-storage.js', () => ({
  loadProductionQcOptions: async () => ({
    brands: [{ uid: 'brand' }],
    defects: [{ uid: 'defect' }],
  }),
  resolveProductionQc: async (_c: unknown, input: Record<string, unknown>) => ({
    brand: { id: 1, uid: 'brand', code: 'BR-001', name: 'Demo' },
    weight1Grams: input.weight1Grams ?? null,
    weight2Grams: input.weight2Grams ?? null,
    defects: input.defects,
  }),
  saveProductionQc: m.saveQc,
  readProductionQc: vi.fn(),
  readProductionQcBatch: vi.fn(),
  cloneProductionQc: vi.fn(),
  assertProductionQcReplay: vi.fn(),
  lastProductionDeviceBrand: vi.fn(),
  loadProductionImportQcMasters: vi.fn(),
  resolveProductionImportQc: vi.fn(),
  saveProductionImportQc: vi.fn(),
  assertProductionImportQcReplay: vi.fn(),
}))
const employee = (id: number) => ({
  id,
  uid: `employee-${id}`,
  employeeNumber: `DEMO-${id}`,
  fullName: `Demo ${id}`,
  barcode: `barcode-${id}`,
})
const selection = {
  dateFrom: '2026-11-01',
  dateTo: '2026-11-01',
  site: 'KLATEN',
}
let candidates = [employee(1), employee(2)],
  missingAttendance = false,
  payrollLocked = false,
  existingProduction = false,
  changedRate = false,
  acquired = true,
  failPair = false
let trainingPair = false
let stored: Array<{ id: number; notes: string }> = []
function query(sql: string, params: unknown[] = []): Promise<unknown> {
  const rows = () => {
    if (sql.includes('GET_LOCK')) return [{ acquired: acquired ? 1 : 0 }]
    if (sql.includes('RELEASE_LOCK')) return [{ released: 1 }]
    if (sql.includes('CONVERT_TZ'))
      return [
        {
          businessDate: '2026-11-19',
          transactionTimestamp: '2026-11-19 09:00:00.000',
          serverTime: '2026-11-19T09:00:00+07:00',
        },
      ]
    if (sql.includes('SELECT id,name FROM sites'))
      return [{ id: 1, name: 'Klaten' }]
    if (sql.includes('SELECT id,code FROM sites'))
      return [{ id: 1, code: 'KLATEN' }]
    if (sql.includes('SELECT e.id,e.uid FROM employees')) return candidates
    if (sql.includes('FROM payroll_periods'))
      return payrollLocked ? [{ status: 'CLOSED' }] : []
    if (sql === 'SELECT barcode FROM employees WHERE uid=?')
      return [{ barcode: `barcode-${String(params[0]).split('-')[1]}` }]
    if (sql.includes('full_name fullName,barcode'))
      return [employee(Number(String(params[0]).split('-')[1]))]
    if (sql.includes('eh.work_group_id workGroupId'))
      return [
        {
          id: 1,
          siteId: 1,
          site: 'KLATEN',
          productionModuleId: 5,
          productionSectionId: 1,
          allowsProduction: 1,
          payrollBasis: trainingPair ? 'TIME_BASED' : 'PIECE_RATE',
          employeeType: trainingPair ? 'TRAINING' : 'BORONGAN',
        },
      ]
    if (sql.includes('attendance_status attendanceStatus'))
      return missingAttendance
        ? []
        : [
            {
              id: 30,
              uid: 'attendance',
              attendanceStatus: 'PRESENT',
              clockInAt: '2026-11-01T07:00:00+07:00',
            },
          ]
    if (sql.includes('FROM attendance_scan_events')) return [{ id: 1 }]
    if (sql.includes('a.id assignmentId')) {
      const batil = Number(params[2]) === 2
      return [
        {
          assignmentId: 1,
          isPrimary: 1,
          jobId: batil ? 12 : 11,
          jobUid: batil ? 'batil' : 'linting',
          jobCode: batil ? 'BORONGAN-BATIL' : 'BORONGAN-LINTING',
          jobName: batil ? 'Batil' : 'Linting',
          rateId: 21,
          rateUid: 'rate',
          rateAmount: changedRate ? '2' : '1',
          currency: 'IDR',
          unitId: 3,
          unitUid: 'unit',
          unitCode: 'PCS',
          unitName: 'PCS',
          decimalPrecision: 0,
        },
      ]
    }
    if (sql.includes('a.production_job_id jobId'))
      return [{ jobId: params[0] === 'batil' ? 12 : 11, rateId: 21, unitId: 3 }]
    if (sql.includes('quantity_deduction_policy_id deductionPolicyId'))
      return []
    if (sql.includes('mapping.production_section_id sectionId'))
      return [{ sectionId: 1 }]
    if (sql.includes('FROM production_quantity_deduction_policies')) return []
    if (sql.includes('COALESCE(SUM(quantity),0) rawQuantity'))
      return [{ rawQuantity: '0', payableQuantity: '0' }]
    if (sql.includes('FROM production_job_rate_tiers'))
      return [{ id: 1, minQuantity: '1', rateAmount: changedRate ? '2' : '1' }]
    if (sql.includes('SELECT id FROM production_modules')) return [{ id: 5 }]
    if (
      sql.includes('SELECT id FROM production_transactions WHERE employee_id')
    )
      return existingProduction ? [{ id: 99 }] : []
    if (sql.includes('WHERE idempotency_key LIKE')) return stored
    if (sql.includes('SELECT id FROM employees WHERE id='))
      return [{ id: params[0] }]
    if (sql.includes('pt.job_rate_id rateId')) return []
    throw new Error(`Unmocked query: ${sql}`)
  }
  return Promise.resolve([rows()])
}
async function post(path: string, body: unknown, roles = ['SUPER_ADMIN']) {
  const app = express()
  app.use(express.json())
  app.use((_q, res, next) => {
    res.locals.auth = {
      id: 1,
      uid: 'actor',
      roles,
      permissions: ['production.scan'],
      siteAccess: ['KLATEN'],
    }
    next()
  })
  app.use(productionTransactionsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    return {
      status: response.status,
      body: (await response.json()) as {
        data: {
          previewToken: string
          canCreate: boolean
          summary: {
            employees: number
            planned: number
            blocked: number
            pairs: number
          }
          total: number
          created: number
          replayed: number
          pairs: number
        }
      },
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
const preview = () => post('/transactions/batch-input/preview', selection)
const runPayload = (previewToken: string) => ({
  ...selection,
  previewToken,
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  reason: 'Pembuatan data demo',
  confirmation: 'PROSES',
})
beforeEach(() => {
  trainingPair = false
  vi.clearAllMocks()
  vi.stubEnv('PRODUCTION_BATCH_TOOLS_ENABLED', 'true')
  vi.stubEnv('JWT_ACCESS_SECRET', 'a'.repeat(64))
  candidates = [employee(1), employee(2)]
  missingAttendance = false
  payrollLocked = false
  existingProduction = false
  changedRate = false
  stored = []
  acquired = true
  failPair = false
  m.query.mockImplementation(query)
  let id = 100
  m.execute.mockImplementation(async (sql: string) => {
    if (failPair && sql.includes('INSERT INTO production_transaction_pairs'))
      throw new Error('pair write failed')
    return [{ insertId: id++, affectedRows: 1 }]
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
describe('Production demo batch API', () => {
  it.each([
    ['QC'],
    ['PRODUCTION_ADMIN'],
    ['HR_OFFICER'],
    ['SUPER_ADMIN', 'QC'],
  ])('rejects unauthorized role %j', async (...roles) => {
    expect(
      (await post('/transactions/batch-input/preview', selection, roles)).status
    ).toBe(403)
    expect(m.query).not.toHaveBeenCalled()
  })
  it('is disabled unless flag enabled and validates dates', async () => {
    vi.stubEnv('PRODUCTION_BATCH_TOOLS_ENABLED', 'false')
    expect((await preview()).status).toBe(403)
    vi.stubEnv('PRODUCTION_BATCH_TOOLS_ENABLED', 'true')
    expect(
      (
        await post('/transactions/batch-input/preview', {
          ...selection,
          dateTo: '2026-11-09',
        })
      ).status
    ).toBe(422)
  })
  it('rejects excessive candidates before individual expensive validation', async () => {
    candidates = Array.from({ length: 1001 }, (_, i) => employee(i + 1))
    expect((await preview()).status).toBe(422)
    expect(
      m.query.mock.calls.some(([sql]) =>
        String(sql).includes('SELECT barcode FROM employees')
      )
    ).toBe(false)
  })
  it.each(['attendance', 'payroll', 'existing', 'pair'])(
    'skips ineligible candidates: %s',
    async (kind) => {
      if (kind === 'attendance') missingAttendance = true
      if (kind === 'payroll') payrollLocked = true
      if (kind === 'existing') existingProduction = true
      if (kind === 'pair') candidates = [employee(1)]
      const result = await preview()
      expect(result.status).toBe(200)
      expect(result.body.data.canCreate).toBe(false)
      expect(result.body.data.summary.blocked).toBeGreaterThan(0)
      expect(m.execute).not.toHaveBeenCalled()
    }
  )
  it.each([false,true])('creates exact previewed pair with equal PCS and historical timestamp (Training: %s)', async (isTraining) => {
    trainingPair = isTraining
    const checked = await preview()
    expect(checked.body).toHaveProperty('data')
    expect(checked.status).toBe(200)
    expect(checked.body.data.summary).toEqual({
      employees: 2,
      planned: 2,
      blocked: 0,
      pairs: 1,
    })
    const result = await post(
      '/transactions/batch-input/run',
      runPayload(checked.body.data.previewToken)
    )
    expect(result.status).toBe(201)
    expect(result.body.data).toEqual({
      total: 2,
      created: 2,
      replayed: 0,
      pairs: 1,
    })
    const inserts = m.execute.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO production_transactions(')
    )
    expect(inserts).toHaveLength(2)
    expect(inserts[0][1][12]).toEqual(inserts[1][1][12])
    expect(inserts[0][1][11]).toMatch(/^2026-11-01 /)
    expect(
      m.execute.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO production_transaction_pairs')
      )
    ).toBe(true)
    expect(m.saveQc.mock.calls[1][2]).toMatchObject({
      weight1Grams: null,
      weight2Grams: null,
      defects: [],
    })
    expect(m.commit).toHaveBeenCalledOnce()
    expect(m.audit).toHaveBeenCalledTimes(2)
  })
  it('rejects stale rates, changed filters and concurrent lock', async () => {
    const checked = await preview()
    const input = runPayload(checked.body.data.previewToken)
    changedRate = true
    expect((await post('/transactions/batch-input/run', input)).status).toBe(
      409
    )
    expect(m.execute).not.toHaveBeenCalled()
    expect(
      (
        await post('/transactions/batch-input/run', {
          ...input,
          site: 'JEPARA',
        })
      ).status
    ).toBe(409)
    acquired = false
    expect((await post('/transactions/batch-input/run', input)).status).toBe(
      409
    )
  })
  it('rolls back all inserts after pair persistence fails', async () => {
    const checked = await preview()
    failPair = true
    expect(
      (
        await post(
          '/transactions/batch-input/run',
          runPayload(checked.body.data.previewToken)
        )
      ).status
    ).toBe(500)
    expect(m.commit).not.toHaveBeenCalled()
    expect(m.rollback).toHaveBeenCalled()
    expect(
      m.query.mock.calls.some(([sql]) => String(sql).includes('RELEASE_LOCK'))
    ).toBe(true)
  })
  it('recovers committed retry after expiry without writes and rejects changed reason', async () => {
    const checked = await preview()
    const input = runPayload(checked.body.data.previewToken)
    expect((await post('/transactions/batch-input/run', input)).status).toBe(
      201
    )
    stored = m.execute.mock.calls
      .filter(([sql]) =>
        String(sql).includes('INSERT INTO production_transactions(')
      )
      .map(([, params], i) => ({ id: i + 1, notes: params[17] }))
    m.execute.mockClear()
    const future = Date.now() + 3600000
    vi.spyOn(Date, 'now').mockReturnValue(future)
    const replay = await post('/transactions/batch-input/run', input)
    expect(replay.status).toBe(200)
    expect(replay.body.data.replayed).toBe(2)
    expect(m.execute).not.toHaveBeenCalled()
    expect(
      (
        await post('/transactions/batch-input/run', {
          ...input,
          reason: 'Alasan yang sudah berbeda',
        })
      ).status
    ).toBe(409)
  })
})
