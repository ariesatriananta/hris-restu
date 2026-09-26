import express from 'express'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'

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

import { employeesRouter } from './employees.js'

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
    return await fetch(`http://127.0.0.1:${address.port}/api/employees${path}`, {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } finally {
    server.close()
  }
}

describe('hapus permanen karyawan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAuth()
    mocks.query.mockResolvedValue([[]])
    mocks.execute.mockResolvedValue([{ affectedRows: 0 }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('menampilkan preview eligible beserta data administratif yang terdampak', async () => {
    mocks.query
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        {
          ...emptyMetrics,
          contracts: 2,
          contractLifecycleEvents: 3,
          documents: 1,
          recruitmentCandidates: 1,
        },
      ]])

    const response = await request(`/${employee.uid}/deletion-preview`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        employee: {
          uid: employee.uid,
          employeeNumber: employee.employeeNumber,
          fullName: employee.fullName,
          site: employee.siteCode,
        },
        canDelete: true,
        blockers: [],
        totalAffectedRecords: 9,
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            key: 'contracts',
            count: 2,
            action: 'DELETE',
          }),
          expect.objectContaining({
            key: 'recruitmentCandidates',
            count: 1,
            action: 'UNLINK',
          }),
        ]),
      })
    )
  })

  it('menampilkan seluruh kelompok blocker operasional tanpa menghapus apa pun', async () => {
    mocks.query
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        {
          ...emptyMetrics,
          attendanceRecords: 1,
          attendanceScans: 2,
          attendanceCorrections: 1,
          attendanceClassifications: 3,
          productionTransactions: 4,
          payrollManualComponents: 1,
          payrollEmployeeResults: 1,
          payrollSettlements: 1,
          payrollLinkedMasterFacts: 2,
        },
      ]])

    const response = await request(`/${employee.uid}/deletion-preview`)
    const body = (await response.json()) as {
      canDelete: boolean
      blockers: string[]
    }

    expect(response.status).toBe(200)
    expect(body.canDelete).toBe(false)
    expect(body.blockers).toHaveLength(9)
    expect(body.blockers.join(' ')).toContain('transaksi Produksi')
    expect(body.blockers.join(' ')).toContain('hasil perhitungan Payroll')
    expect(body.blockers.join(' ')).toContain('snapshot Payroll')
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('menolak akun selain SUPER_ADMIN walaupun memiliki izin kelola karyawan', async () => {
    setAuth({ roles: ['HR_OFFICER'], permissions: ['employees.manage'] })

    const preview = await request(`/${employee.uid}/deletion-preview`)
    const deletion = await request(`/${employee.uid}`, {
      method: 'DELETE',
      body: {
        confirmation: employee.employeeNumber,
        reason: 'Menghapus data dummy.',
      },
    })

    expect(preview.status).toBe(403)
    expect(deletion.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('memeriksa ulang blocker di dalam transaksi dan melakukan rollback', async () => {
    mocks.query
      .mockResolvedValueOnce([[employee]])
      .mockResolvedValueOnce([[
        { ...emptyMetrics, productionTransactions: 1 },
      ]])

    const response = await request(`/${employee.uid}`, {
      method: 'DELETE',
      body: {
        confirmation: employee.employeeNumber,
        reason: 'Menghapus data dummy.',
      },
    })

    expect(response.status).toBe(409)
    expect(mocks.beginTransaction).toHaveBeenCalledOnce()
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(
      mocks.query.mock.calls.some((call) => String(call[0]).includes('FOR UPDATE'))
    ).toBe(true)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('menghapus seluruh relasi administratif, melepas arsip, dan menulis audit', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM employees e')) return [[employee]]
      if (statement.includes('attendanceRecords')) {
        return [[
          {
            ...emptyMetrics,
            contracts: 1,
            contractLifecycleEvents: 1,
            documents: 1,
            recruitmentCandidates: 1,
            generatedDocuments: 1,
          },
        ]]
      }
      return [[]]
    })
    mocks.execute.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('UPDATE recruitment_candidates')) {
        return [{ affectedRows: 1 }]
      }
      if (statement.includes('UPDATE generated_documents')) {
        return [{ affectedRows: 1 }]
      }
      if (statement.includes('DELETE FROM employees')) {
        return [{ affectedRows: 1 }]
      }
      if (
        statement.includes('employee_contract_lifecycle_events') ||
        statement.includes('DELETE FROM employee_contracts') ||
        statement.includes('DELETE FROM employee_employment_histories') ||
        statement.includes('DELETE FROM employee_documents')
      ) {
        return [{ affectedRows: 1 }]
      }
      return [{ affectedRows: 0 }]
    })

    const response = await request(`/${employee.uid}`, {
      method: 'DELETE',
      body: {
        confirmation: employee.employeeNumber,
        reason: 'Menghapus data dummy.',
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      deleted: true,
      employeeUid: employee.uid,
      employeeNumber: employee.employeeNumber,
      deletedRecords: 5,
      unlinkedRecords: 2,
    })
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.rollback).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        table: 'employees',
        recordUid: employee.uid,
        reason: 'Menghapus data dummy.',
        beforeData: expect.objectContaining({
          employeeNumber: employee.employeeNumber,
          totalAffectedRecords: 7,
        }),
      }),
      connection
    )

    const statements = mocks.execute.mock.calls.map((call) => String(call[0]))
    expect(
      statements.indexOf(
        'DELETE FROM employee_contracts WHERE employee_id=?'
      )
    ).toBeLessThan(
      statements.indexOf('DELETE FROM employees WHERE id=?')
    )
    expect(
      statements.some((statement) =>
        statement.includes('DELETE revision') &&
        statement.includes('employee_bpjs_enrollment_revisions')
      )
    ).toBe(true)
  })
})
