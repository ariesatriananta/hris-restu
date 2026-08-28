import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { payrollApprovalsRouter } from './payroll-approvals.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(), execute: vi.fn(), begin: vi.fn(), commit: vi.fn(),
  rollback: vi.fn(), release: vi.fn(), audit: vi.fn(), integrity: vi.fn(),
}))
const conn = {
  query: mocks.query, execute: mocks.execute,
  beginTransaction: mocks.begin, commit: mocks.commit,
  rollback: mocks.rollback, release: mocks.release,
}
vi.mock('../db.js', () => ({
  pool: { query: mocks.query, execute: mocks.execute, getConnection: vi.fn(async () => conn) },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../lib/payroll-approval.js', () => ({ inspectPayrollRunIntegrity: mocks.integrity }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  requirePermission: (permission: string) => (
    _req: express.Request, res: express.Response, next: express.NextFunction
  ) => {
    const auth = res.locals.auth as AuthContext
    if (!auth.roles.includes('SUPER_ADMIN') && !auth.permissions.includes(permission))
      return res.status(403).json({ message: 'Izin ditolak.' })
    next()
  },
}))

const finance: AuthContext = {
  id: 7, uid: 'finance', name: 'Finance', email: null,
  roles: ['PAYROLL_FINANCE'], permissions: ['payroll.view', 'payroll.calculate', 'payroll.close'],
  siteAccess: ['JEPARA'],
}
const director: AuthContext = {
  ...finance, id: 8, uid: 'director', roles: ['DIRECTOR'],
  permissions: ['payroll.view', 'payroll.approve'], siteAccess: [],
}
const superAdmin: AuthContext = {
  ...finance, id: 9, uid: 'super', roles: ['SUPER_ADMIN'], permissions: [], siteAccess: [],
}
const period = {
  periodId: 3, periodUid: '11111111-1111-4111-8111-111111111111',
  periodStatus: 'CALCULATED', currentRunId: 7, siteId: 2, siteCode: 'JEPARA',
  runId: 7, runUid: '22222222-2222-4222-8222-222222222222', runNumber: 1,
  runStatus: 'COMPLETED', runType: 'SIMULATION', employeeCount: 2,
  calculatedBy: 7,
  totalPieceRateAmount: '100.00', totalEarnings: '10.00', totalDeductions: '5.00', totalNetPay: '105.00',
  periodStart: '2026-08-01', periodEnd: '2026-08-07',
}

