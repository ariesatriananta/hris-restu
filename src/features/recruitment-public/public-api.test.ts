import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkRecruitmentIdentity,
  submitRecruitmentApplication,
} from './public-api'

afterEach(() => vi.restoreAllMocks())

describe('API Form Data Pelamar', () => {
  it('mengirim gabungan identitas dan token keamanan saat pengecekan', async () => {
    const fetchMock = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          canSubmit: true,
          message: 'Data dapat dilanjutkan.',
          priorRejectedApplication: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    await checkRecruitmentIdentity(
      'site-token-yang-panjang-dan-aman',
      {
        nationalIdNumber: '3374123456789012',
        familyCardNumber: '3374123456789013',
        birthDate: '2000-01-20',
      },
      'turnstile-check-token'
    )
    const init = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(String(init?.body))).toMatchObject({
      nationalIdNumber: '3374123456789012',
      turnstileToken: 'turnstile-check-token',
    })
  })

  it('mengirim payload dan tepat tiga jenis foto dengan idempotency key', async () => {
    const fetchMock = vi
      .spyOn(window, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ applicationNumber: 'APL-JEPARA-20260904-ABC' }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        )
      )
    const photo = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
    await submitRecruitmentApplication({
      siteToken: 'site-token-yang-panjang-dan-aman',
      values: {
        nationalIdNumber: '3374123456789012',
        familyCardNumber: '3374123456789013',
        birthDate: '2000-01-20',
        fullName: 'Siti Aminah',
        gender: 'FEMALE',
        birthPlace: 'Jepara',
        educationLevel: 'SENIOR_SECONDARY',
        address: 'Jalan Melati Nomor 10',
        phone: '081234567890',
        email: '',
        privacyConsent: true,
      },
      files: { photo, ktp: photo, kk: photo },
      privacyNoticeVersion: 'recruitment-privacy-v1',
      idempotencyKey: '8e244d07-e65c-4fb2-9dbb-d2439c20a7c5',
      turnstileToken: 'turnstile-submit-token',
    })
    const init = fetchMock.mock.calls[0]?.[1]
    const body = init?.body as FormData
    expect(body.get('photo')).toBe(photo)
    expect(body.get('ktp')).toBe(photo)
    expect(body.get('kk')).toBe(photo)
    expect(JSON.parse(String(body.get('payload'))).idempotencyKey).toBe(
      '8e244d07-e65c-4fb2-9dbb-d2439c20a7c5'
    )
    expect((init?.headers as Record<string, string>)['x-turnstile-token']).toBe(
      'turnstile-submit-token'
    )
  })
})
