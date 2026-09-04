import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import type { ResultSetHeader } from 'mysql2'
import { env } from '../config.js'
import { pool } from '../db.js'
import { ApiError } from './errors.js'
import type { RecruitmentImage } from './recruitment-images.js'
import {
  deletePrivateRecruitmentObject,
  putPrivateRecruitmentObject,
  recruitmentObjectKey,
} from './recruitment-private-storage.js'

export type PublicSite = { id: number; uid: string; code: string; name: string }
export type RecruitmentFileKind = 'PHOTO' | 'KTP' | 'KK'

export async function findPublicRecruitmentSite(siteCode: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id,uid,code,name
       FROM sites
      WHERE code=? AND is_active=1
      LIMIT 1`,
    [siteCode]
  )
  return (rows[0] as PublicSite | undefined) ?? null
}

function settingObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function publicRecruitmentConfig(site: PublicSite) {
  const [settingRows] = await pool.query<RowDataPacket[]>(
    `SELECT setting_key settingKey,setting_value settingValue
       FROM system_settings
      WHERE site_id IS NULL
        AND setting_key IN ('company.profile','contract.pkwt.first_party')`
  )
  const profile = settingObject(
    settingRows.find((row) => row.settingKey === 'company.profile')?.settingValue
  )
  const legacy = settingObject(
    settingRows.find((row) => row.settingKey === 'contract.pkwt.first_party')
      ?.settingValue
  )
  const companyName =
    text(profile.companyName) ||
    text(legacy.companyName) ||
    'PT Restu Sejati Inti Abadi'
  const logoFileUid = text(profile.logoFileUid)
  let logoUrl: string | null = null
  if (logoFileUid) {
    const [fileRows] = await pool.query<RowDataPacket[]>(
      `SELECT storage_path storagePath
         FROM files
        WHERE uid=?
          AND mime_type IN ('image/jpeg','image/png','image/webp')
          AND storage_path LIKE ?
        LIMIT 1`,
      [
        logoFileUid,
        `${env.R2_KEY_PREFIX.replace(/\/?$/, '/')}settings/company-logo/%`,
      ]
    )
    if (fileRows[0]) {
      logoUrl = `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${String(fileRows[0].storagePath)}`
    }
  }
  return {
    company: { name: companyName, logoUrl },
    site: { uid: site.uid, code: site.code, name: site.name },
    privacyNoticeVersion: 'recruitment-privacy-v1',
    turnstileSiteKey: env.RECRUITMENT_TURNSTILE_SITE_KEY ?? null,
    limits: {
      imageTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxImageBytes: 5 * 1024 * 1024,
    },
  }
}

export async function checkRecruitmentEligibility(input: {
  siteId: number
  nationalIdNumber: string
  familyCardNumber: string
  birthDate: string
}) {
  const [blockingEmployees] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM employees WHERE national_id_number=? LIMIT 1`,
    [input.nationalIdNumber]
  )
  const [activeApplications] = await pool.query<RowDataPacket[]>(
    `SELECT id
       FROM recruitment_candidates
      WHERE national_id_number=?
        AND status IN ('NEW','IN_PROGRESS','PASSED','CONVERTED')
      LIMIT 1`,
    [input.nationalIdNumber]
  )
  if (blockingEmployees[0] || activeApplications[0]) {
    return {
      canSubmit: false,
      message:
        'Pendaftaran belum dapat dilanjutkan. Silakan hubungi HR site tujuan.',
      priorRejectedApplication: null,
    }
  }

  const [rejected] = await pool.query<RowDataPacket[]>(
    `SELECT applicant_rejection_reason reason,
            DATE_FORMAT(submitted_at,'%Y-%m-%d') submittedDate
       FROM recruitment_candidates
      WHERE site_id=? AND national_id_number=? AND family_card_number=?
        AND birth_date=? AND status='REJECTED'
      ORDER BY submitted_at DESC,id DESC
      LIMIT 1`,
    [
      input.siteId,
      input.nationalIdNumber,
      input.familyCardNumber,
      input.birthDate,
    ]
  )
  return {
    canSubmit: true,
    message: rejected[0]
      ? 'Anda pernah mendaftar sebelumnya dan tetap dapat mengirim lamaran baru.'
      : 'Data dapat dilanjutkan.',
    priorRejectedApplication: rejected[0]
      ? {
          submittedDate: String(rejected[0].submittedDate),
          reason: String(rejected[0].reason),
        }
      : null,
  }
}

