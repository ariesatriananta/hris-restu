import { describe, expect, it } from 'vitest'
import {
  missingRecruitmentFiles,
  validateIdentity,
  validateImageFile,
  validateRecruitmentForm,
} from './validation'

const validValues = {
  nationalIdNumber: '3374123456789012',
  familyCardNumber: '3374123456789013',
  birthDate: '2000-01-20',
  fullName: 'Siti Aminah',
  gender: 'FEMALE' as const,
  birthPlace: 'Jepara',
  address: 'Jalan Melati Nomor 10',
  phone: '081234567890',
  email: '',
  privacyConsent: true,
}

describe('validasi Form Data Pelamar', () => {
  it('menerima identitas dan biodata yang lengkap', () => {
    expect(validateIdentity(validValues)).toEqual({})
    expect(validateRecruitmentForm(validValues)).toEqual({})
  })

  it('menolak identitas, kontak, dan persetujuan yang tidak valid', () => {
    const errors = validateRecruitmentForm({
      ...validValues,
      nationalIdNumber: '123',
      familyCardNumber: 'abc',
      phone: '123',
      email: 'bukan-email',
      privacyConsent: false,
    })
    expect(errors.nationalIdNumber).toBeTruthy()
    expect(errors.familyCardNumber).toBeTruthy()
    expect(errors.phone).toBeTruthy()
    expect(errors.email).toBeTruthy()
    expect(errors.privacyConsent).toBeTruthy()
  })

  it('memeriksa jenis, ukuran, dan kelengkapan foto', () => {
    const validPhoto = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
    const invalidPhoto = new File(['text'], 'document.txt', {
      type: 'text/plain',
    })
    expect(validateImageFile(validPhoto)).toBeNull()
    expect(validateImageFile(invalidPhoto)).toContain('JPG')
    expect(
      missingRecruitmentFiles({ photo: validPhoto, ktp: null, kk: null })
    ).toEqual(['ktp', 'kk'])
  })
})
