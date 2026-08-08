import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { employeeIdCardsRouter } from './employee-id-cards.js'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../config.js', () => ({
  env: { R2_PUBLIC_BASE_URL: 'https://files.example.test' },
}))
vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))
vi.mock('../middleware/authenticate.js', () => ({
  requirePermission:
    (permission: string) =>
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const context = res.locals.auth as AuthContext
      if (
        !context.roles.includes('SUPER_ADMIN') &&
        !context.permissions.includes(permission)
      ) {
        return res.status(403).json({ message: 'Izin ditolak.' })
      }
      next()
    },
}))

const firstUid = '11111111-1111-4111-8111-111111111111'
const secondUid = '22222222-2222-4222-8222-222222222222'

function auth(allowed = true): AuthContext {
  return {
    id: 7,
    uid: 'hr-jepara',
    name: 'HR Jepara',
    email: null,
    roles: ['HR_OFFICER'],
    permissions: allowed ? ['employees.view'] : [],
    siteAccess: ['JEPARA'],
  }
}

async function request(
  path: string,
  options?: { method?: string; body?: unknown; auth?: AuthContext }
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = options?.auth ?? auth()
    next()
  })
  app.use('/api/employees', employeeIdCardsRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/employees${path}`, {
      method: options?.method,
      headers: options?.body
        ? { 'content-type': 'application/json' }
        : undefined,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

function employeeRow(uid: string, employeeNumber: string) {
  return {
    uid,
    employeeNumber,
    barcode: employeeNumber,
    fullName: `Karyawan ${employeeNumber}`,
    employeeType: 'BORONGAN',
    employeeStatus: 'ACTIVE',
    site: 'JEPARA',
    position: 'Operator Produksi',
    productionModule: 'Modul A',
    productionSection: 'Packing',
    photoUid: `${uid}-photo`,
    photoPath: `employees/${uid}/photo.jpg`,
    nationalIdNumber: 'tidak-boleh-terekspos',
  }
}

describe('Employee ID Card API', () => {
  beforeEach(() => {
    mocks.query.mockReset()
  })

  it('menolak tanpa employees.view sebelum query database', async () => {
    const response = await request('/id-cards', { auth: auth(false) })
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menolak filter site di luar site access', async () => {
    const response = await request('/id-cards?site=SEMARANG')
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('mengembalikan kontrak sempit dan status kosong fallback ACTIVE', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[employeeRow(firstUid, 'PKDS-2608-001')]])
    const response = await request(
      '/id-cards?query=Karyawan&pageSize=100&employeeStatus='
    )
    const result = (await response.json()) as {
      items: Array<Record<string, unknown>>
      total: number
      pageSize: number
    }
    expect(response.status).toBe(200)
    expect(result).toMatchObject({ total: 1, pageSize: 100 })
    expect(result.items[0]).toEqual({
      uid: firstUid,
      employeeNumber: 'PKDS-2608-001',
      fullName: 'Karyawan PKDS-2608-001',
      employeeType: 'BORONGAN',
      employeeStatus: 'ACTIVE',
      site: 'JEPARA',
      position: 'Operator Produksi',
      productionModule: 'Modul A',
      productionSection: 'Packing',
      photo: {
        uid: `${firstUid}-photo`,
        url: `https://files.example.test/employees/${firstUid}/photo.jpg`,
      },
      machineReadable: {
        version: 1,
        barcodePayload: 'PKDS-2608-001',
        qrPayload: 'PKDS-2608-001',
      },
    })
    expect(result.items[0]).not.toHaveProperty('nationalIdNumber')
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      'JEPARA',
      'ACTIVE',
      '%Karyawan%',
      '%Karyawan%',
      '%Karyawan%',
    ])
  })

  it('dedupe UID dan mempertahankan urutan input print-data', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        employeeRow(secondUid, 'PKDS-2608-002'),
        employeeRow(firstUid, 'PKDS-2608-001'),
      ],
    ])
    const response = await request('/id-cards/print-data', {
      method: 'POST',
      body: { employeeUids: [firstUid, secondUid, firstUid] },
    })
    const result = (await response.json()) as {
      generatedAt: string
      items: Array<{ uid: string }>
    }
    expect(response.status).toBe(200)
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false)
    expect(result.items.map((item) => item.uid)).toEqual([firstUid, secondUid])
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      firstUid,
      secondUid,
      'JEPARA',
    ])
  })

  it('menolak semua batch bila ada karyawan nonaktif atau di luar scope', async () => {
    mocks.query.mockResolvedValueOnce([
      [employeeRow(firstUid, 'PKDS-2608-001')],
    ])
    const response = await request('/id-cards/print-data', {
      method: 'POST',
      body: { employeeUids: [firstUid, secondUid] },
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      message: 'Semua karyawan harus aktif dan berada dalam akses site Anda.',
    })
  })
})
