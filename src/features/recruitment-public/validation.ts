import type {
  RecruitmentFiles,
  RecruitmentFormValues,
  RecruitmentIdentity,
} from './domain'

export type FieldErrors = Partial<Record<keyof RecruitmentFormValues, string>>

export const RECRUITMENT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const RECRUITMENT_MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function validateIdentity(values: RecruitmentIdentity): FieldErrors {
  const errors: FieldErrors = {}
  if (!/^\d{16}$/.test(values.nationalIdNumber))
    errors.nationalIdNumber = 'NIK harus terdiri dari 16 angka.'
  if (!/^\d{16}$/.test(values.familyCardNumber))
    errors.familyCardNumber = 'Nomor KK harus terdiri dari 16 angka.'
  if (!values.birthDate) errors.birthDate = 'Tanggal lahir wajib diisi.'
  else if (new Date(`${values.birthDate}T00:00:00`).getTime() > Date.now())
    errors.birthDate = 'Tanggal lahir tidak boleh di masa depan.'
  return errors
}

export function validateRecruitmentForm(values: RecruitmentFormValues) {
  const errors = validateIdentity(values)
  if (values.fullName.trim().length < 2)
    errors.fullName = 'Nama lengkap wajib diisi sesuai KTP.'
  if (!values.gender) errors.gender = 'Pilih jenis kelamin.'
  if (values.birthPlace.trim().length < 2)
    errors.birthPlace = 'Tempat lahir wajib diisi.'
  if (values.address.trim().length < 5)
    errors.address = 'Alamat sesuai KTP wajib diisi.'
  const phone = values.phone.replace(/[\s().-]/g, '')
  if (!/^\+?\d{8,15}$/.test(phone))
    errors.phone = 'Masukkan nomor HP/WhatsApp yang aktif.'
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
    errors.email = 'Format email belum benar.'
  if (!values.privacyConsent)
    errors.privacyConsent = 'Persetujuan penggunaan data wajib diberikan.'
  return errors
}

export function validateImageFile(
  file: File,
  allowedTypes = RECRUITMENT_IMAGE_TYPES,
  maxBytes = RECRUITMENT_MAX_IMAGE_BYTES
) {
  if (!allowedTypes.includes(file.type))
    return 'Gunakan foto JPG, PNG, atau WebP.'
  if (file.size > maxBytes) return 'Ukuran foto maksimal 5 MB.'
  if (file.size === 0) return 'Berkas foto kosong. Silakan pilih ulang.'
  return null
}

export function missingRecruitmentFiles(files: RecruitmentFiles) {
  return (Object.entries(files) as [keyof RecruitmentFiles, File | null][])
    .filter(([, file]) => !file)
    .map(([kind]) => kind)
}
