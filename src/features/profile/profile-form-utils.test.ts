import { describe, expect, it } from 'vitest'
import {
  normalizeProfileDraft,
  validatePasswordDraft,
  validateProfileDraft,
} from './profile-form-utils'

describe('profile form utils', () => {
  it('menerima data akun yang valid dan menormalkan kontak kosong', () => {
    const draft = {
      fullName: '  Administrator HRIS  ',
      username: ' admin.hris ',
      email: ' ',
      phone: ' ',
    }
    expect(validateProfileDraft(draft)).toEqual({})
    expect(normalizeProfileDraft(draft)).toEqual({
      fullName: 'Administrator HRIS',
      username: 'admin.hris',
      email: null,
      phone: null,
    })
  })

  it('menolak username dan email yang tidak valid', () => {
    const errors = validateProfileDraft({
      fullName: 'A',
      username: 'admin hris',
      email: 'bukan-email',
      phone: '',
    })
    expect(errors.fullName).toBeTruthy()
    expect(errors.username).toBeTruthy()
    expect(errors.email).toBeTruthy()
  })

  it('memastikan kata sandi kuat dan konfirmasinya sama', () => {
    expect(
      validatePasswordDraft({
        currentPassword: 'lama',
        newPassword: 'Baru1234',
        confirmation: 'Baru1234',
      })
    ).toEqual({})
    expect(
      validatePasswordDraft({
        currentPassword: '',
        newPassword: 'tanpaangka',
        confirmation: 'berbeda',
      })
    ).toMatchObject({
      currentPassword: expect.any(String),
      newPassword: expect.any(String),
      confirmation: expect.any(String),
    })
  })
})
