import express from 'express'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { employeesRouter } from './employees.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
  auth: {
    id: 1,
    uid: '00000000-0000-4000-8000-000000000001',
    name: 'Super Admin',
    email: null,
    roles: ['SUPER_ADMIN'],
    permissions: [],
    siteAccess: [],
  } as AuthContext,
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
    res: express.Response,
    next: express.NextFunction
  ) => {
    res.locals.auth = mocks.auth
    next()
  },
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
        return res.status(403).json({ message: 'Izin ditolak.' })
      }
      next()
    },
}))

const employee = {
  id: 17,
  uid: '00000000-0000-4000-8000-000000000017',
  employeeNumber: 'PKDS-2609-00017',
  fullName: 'KARYAWAN DUMMY',
  siteId: 2,
  siteCode: 'JEPARA',
}

const emptyMetrics = {
  employmentHistories: 1,
  scheduledMutations: 0,
  contracts: 0,
  contractLifecycleEvents: 0,
  scheduledStatusChanges: 0,
  salaryRecords: 0,
  dailyRateRecords: 0,
  bpjsEnrollments: 0,
  shiftAssignments: 0,
  jobAssignments: 0,
  documents: 0,
  payrollComponents: 0,
  recruitmentCandidates: 0,
  generatedDocuments: 0,
  attendanceRecords: 0,
  attendanceScans: 0,
  attendanceCorrections: 0,
  attendanceClassifications: 0,
  productionTransactions: 0,
  payrollManualComponents: 0,
  payrollEmployeeResults: 0,
  payrollSettlements: 0,
  payrollLinkedMasterFacts: 0,
}

function setAuth(input: Partial<AuthContext> = {}) {
  Object.assign(mocks.auth, {
    id: 1,
    uid: '00000000-0000-4000-8000-000000000001',
    name: 'Super Admin',
    email: null,
    roles: ['SUPER_ADMIN'],
    permissions: [],
    siteAccess: [],
    ...input,
  })
}

