import express from 'express'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, errorHandler } from '../lib/errors.js'
import { publicRecruitmentRouter } from './public-recruitment.js'

const mocks = vi.hoisted(() => ({
  siteCode: vi.fn(),
  configured: vi.fn(),
  verifyTurnstile: vi.fn(),
  findSite: vi.fn(),
  readConfig: vi.fn(),
  check: vi.fn(),
  create: vi.fn(),
}))

vi.mock('../lib/recruitment-public-config.js', () => ({
  recruitmentSiteCodeFromToken: mocks.siteCode,
  assertPublicRecruitmentConfigured: mocks.configured,
}))
vi.mock('../lib/recruitment-turnstile.js', () => ({
  verifyRecruitmentTurnstile: mocks.verifyTurnstile,
}))
vi.mock('../lib/recruitment-public-service.js', () => ({
  findPublicRecruitmentSite: mocks.findSite,
  publicRecruitmentConfig: mocks.readConfig,
  checkRecruitmentEligibility: mocks.check,
  createRecruitmentSubmission: mocks.create,
}))

async function request(path: string, options: RequestInit = {}) {
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/public/recruitment', publicRecruitmentRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/public/recruitment${path}`, options)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

const site = { id: 2, uid: 'site-uid', code: 'JEPARA', name: 'Site Jepara' }
const payload = {
  fullName: 'Pelamar Aman',
  nationalIdNumber: '3320123456789012',
  familyCardNumber: '3320987654321098',
  gender: 'FEMALE',
  birthPlace: 'Jepara',
  birthDate: '2000-01-01',
  address: 'Alamat lengkap pelamar',
  phone: '081234567890',
  email: '',
  privacyConsent: true,
  privacyNoticeVersion: 'recruitment-privacy-v1',
  idempotencyKey: 'f197b67b-a82a-4fec-91dd-f06efc5cf41e',
}

describe('Public recruitment API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.siteCode.mockReturnValue('JEPARA')
    mocks.findSite.mockResolvedValue(site)
    mocks.verifyTurnstile.mockResolvedValue(undefined)
    mocks.readConfig.mockResolvedValue({ company: { name: 'RSIA' }, site })
    mocks.check.mockResolvedValue({ canSubmit: true, priorRejectedApplication: null })
    mocks.create.mockResolvedValue({ applicationNumber: 'APL-JEPARA-1', replayed: false })
  })

  it('menolak token site yang tidak valid tanpa menjalankan Turnstile', async () => {
    mocks.siteCode.mockReturnValue(null)
    const response = await request('/invalid-token/config')
    expect(response.status).toBe(404)
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled()
  })

  it('menolak pengecekan ketika Turnstile gagal', async () => {
    mocks.verifyTurnstile.mockRejectedValue(
      new ApiError(422, 'Verifikasi keamanan gagal. Silakan coba kembali.')
    )
    const response = await request('/valid-site-token-123456789/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nationalIdNumber: payload.nationalIdNumber,
        familyCardNumber: payload.familyCardNumber,
        birthDate: payload.birthDate,
        turnstileToken: 'bad-token',
      }),
    })
    expect(response.status).toBe(422)
    expect(mocks.check).not.toHaveBeenCalled()
  })

  it('menolak submit tanpa tiga foto', async () => {
    const form = new FormData()
    form.set('payload', JSON.stringify(payload))
    const response = await request('/valid-site-token-123456789/submit', {
      method: 'POST',
      headers: { 'x-turnstile-token': 'valid-token' },
      body: form,
    })
    expect(response.status).toBe(422)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('menolak file yang menyamar sebagai gambar', async () => {
    const form = new FormData()
    form.set('payload', JSON.stringify(payload))
    for (const field of ['photo', 'ktp', 'kk']) {
      form.set(field, new Blob(['not-an-image'], { type: 'image/jpeg' }), `${field}.jpg`)
    }
    const response = await request('/valid-site-token-123456789/submit', {
      method: 'POST',
      headers: { 'x-turnstile-token': 'valid-token' },
      body: form,
    })
    expect(response.status).toBe(422)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('menolak file di atas 5 MB sebelum penyimpanan', async () => {
    const form = new FormData()
    form.set('payload', JSON.stringify(payload))
    const oversized = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], {
      type: 'image/jpeg',
    })
    form.set('photo', oversized, 'photo.jpg')
    form.set('ktp', new Blob(['x'], { type: 'image/jpeg' }), 'ktp.jpg')
    form.set('kk', new Blob(['x'], { type: 'image/jpeg' }), 'kk.jpg')
    const response = await request('/valid-site-token-123456789/submit', {
      method: 'POST',
      headers: { 'x-turnstile-token': 'valid-token' },
      body: form,
    })
    expect(response.status).toBe(422)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('menerima tiga gambar valid dan tidak mengirim URL privat', async () => {
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer()
    const form = new FormData()
    form.set('payload', JSON.stringify(payload))
    for (const field of ['photo', 'ktp', 'kk']) {
      form.set(field, new Blob([image], { type: 'image/png' }), `${field}.png`)
    }
    const response = await request('/valid-site-token-123456789/submit', {
      method: 'POST',
      headers: { 'x-turnstile-token': 'valid-token' },
      body: form,
    })
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toEqual({
      applicationNumber: 'APL-JEPARA-1',
      message: 'Pendaftaran berhasil diterima.',
    })
    expect(JSON.stringify(body)).not.toMatch(/url|storage|bucket/i)
  })
})
