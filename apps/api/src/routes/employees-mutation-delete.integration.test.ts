import express from 'express'
import type { AddressInfo } from 'node:net'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) =>
      next(),
}))

const historyUid = '11111111-1111-4111-8111-111111111111'

function auth(): AuthContext {
  return {
    id: 7,
    uid: '22222222-2222-4222-8222-222222222222',
    name: 'HR Officer',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: ['employees.manage'],
    siteAccess: ['JEPARA', 'SEMARANG'],
  }
}

async function removeMutation() {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth()
    next()
  })
  app.use('/api/employees', employeesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(
      `http://127.0.0.1:${port}/api/employees/histories/${historyUid}`,
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: 'Salah mencatat site tujuan.',
          confirmation: 'HAPUS',
        }),
      }
    )
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

function mutationRow() {
  return {
    id: 42,
    uid: historyUid,
    employee_id: 10,
    site_id: 2,
    department_id: 21,
    position_id: 12,
    work_group_id: null,
    production_module_section_id: 22,
    employee_type_id: 14,
    employee_status_id: 15,
    effective_to: null,
    change_type: 'TRANSFER',
    created_by: 7,
    employeeUid: '33333333-3333-4333-8333-333333333333',
    employeeNumber: 'PKDS-2509-16001',
    employeeName: 'BUDI OPERASIONAL',
    currentSiteId: 2,
    currentDepartmentId: 21,
    currentPositionId: 12,
    currentWorkGroupId: null,
    currentProductionModuleSectionId: 22,
    currentEmployeeTypeId: 14,
    currentEmployeeStatusId: 15,
    siteCode: 'SEMARANG',
    effectiveFrom: '2026-09-19',
  }
}

function previousRow() {
  return {
    id: 41,
    uid: '44444444-4444-4444-8444-444444444444',
    employee_id: 10,
    site_id: 1,
    department_id: 11,
    position_id: 12,
    work_group_id: null,
    production_module_section_id: 13,
    employee_type_id: 14,
    employee_status_id: 15,
    siteCode: 'JEPARA',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-09-18',
  }
}

describe('hapus mutasi terakhir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }])
  })

  it('memulihkan histori dan profil tanpa membuka assignment dalam satu transaksi', async () => {
    mocks.query
      .mockResolvedValueOnce([[mutationRow()]])
      .mockResolvedValueOnce([[{ id: 42 }]])
      .mockResolvedValueOnce([[previousRow()]])
      .mockResolvedValueOnce([
        [
          {
            historyReferences: 0,
            openMutations: 0,
            openStatusChanges: 0,
            attendanceRecords: 0,
            attendanceScans: 0,
            attendanceClassifications: 0,
            productionTransactions: 0,
            payrollResults: 0,
            bpjsSettlements: 0,
            laterShiftAssignments: 0,
            laterJobAssignments: 0,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ ambiguousShifts: 0, ambiguousJobs: 0, cancelledFutureJobs: 0 }],
      ])
      .mockResolvedValueOnce([[]])

    const response = await removeMutation()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      deleted: true,
      restoredHistoryUid: previousRow().uid,
      restoredShiftAssignments: 0,
      restoredJobAssignments: 0,
    })
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        recordUid: historyUid,
        reason: 'Salah mencatat site tujuan.',
      }),
      connection
    )
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        String(sql).includes('DELETE FROM employee_employment_histories')
      )
    ).toBe(true)
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        /UPDATE employee_(shift|job)_assignments/.test(String(sql))
      )
    ).toBe(false)
  })

  it.each([
    ['shift', 7],
    ['shift', 99],
    ['job', 7],
    ['job', 99],
    ['job', null],
  ])('menolak assignment %s berakhir H-1 tanpa menebak asal tanggalnya (actor %s)', async (kind, actor) => {
    const db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE shifts (id INTEGER, site_id INTEGER);
      INSERT INTO shifts VALUES (1,1);
      CREATE TABLE employee_shift_assignments (employee_id INTEGER,shift_id INTEGER,effective_to TEXT,updated_by INTEGER);
      CREATE TABLE employee_job_assignments (employee_id INTEGER,site_id INTEGER,status TEXT,effective_from TEXT,effective_to TEXT,updated_by INTEGER);
    `)
    if (kind === 'shift') {
      db.prepare('INSERT INTO employee_shift_assignments VALUES(10,1,?,?)').run('2026-09-18', actor)
    } else {
      db.prepare("INSERT INTO employee_job_assignments VALUES(10,1,'ACTIVE','2026-01-01',?,?)").run('2026-09-18', actor)
    }
    mocks.query
      .mockResolvedValueOnce([[mutationRow()]])
      .mockResolvedValueOnce([[{ id: 42 }]])
      .mockResolvedValueOnce([[previousRow()]])
      .mockResolvedValueOnce([[{}]])
      .mockImplementationOnce(async (sql: string, params: Array<string | number | null>) => [
        [db.prepare(sql.replaceAll('<=>', 'IS')).get(...params)],
      ])
    try {
      const response = await removeMutation()
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        message: expect.stringContaining('tanggal akhir asli'),
      })
      expect(mocks.execute).not.toHaveBeenCalled()
      expect(mocks.rollback).toHaveBeenCalledOnce()
      expect(mocks.commit).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    } finally {
      db.close()
    }
  })

  it('menolak assignment pekerjaan masa depan yang sudah dibatalkan', async () => {
    mocks.query
      .mockResolvedValueOnce([[mutationRow()]])
      .mockResolvedValueOnce([[{ id: 42 }]])
      .mockResolvedValueOnce([[previousRow()]])
      .mockResolvedValueOnce([[{}]])
      .mockResolvedValueOnce([[{ ambiguousShifts: 0, ambiguousJobs: 0, cancelledFutureJobs: 1 }]])
    const response = await removeMutation()
    expect(response.status).toBe(409)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })

  it('menolak rollback ketika Attendance sudah memakai mutasi', async () => {
    mocks.query
      .mockResolvedValueOnce([[mutationRow()]])
      .mockResolvedValueOnce([[{ id: 42 }]])
      .mockResolvedValueOnce([[previousRow()]])
      .mockResolvedValueOnce([
        [
          {
            historyReferences: 0,
            openMutations: 0,
            openStatusChanges: 0,
            attendanceRecords: 2,
          },
        ],
      ])

    const response = await removeMutation()
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining('2 Attendance'),
    })
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it('menolak histori lifecycle kontrak yang bukan mutasi operasional', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ ...mutationRow(), change_type: 'STATUS_CHANGE' }],
    ])

    const response = await removeMutation()
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining('lifecycle kontrak'),
    })
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(
      mocks.execute.mock.calls.some(([sql]) =>
        String(sql).includes('DELETE FROM employee_employment_histories')
      )
    ).toBe(false)
  })
})