async function request(
  path: string,
  options: { method?: string; body?: unknown } = {}
) {
  const app = express()
  app.use(express.json())
  app.use('/api/employees', employeesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  try {
    const address = server.address() as AddressInfo
    return await fetch(
      `http://127.0.0.1:${address.port}/api/employees${path}`,
      {
        method: options.method ?? 'GET',
        headers: { 'content-type': 'application/json' },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      }
    )
  } finally {
    server.close()
  }
}

const other = {
  ...employee,
  id: 18,
  uid: '00000000-0000-4000-8000-000000000018',
  employeeNumber: 'DUMMY-18',
}
const input = {
  employeeUids: [employee.uid, other.uid],
  reason: 'Reset data uji',
  confirmation: 'HAPUS',
}
let roster = [employee, other]
let metrics: Record<number, typeof emptyMetrics>
let processing = false
let finalizing = false
let lifecycleAvailable = true
let coverageChanged = false
let writeFailure = false
function query(sql: string, params: unknown[] = []) {
  if (sql.startsWith('SELECT id FROM sites WHERE id IN')) return [[]]
  if (sql.includes('GET_LOCK'))
    return [[{ acquired: lifecycleAvailable ? 1 : 0 }]]
  if (sql.includes('RELEASE_LOCK') || sql.startsWith('SET TRANSACTION'))
    return [[]]
  if (sql.startsWith('SELECT COUNT(*) total'))
    return [[{ total: roster.length }]]
  if (sql.startsWith('SELECT pp.id FROM payroll_periods'))
    return [
      [...(coverageChanged && !sql.includes('FOR UPDATE') ? [{ id: 99 }] : [])],
    ]
  if (sql.includes('SELECT pr.id FROM payroll_runs'))
    return [[...(processing ? [{ id: 90 }] : [])]]
  if (sql.includes('SELECT afr.id FROM attendance_daily_finalization_runs'))
    return [[...(finalizing ? [{ id: 91 }] : [])]]
  if (sql.includes('WHERE e.uid=?'))
    return [[...roster.filter((item) => item.uid === params[0])]]
  if (sql.includes('FROM employees e JOIN sites') && sql.includes('e.uid IN'))
    return [roster]
  if (sql.includes('LIMIT ? OFFSET ?')) return [roster]
  if (sql.includes('employmentHistories'))
    return [[metrics[Number(params[0])] ?? emptyMetrics]]
  throw new Error(`Unexpected SQL: ${sql}`)
}
describe('employee batch permanent delete', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setAuth()
    roster = [employee, other]
    metrics = { 17: { ...emptyMetrics }, 18: { ...emptyMetrics } }
    processing = false
    finalizing = false
    lifecycleAvailable = true
    coverageChanged = false
    writeFailure = false
    mocks.query.mockImplementation(query)
    mocks.execute.mockImplementation(async (sql: string, params: unknown[]) => {
      if (
        writeFailure &&
        sql === 'DELETE FROM employees WHERE id=?' &&
        params[0] === other.id
      )
        throw new Error('Synthetic delete failure')
      return [
        { affectedRows: sql === 'DELETE FROM employees WHERE id=?' ? 1 : 0 },
      ]
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  const post = (path: string, body: unknown) =>
    request(path, { method: 'POST', body })
  it('returns paginated public preview and all nine operational blockers', async () => {
    metrics[18] = {
      ...emptyMetrics,
      attendanceRecords: 1,
      attendanceScans: 1,
      attendanceCorrections: 1,
      attendanceClassifications: 1,
      productionTransactions: 1,
      payrollManualComponents: 1,
      payrollEmployeeResults: 1,
      payrollSettlements: 1,
      payrollLinkedMasterFacts: 1,
    }
    const response = await post('/batch-delete/preview', {
      site: 'JEPARA',
      employeeType: 'BORONGAN',
      employeeStatus: 'LEAVE',
      search: 'DUMMY',
      page: 2,
      pageSize: 100,
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      rows: Array<{
        canDelete: boolean
        blockers: string[]
        employee: Record<string, unknown>
      }>
    }
    expect(body).toMatchObject({ total: 2, page: 2, pageSize: 100 })
    expect(body.rows[0].canDelete).toBe(true)
    expect(body.rows[1].blockers).toHaveLength(9)
    expect(body.rows[1].canDelete).toBe(false)
    expect(body.rows[0].employee).not.toHaveProperty('id')
    expect(
      mocks.query.mock.calls.find(([sql]) =>
        String(sql).includes('LIMIT ? OFFSET ?')
      )?.[1]
    ).toEqual(['JEPARA', 'BORONGAN', 'LEAVE', '%DUMMY%', '%DUMMY%', 100, 100])
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('requires Super Admin even with employees.manage', async () => {
    setAuth({ roles: ['HR_ADMIN'], permissions: ['employees.manage'] })
    expect((await post('/batch-delete/preview', {})).status).toBe(403)
    expect((await post('/batch-delete', input)).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it.each([
    { ...input, reason: 'x' },
    { ...input, confirmation: 'SALAH' },
    { ...input, employeeUids: [] },
    { ...input, employeeUids: [employee.uid, employee.uid] },
    { ...input, employeeUids: Array.from({ length: 201 }, () => employee.uid) },
    { ...input, employeeUids: ['17'] },
  ])('rejects malformed batch before DB locks', async (body) => {
    expect((await post('/batch-delete', body)).status).toBe(422)
    expect(mocks.beginTransaction).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('atomically deletes selected employees, audits each plus batch, unlinks archives', async () => {
    const response = await post('/batch-delete', input)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      deleted: true,
      deletedEmployees: 2,
      deletedRecords: 2,
      unlinkedRecords: 0,
    })
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.rollback).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledTimes(3)
    const calls = mocks.execute.mock.calls.map(([sql]) => String(sql))
    expect(calls).toContain(
      'UPDATE recruitment_candidates SET employee_id=NULL,updated_by=? WHERE employee_id=?'
    )
    expect(
      calls.indexOf('DELETE FROM employee_contracts WHERE employee_id=?')
    ).toBeLessThan(calls.indexOf('DELETE FROM employees WHERE id=?'))
    const queryCalls = mocks.query.mock.calls.map(([sql]) => String(sql))
    expect(
      queryCalls.findIndex(
        (sql) => sql.startsWith('SELECT pp.id') && sql.includes('FOR UPDATE')
      )
    ).toBeLessThan(
      queryCalls.findIndex(
        (sql) => sql.includes('WHERE e.uid=?') && sql.includes('FOR UPDATE')
      )
    )
    expect(mocks.query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [
      'hris:contracts:reconcile',
    ])
    expect(mocks.release).toHaveBeenCalledOnce()
  })
  it('revalidates all targets before first cleanup', async () => {
    metrics[18].productionTransactions = 1
    expect((await post('/batch-delete', input)).status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })
  it.each([
    'attendanceRecords',
    'attendanceScans',
    'attendanceCorrections',
    'attendanceClassifications',
    'productionTransactions',
    'payrollManualComponents',
    'payrollEmployeeResults',
    'payrollSettlements',
    'payrollLinkedMasterFacts',
  ] as const)('blocks entire batch for %s independently', async (key) => {
    metrics[18][key] = 1
    expect((await post('/batch-delete', input)).status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
  })
  it.each([{ page: 0 }, { pageSize: 201 }, { site: 'UNKNOWN' }])(
    'rejects invalid preview filter bounds',
    async (body) => {
      expect((await post('/batch-delete/preview', body)).status).toBe(422)
      expect(mocks.query).not.toHaveBeenCalled()
    }
  )
  it.each(['payroll', 'attendance'])(
    'blocks related running %s with historical placement',
    async (kind) => {
      processing = kind === 'payroll'
      finalizing = kind === 'attendance'
      const preview = await post('/batch-delete/preview', {})
      expect(
        (
          (await preview.json()) as { rows: Array<{ canDelete: boolean }> }
        ).rows.every((row: { canDelete: boolean }) => !row.canDelete)
      ).toBe(true)
      expect((await post('/batch-delete', input)).status).toBe(409)
      expect(mocks.execute).not.toHaveBeenCalled()
      const guarded = mocks.query.mock.calls
        .map(([sql]) => String(sql))
        .filter(
          (sql) =>
            sql.includes("status='PROCESSING'") ||
            sql.includes("status='RUNNING'")
        )
      expect(guarded.some((sql) => sql.includes('FOR UPDATE'))).toBe(true)
      expect(
        guarded.every((sql) => sql.includes('employee_employment_histories'))
      ).toBe(true)
    }
  )
  it('blocks lifecycle concurrency and releases connection', async () => {
    lifecycleAvailable = false
    expect((await post('/batch-delete', input)).status).toBe(409)
    expect(mocks.beginTransaction).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes('RELEASE_LOCK')
      )
    ).toBe(false)
  })
  it('rejects missing targets without deleting remaining employees', async () => {
    roster = [employee]
    expect((await post('/batch-delete', input)).status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('rejects changed Payroll coverage after employee locks', async () => {
    coverageChanged = true
    expect((await post('/batch-delete', input)).status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('rolls back whole batch if a later employee delete fails', async () => {
    writeFailure = true
    expect((await post('/batch-delete', input)).status).toBe(500)
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [
      'hris:contracts:reconcile',
    ])
  })
  it('rolls back whole batch if audit fails', async () => {
    mocks.audit.mockRejectedValueOnce(new Error('Synthetic audit failure'))
    expect((await post('/batch-delete', input)).status).toBe(500)
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })
})