async function request(path: string, input: { method?: string; body?: unknown; auth?: AuthContext } = {}) {
  const app = express(); app.use(express.json())
  app.use((_req, res, next) => { res.locals.auth = input.auth ?? finance; next() })
  app.use('/api/payroll', payrollApprovalsRouter); app.use(errorHandler)
  const server = app.listen(0); await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/payroll${path}`, {
      method: input.method ?? 'GET', headers: { 'content-type': 'application/json' },
      body: input.body ? JSON.stringify(input.body) : undefined,
    })
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

describe('Payroll approval API', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.begin.mockResolvedValue(undefined); mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined); mocks.execute.mockResolvedValue([{ insertId: 11, affectedRows: 1 }])
    mocks.integrity.mockResolvedValue({ valid: true, issues: [] })
  })

  function mutationQueries(initial: Record<string, unknown>, final: Record<string, unknown>) {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('WHERE pp.uid=? FOR UPDATE') || statement.includes('WHERE approval.uid=? FOR UPDATE'))
        return [[initial]]
      if (statement.includes('WHERE pp.uid=?')) return [[final]]
      if (statement.includes('FROM payroll_workflow_actions action')) return [[]]
      return [[]]
    })
  }

  it('submit membuat approval PENDING untuk exact current run', async () => {
    mutationQueries(period, { ...period, approvalId: 11, approvalUid: '55555555-5555-4555-8555-555555555555', approvalStatus: 'PENDING' })
    const response = await request(`/periods/${period.periodUid}/submit`, {
      method: 'POST', body: { idempotencyKey: '33333333-3333-4333-8333-333333333333' },
    })
    expect(response.status).toBe(201)
    expect(mocks.integrity).toHaveBeenCalled()
    expect(mocks.execute.mock.calls.some((call) => String(call[0]).includes("'DIRECTOR','PENDING'"))).toBe(true)
  })

  it('submit diblokir ketika integritas current run berubah', async () => {
    mutationQueries(period, period)
    mocks.integrity.mockResolvedValueOnce({
      valid: false,
      issues: [{ code: 'MISSING_BANK_ACCOUNT', message: 'Snapshot rekening pembayaran belum lengkap.', count: 1 }],
    })
    const response = await request(`/periods/${period.periodUid}/submit`, {
      method: 'POST', body: { idempotencyKey: '33333333-3333-4333-8333-333333333333' },
    })
    expect(response.status).toBe(409)
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })

  it('retry submit idempotent tidak membuat approval atau audit kedua', async () => {
    const final = { ...period, approvalId: 11, approvalUid: '55555555-5555-4555-8555-555555555555', approvalStatus: 'PENDING' }
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('WHERE pp.uid=? FOR UPDATE')) return [[final]]
      if (statement.includes('WHERE idempotency_key=?'))
        return [[{ actionType: 'SUBMIT', periodId: 3, approvalId: 11 }]]
      if (statement.includes('WHERE pp.uid=?')) return [[final]]
      return [[]]
    })
    const response = await request(`/periods/${period.periodUid}/submit`, {
      method: 'POST', body: { idempotencyKey: '33333333-3333-4333-8333-333333333333' },
    })
    expect(response.status).toBe(200)
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('DIRECTOR tidak boleh self-approve', async () => {
    mutationQueries(
      { ...period, approvalId: 11, approvalUid: '55555555-5555-4555-8555-555555555555', approvalStatus: 'PENDING', requestedBy: 8 },
      period
    )
    const response = await request('/approvals/55555555-5555-4555-8555-555555555555/approve', {
      method: 'POST', auth: director,
      body: { idempotencyKey: '33333333-3333-4333-8333-333333333333' },
    })
    expect(response.status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('DIRECTOR yang menghitung run tetap tidak boleh menyetujui walau bukan pengaju', async () => {
    mutationQueries(
      { ...period, calculatedBy: 8, approvalId: 11, approvalUid: '55555555-5555-4555-8555-555555555555', approvalStatus: 'PENDING', requestedBy: 7 },
      period
    )
    const response = await request('/approvals/55555555-5555-4555-8555-555555555555/approve', {
      method: 'POST', auth: director,
      body: { idempotencyKey: '33333333-3333-4333-8333-333333333333' },
    })
    expect(response.status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('SUPER_ADMIN boleh self-approve dan menulis override', async () => {
    const initial = { ...period, approvalId: 11, approvalUid: '55555555-5555-4555-8555-555555555555', approvalStatus: 'PENDING', requestedBy: 9 }
    const final = { ...period, periodStatus: 'APPROVED', approvalId: 11, approvalUid: '55555555-5555-4555-8555-555555555555', approvalStatus: 'APPROVED' }
    mutationQueries(initial, final)
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('WHERE approval.uid=? FOR UPDATE')) return [[initial]]
      if (statement.includes('WHERE pp.uid=?')) return [[final]]
      if (statement.includes('FROM payroll_workflow_actions action'))
        return [[{ action: 'APPROVE', superAdminOverride: 1 }]]
      return [[]]
    })
    const response = await request('/approvals/55555555-5555-4555-8555-555555555555/approve', {
      method: 'POST', auth: superAdmin,
      body: { idempotencyKey: '33333333-3333-4333-8333-333333333333' },
    })
    expect(response.status).toBe(200)
    const actionCall = mocks.execute.mock.calls.find((call) => String(call[0]).includes('payroll_workflow_actions'))
    expect(actionCall?.[1]).toContain(1)
  })

  it('withdraw wajib alasan minimal lima karakter', async () => {
    const response = await request('/approvals/55555555-5555-4555-8555-555555555555/withdraw', {
      method: 'POST', body: { idempotencyKey: '33333333-3333-4333-8333-333333333333', reason: 'x' },
    })
    expect(response.status).toBe(422)
  })

  it('PAYROLL_FINANCE site dapat menarik pengajuan pengguna lain', async () => {
    const initial = { ...period, approvalId: 11, approvalUid: '55555555-5555-4555-8555-555555555555', approvalStatus: 'PENDING', requestedBy: 99 }
    const final = { ...initial, approvalStatus: 'CANCELLED' }
    mutationQueries(initial, final)
    const response = await request('/approvals/55555555-5555-4555-8555-555555555555/withdraw', {
      method: 'POST', body: {
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
        reason: 'Perlu menghitung ulang komponen.',
      },
    })
    expect(response.status).toBe(200)
    expect(mocks.execute.mock.calls.some((call) => String(call[0]).includes("status='CANCELLED'"))).toBe(true)
  })

  it('close menetapkan current run FINAL dan periode CLOSED secara atomik', async () => {
    mutationQueries(
      { ...period, periodStatus: 'APPROVED', approvalId: 11, approvalStatus: 'APPROVED' },
      { ...period, periodStatus: 'CLOSED', runType: 'FINAL', approvalId: 11, approvalStatus: 'APPROVED' }
    )
    const response = await request(`/periods/${period.periodUid}/close`, {
      method: 'POST', body: { idempotencyKey: '33333333-3333-4333-8333-333333333333' },
    })
    expect(response.status).toBe(200)
    expect(mocks.execute.mock.calls.some((call) => String(call[0]).includes("run_type='FINAL'"))).toBe(true)
    expect(mocks.execute.mock.calls.some((call) => String(call[0]).includes("status='CLOSED'"))).toBe(true)
    expect(mocks.commit).toHaveBeenCalledOnce()
  })
})
