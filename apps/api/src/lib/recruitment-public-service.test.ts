import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkRecruitmentEligibility,
  createRecruitmentSubmission,
} from './recruitment-public-service.js'

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  begin: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
}))

const connection = {
  query: mocks.query,
  execute: mocks.execute,
  beginTransaction: mocks.begin,
  commit: mocks.commit,
  rollback: mocks.rollback,
  release: mocks.release,
}

vi.mock('../config.js', () => ({
  env: {
    R2_KEY_PREFIX: 'hris-rsia/',
    R2_PUBLIC_BASE_URL: 'https://files.example.test',
  },
}))
vi.mock('../db.js', () => ({
  pool: {
    query: mocks.poolQuery,
    getConnection: vi.fn(async () => connection),
  },
}))
vi.mock('./recruitment-private-storage.js', () => ({
  putPrivateRecruitmentObject: mocks.put,
  deletePrivateRecruitmentObject: mocks.remove,
  recruitmentObjectKey: (_candidate: string, file: string) => `private/${file}.jpg`,
}))

const image = {
  buffer: Buffer.from('sanitized-image'),
  mimeType: 'image/jpeg' as const,
  extension: 'jpg' as const,
  sizeBytes: 15,
}
const site = { id: 2, uid: 'site-uid', code: 'JEPARA', name: 'Site Jepara' }
const submission = {
  fullName: 'Pelamar Aman',
  nationalIdNumber: '3320123456789012',
  familyCardNumber: '3320987654321098',
  gender: 'FEMALE' as const,
  birthPlace: 'Jepara',
  birthDate: '2000-01-01',
  educationLevel: 'SENIOR_SECONDARY' as const,
  address: 'Alamat lengkap pelamar',
  phone: '081234567890',
  email: undefined,
  privacyNoticeVersion: 'recruitment-privacy-v1',
  idempotencyKey: 'f197b67b-a82a-4fec-91dd-f06efc5cf41e',
}

describe('public recruitment service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.begin.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined)
    mocks.release.mockReturnValue(undefined)
    mocks.put.mockResolvedValue(undefined)
    mocks.remove.mockResolvedValue(undefined)
  })

  it('mengizinkan pendaftaran ulang dan hanya mengembalikan alasan untuk pelamar', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ reason: 'Dokumen belum sesuai.', submittedDate: '2026-08-01' }]])
    const result = await checkRecruitmentEligibility({
      siteId: site.id,
      nationalIdNumber: submission.nationalIdNumber,
      familyCardNumber: submission.familyCardNumber,
      birthDate: submission.birthDate,
    })
    expect(result.canSubmit).toBe(true)
    expect(result.priorRejectedApplication).toEqual({
      reason: 'Dokumen belum sesuai.',
      submittedDate: '2026-08-01',
    })
    expect(result).not.toHaveProperty('internalNotes')
  })

  it('menolak lamaran aktif dengan pesan generik', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 9 }]])
    const result = await checkRecruitmentEligibility({
      siteId: site.id,
      nationalIdNumber: submission.nationalIdNumber,
      familyCardNumber: submission.familyCardNumber,
      birthDate: submission.birthDate,
    })
    expect(result.canSubmit).toBe(false)
    expect(result.message).not.toContain('NIK')
  })

  it('menolak NIK yang sudah menjadi karyawan tanpa membocorkan data', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce([[{ id: 10 }]])
      .mockResolvedValueOnce([[]])
    const result = await checkRecruitmentEligibility({
      siteId: site.id,
      nationalIdNumber: submission.nationalIdNumber,
      familyCardNumber: submission.familyCardNumber,
      birthDate: submission.birthDate,
    })
    expect(result.canSubmit).toBe(false)
    expect(result.message).not.toContain('NIK')
    expect(result).not.toHaveProperty('employee')
  })

  it('menolak submit bersamaan ketika NIK sedang diproses', async () => {
    mocks.query.mockResolvedValueOnce([[{ acquired: 0 }]])
    await expect(
      createRecruitmentSubmission({
        site,
        submission,
        files: { PHOTO: image, KTP: image, KK: image },
      })
    ).rejects.toMatchObject({
      status: 409,
      message: 'Pendaftaran sedang diproses. Silakan coba kembali beberapa saat lagi.',
    })
    expect(mocks.begin).not.toHaveBeenCalled()
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('mengembalikan receipt lama hanya jika payload dan checksum sama', async () => {
    const checksum = createHash('sha256').update(image.buffer).digest('hex')
    mocks.query
      .mockResolvedValueOnce([[{ acquired: 1 }]])
      .mockResolvedValueOnce([[
        {
          id: 8,
          applicationNumber: 'APL-JEPARA-OLD',
          siteId: 2,
          fullName: submission.fullName,
          nationalIdNumber: submission.nationalIdNumber,
          familyCardNumber: submission.familyCardNumber,
          gender: submission.gender,
          birthPlace: submission.birthPlace,
          birthDate: submission.birthDate,
          educationLevel: submission.educationLevel,
          address: submission.address,
          phone: submission.phone,
          email: null,
          privacyNoticeVersion: submission.privacyNoticeVersion,
        },
      ]])
      .mockResolvedValueOnce([[
        { fileKind: 'PHOTO', checksum },
        { fileKind: 'KTP', checksum },
        { fileKind: 'KK', checksum },
      ]])
      .mockResolvedValueOnce([[{ released: 1 }]])
    const result = await createRecruitmentSubmission({
      site,
      submission,
      files: { PHOTO: image, KTP: image, KK: image },
    })
    expect(result).toEqual({ applicationNumber: 'APL-JEPARA-OLD', replayed: true })
    expect(mocks.put).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('membersihkan object privat dan rollback ketika penyimpanan database gagal', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ acquired: 1 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ released: 1 }]])
    mocks.execute.mockRejectedValueOnce(new Error('database down'))
    await expect(
      createRecruitmentSubmission({
        site,
        submission,
        files: { PHOTO: image, KTP: image, KK: image },
      })
    ).rejects.toThrow('database down')
    expect(mocks.put).toHaveBeenCalledTimes(3)
    expect(mocks.remove).toHaveBeenCalledTimes(3)
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })

  it('mempertahankan berkas bila hasil commit tidak dapat dipastikan', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ acquired: 1 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ released: 1 }]])
    mocks.execute.mockResolvedValue([{ insertId: 41 }])
    mocks.commit.mockRejectedValueOnce(new Error('connection lost during commit'))

    await expect(
      createRecruitmentSubmission({
        site,
        submission,
        files: { PHOTO: image, KTP: image, KK: image },
      })
    ).rejects.toThrow('connection lost during commit')
    expect(mocks.put).toHaveBeenCalledTimes(3)
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })
})
