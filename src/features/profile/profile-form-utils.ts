import type { UpdateMyProfileInput } from './domain'

export interface ProfileDraft {
  fullName: string
  username: string
  email: string
  phone: string
}

export interface PasswordDraft {
  currentPassword: string
  newPassword: string
  confirmation: string
}

export type ProfileErrors = Partial<Record<keyof ProfileDraft, string>>
export type PasswordErrors = Partial<Record<keyof PasswordDraft, string>>

export function validateProfileDraft(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {}
  const fullName = draft.fullName.trim()
  const username = draft.username.trim()
  const email = draft.email.trim()
  const phone = draft.phone.trim()

  if (fullName.length < 2) errors.fullName = 'Nama lengkap minimal 2 karakter.'
  else if (fullName.length > 150)
    errors.fullName = 'Nama lengkap maksimal 150 karakter.'

  if (username.length < 3) errors.username = 'Username minimal 3 karakter.'
  else if (username.length > 100)
    errors.username = 'Username maksimal 100 karakter.'
  else if (!/^[A-Za-z0-9._-]+$/.test(username))
    errors.username =
      'Gunakan huruf, angka, titik, garis bawah, atau tanda minus.'

  if (email.length > 191) errors.email = 'Email maksimal 191 karakter.'
  else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = 'Format email belum sesuai.'

  if (phone.length > 30) errors.phone = 'Nomor telepon maksimal 30 karakter.'
  return errors
}

export function validatePasswordDraft(draft: PasswordDraft): PasswordErrors {
  const errors: PasswordErrors = {}
  if (!draft.currentPassword)
    errors.currentPassword = 'Kata sandi saat ini wajib diisi.'
  if (draft.newPassword.length < 8)
    errors.newPassword = 'Kata sandi baru minimal 8 karakter.'
  else if (draft.newPassword.length > 128)
    errors.newPassword = 'Kata sandi baru maksimal 128 karakter.'
  else if (!/[A-Za-z]/.test(draft.newPassword) || !/\d/.test(draft.newPassword))
    errors.newPassword = 'Gunakan minimal satu huruf dan satu angka.'
  if (!draft.confirmation) errors.confirmation = 'Ulangi kata sandi baru.'
  else if (draft.confirmation !== draft.newPassword)
    errors.confirmation = 'Konfirmasi kata sandi belum sama.'
  return errors
}

export function normalizeProfileDraft(
  draft: ProfileDraft
): UpdateMyProfileInput {
  return {
    fullName: draft.fullName.trim(),
    username: draft.username.trim(),
    email: draft.email.trim() || null,
    phone: draft.phone.trim() || null,
  }
}