type Submission = {
  fullName: string
  nationalIdNumber: string
  familyCardNumber: string
  gender: 'MALE' | 'FEMALE'
  birthPlace: string
  birthDate: string
  address: string
  phone: string
  email?: string
  privacyNoticeVersion: string
  idempotencyKey: string
}

function idempotencyHash(siteId: number, key: string) {
  return createHash('sha256')
    .update(`recruitment|${siteId}|${key}`)
    .digest('hex')
}

function applicationNumber(siteCode: string) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = randomBytes(5).toString('hex').toUpperCase()
  return `APL-${siteCode}-${date}-${suffix}`
}

async function acquireNationalIdLock(
  conn: PoolConnection,
  nationalIdNumber: string
) {
  const lockName = `recruitment:${createHash('sha256').update(nationalIdNumber).digest('hex').slice(0, 40)}`
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT GET_LOCK(?,5) acquired',
    [lockName]
  )
  if (Number(rows[0]?.acquired) !== 1) {
    throw new ApiError(
      409,
      'Pendaftaran sedang diproses. Silakan coba kembali beberapa saat lagi.'
    )
  }
  return lockName
}

export async function createRecruitmentSubmission(input: {
  site: PublicSite
  submission: Submission
  files: Record<RecruitmentFileKind, RecruitmentImage>
}) {
  const conn = await pool.getConnection()
  const uploadedKeys: string[] = []
  const scopedIdempotencyKey = idempotencyHash(
    input.site.id,
    input.submission.idempotencyKey
  )
  let lockName: string | null = null
  let committed = false
  try {
    lockName = await acquireNationalIdLock(
      conn,
      input.submission.nationalIdNumber
    )
    await conn.beginTransaction()

    const [existingRows] = await conn.query<RowDataPacket[]>(
      `SELECT id,application_number applicationNumber,site_id siteId,
              full_name fullName,national_id_number nationalIdNumber,
              family_card_number familyCardNumber,gender,birth_place birthPlace,
              DATE_FORMAT(birth_date,'%Y-%m-%d') birthDate,address,phone,email,
              privacy_notice_version privacyNoticeVersion
         FROM recruitment_candidates
        WHERE idempotency_key=?
        LIMIT 1 FOR UPDATE`,
      [scopedIdempotencyKey]
    )
    const existing = existingRows[0]
    if (existing) {
      const [existingFileRows] = await conn.query<RowDataPacket[]>(
        `SELECT rcf.file_kind fileKind,f.checksum_sha256 checksum
           FROM recruitment_candidate_files rcf
           JOIN files f ON f.id=rcf.file_id
          WHERE rcf.candidate_id=?`,
        [existing.id]
      )
      const existingChecksums = new Map(
        existingFileRows.map((row) => [String(row.fileKind), String(row.checksum)])
      )
      const sameFiles = (Object.entries(input.files) as [
        RecruitmentFileKind,
        RecruitmentImage,
      ][]).every(
        ([kind, image]) =>
          existingChecksums.get(kind) ===
          createHash('sha256').update(image.buffer).digest('hex')
      )
      const samePayload =
        Number(existing.siteId) === input.site.id &&
        existing.fullName === input.submission.fullName &&
        existing.nationalIdNumber === input.submission.nationalIdNumber &&
        existing.familyCardNumber === input.submission.familyCardNumber &&
        existing.gender === input.submission.gender &&
        existing.birthPlace === input.submission.birthPlace &&
        existing.birthDate === input.submission.birthDate &&
        existing.address === input.submission.address &&
        existing.phone === input.submission.phone &&
        (existing.email ?? null) === (input.submission.email ?? null) &&
        existing.privacyNoticeVersion === input.submission.privacyNoticeVersion &&
        existingFileRows.length === 3 &&
        sameFiles
      if (
        !samePayload
      ) {
        throw new ApiError(409, 'Kiriman yang sama tidak dapat digunakan kembali.')
      }
      await conn.commit()
      committed = true
      return { applicationNumber: String(existing.applicationNumber), replayed: true }
    }

    const [employeeRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM employees WHERE national_id_number=? LIMIT 1 FOR UPDATE`,
      [input.submission.nationalIdNumber]
    )
    const [activeRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM recruitment_candidates
        WHERE national_id_number=?
          AND status IN ('NEW','IN_PROGRESS','PASSED','CONVERTED')
        LIMIT 1 FOR UPDATE`,
      [input.submission.nationalIdNumber]
    )
    if (employeeRows[0] || activeRows[0]) {
      throw new ApiError(
        409,
        'Pendaftaran belum dapat dilanjutkan. Silakan hubungi HR site tujuan.'
      )
    }

    const candidateUid = randomUUID()
    const number = applicationNumber(input.site.code)
    const preparedFiles: Array<{
      kind: RecruitmentFileKind
      image: RecruitmentImage
      fileUid: string
      key: string
    }> = []
    for (const [kind, image] of Object.entries(input.files) as [
      RecruitmentFileKind,
      RecruitmentImage,
    ][]) {
      const fileUid = randomUUID()
      const key = recruitmentObjectKey(candidateUid, fileUid)
      await putPrivateRecruitmentObject({
        key,
        body: image.buffer,
        contentType: image.mimeType,
      })
      uploadedKeys.push(key)
      preparedFiles.push({ kind, image, fileUid, key })
    }

    const [candidateInsert] = await conn.execute<ResultSetHeader>(
      `INSERT INTO recruitment_candidates
         (uid,application_number,idempotency_key,site_id,full_name,
          national_id_number,family_card_number,gender,birth_place,birth_date,
          address,phone,email,privacy_consent_at,privacy_notice_version,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(3),?,'NEW')`,
      [
        candidateUid,
        number,
        scopedIdempotencyKey,
        input.site.id,
        input.submission.fullName,
        input.submission.nationalIdNumber,
        input.submission.familyCardNumber,
        input.submission.gender,
        input.submission.birthPlace,
        input.submission.birthDate,
        input.submission.address,
        input.submission.phone,
        input.submission.email ?? null,
        input.submission.privacyNoticeVersion,
      ]
    )

    for (const file of preparedFiles) {
      const checksum = createHash('sha256')
        .update(file.image.buffer)
        .digest('hex')
      const [fileInsert] = await conn.execute<ResultSetHeader>(
        `INSERT INTO files
           (uid,storage_provider,storage_path,original_name,stored_name,
            mime_type,extension,size_bytes,checksum_sha256,visibility)
         VALUES (?,'S3',?,?,?,'image/jpeg','jpg',?,?,'INTERNAL')`,
        [
          file.fileUid,
          file.key,
          `${file.kind}.jpg`,
          `${file.fileUid}.jpg`,
          file.image.sizeBytes,
          checksum,
        ]
      )
      await conn.execute(
        `INSERT INTO recruitment_candidate_files
           (uid,candidate_id,file_id,file_kind)
         VALUES (?,?,?,?)`,
        [randomUUID(), candidateInsert.insertId, fileInsert.insertId, file.kind]
      )
    }

    await conn.execute(
      `INSERT INTO recruitment_status_events
         (uid,candidate_id,from_status,to_status,event_source,idempotency_key)
       VALUES (?, ?, NULL, 'NEW', 'PUBLIC_SUBMISSION', ?)`,
      [
        randomUUID(),
        candidateInsert.insertId,
        `submission:${scopedIdempotencyKey}`,
      ]
    )
    await conn.commit()
    committed = true
    return { applicationNumber: number, replayed: false }
  } catch (error) {
    if (!committed) await conn.rollback()
    if (uploadedKeys.length) {
      await Promise.allSettled(uploadedKeys.map(deletePrivateRecruitmentObject))
    }
    throw error
  } finally {
    if (lockName) {
      await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined)
    }
    conn.release()
  }
}
