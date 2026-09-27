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
  destroy: vi.fn(),
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
  destroy: mocks.destroy,
}

vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    execute: mocks.execute,
    getConnection: vi.fn(async () => connection),
  },
}))

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

async function request(path: string, body?: unknown) {
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
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }
    )
  } finally {
    server.close()
  }
}

describe('perpanjangan kontrak massal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue([{ affectedRows: 0 }])
  })

  it('memfilter hanya kontrak terakhir yang baru berakhir dalam 14 hari', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])

    const response = await request(
      '/contracts?coverage=EXPIRED_WITHIN_14_DAYS&status=EXPIRED&site=JEPARA&query=Budi'
    )

    expect(response.status).toBe(200)
    const countSql = String(mocks.query.mock.calls[0]?.[0])
    const countParams = mocks.query.mock.calls[0]?.[1] as unknown[]
    expect(countSql).toContain("c.status='EXPIRED'")
    expect(countSql).toContain('DATE_SUB(?, INTERVAL 14 DAY)')
    expect(countSql).toContain("newer.status<>'CANCELLED'")
    expect(countParams).toEqual(
      expect.arrayContaining(['%Budi%', 'JEPARA', 'EXPIRED'])
    )
  })

  it('mempertahankan urutan pilihan dan menandai sumber yang hilang', async () => {
    const foundUid = '00000000-0000-4000-8000-000000000101'
    const missingUid = '00000000-0000-4000-8000-000000000102'
    mocks.query.mockResolvedValueOnce([
      [
        {
          id: 101,
          sourceContractUid: foundUid,
          employeeId: 11,
          sourceContractNumber: 'PKWT/JEPARA/0001/2026',
          sourceStatus: 'EXPIRED',
          sourceStartDate: '2025-09-01',
          sourceEndDate: '2026-08-31',
          proposedStartDate: '2026-09-01',
          proposedEndDate: '2027-08-31',
          contractType: 'PKWT',
          contractTypeActive: 1,
          employeeUid: '00000000-0000-4000-8000-000000000011',
          employeeNumber: 'PSLO-2507-00011',
          employeeName: 'BUDI',
          employeeStatus: 'ACTIVE',
          employeeType: 'BORONGAN',
          siteId: 1,
          site: 'JEPARA',
          position: 'Operator',
          joinDate: '2025-07-01',
          newerContracts: 0,
          openContracts: 0,
          overlappingContracts: 0,
          openStatusSchedules: 0,
          openMutationSchedules: 0,
          laterHistories: 0,
        },
      ],
    ])

    const response = await request('/contracts/batch/renewal-preview', {
      sourceContractUids: [missingUid, foundUid],
    })

    expect(response.status).toBe(200)
    const result = (await response.json()) as {
      canCreate: boolean
      total: number
      ready: number
      blocked: number
      items: Array<{
        sourceContractUid: string
        valid: boolean
        proposed?: { contractType: string; startDate: string; endDate: string }
      }>
    }
    expect(result).toMatchObject({
      canCreate: false,
      total: 2,
      ready: 1,
      blocked: 1,
    })
    expect(
      result.items.map(
        (item: { sourceContractUid: string }) => item.sourceContractUid
      )
    ).toEqual([missingUid, foundUid])
    expect(result.items[1]).toMatchObject({
      valid: true,
      proposed: {
        contractType: 'PKWT',
        startDate: '2026-09-01',
        endDate: '2027-08-31',
      },
    })
  })

  it('menolak UID kontrak sumber duplikat sebelum query database', async () => {
    const uid = '00000000-0000-4000-8000-000000000101'
    const response = await request('/contracts/batch/renewal-preview', {
      sourceContractUids: [uid, uid],
    })

    expect(response.status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menggagalkan seluruh create ketika sumber berubah saat revalidasi', async () => {
    const sourceUid = '00000000-0000-4000-8000-000000000101'
    mocks.query
      .mockResolvedValueOnce([[{ acquired: 1 }]])
      .mockResolvedValueOnce([[{ id: 101, employeeId: 11 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            sourceContractUid: sourceUid,
            sourceContractNumber: 'PKWT/JEPARA/0001/2026',
            sourceStatus: 'DRAFT',
            sourceStartDate: '2025-09-01',
            sourceEndDate: '2026-08-31',
            proposedStartDate: '2026-09-01',
            proposedEndDate: '2027-08-31',
            contractType: 'PKWT',
            contractTypeActive: 1,
            employeeId: 11,
            employeeUid: '00000000-0000-4000-8000-000000000011',
            employeeNumber: 'PSLO-2507-00011',
            employeeName: 'BUDI',
            employeeStatus: 'ACTIVE',
            employeeType: 'BORONGAN',
            siteId: 1,
            site: 'JEPARA',
            position: 'Operator',
            joinDate: '2025-07-01',
            newerContracts: 0,
            openContracts: 0,
            overlappingContracts: 0,
            openStatusSchedules: 0,
            openMutationSchedules: 0,
            laterHistories: 0,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ released: 1 }]])

    const response = await request('/contracts/batch/renew', {
      items: [
        {
          sourceContractUid: sourceUid,
          input: {
            contractType: 'PKWT',
            startDate: '2026-09-01',
            endDate: '2027-08-31',
          },
        },
      ],
    })

    expect(response.status).toBe(409)
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
