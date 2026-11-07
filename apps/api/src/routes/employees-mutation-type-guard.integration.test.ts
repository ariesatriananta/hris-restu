import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { businessDate } from '../lib/contract-lifecycle.js'
import { errorHandler } from '../lib/errors.js'
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
vi.mock('../db.js', () => ({
  pool: { ...mocks, getConnection: async () => mocks },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../lib/production-assignment-lifecycle.js', () => ({
  reconcileProductionAssignmentsAtEmploymentBoundary: vi.fn(),
}))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}))

const employeeUid = '11111111-1111-4111-8111-111111111111'
const scheduleUid = '22222222-2222-4222-8222-222222222222'
const mappingUid = '33333333-3333-4333-8333-333333333333'
const employee = {
  id: 10,
  uid: employeeUid,
  employeeNumber: 'TEST-001',
  employeeStatus: 'ACTIVE',
  employeeType: 'BORONGAN',
  siteId: 1,
  site: 'JEPARA',
  department: 'Produksi',
  position: 'Operator',
  workGroup: null,
  productionModuleSectionUid: mappingUid,
}
let openContract: boolean

function input(changeType: string, employeeType: string, future: boolean) {
  const date = new Date(`${businessDate()}T00:00:00Z`)
  if (future) date.setUTCDate(date.getUTCDate() + 1)
  return {
    site: 'JEPARA',
    department: 'Produksi',
    position: 'Operator',
    productionModuleSectionUid: mappingUid,
    employeeType,
    changeType,
    effectiveFrom: date.toISOString().slice(0, 10),
    reason: 'Koreksi penempatan pekerja',
  }
}

const flows = [
  'individual',
  'batch',
  'schedule-create',
  'schedule-edit',
] as const
async function request(
  flow: (typeof flows)[number],
  changeType: string,
  employeeType: string
) {
  const body = input(changeType, employeeType, flow !== 'individual')
  const path =
    flow === 'individual'
      ? `/${employeeUid}/mutations`
      : flow === 'batch'
        ? '/mutations/batch'
        : flow === 'schedule-create'
          ? `/${employeeUid}/scheduled-mutations`
          : `/scheduled-mutations/${scheduleUid}`
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = {
      id: 7,
      roles: ['SUPER_ADMIN'],
      permissions: ['employees.manage'],
      siteAccess: [],
    }
    next()
  })
  app.use('/employees', employeesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    return await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/employees${path}`,
      {
        method: flow === 'schedule-edit' ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          flow === 'batch' ? { items: [{ employeeUid, input: body }] } : body
        ),
      }
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  openContract = true
  mocks.execute.mockResolvedValue([{ affectedRows: 1 }])
  mocks.query.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue)
    if (sql.includes('FROM employee_contracts'))
      return [
        openContract
          ? [
              {
                employeeId: 10,
                contractNumber: 'TEST-PKWT',
                contract_number: 'TEST-PKWT',
              },
            ]
          : [],
      ]
    if (sql.includes('SELECT sm.id,sm.employee_id'))
      return [
        [
          {
            id: 50,
            employeeId: 10,
            employeeUid,
            employeeStatus: 'ACTIVE',
            sourceSite: 'JEPARA',
          },
        ],
      ]
    if (sql.includes('SELECT id,status FROM scheduled_employee_mutations'))
      return [[{ id: 50, status: 'SCHEDULED' }]]
    if (sql.includes('WHERE e.uid')) return [[employee]]
    if (sql.includes('SELECT s.id siteId'))
      return [
        [{ siteId: 1, typeId: 2, statusId: 3, employeeNumberPrefix: 'TEST' }],
      ]
    if (sql.includes('FROM production_module_sections pms'))
      return [[{ id: 4 }]]
    if (sql.includes('FROM employee_employment_histories'))
      return [
        [{ id: 20, employeeId: 10, statusId: 3, effectiveFrom: '2020-01-01' }],
      ]
    return [[]]
  })
})

describe.each(flows)('mutation type guard: %s', (flow) => {
  it.each(['OTHER', 'GROUP_CHANGE', 'TYPE_CHANGE'])(
    'blocks actual type changes with open contracts regardless of %s label',
    async (label) => {
      const response = await request(flow, label, 'TRAINING')
      expect(response.status, await response.clone().text()).toBe(409)
      expect(mocks.execute).not.toHaveBeenCalled()
      expect(mocks.commit).not.toHaveBeenCalled()
      expect(mocks.rollback).toHaveBeenCalledOnce()
    }
  )
  it('keeps non-type OTHER mutations available even with an open contract', async () => {
    const response = await request(flow, 'OTHER', 'BORONGAN')
    expect(response.status, await response.clone().text()).toBe(
      flow === 'schedule-edit' ? 204 : 201
    )
    expect(
      mocks.query.mock.calls.some(([sql]) =>
        String(sql).includes('FROM employee_contracts')
      )
    ).toBe(false)
    expect(mocks.commit).toHaveBeenCalledOnce()
  })
  it('allows actual type changes when no open contract exists', async () => {
    openContract = false
    const response = await request(flow, 'TYPE_CHANGE', 'TRAINING')
    expect(response.status, await response.clone().text()).toBe(
      flow === 'schedule-edit' ? 204 : 201
    )
    expect(mocks.commit).toHaveBeenCalledOnce()
  })
})
