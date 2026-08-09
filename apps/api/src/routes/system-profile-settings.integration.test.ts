import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { systemRouter } from './system.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connectionQuery: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  writeAudit: vi.fn(),
}))

vi.mock('../config.js', () => ({
  env: {
    ATTENDANCE_GO_LIVE_DATE: '2026-08-01',
    R2_PUBLIC_BASE_URL: 'https://files.example.test',
  },
}))
vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    getConnection: vi.fn(async () => ({
      query: mocks.connectionQuery,
      execute: mocks.execute,
      beginTransaction: mocks.beginTransaction,
      commit: mocks.commit,
      rollback: mocks.rollback,
      release: mocks.release,
    })),
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.writeAudit }))
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

function auth(superAdmin = true): AuthContext {
  return {
    id: 1,
    uid: 'admin',
    name: 'Admin',
    email: null,
    roles: superAdmin ? ['SUPER_ADMIN'] : ['HR_OFFICER'],
    permissions: ['settings.manage'],
    siteAccess: superAdmin ? [] : ['JEPARA'],
  }
}

async function request(
  path: string,
  options: RequestInit = {},
  context = auth()
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = context
    next()
  })
  app.use('/api/system', systemRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/system${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...options.headers },
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('System company profile and Attendance settings API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.beginTransaction.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined)
    mocks.release.mockReturnValue(undefined)
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }])
    mocks.writeAudit.mockResolvedValue(undefined)
  })

  it('tetap membatasi seluruh pengaturan kepada Super Admin', async () => {
    const response = await request(
      '/settings/company-profile',
      {},
      auth(false)
    )

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('membaca profil dengan fallback identitas PKWT lama', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          settingKey: 'contract.pkwt.first_party',
          settingValue: {
            companyName: 'PT Restu',
            headOfficeAddress: 'Semarang',
          },
          updatedAt: '2026-08-01 10:00:00',
        },
      ],
    ])

    const response = await request('/settings/company-profile')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      companyName: 'PT Restu',
      legalAddress: 'Semarang',
      phone: '',
      email: '',
      website: '',
      taxNumber: '',
      logo: null,
      configured: false,
      updatedAt: '2026-08-01 10:00:00',
    })
  })

  it('mengembalikan kebijakan Attendance efektif tanpa endpoint edit', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ settingValue: { value: true }, updatedAt: '2026-08-01 10:00:00' }],
    ])

    const response = await request('/settings/attendance')
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body).toEqual({
      effective: {
        goLiveDate: '2026-08-01',
        timezone: 'Asia/Jakarta',
        finalizationGraceMinutes: 60,
        productionRequiresPresence: true,
        productionIntegrationStatus: 'PLANNED',
      },
      sources: {
        goLiveDate: 'ENVIRONMENT',
        timezone: 'APPLICATION_POLICY',
        finalizationGraceMinutes: 'FIXED_POLICY',
        productionRequiresPresence: 'SYSTEM_SETTING',
      },
      updatedAt: '2026-08-01 10:00:00',
    })
  })

  it('menyimpan profil dan menyinkronkan identitas kontrak secara atomik', async () => {
    mocks.connectionQuery
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            uid: 'legacy-setting',
            settingValue: {
              companyName: 'PT Lama',
              headOfficeAddress: 'Alamat Lama',
              directorName: 'Direktur',
              directorTitle: 'Direktur Utama',
            },
          },
        ],
      ])
      .mockResolvedValueOnce([[]])

    const input = {
      companyName: 'PT Restu Baru',
      legalAddress: 'Alamat Baru',
      phone: '',
      email: '',
      website: '',
      taxNumber: '',
      logoFileUid: null,
    }
    const response = await request('/settings/company-profile', {
      method: 'PUT',
      body: JSON.stringify(input),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ updated: true })
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(String(mocks.execute.mock.calls[0]?.[0])).toContain(
      "'company.profile'"
    )
    expect(String(mocks.execute.mock.calls[1]?.[0])).toContain(
      "'contract.pkwt.first_party'"
    )
    expect(JSON.parse(String(mocks.execute.mock.calls[1]?.[1]?.[1]))).toEqual(
      expect.objectContaining({
        companyName: 'PT Restu Baru',
        headOfficeAddress: 'Alamat Baru',
        directorName: 'Direktur',
      })
    )
    expect(mocks.writeAudit).toHaveBeenCalledOnce()
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.rollback).not.toHaveBeenCalled()
  })
})
