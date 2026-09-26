import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
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

vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    execute: vi.fn(),
    getConnection: vi.fn(),
  },
}))

vi.mock('../lib/audit.js', () => ({ writeAudit: vi.fn() }))

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
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) =>
      next(),
}))

import { employeesRouter } from './employees.js'

async function getReadiness() {
  const app = express()
  app.use('/api/employees', employeesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  try {
    const address = server.address() as AddressInfo
    return await fetch(
      `http://127.0.0.1:${address.port}/api/employees/onboarding-readiness`
    )
  } finally {
    server.close()
  }
}

const employee = {
  employeeNumber: 'PKDS-2609-00001',
  fullName: 'KARYAWAN ONBOARDING',
  site: 'JEPARA',
  employeeType: 'BORONGAN',
  allowsAttendance: 1,
}

describe('kesiapan onboarding karyawan', () => {
  beforeEach(() => vi.clearAllMocks())

  it('memetakan checkpoint dari kondisi kontrak dan shift di database', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          ...employee,
          employeeUid: '00000000-0000-4000-8000-000000000011',
          employeeStatus: 'INACTIVE',
          contractUid: null,
          contractNumber: null,
          contractStartDate: null,
        },
        {
          ...employee,
          employeeUid: '00000000-0000-4000-8000-000000000012',
          employeeStatus: 'INACTIVE',
          contractUid: '00000000-0000-4000-8000-000000000112',
          contractNumber: 'PKWT/TEST/001',
          contractStartDate: '2020-01-01',
        },
        {
          ...employee,
          employeeUid: '00000000-0000-4000-8000-000000000013',
          employeeStatus: 'INACTIVE',
          contractUid: '00000000-0000-4000-8000-000000000113',
          contractNumber: 'PKWT/TEST/002',
          contractStartDate: '2099-01-01',
        },
        {
          ...employee,
          employeeUid: '00000000-0000-4000-8000-000000000014',
          employeeStatus: 'ACTIVE',
          shiftAssignmentCount: 0,
          contractUid: null,
          contractNumber: null,
          contractStartDate: null,
        },
        {
          ...employee,
          employeeUid: '00000000-0000-4000-8000-000000000015',
          employeeStatus: 'ACTIVE',
          shiftAssignmentCount: 1,
          primaryAssignmentCount: 0,
          primaryActiveRateCount: 0,
        },
        {
          ...employee,
          employeeUid: '00000000-0000-4000-8000-000000000016',
          employeeStatus: 'ACTIVE',
          shiftAssignmentCount: 1,
          primaryAssignmentCount: 1,
          primaryActiveRateCount: 0,
          primaryJobUid: '00000000-0000-4000-8000-000000000116',
          primaryJobCode: 'LINTING',
          primaryJobName: 'Linting',
        },
        {
          ...employee,
          employeeUid: '00000000-0000-4000-8000-000000000017',
          employeeStatus: 'ACTIVE',
          shiftAssignmentCount: 1,
          primaryAssignmentCount: 2,
          primaryActiveRateCount: 2,
        },
      ],
    ])

    const response = await getReadiness()

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      items: { stage: string; canContinue: boolean }[]
      total: number
      counts: Record<string, number>
    }
    expect(body.items.map((item) => item.stage)).toEqual([
      'NEEDS_CONTRACT',
      'NEEDS_ACTIVATION',
      'WAITING_START',
      'NEEDS_SHIFT',
      'NEEDS_PRODUCTION_ASSIGNMENT',
      'MISSING_PRODUCTION_RATE',
      'PRODUCTION_ASSIGNMENT_CONFLICT',
    ])
    expect(body.items.map((item) => item.canContinue)).toEqual([
      true,
      true,
      false,
      true,
      true,
      true,
      true,
    ])
    expect(body).toMatchObject({
      total: 7,
      counts: {
        needsContract: 1,
        needsActivation: 1,
        needsShift: 1,
        needsProductionAssignment: 1,
        missingProductionRate: 1,
        productionAssignmentConflict: 1,
        waitingStart: 1,
      },
    })
  })
})
