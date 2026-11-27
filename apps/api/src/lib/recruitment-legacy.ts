import { klatenLegacySourceHash, klatenRefreshSourceHash } from './employee-archive-policy.js'
import { googleDriveDocument } from './google-drive-document.js'

function object(value: unknown): Record<string, unknown> | undefined {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
  } catch { return undefined }
}

// Provenance is written only by the reviewed owner SQL, never accepted from HTTP.
export function recruitmentLegacy(value: unknown) {
  const meta = object(value)
  const employee = object(meta?.sourceEmployee)
  const original = object(object(employee?.notes)?.legacyImport)
  if (!meta || !original || !employee || meta.sourceHash !== original.sourceHash) return undefined
  if (meta.sourceHash === klatenRefreshSourceHash) {
    if (meta.sourceSheet !== 'REKRUTMEN' || original.sourceSheet !== 'REKRUTMEN'
      || !Number.isInteger(meta.sourceRow) || Number(meta.sourceRow) < 2
      || meta.sourceRow !== original.sourceRow) return undefined
  } else if (meta.sourceHash !== klatenLegacySourceHash) return undefined
  return { meta, employee }
}

export function recruitmentLegacyNumber(value: unknown) {
  const number = recruitmentLegacy(value)?.employee.employee_number
  return typeof number === 'string' && /^PSLO-\d{4}-\d{5}$/.test(number) ? number : null
}

export function recruitmentMissingFields(candidate: Record<string, unknown>) {
  const valid: Record<string, boolean> = {
    nationalIdNumber: /^\d{16}$/.test(String(candidate.nationalIdNumber ?? '')),
    familyCardNumber: /^\d{16}$/.test(String(candidate.familyCardNumber ?? '')),
    gender: ['MALE','FEMALE'].includes(String(candidate.gender ?? '')),
    birthPlace: String(candidate.birthPlace ?? '').trim().length > 0,
    birthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.birthDate ?? '')),
    educationLevel: Boolean(candidate.educationLevel),
    address: String(candidate.address ?? '').trim().length >= 5,
    phone: String(candidate.phone ?? '').trim().length >= 8,
  }
  return Object.keys(valid).filter((key) => !valid[key])
}

export function recruitmentFile(row: Record<string, unknown>) {
  const drive = typeof row.externalUrl === 'string' ? googleDriveDocument(row.externalUrl) : undefined
  return {
    uid: String(row.uid), kind: String(row.kind),
    originalName: row.originalName ? String(row.originalName) : `${String(row.kind)} Google Drive`,
    mimeType: row.mimeType ? String(row.mimeType) : 'application/octet-stream',
    sizeBytes: Number(row.sizeBytes ?? 0),
    sourceType: drive ? 'GOOGLE_DRIVE' as const : 'UPLOAD' as const,
    externalUrl: drive?.url ?? null, previewUrl: drive?.previewUrl ?? null,
  }
}

export function recruitmentLegacyDefaults(value: unknown) {
  const source = recruitmentLegacy(value)?.employee
  if (!source) return {}
  const mapping = {
    nickname:'nickname',
    maritalStatus:'marital_status',religion:'religion',rtrw:'rtrw',kelurahan:'kelurahan',kecamatan:'kecamatan',city:'city',province:'province',postalCode:'postal_code',
    emergencyContactName:'emergency_contact_name',emergencyContactPhone:'emergency_contact_phone',emergencyContactRelation:'emergency_contact_relation',
    taxNumber:'tax_number',bankName:'bank_name',bankAccountNumber:'bank_account_number',bankAccountName:'bank_account_name',
    bpjsHealthNumber:'bpjs_health_number',bpjsEmploymentNumber:'bpjs_employment_number',
  }
  return { ...Object.fromEntries(Object.entries(mapping).map(([target,key]) => [target,source[key] ?? null])), joinDate: null, joinDateTraining: null, joinDateBorong: null, permanentDate: null }
}
