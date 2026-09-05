import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { recruitmentRouter } from './recruitment.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  writeAudit: vi.fn(),
  getPrivateObject: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: { query: mocks.query, getConnection: mocks.getConnection },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.writeAudit }))
vi.mock('../lib/recruitment-internal-storage.js', () => ({
  getPrivateRecruitmentObject: mocks.getPrivateObject,
}))
vi.mock('../lib/recruitment-public-config.js', () => ({
  recruitmentPublicTokensBySite: () =>
    new Map([
      ['JEPARA', 'token-publik-jepara-yang-aman'],
      ['SEMARANG', 'token-publik-semarang-yang-aman'],
    ]),
}))
vi.mock('../lib/recruitment-conversion-storage.js', () => ({
  employeeRecruitmentObjectKey: vi.fn(),
  putEmployeeRecruitmentObject: vi.fn(),
  deleteEmployeeRecruitmentObject: vi.fn(),
}))
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

const candidateUid = '11111111-1111-4111-8111-111111111111'
const fileUid = '22222222-2222-4222-8222-222222222222'

const hr: AuthContext = {
  id: 7,
  uid: 'hr-jepara',
  name: 'HR Jepara',
  email: null,
  roles: ['HR_OFFICER'],
  permissions: ['recruitment.view', 'recruitment.manage'],
  siteAccess: ['JEPARA'],
}

function candidate(status = 'NEW') {
  return {
    id: 41,
    siteId: 1,
    uid: candidateUid,
    applicationNumber: 'APL-JEPARA-20260904-ABCDE',
    fullName: 'Pelamar Contoh',
    nationalIdNumber: '3320112233445566',
    familyCardNumber: '3320112233445577',
    gender: 'FEMALE',
    birthPlace: 'Jepara',
    birthDate: '2000-01-02',
    educationLevel: 'SENIOR_SECONDARY',
    address: 'Alamat sesuai KTP',
    phone: '081234567890',
    email: null,
    privacyNoticeVersion: 'recruitment-privacy-v1',
    privacyConsentAt: '2026-09-04T08:00:00.000000',
    status,
    applicantRejectionReason: null,
    internalNotes: null,
    submittedAt: '2026-09-04T08:00:00.000000',
    statusChangedAt: '2026-09-04T08:00:00.000000',
    updatedAt: '2026-09-04T08:00:00.000000',
    convertedAt: null,
    siteUid: 'site-jepara',
    siteCode: 'JEPARA',
    siteName: 'Site Jepara',
    employeeUid: null,
  }
}

function connection(input?: {
  status?: string
  replay?: Row<Record<string, unknown>>
  updateAffectedRows?: number
  updatedAt?: string
}) {
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    execute: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  }
  conn.query.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue)
    if (
      sql.includes('FROM recruitment_candidates rc') &&
      sql.includes('FOR UPDATE')
    ) {
      return [[candidate(input?.status)]]
    }
    if (sql.includes('FROM recruitment_status_events rse')) {
      return [input?.replay ? [input.replay] : []]
    }
    if (sql.includes('status_changed_at')) {
      return [[{ statusChangedAt: '2026-09-04T09:00:00.000000' }]]
    }
    if (sql.includes('updated_at')) {
      return [[{ updatedAt: input?.updatedAt ?? '2026-09-04T09:00:00.000000' }]]
    }
    throw new Error(`Query belum dimock: ${sql.slice(0, 120)}`)
  })
  conn.execute.mockResolvedValue([
    { affectedRows: input?.updateAffectedRows ?? 1 },
    [],
  ])
  return conn
}

type Row<T> = T & Record<string, unknown>

