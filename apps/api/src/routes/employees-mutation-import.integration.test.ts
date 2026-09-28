import express from 'express'
import type { AddressInfo } from 'node:net'
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

const employeeUid = '11111111-1111-4111-8111-111111111111'

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

async function request(path: string, body: unknown) {
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
    return await fetch(`http://127.0.0.1:${port}/api/employees${path}`, {
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

function tomorrow() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const current = formatter.format(new Date())
  const date = new Date(`${current}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  const iso = date.toISOString().slice(0, 10)
  return {
    iso,
    display: `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
  }
}

function employeeRow() {
  return {
    id: 10,
    uid: employeeUid,
    employeeNumber: 'PKDS-2509-16001',
    employeeName: 'BUDI OPERASIONAL',
    currentSiteId: 1,
    currentDepartmentId: 11,
    currentPositionId: 12,
    currentWorkGroupId: null,
    currentProductionModuleSectionId: 13,
    employeeTypeId: 14,
    employeeStatusId: 15,
    site: 'JEPARA',
    department: 'Produksi',
    position: 'Operator',
    workGroup: null,
    employeeType: 'BORONGAN',
    employeeStatus: 'ACTIVE',
    productionModuleSectionUid: '33333333-3333-4333-8333-333333333333',
    openHistoryCount: 1,
    activeHistoryFrom: '2026-01-01',
    openMutationCount: 0,
    openStatusChangeCount: 0,
  }
}

function targetRefs() {
  return {
    siteId: 2,
    site: 'SEMARANG',
    departmentId: 21,
    department: 'Produksi',
    positionId: 12,
    workGroupId: null,
    typeId: 14,
    statusId: 15,
    productionModuleSectionId: 22,
    productionModuleSectionUid: '44444444-4444-4444-8444-444444444444',
  }
}

function payload(effectiveFrom: string) {
  return {
    mutationType: 'SITE_MUTATION',
    reason: 'Kebutuhan operasional site.',
    items: [
      {
        employeeNumber: 'PKDS-2509-16001',
        employeeName: 'Nama dari file hanya informasi',
        targetSite: 'SEMARANG',
        targetDepartmentCode: 'PROD',
        targetProductionModuleCode: 'SMG-MOD-A',
        targetProductionSectionCode: 'LINTING',
        effectiveFrom,
      },
    ],
  }
}

describe('import Excel mutasi site', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }])
    mocks.query.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('WHERE e.employee_number=?')) return [[employeeRow()]]
      if (
        sql.includes('FROM sites s') &&
        sql.includes('production_modules pm')
      ) {
        return [[targetRefs()]]
      }
      if (sql.includes('FROM employees e') && sql.includes('FOR UPDATE')) {
        return [[employeeRow()]]
      }
      if (sql.includes('FROM scheduled_employee_mutations')) return [[]]
      if (sql.includes('FROM scheduled_employee_status_changes')) return [[]]
      if (sql.includes('FROM employee_employment_histories')) {
        return [
          [
            {
              id: 31,
              employeeId: 10,
              statusId: 15,
              effectiveFrom: '2026-01-01',
            },
          ],
        ]
      }
      return [[]]
    })
  })

  it('preview menerima tanggal DD/MM/YYYY dan memakai nama karyawan dari master', async () => {
    const date = tomorrow()
    const response = await request(
      '/mutations/import/preview',
      payload(date.display)
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      rows: [
        expect.objectContaining({
          rowNumber: 2,
          employeeNumber: 'PKDS-2509-16001',
          employeeName: 'BUDI OPERASIONAL',
          sourceSite: 'JEPARA',
          targetSite: 'SEMARANG',
          effectiveFrom: date.iso,
          valid: true,
          issues: [],
        }),
      ],
      total: 1,
      valid: 1,
      invalid: 0,
    })
  })

  it('preview mengembalikan error per baris untuk tanggal kalender tidak valid', async () => {
    const response = await request(
      '/mutations/import/preview',
      payload('31/02/2026')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        total: 1,
        valid: 0,
        invalid: 1,
        rows: [
          expect.objectContaining({
            rowNumber: 2,
            valid: false,
            issues: [
              'Tanggal efektif wajib berformat DD/MM/YYYY atau YYYY-MM-DD.',
            ],
          }),
        ],
      })
    )
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menjadwalkan seluruh import dalam satu transaksi untuk tanggal mendatang', async () => {
    const date = tomorrow()
    const response = await request('/mutations/import', payload(date.iso))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ applied: 0, scheduled: 1 })
    expect(mocks.beginTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.commit).toHaveBeenCalledTimes(1)
    expect(mocks.rollback).not.toHaveBeenCalled()
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO scheduled_employee_mutations'),
      expect.arrayContaining([
        10,
        31,
        2,
        date.iso,
        'Kebutuhan operasional site.',
      ])
    )
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        table: 'scheduled_employee_mutations',
        reason: 'Kebutuhan operasional site.',
      }),
      connection
    )
  })

  it('membatalkan seluruh transaksi ketika penyimpanan salah satu baris gagal', async () => {
    const date = tomorrow()
    mocks.execute.mockRejectedValueOnce(new Error('database write failed'))

    const response = await request('/mutations/import', payload(date.iso))

    expect(response.status).toBe(500)
    expect(mocks.beginTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledTimes(1)
  })
})
