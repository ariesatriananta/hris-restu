import type { AddressInfo } from 'node:net'
import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  getConnection: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    getConnection: mocks.getConnection,
  },
}))

vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))

vi.mock('../middleware/authenticate.js', () => ({
  requirePermission:
    () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}))

import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { attendanceDevicesRouter } from './attendance-devices.js'

const auth: AuthContext = {
  id: 7,
  uid: 'super-admin',
  name: 'Super Admin',
  email: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
  siteAccess: [],
}

function connection() {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  }
}

async function request(path: string, options: { method?: string; body?: unknown } = {}) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth
    next()
  })
  app.use('/api/attendance', attendanceDevicesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/attendance${path}`, {
      method: options.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

function deviceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    uid: '44444444-4444-4444-8444-444444444444',
    siteId: 1,
    site: 'JEPARA',
    siteName: 'Jepara',
    code: 'TERM-01',
    name: 'Terminal Jepara',
    deviceType: 'TERMINAL',
    isActive: 1,
    deviceTokenHash: 'attendance-token-hash',
    productionTokenHash: 'production-token-hash',
    ...overrides,
  }
}

describe('Attendance device readiness API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  it('menampilkan kesiapan Attendance dan Produksi secara terpisah', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        {
          ...deviceRow(),
          isActivated: 1,
          attendanceActivated: 1,
          productionSupported: 1,
          productionActivated: 0,
          activationPending: 1,
          activationPurpose: 'PRODUCTION',
          scanCount: 12,
        },
      ]])

    const response = await request('/devices')
    const body = (await response.json()) as {
      items: Array<Record<string, unknown>>
    }

    expect(response.status).toBe(200)
    expect(body.items[0]).toMatchObject({
      attendanceActivated: true,
      productionSupported: true,
      productionActivated: false,
      activationPending: true,
      activationPurpose: 'PRODUCTION',
    })
  })

  it('membuat kode Produksi tanpa membatalkan token Attendance', async () => {
    const conn = connection()
    conn.query
      .mockResolvedValueOnce([[deviceRow()]])
      .mockResolvedValueOnce([[
        { activationCodeExpiresAt: '2026-09-08T12:00:00+07:00' },
      ]])
    mocks.getConnection.mockResolvedValue(conn)

    const response = await request(
      '/devices/44444444-4444-4444-8444-444444444444/regenerate-activation',
      { method: 'POST', body: { purpose: 'PRODUCTION' } }
    )
    const body = (await response.json()) as { purpose: string }

    expect(response.status).toBe(200)
    expect(body.purpose).toBe('PRODUCTION')
    const update = conn.execute.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE scan_devices')
    )
    expect(String(update?.[0])).toContain('production_token_hash=NULL')
    expect(String(update?.[0])).not.toContain('SET device_token_hash=NULL')
    expect(String((update?.[1] as unknown[] | undefined)?.[0])).toMatch(
      /^PRODUCTION:[a-f0-9]{64}$/
    )
    expect(conn.commit).toHaveBeenCalledOnce()
  })

  it('menukar hanya kode bertujuan Attendance atau kode legacy', async () => {
    const conn = connection()
    conn.query.mockResolvedValueOnce([[deviceRow()]])
    mocks.getConnection.mockResolvedValue(conn)

    const response = await request('/devices/activate', {
      method: 'POST',
      body: { activationCode: '0123-4567-89AB' },
    })

    expect(response.status).toBe(200)
    const lookupParams = conn.query.mock.calls[0]?.[1] as string[]
    expect(lookupParams[0]).toMatch(/^ATTENDANCE:[a-f0-9]{64}$/)
    expect(lookupParams[1]).toMatch(/^[a-f0-9]{64}$/)
    expect(conn.commit).toHaveBeenCalledOnce()
  })

  it('menolak aktivasi Produksi untuk tipe perangkat yang tidak didukung', async () => {
    const conn = connection()
    conn.query.mockResolvedValueOnce([[
      deviceRow({ deviceType: 'MOBILE_CAMERA', productionTokenHash: null }),
    ]])
    mocks.getConnection.mockResolvedValue(conn)

    const response = await request(
      '/devices/44444444-4444-4444-8444-444444444444/regenerate-activation',
      { method: 'POST', body: { purpose: 'PRODUCTION' } }
    )

    expect(response.status).toBe(422)
    expect(conn.execute).not.toHaveBeenCalled()
    expect(conn.rollback).toHaveBeenCalledOnce()
  })
})
