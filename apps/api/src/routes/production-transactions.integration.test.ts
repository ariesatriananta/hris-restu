import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { productionTransactionsRouter } from './production-transactions.js'

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

  it('menolak Terminal tanpa production.scan sebelum membuka transaksi', async () => {
    const response = await request('/terminal/lookup', {
      method: 'POST',
      body: { barcode: 'J2608-001' },
      auth: auth({ permissions: ['production.view'] }),
    })
    expect(response.status).toBe(403)
    expect(mocks.beginTransaction).not.toHaveBeenCalled()
  })

  it('mewajibkan token perangkat Produksi pada lookup', async () => {
    const response = await request('/terminal/lookup', {
      method: 'POST',
      body: { barcode: 'J2608-001' },
      withToken: false,
    })
    expect(response.status).toBe(401)
    expect(mocks.rollback).toHaveBeenCalled()
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

  it('menolak status Hadir tanpa event scan Masuk sukses yang terkait', async () => {
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
      'scan Masuk terminal'
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

  it('mencatat setoran atomik dengan snapshot dan gate scan Masuk sukses', async () => {
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
        { assignmentId: 14, isPrimary: 1, isJobActive: 1, jobId: 15, jobUid, jobCode: 'BORONGAN-LINTING', jobName: 'Linting' },
      ]])
      .mockResolvedValueOnce([[
        { rateId: 16, rateUid: 'rate', rateAmount: '1175.0000', currency: 'IDR', unitId: 17, unitUid: 'unit', unitCode: 'PCS', unitName: 'Pcs', decimalPrecision: 0 },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[transactionRow()]])
    mocks.execute.mockImplementation(async (sql: unknown) =>
      String(sql).includes('INSERT INTO production_transactions')
        ? [{ affectedRows: 1, insertId: 21 }]
        : [{ affectedRows: 1 }]
    )

    const response = await request('/terminal/post', {
      method: 'POST',
      body: {
        barcode: 'J2608-001',
        jobUid,
        quantity: '3',
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
      },
    })
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
      .mockResolvedValueOnce([[transactionRow()]])
    const superAdmin = {
      ...auth({ permissions: [] }),
      roles: ['SUPER_ADMIN'],
      siteAccess: [],
    }
    const allowed = await request(`/transactions/${transactionUid}/void-preview`, {
      method: 'POST',
      body: {},
      auth: superAdmin,
    })
    expect(allowed.status).toBe(200)
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

  it('membuat koreksi atomik: original VOID, replacement POSTED, dan revision append-only', async () => {
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
      if (statement.includes('MAX(revision_number)')) {
        return [[{ revisionNumber: 1 }]]
      }
      if (statement.includes('SELECT pt.id,pt.uid')) {
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
    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      sourceTransaction: { status: string }
      transaction: { status: string; quantity: string }
    }
    expect(body.sourceTransaction.status).toBe('VOID')
    expect(body.transaction).toMatchObject({ status: 'POSTED', quantity: '4.0000' })
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
})