async function request(
  path: string,
  options?: RequestInit,
  auth: AuthContext = hr
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth
    next()
  })
  app.use('/api/recruitment', recruitmentRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    return await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/recruitment${path}`,
      options
    )
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Recruitment internal API', () => {
  beforeEach(() => {
    mocks.query.mockReset()
    mocks.getConnection.mockReset()
    mocks.writeAudit.mockReset().mockResolvedValue(undefined)
    mocks.getPrivateObject.mockReset()
  })

  it('menolak pengguna tanpa recruitment.view sebelum membaca data', async () => {
    const response = await request('/candidates', undefined, {
      ...hr,
      permissions: [],
    })
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('memberikan tautan form hanya untuk site yang dapat diakses pengguna', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ uid: 'site-jepara', code: 'JEPARA', name: 'Site Jepara' }],
    ])

    const response = await request('/public-links')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      data: [
        {
          site: {
            uid: 'site-jepara',
            code: 'JEPARA',
            name: 'Site Jepara',
          },
          url: expect.stringMatching(
            /\/form-data-pelamar\/token-publik-jepara-yang-aman$/
          ),
        },
      ],
    })
    expect(String(mocks.query.mock.calls[0][0])).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0][1]).toEqual(['JEPARA'])
  })

  it('menerapkan cakupan site, filter, pagination, sort, dan menyamarkan NIK pada daftar', async () => {
    mocks.query.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('COUNT(*) total')) return [[{ total: 1 }]]
      if (sql.includes('newCount')) {
        return [
          [{ newCount: 1, inProgressCount: 2, passedNotConvertedCount: 3 }],
        ]
      }
      return [[candidate()]]
    })
    const response = await request(
      '/candidates?search=Pelamar&site=JEPARA&status=NEW&dateFrom=2026-09-01&dateTo=2026-09-04&page=2&pageSize=10&sortBy=fullName&sortDirection=asc'
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      meta: { page: number; pageSize: number; total: number }
      summary: {
        new: number
        inProgress: number
        passedNotConverted: number
      }
      data: Array<{ nationalIdMasked: string; nationalIdNumber?: string }>
    }
    expect(body.meta).toEqual({ page: 2, pageSize: 10, total: 1 })
    expect(body.summary).toEqual({
      new: 1,
      inProgress: 2,
      passedNotConverted: 3,
    })
    expect(body.data[0].nationalIdMasked).toBe('3320********5566')
    expect(body.data[0]).not.toHaveProperty('nationalIdNumber')
    for (const [sql] of mocks.query.mock.calls) {
      expect(String(sql)).toContain('s.code IN (?)')
    }
    const listCall = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('ORDER BY rc.full_name ASC')
    )
    expect(listCall).toBeTruthy()
    expect(listCall?.[1]).toEqual([
      'JEPARA',
      'JEPARA',
      'JEPARA',
      '%Pelamar%',
      '%Pelamar%',
      '%Pelamar%',
      '%Pelamar%',
      '2026-09-01 00:00:00',
      '2026-09-04 00:00:00',
      'NEW',
      10,
      10,
    ])
  })

  it('memperlakukan detail kandidat lintas site sebagai tidak ditemukan', async () => {
    mocks.query.mockResolvedValueOnce([[]])
    const response = await request(`/candidates/${candidateUid}`)
    expect(response.status).toBe(404)
    expect(String(mocks.query.mock.calls[0][0])).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0][1]).toEqual([candidateUid, 'JEPARA'])
    expect(mocks.query).toHaveBeenCalledOnce()
  })

  it('mengirim detail tanpa id internal dan lokasi penyimpanan', async () => {
    mocks.query
      .mockResolvedValueOnce([[candidate('PASSED')]])
      .mockResolvedValueOnce([
        [
          {
            uid: fileUid,
            kind: 'KTP',
            originalName: 'KTP.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 1234,
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            uid: '33333333-3333-4333-8333-333333333333',
            fromStatus: 'IN_PROGRESS',
            toStatus: 'PASSED',
            eventSource: 'HR_USER',
            applicantReason: null,
            internalNotes: 'Lolos wawancara.',
            occurredAt: '2026-09-04T09:00:00.000000',
            actorUid: 'actor-uid',
            actorName: 'HR Jepara',
          },
        ],
      ])
    const response = await request(`/candidates/${candidateUid}`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      id?: number
      allowedTransitions: string[]
      canManage: boolean
      files: Array<Record<string, unknown>>
      site: Record<string, unknown>
    }
    expect(body.allowedTransitions).toEqual(['IN_PROGRESS', 'REJECTED'])
    expect(body.canManage).toBe(true)
    expect(body.files[0]).toEqual({
      uid: fileUid,
      kind: 'KTP',
      originalName: 'KTP.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1234,
    })
    expect(JSON.stringify(body)).not.toContain('storagePath')
    expect(body).not.toHaveProperty('id')
    expect(body.site).not.toHaveProperty('id')
  })

  it('menolak pembukaan dokumen lintas site tanpa membaca R2', async () => {
    mocks.query.mockResolvedValueOnce([[]])
    const response = await request(
      `/candidates/${candidateUid}/files/${fileUid}`
    )
    expect(response.status).toBe(404)
    expect(mocks.getPrivateObject).not.toHaveBeenCalled()
    expect(mocks.writeAudit).not.toHaveBeenCalled()
  })

  it('membuka dokumen privat dengan header aman dan mencatat audit', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          candidateId: 41,
          siteId: 1,
          candidateUid,
          fileUid,
          storagePath: 'private/recruitment/file.jpg',
          originalName: 'KTP.jpg',
          mimeType: 'image/jpeg',
          fileKind: 'KTP',
        },
      ],
    ])
    mocks.getPrivateObject.mockResolvedValue(Buffer.from('safe-image'))
    const response = await request(
      `/candidates/${candidateUid}/files/${fileUid}`
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(mocks.getPrivateObject).toHaveBeenCalledWith(
      'private/recruitment/file.jpg'
    )
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'RECRUITMENT',
        siteId: 1,
        recordUid: fileUid,
      })
    )
  })

  it('menolak alasan Tidak Lolos yang terlalu pendek sebelum membuka koneksi', async () => {
    const response = await request(`/candidates/${candidateUid}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentStatus: 'NEW',
        toStatus: 'REJECTED',
        applicantReason: 'No',
        idempotencyKey: 'request-123',
      }),
    })
    expect(response.status).toBe(422)
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })

  it('menolak aksi pengguna yang hanya memiliki izin melihat', async () => {
    const response = await request(
      `/candidates/${candidateUid}/status`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentStatus: 'NEW',
          toStatus: 'IN_PROGRESS',
          idempotencyKey: 'request-view-only',
        }),
      },
      { ...hr, permissions: ['recruitment.view'] }
    )
    expect(response.status).toBe(403)
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })

  it('menolak perubahan kandidat lintas site sebagai tidak ditemukan', async () => {
    const conn = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([[]]),
      execute: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    }
    mocks.getConnection.mockResolvedValue(conn)
    const response = await request(`/candidates/${candidateUid}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentStatus: 'NEW',
        toStatus: 'IN_PROGRESS',
        idempotencyKey: 'request-cross-site',
      }),
    })
    expect(response.status).toBe(404)
    expect(String(conn.query.mock.calls[0][0])).toContain('s.code IN (?)')
    expect(conn.query.mock.calls[0][1]).toEqual([candidateUid, 'JEPARA'])
    expect(conn.execute).not.toHaveBeenCalled()
    expect(conn.rollback).toHaveBeenCalledOnce()
  })

  it('mengubah status secara atomik, menambah event, dan menulis audit', async () => {
    const conn = connection({ status: 'NEW' })
    mocks.getConnection.mockResolvedValue(conn)
    const response = await request(`/candidates/${candidateUid}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentStatus: 'NEW',
        toStatus: 'IN_PROGRESS',
        internalNotes: 'Berkas sedang diperiksa.',
        idempotencyKey: 'request-123',
      }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        uid: candidateUid,
        status: 'IN_PROGRESS',
        replayed: false,
      })
    )
    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE recruitment_candidates'),
      ['IN_PROGRESS', null, 7, 41, 'NEW']
    )
    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO recruitment_status_events'),
      expect.arrayContaining(['NEW', 'IN_PROGRESS', 'Berkas sedang diperiksa.'])
    )
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        recordUid: candidateUid,
        beforeData: { status: 'NEW' },
        afterData: { status: 'IN_PROGRESS' },
      }),
      conn
    )
    expect(conn.commit).toHaveBeenCalledOnce()
  })

  it('menolak status stale dan transisi ilegal', async () => {
    const stale = connection({ status: 'IN_PROGRESS' })
    mocks.getConnection.mockResolvedValueOnce(stale)
    const staleResponse = await request(`/candidates/${candidateUid}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentStatus: 'NEW',
        toStatus: 'IN_PROGRESS',
        idempotencyKey: 'request-stale',
      }),
    })
    expect(staleResponse.status).toBe(409)
    expect(stale.execute).not.toHaveBeenCalled()

    const illegal = connection({ status: 'PASSED' })
    mocks.getConnection.mockResolvedValueOnce(illegal)
    const illegalResponse = await request(
      `/candidates/${candidateUid}/status`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentStatus: 'PASSED',
          toStatus: 'NEW',
          idempotencyKey: 'request-illegal',
        }),
      }
    )
    expect(illegalResponse.status).toBe(422)
    expect(illegal.execute).not.toHaveBeenCalled()
  })

  it('mengembalikan hasil lama untuk klik ganda dengan payload yang sama', async () => {
    const conn = connection({
      status: 'IN_PROGRESS',
      replay: {
        eventUid: '44444444-4444-4444-8444-444444444444',
        candidateUid,
        fromStatus: 'NEW',
        toStatus: 'IN_PROGRESS',
        applicantReason: null,
        internalNotes: null,
        occurredAt: '2026-09-04T09:00:00.000000',
      },
    })
    mocks.getConnection.mockResolvedValue(conn)
    const response = await request(`/candidates/${candidateUid}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentStatus: 'NEW',
        toStatus: 'IN_PROGRESS',
        idempotencyKey: 'request-replay',
      }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({ replayed: true, status: 'IN_PROGRESS' })
    )
    expect(conn.execute).not.toHaveBeenCalled()
    expect(mocks.writeAudit).not.toHaveBeenCalled()
    expect(conn.commit).toHaveBeenCalledOnce()
  })

  it('menyimpan catatan HR terpisah dengan optimistic concurrency dan audit', async () => {
    const conn = connection()
    mocks.getConnection.mockResolvedValue(conn)
    const response = await request(
      `/candidates/${candidateUid}/internal-notes`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          internalNotes: 'Hubungi kembali hari Senin.',
          currentUpdatedAt: '2026-09-04T08:00:00.000000',
        }),
      }
    )
    expect(response.status).toBe(200)
    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE recruitment_candidates'),
      ['Hubungi kembali hari Senin.', 7, 41, '2026-09-04T08:00:00.000000']
    )
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Memperbarui catatan internal kandidat.',
      }),
      conn
    )
  })
})
