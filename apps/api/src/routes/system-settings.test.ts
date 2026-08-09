import { describe, expect, it } from 'vitest'
import {
  companyProfileInput,
  matchesCompanyLogoSignature,
} from '../lib/company-settings.js'
import { contractSettingsInput } from '../lib/contract-settings.js'

const validTarget = {
  siteCode: 'JEPARA',
  sectionCode: 'LINTING',
  value: 450,
  unit: 'batang per-jam kerja',
}

describe('contractSettingsInput', () => {
  it('menerima perubahan pihak pertama dan beberapa target', () => {
    const result = contractSettingsInput.parse({
      firstParty: {
        companyName: 'PT Restu Sejati Inti Abadi',
        directorName: 'Budi Wicaksono Yuwono',
        directorTitle: 'Direktur',
        headOfficeAddress: 'Semarang',
      },
      targets: [
        validTarget,
        { ...validTarget, siteCode: 'KLATEN', value: 500 },
      ],
    })

    expect(result.targets).toHaveLength(2)
  })

  it.each([0, -1])('menolak target tidak positif: %s', (value) => {
    expect(() =>
      contractSettingsInput.parse({
        targets: [{ ...validTarget, value }],
      })
    ).toThrow()
  })

  it('menolak satuan kosong dan target duplikat', () => {
    expect(() =>
      contractSettingsInput.parse({
        targets: [validTarget, { ...validTarget, unit: '   ' }],
      })
    ).toThrow()
  })

  it('menolak payload tanpa perubahan', () => {
    expect(() => contractSettingsInput.parse({ targets: [] })).toThrow()
  })
})

describe('companyProfileInput', () => {
  const validProfile = {
    companyName: 'PT Restu Sejati Inti Abadi',
    legalAddress: 'Semarang',
    phone: '024-123456',
    email: 'hr@example.com',
    website: 'https://example.com',
    taxNumber: '01.234.567.8-999.000',
    logoFileUid: null,
  }

  it('menerima profil lengkap dan field kontak kosong', () => {
    expect(companyProfileInput.parse(validProfile)).toEqual(validProfile)
    expect(
      companyProfileInput.parse({
        ...validProfile,
        phone: '',
        email: '',
        website: '',
        taxNumber: '',
      })
    ).toBeTruthy()
  })

  it('menolak email, website, dan field tambahan yang tidak valid', () => {
    expect(() =>
      companyProfileInput.parse({ ...validProfile, email: 'bukan-email' })
    ).toThrow()
    expect(() =>
      companyProfileInput.parse({ ...validProfile, website: 'example.com' })
    ).toThrow()
    expect(() =>
      companyProfileInput.parse({ ...validProfile, unknown: true })
    ).toThrow()
  })
})

describe('matchesCompanyLogoSignature', () => {
  it('menerima signature JPG, PNG, dan WebP yang valid', () => {
    expect(
      matchesCompanyLogoSignature(
        Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        'image/jpeg'
      )
    ).toBe(true)
    expect(
      matchesCompanyLogoSignature(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image/png'
      )
    ).toBe(true)
    expect(
      matchesCompanyLogoSignature(
        Buffer.from('RIFF0000WEBP', 'ascii'),
        'image/webp'
      )
    ).toBe(true)
  })

  it('menolak mime atau isi file yang dipalsukan', () => {
    expect(matchesCompanyLogoSignature(Buffer.from('fake'), 'image/png')).toBe(
      false
    )
    expect(
      matchesCompanyLogoSignature(
        Buffer.from([0xff, 0xd8, 0xff]),
        'application/pdf'
      )
    ).toBe(false)
  })
})
