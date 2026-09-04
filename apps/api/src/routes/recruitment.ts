import { z } from 'zod'
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { createHash, randomUUID } from 'node:crypto'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import {
  EmployeeNumberSequenceExhaustedError,
  reserveEmployeeNumber,
} from '../lib/employee-number.js'
import { ApiError } from '../lib/errors.js'
import {
  deleteEmployeeRecruitmentObject,
  employeeRecruitmentObjectKey,
  putEmployeeRecruitmentObject,
} from '../lib/recruitment-conversion-storage.js'
import { getPrivateRecruitmentObject } from '../lib/recruitment-internal-storage.js'
import { recruitmentPublicTokensBySite } from '../lib/recruitment-public-config.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const statuses = [
  'NEW',
  'IN_PROGRESS',
  'PASSED',
  'REJECTED',
  'CONVERTED',
] as const
type RecruitmentStatus = (typeof statuses)[number]
const statusLabels: Record<RecruitmentStatus, string> = {
  NEW: 'Baru',
  IN_PROGRESS: 'Diproses',
  PASSED: 'Lolos',
  REJECTED: 'Tidak Lolos',
  CONVERTED: 'Sudah menjadi karyawan',
}
const allowedTransitions: Partial<
  Record<RecruitmentStatus, RecruitmentStatus[]>
> = {
  NEW: ['IN_PROGRESS', 'REJECTED'],
  IN_PROGRESS: ['PASSED', 'REJECTED'],
  PASSED: ['IN_PROGRESS', 'REJECTED'],
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const listInput = z.object({
  search: z.string().trim().max(150).default(''),
  site: z.string().trim().max(500).optional(),
  status: z.string().trim().max(500).optional(),
  dateFrom: date.optional(),
  dateTo: date.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  sortBy: z
    .enum([
      'submittedAt',
      'statusChangedAt',
      'fullName',
      'status',
      'site',
      'applicationNumber',
    ])
    .default('submittedAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
})
const transitionInput = z
  .object({
    toStatus: z.enum(statuses),
    currentStatus: z.enum(statuses),
    idempotencyKey: z.string().trim().min(8).max(100),
    applicantReason: z.string().trim().max(500).optional(),
    internalNotes: z.string().trim().max(5000).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.toStatus === 'REJECTED' &&
      (value.applicantReason?.length ?? 0) < 5
    ) {
      context.addIssue({
        code: 'custom',
        path: ['applicantReason'],
        message: 'Alasan untuk pelamar minimal 5 karakter.',
      })
    }
    if (value.toStatus !== 'REJECTED' && value.applicantReason) {
      context.addIssue({
        code: 'custom',
        path: ['applicantReason'],
        message: 'Alasan untuk pelamar hanya diisi saat kandidat Tidak Lolos.',
      })
    }
  })
const notesInput = z.object({
  internalNotes: z.string().trim().max(10000).nullable(),
  currentUpdatedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/),
})
const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((value) => value || undefined)
const optionalLongText = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .nullable()
  .transform((value) => value || undefined)
const optionalDate = z
  .string()
  .date()
  .optional()
  .nullable()
  .transform((value) => value || undefined)
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email tidak valid.')
  .max(191)
  .optional()
  .nullable()
  .transform((value) => value || undefined)
const conversionEmployeeInput = z
  .object({
    fullName: z.string().trim().min(2).max(150),
    nickname: optionalText,
    employeeType: z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']),
    site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
    department: optionalText,
    position: optionalText,
    workGroup: optionalText,
    productionModuleSectionUid: z.string().uuid(),
    joinDate: z.string().date(),
    joinDateTraining: optionalDate,
    joinDateBorong: optionalDate,
    permanentDate: optionalDate,
    gender: z.enum(['MALE', 'FEMALE', 'LAKI-LAKI', 'PEREMPUAN']),
    birthPlace: z.string().trim().min(1).max(100),
    birthDate: z.string().date(),
    maritalStatus: z
      .enum([
        'BELUM_KAWIN',
        'KAWIN',
        'CERAI_HIDUP',
        'CERAI_MATI',
        'SINGLE',
        'MARRIED',
        'DIVORCED',
        'WIDOWED',
      ])
      .optional()
      .nullable()
      .transform((value) => value || undefined),
    religion: optionalText,
    address: z.string().trim().min(5).max(5000),
    rtrw: z
      .string()
      .trim()
      .regex(/^\d{3}\/\d{3}$/, 'RT/RW wajib berformat 001/002.')
      .optional()
      .nullable()
      .transform((value) => value || undefined),
    kelurahan: optionalText,
    kecamatan: optionalText,
    city: optionalText,
    province: optionalText,
    postalCode: optionalText,
    phone: z.string().trim().min(8).max(30),
    email: optionalEmail,
    emergencyContactName: optionalText,
    emergencyContactPhone: optionalText,
    emergencyContactRelation: optionalText,
    nationalIdNumber: z.string().regex(/^\d{16}$/, 'NIK wajib 16 angka.'),
    familyCardNumber: z
      .string()
      .regex(/^\d{16}$/, 'Nomor KK wajib 16 angka.'),
    taxNumber: optionalText,
    bankName: optionalText,
    bankAccountNumber: optionalText,
    bankAccountName: optionalText,
    bpjsHealthNumber: optionalText,
    bpjsEmploymentNumber: optionalText,
    notes: optionalLongText,
  })
  .strict()
  .refine(
    (value) => !value.joinDateTraining || value.joinDateTraining >= value.joinDate,
    {
      path: ['joinDateTraining'],
      message: 'Tanggal join training tidak boleh sebelum tanggal bergabung.',
    }
  )
  .refine(
    (value) => !value.joinDateBorong || value.joinDateBorong >= value.joinDate,
    {
      path: ['joinDateBorong'],
      message: 'Tanggal join borong tidak boleh sebelum tanggal bergabung.',
    }
  )
const conversionInput = z.object({
  currentUpdatedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/),
  idempotencyKey: z.string().trim().min(8).max(100),
  input: conversionEmployeeInput,
})

function csv(value?: string) {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ]
}

function siteScope(auth: AuthContext, alias = 's') {
  if (auth.roles.includes('SUPER_ADMIN'))
    return { sql: '1=1', params: [] as string[] }
  if (!auth.siteAccess.length) return { sql: '1=0', params: [] as string[] }
  return {
    sql: `${alias}.code IN (${auth.siteAccess.map(() => '?').join(',')})`,
    params: auth.siteAccess,
  }
}

function canManage(auth: AuthContext) {
  return (
    auth.roles.includes('SUPER_ADMIN') ||
    auth.permissions.includes('recruitment.manage')
  )
}

function maskedNik(value: unknown) {
  const digits = String(value ?? '')
  return digits.length === 16
    ? `${digits.slice(0, 4)}********${digits.slice(-4)}`
    : '****************'
}

function candidateDate(alias: string, column: string) {
  return `DATE_FORMAT(${alias}.${column},'%Y-%m-%dT%H:%i:%s.%f')`
}

function candidateAccessQuery(auth: AuthContext) {
  const access = siteScope(auth)
  return { sql: access.sql, params: access.params }
}

function allowedFor(status: RecruitmentStatus, manageable: boolean) {
  return manageable ? (allowedTransitions[status] ?? []) : []
}

const empty = (value?: string) => value?.trim() || null

async function conversionReferences(
  conn: PoolConnection,
  input: z.infer<typeof conversionEmployeeInput>,
  candidateSiteId: number
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT s.id siteId,s.employee_number_prefix employeeNumberPrefix,
      (SELECT id FROM departments WHERE site_id=s.id AND name=? AND is_active=1 LIMIT 1) departmentId,
      (SELECT id FROM positions WHERE name=? AND is_active=1 LIMIT 1) positionId,
      (SELECT id FROM work_groups WHERE site_id=s.id AND name=? AND is_active=1 LIMIT 1) workGroupId,
      (SELECT id FROM employee_types WHERE code=? AND is_active=1 LIMIT 1) typeId,
      (SELECT id FROM employee_statuses WHERE code='INACTIVE' LIMIT 1) statusId
     FROM sites s WHERE s.id=? AND s.code=? AND s.is_active=1 LIMIT 1`,
    [
      empty(input.department),
      empty(input.position),
      empty(input.workGroup),
      input.employeeType,
      candidateSiteId,
      input.site,
    ]
  )
  const refs = rows[0]
  if (!refs?.siteId || !refs.typeId || !refs.statusId || !refs.employeeNumberPrefix) {
    throw new ApiError(422, 'Referensi penempatan tidak valid.')
  }
  if (input.department && !refs.departmentId)
    throw new ApiError(422, 'Departemen tidak valid untuk site kandidat.')
  if (input.position && !refs.positionId)
    throw new ApiError(422, 'Jabatan tidak aktif atau tidak ditemukan.')
  if (input.workGroup && !refs.workGroupId)
    throw new ApiError(422, 'Kelompok kerja tidak valid untuk site kandidat.')
  const [sections] = await conn.query<RowDataPacket[]>(
    `SELECT pms.id FROM production_module_sections pms
     JOIN production_modules pm ON pm.id=pms.production_module_id
     JOIN production_sections ps ON ps.id=pms.production_section_id
     WHERE pms.uid=? AND pm.site_id=? AND pms.is_active=1
       AND pm.is_active=1 AND ps.is_active=1 LIMIT 1`,
    [input.productionModuleSectionUid, candidateSiteId]
  )
  if (!sections[0])
    throw new ApiError(422, 'Pasangan Modul dan Bagian produksi tidak valid untuk site kandidat.')
  return {
    siteId: Number(refs.siteId),
    employeeNumberPrefix: String(refs.employeeNumberPrefix),
    departmentId: refs.departmentId ? Number(refs.departmentId) : null,
    positionId: refs.positionId ? Number(refs.positionId) : null,
    workGroupId: refs.workGroupId ? Number(refs.workGroupId) : null,
    typeId: Number(refs.typeId),
    statusId: Number(refs.statusId),
    productionModuleSectionId: Number(sections[0].id),
  }
}

const candidateBaseSelect = `SELECT rc.id,rc.site_id siteId,rc.uid,rc.application_number applicationNumber,
  rc.full_name fullName,rc.national_id_number nationalIdNumber,
  rc.family_card_number familyCardNumber,rc.gender,rc.birth_place birthPlace,
  DATE_FORMAT(rc.birth_date,'%Y-%m-%d') birthDate,rc.address,rc.phone,rc.email,
  rc.privacy_notice_version privacyNoticeVersion,
  ${candidateDate('rc', 'privacy_consent_at')} privacyConsentAt,
  rc.status,rc.applicant_rejection_reason applicantRejectionReason,
  rc.internal_notes internalNotes,
  ${candidateDate('rc', 'submitted_at')} submittedAt,
  ${candidateDate('rc', 'status_changed_at')} statusChangedAt,
  ${candidateDate('rc', 'updated_at')} updatedAt,
  ${candidateDate('rc', 'converted_at')} convertedAt,
  DATE_FORMAT(CURRENT_DATE(),'%Y-%m-%d') today,
  s.uid siteUid,s.code siteCode,s.name siteName,e.uid employeeUid
  FROM recruitment_candidates rc
  JOIN sites s ON s.id=rc.site_id
  LEFT JOIN employees e ON e.id=rc.employee_id`

export const recruitmentRouter = Router()
recruitmentRouter.use(authenticate, requirePermission('recruitment.view'))

recruitmentRouter.get('/meta', async (_req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const access = siteScope(auth)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT s.uid,s.code,s.name FROM sites s WHERE s.is_active=1 AND ${access.sql} ORDER BY s.name`,
      access.params
    )
    res.json({
      sites: rows,
      statuses: statuses.map((value) => ({
        value,
        label: statusLabels[value],
      })),
    })
  } catch (error) {
    next(error)
  }
})

recruitmentRouter.get('/public-links', async (_req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const access = siteScope(auth)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT s.uid,s.code,s.name FROM sites s WHERE s.is_active=1 AND ${access.sql} ORDER BY s.name`,
      access.params
    )
    const tokensBySite = recruitmentPublicTokensBySite()
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      data: rows.map((row) => {
        const token = tokensBySite.get(String(row.code))
        return {
          site: {
            uid: String(row.uid),
            code: String(row.code),
            name: String(row.name),
          },
          url: token
            ? `/form-data-pelamar/${encodeURIComponent(token)}`
            : null,
        }
      }),
    })
  } catch (error) {
    next(error)
  }
})

recruitmentRouter.get(
  '/candidates/:uid/conversion-prefill',
  requirePermission('recruitment.manage'),
  async (req, res, next) => {
    try {
      const candidateUid = z.string().uuid().parse(req.params.uid)
      const auth = res.locals.auth as AuthContext
      const access = candidateAccessQuery(auth)
      const [candidateRows] = await pool.query<RowDataPacket[]>(
        `${candidateBaseSelect} WHERE rc.uid=? AND ${access.sql} LIMIT 1`,
        [candidateUid, ...access.params]
      )
      const candidate = candidateRows[0]
      if (!candidate) throw new ApiError(404, 'Kandidat tidak ditemukan.')
      if (candidate.status !== 'PASSED' || candidate.employeeUid) {
        throw new ApiError(
          409,
          candidate.employeeUid
            ? 'Kandidat ini sudah menjadi karyawan.'
            : 'Hanya kandidat berstatus Lolos yang dapat dijadikan karyawan.'
        )
      }
      const [filesResult, employeeTypesResult, departmentsResult, positionsResult, workGroupsResult, modulesResult, sectionsResult] =
        await Promise.all([
          pool.query<RowDataPacket[]>(
            `SELECT f.uid,rcf.file_kind kind,f.original_name originalName,
              f.mime_type mimeType,f.size_bytes sizeBytes
             FROM recruitment_candidate_files rcf JOIN files f ON f.id=rcf.file_id
             WHERE rcf.candidate_id=? ORDER BY FIELD(rcf.file_kind,'PHOTO','KTP','KK')`,
            [candidate.id]
          ),
          pool.query<RowDataPacket[]>(
            `SELECT code,name FROM employee_types WHERE is_active=1
             AND code IN ('BORONGAN','HARIAN','BULANAN','TRAINING') ORDER BY id`,
          ),
          pool.query<RowDataPacket[]>(
            'SELECT uid,code,name FROM departments WHERE site_id=? AND is_active=1 ORDER BY name',
            [candidate.siteId]
          ),
          pool.query<RowDataPacket[]>(
            'SELECT uid,code,name FROM positions WHERE is_active=1 ORDER BY name'
          ),
          pool.query<RowDataPacket[]>(
            'SELECT uid,code,name FROM work_groups WHERE site_id=? AND is_active=1 ORDER BY name',
            [candidate.siteId]
          ),
          pool.query<RowDataPacket[]>(
            'SELECT uid,code,name FROM production_modules WHERE site_id=? AND is_active=1 ORDER BY name',
            [candidate.siteId]
          ),
          pool.query<RowDataPacket[]>(
            `SELECT pms.uid,pm.uid moduleUid,ps.uid sectionUid,ps.code sectionCode,
              ps.name sectionName FROM production_module_sections pms
             JOIN production_modules pm ON pm.id=pms.production_module_id
             JOIN production_sections ps ON ps.id=pms.production_section_id
             WHERE pm.site_id=? AND pms.is_active=1 AND pm.is_active=1
               AND ps.is_active=1 ORDER BY pm.name,ps.name`,
            [candidate.siteId]
          ),
        ])
      const files = filesResult[0].map((row) => ({
        uid: String(row.uid),
        kind: String(row.kind),
        originalName: String(row.originalName),
        mimeType: String(row.mimeType),
        sizeBytes: Number(row.sizeBytes),
      }))
      if (new Set(files.map((file) => file.kind)).size !== 3) {
        throw new ApiError(
          409,
          'Foto, KTP, atau KK kandidat belum lengkap. Lengkapi arsip kandidat terlebih dahulu.'
        )
      }
      res.json({
        candidate: {
          uid: String(candidate.uid),
          applicationNumber: String(candidate.applicationNumber),
          status: String(candidate.status),
          updatedAt: candidate.updatedAt,
          site: {
            uid: String(candidate.siteUid),
            code: String(candidate.siteCode),
            name: String(candidate.siteName),
          },
          files,
        },
        employeeInput: {
          fullName: String(candidate.fullName),
          nickname: null,
          employeeType: null,
          employeeStatus: 'INACTIVE',
          site: String(candidate.siteCode),
          department: null,
          position: null,
          workGroup: null,
          productionModuleSectionUid: null,
          joinDate: String(candidate.today),
          joinDateTraining: null,
          joinDateBorong: null,
          permanentDate: null,
          gender: String(candidate.gender),
          birthPlace: String(candidate.birthPlace),
          birthDate: String(candidate.birthDate),
          maritalStatus: null,
          religion: null,
          address: String(candidate.address),
          rtrw: null,
          kelurahan: null,
          kecamatan: null,
          city: null,
          province: null,
          postalCode: null,
          phone: String(candidate.phone),
          email: candidate.email ? String(candidate.email) : null,
          emergencyContactName: null,
          emergencyContactPhone: null,
          emergencyContactRelation: null,
          nationalIdNumber: String(candidate.nationalIdNumber),
          familyCardNumber: String(candidate.familyCardNumber),
          taxNumber: null,
          bankName: null,
          bankAccountNumber: null,
          bankAccountName: null,
          bpjsHealthNumber: null,
          bpjsEmploymentNumber: null,
          notes: null,
        },
        lookups: {
          employeeTypes: employeeTypesResult[0],
          departments: departmentsResult[0],
          positions: positionsResult[0],
          workGroups: workGroupsResult[0],
          productionModules: modulesResult[0],
          productionModuleSections: sectionsResult[0],
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

recruitmentRouter.post(
  '/candidates/:uid/convert',
  requirePermission('recruitment.manage'),
  async (req, res, next) => {
    let conn: PoolConnection | undefined
    let committed = false
    let commitAttempted = false
    const uploadedKeys: string[] = []
    try {
      const candidateUid = z.string().uuid().parse(req.params.uid)
      const conversion = conversionInput.parse(req.body)
      const input = conversion.input
      const auth = res.locals.auth as AuthContext
      const access = candidateAccessQuery(auth)
      const eventKey = `conversion:${createHash('sha256')
        .update(
          `${candidateUid}|${auth.uid}|${conversion.idempotencyKey}|${JSON.stringify(input)}`
        )
        .digest('hex')}`

      conn = await pool.getConnection()
      await conn.beginTransaction()
      const [candidateRows] = await conn.query<RowDataPacket[]>(
        `${candidateBaseSelect} WHERE rc.uid=? AND ${access.sql} LIMIT 1 FOR UPDATE`,
        [candidateUid, ...access.params]
      )
      const candidate = candidateRows[0]
      if (!candidate) throw new ApiError(404, 'Kandidat tidak ditemukan.')

      const [replayRows] = await conn.query<RowDataPacket[]>(
        `SELECT rse.uid eventUid,e.uid employeeUid,e.employee_number employeeNumber
         FROM recruitment_status_events rse
         JOIN recruitment_candidates rc ON rc.id=rse.candidate_id
         JOIN employees e ON e.id=rc.employee_id
         WHERE rse.idempotency_key=? AND rc.uid=? AND rse.to_status='CONVERTED'
         LIMIT 1 FOR UPDATE`,
        [eventKey, candidateUid]
      )
      if (replayRows[0]) {
        commitAttempted = true
        await conn.commit()
        committed = true
        res.json({
          candidateUid,
          status: 'CONVERTED',
          employee: {
            uid: String(replayRows[0].employeeUid),
            employeeNumber: String(replayRows[0].employeeNumber),
          },
          replayed: true,
        })
        return
      }
      if (candidate.status === 'CONVERTED' || candidate.employeeUid) {
        throw new ApiError(
          409,
          'Kandidat ini sudah menjadi karyawan melalui proses lain.'
        )
      }
      if (candidate.status !== 'PASSED') {
        throw new ApiError(
          409,
          'Hanya kandidat berstatus Lolos yang dapat dijadikan karyawan.'
        )
      }
      if (candidate.updatedAt !== conversion.currentUpdatedAt) {
        throw new ApiError(
          409,
          'Data kandidat sudah berubah. Muat ulang data terbaru sebelum melanjutkan.'
        )
      }
      if (input.site !== candidate.siteCode) {
        throw new ApiError(
          422,
          'Site karyawan pertama harus sama dengan site pendaftaran kandidat.'
        )
      }

      const refs = await conversionReferences(
        conn,
        input,
        Number(candidate.siteId)
      )
      const [duplicateRows] = await conn.query<RowDataPacket[]>(
        `SELECT uid,employee_number employeeNumber FROM employees
         WHERE national_id_number=?${input.email ? ' OR LOWER(email)=LOWER(?)' : ''}
         LIMIT 1 FOR UPDATE`,
        input.email
          ? [input.nationalIdNumber, input.email]
          : [input.nationalIdNumber]
      )
      if (duplicateRows[0]) {
        throw new ApiError(
          409,
          duplicateRows[0].employeeNumber
            ? `NIK atau email sudah digunakan oleh karyawan ${String(duplicateRows[0].employeeNumber)}.`
            : 'NIK atau email sudah digunakan oleh karyawan lain.'
        )
      }

      const [sourceRows] = await conn.query<RowDataPacket[]>(
        `SELECT rcf.file_kind kind,f.storage_path storagePath,
          f.original_name originalName,f.mime_type mimeType,f.extension,
          f.size_bytes sizeBytes,f.checksum_sha256 checksumSha256
         FROM recruitment_candidate_files rcf JOIN files f ON f.id=rcf.file_id
         WHERE rcf.candidate_id=? AND f.visibility='INTERNAL'
         ORDER BY FIELD(rcf.file_kind,'PHOTO','KTP','KK') FOR UPDATE`,
        [candidate.id]
      )
      const sourceByKind = new Map(
        sourceRows.map((row) => [String(row.kind), row])
      )
      if (!['PHOTO', 'KTP', 'KK'].every((kind) => sourceByKind.has(kind))) {
        throw new ApiError(
          409,
          'Foto, KTP, atau KK kandidat belum lengkap. Konversi dibatalkan.'
        )
      }

      const sourceFiles = await Promise.all(
        ['PHOTO', 'KTP', 'KK'].map(async (kind) => {
          const source = sourceByKind.get(kind)!
          return {
            kind,
            source,
            body: await getPrivateRecruitmentObject(String(source.storagePath)),
          }
        })
      )
      const employeeUid = randomUUID()
      const preparedFiles = sourceFiles.map(({ kind, source, body }) => {
        const uid = randomUUID()
        const extension = String(source.extension || 'jpg')
        return {
          kind,
          source,
          body,
          uid,
          storedName: `${uid}.${extension}`,
          key: employeeRecruitmentObjectKey(employeeUid, uid, extension),
        }
      })
      // Maksimal tiga berkas. Upload berurutan membuat daftar kompensasi selalu
      // lengkap bila salah satu upload berikutnya gagal.
      for (const file of preparedFiles) {
        await putEmployeeRecruitmentObject({
          key: file.key,
          body: file.body,
          contentType: String(file.source.mimeType),
        })
        uploadedKeys.push(file.key)
      }

      const copiedFileIds = new Map<string, number>()
      for (const file of preparedFiles) {
        const [inserted] = await conn.execute<ResultSetHeader>(
          `INSERT INTO files
            (uid,storage_provider,storage_path,original_name,stored_name,
             mime_type,extension,size_bytes,checksum_sha256,visibility,
             uploaded_by,created_by,updated_by)
           VALUES (?,'S3',?,?,?,?,?,?,?,'INTERNAL',?,?,?)`,
          [
            file.uid,
            file.key,
            String(file.source.originalName),
            file.storedName,
            String(file.source.mimeType),
            String(file.source.extension || 'jpg'),
            file.body.length,
            file.source.checksumSha256 ||
              createHash('sha256').update(file.body).digest('hex'),
            auth.id,
            auth.id,
            auth.id,
          ]
        )
        copiedFileIds.set(file.kind, inserted.insertId)
      }

      const employeeNumber = await reserveEmployeeNumber(conn, {
        siteId: Number(refs.siteId),
        prefix: String(refs.employeeNumberPrefix),
        joinDate: input.joinDate,
      })
      const photoFileId = copiedFileIds.get('PHOTO')!
      const [employeeInsert] = await conn.execute<ResultSetHeader>(
        `INSERT INTO employees(
          uid,employee_number,employee_type_id,employee_status_id,current_site_id,
          current_department_id,current_position_id,current_work_group_id,
          current_production_module_section_id,full_name,nickname,national_id_number,
          family_card_number,gender,birth_place,birth_date,marital_status,religion,
          address,rtrw,kelurahan,kecamatan,city,province,postal_code,phone,email,
          emergency_contact_name,emergency_contact_phone,emergency_contact_relation,
          bank_name,bank_account_number,bank_account_name,tax_number,
          bpjs_health_number,bpjs_employment_number,join_date,join_date_training,
          join_date_borong,permanent_date,photo_file_id,notes,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          employeeUid,
          employeeNumber,
          refs.typeId,
          refs.statusId,
          refs.siteId,
          refs.departmentId,
          refs.positionId,
          refs.workGroupId,
          refs.productionModuleSectionId,
          input.fullName,
          empty(input.nickname),
          input.nationalIdNumber,
          input.familyCardNumber,
          input.gender,
          input.birthPlace,
          input.birthDate,
          empty(input.maritalStatus),
          empty(input.religion),
          input.address,
          empty(input.rtrw),
          empty(input.kelurahan),
          empty(input.kecamatan),
          empty(input.city),
          empty(input.province),
          empty(input.postalCode),
          input.phone,
          empty(input.email),
          empty(input.emergencyContactName),
          empty(input.emergencyContactPhone),
          empty(input.emergencyContactRelation),
          empty(input.bankName),
          empty(input.bankAccountNumber),
          empty(input.bankAccountName),
          empty(input.taxNumber),
          empty(input.bpjsHealthNumber),
          empty(input.bpjsEmploymentNumber),
          input.joinDate,
          input.joinDateTraining ?? null,
          input.joinDateBorong ?? null,
          input.permanentDate ?? null,
          photoFileId,
          empty(input.notes),
          auth.id,
          auth.id,
        ]
      )
      const historyUid = randomUUID()
      await conn.execute(
        `INSERT INTO employee_employment_histories(
          uid,employee_id,site_id,department_id,position_id,work_group_id,
          production_module_section_id,employee_type_id,employee_status_id,
          effective_from,change_type,notes,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,'INITIAL',?,?,?)`,
        [
          historyUid,
          employeeInsert.insertId,
          refs.siteId,
          refs.departmentId,
          refs.positionId,
          refs.workGroupId,
          refs.productionModuleSectionId,
          refs.typeId,
          refs.statusId,
          input.joinDate,
          'Penempatan awal dari proses rekrutmen.',
          auth.id,
          auth.id,
        ]
      )
      for (const kind of ['KTP', 'KK'] as const) {
        await conn.execute(
          `INSERT INTO employee_documents(
            uid,employee_id,document_type,document_number,name,file_id,status,
            notes,created_by,updated_by)
           VALUES (?,?,?,?,?,?,'ACTIVE',?,?,?)`,
          [
            randomUUID(),
            employeeInsert.insertId,
            kind,
            kind === 'KTP' ? input.nationalIdNumber : input.familyCardNumber,
            kind === 'KTP' ? 'Kartu Tanda Penduduk' : 'Kartu Keluarga',
            copiedFileIds.get(kind)!,
            'Disalin dari berkas Form Data Pelamar.',
            auth.id,
            auth.id,
          ]
        )
      }

      const [candidateUpdate] = await conn.execute<ResultSetHeader>(
        `UPDATE recruitment_candidates
         SET status='CONVERTED',employee_id=?,converted_at=CURRENT_TIMESTAMP(3),converted_by=?,
             status_changed_at=CURRENT_TIMESTAMP(3),updated_by=?
         WHERE id=? AND status='PASSED' AND employee_id IS NULL
           AND updated_at=STR_TO_DATE(?,'%Y-%m-%dT%H:%i:%s.%f')`,
        [
          employeeInsert.insertId,
          auth.id,
          auth.id,
          candidate.id,
          conversion.currentUpdatedAt,
        ]
      )
      if (candidateUpdate.affectedRows !== 1) {
        throw new ApiError(
          409,
          'Data kandidat sudah berubah. Muat ulang data terbaru sebelum melanjutkan.'
        )
      }
      const eventUid = randomUUID()
      await conn.execute(
        `INSERT INTO recruitment_status_events(
          uid,candidate_id,from_status,to_status,event_source,internal_notes,
          actor_user_id,idempotency_key,created_by)
         VALUES (?,?,'PASSED','CONVERTED','SYSTEM',?,?,?,?)`,
        [
          eventUid,
          candidate.id,
          `Dijadikan karyawan ${employeeNumber} oleh HR.`,
          auth.id,
          eventKey,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'EMPLOYEES',
          siteId: Number(candidate.siteId),
          action: 'CREATE',
          table: 'employees',
          recordId: employeeInsert.insertId,
          recordUid: employeeUid,
          description: `Membuat karyawan ${employeeNumber} dari proses rekrutmen.`,
          afterData: {
            employeeNumber,
            employeeStatus: 'INACTIVE',
            candidateUid,
          },
        },
        conn
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'RECRUITMENT',
          siteId: Number(candidate.siteId),
          action: 'UPDATE',
          table: 'recruitment_candidates',
          recordId: Number(candidate.id),
          recordUid: candidateUid,
          description: `Menjadikan kandidat sebagai karyawan ${employeeNumber}.`,
          beforeData: { status: 'PASSED' },
          afterData: {
            status: 'CONVERTED',
            employeeUid,
            employeeNumber,
          },
        },
        conn
      )
      commitAttempted = true
      await conn.commit()
      committed = true
      res.status(201).json({
        candidateUid,
        status: 'CONVERTED',
        employee: { uid: employeeUid, employeeNumber },
        eventUid,
        replayed: false,
      })
    } catch (error) {
      if (conn && !committed) await conn.rollback()
      // Bila COMMIT sudah dikirim tetapi koneksi putus, hasil database menjadi
      // ambigu. Pertahankan objek agar transaksi yang ternyata sukses tidak
      // menunjuk ke berkas yang sudah terhapus.
      if (!committed && !commitAttempted && uploadedKeys.length) {
        await Promise.allSettled(
          uploadedKeys.map((key) => deleteEmployeeRecruitmentObject(key))
        )
      }
      if (error instanceof EmployeeNumberSequenceExhaustedError) {
        next(new ApiError(422, error.message))
        return
      }
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        next(
          new ApiError(
            409,
            'NIK, email, atau nomor karyawan sudah digunakan. Muat ulang data dan periksa kembali.'
          )
        )
        return
      }
      next(error)
    } finally {
      conn?.release()
    }
  }
)

recruitmentRouter.get('/candidates', async (req, res, next) => {
  try {
    const input = listInput.parse(req.query)
    if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) {
      throw new ApiError(
        422,
        'Tanggal awal tidak boleh melewati tanggal akhir.'
      )
    }
    const selectedStatuses = csv(input.status)
    if (
      selectedStatuses.some(
        (value) => !statuses.includes(value as RecruitmentStatus)
      )
    ) {
      throw new ApiError(422, 'Filter status kandidat belum valid.')
    }
    const auth = res.locals.auth as AuthContext
    const access = candidateAccessQuery(auth)
    const commonWhere = [access.sql]
    const commonParams: unknown[] = [...access.params]
    const selectedSites = csv(input.site)
    if (selectedSites.length) {
      commonWhere.push(
        `(s.uid IN (${selectedSites.map(() => '?').join(',')}) OR s.code IN (${selectedSites.map(() => '?').join(',')}))`
      )
      commonParams.push(...selectedSites, ...selectedSites)
    }
    if (input.search) {
      const term = `%${input.search}%`
      commonWhere.push(
        '(rc.full_name LIKE ? OR rc.application_number LIKE ? OR rc.national_id_number LIKE ? OR rc.phone LIKE ?)'
      )
      commonParams.push(term, term, term, term)
    }
    if (input.dateFrom) {
      commonWhere.push('rc.submitted_at>=?')
      commonParams.push(`${input.dateFrom} 00:00:00`)
    }
    if (input.dateTo) {
      commonWhere.push('rc.submitted_at<DATE_ADD(?,INTERVAL 1 DAY)')
      commonParams.push(`${input.dateTo} 00:00:00`)
    }
    const listWhere = [...commonWhere]
    const listParams = [...commonParams]
    if (selectedStatuses.length) {
      listWhere.push(
        `rc.status IN (${selectedStatuses.map(() => '?').join(',')})`
      )
      listParams.push(...selectedStatuses)
    }
    const predicate = listWhere.join(' AND ')
    const commonPredicate = commonWhere.join(' AND ')
    const orderColumns = {
      submittedAt: 'rc.submitted_at',
      statusChangedAt: 'rc.status_changed_at',
      fullName: 'rc.full_name',
      status: 'rc.status',
      site: 's.name',
      applicationNumber: 'rc.application_number',
    } as const
    const [countResult, rowsResult, summaryResult] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total FROM recruitment_candidates rc JOIN sites s ON s.id=rc.site_id WHERE ${predicate}`,
        listParams
      ),
      pool.query<RowDataPacket[]>(
        `SELECT rc.uid,rc.application_number applicationNumber,rc.full_name fullName,
          rc.national_id_number nationalIdNumber,rc.phone,rc.status,
          ${candidateDate('rc', 'submitted_at')} submittedAt,
          ${candidateDate('rc', 'status_changed_at')} statusChangedAt,
          s.uid siteUid,s.code siteCode,s.name siteName
         FROM recruitment_candidates rc JOIN sites s ON s.id=rc.site_id
         WHERE ${predicate}
         ORDER BY ${orderColumns[input.sortBy]} ${input.sortDirection.toUpperCase()},rc.id DESC
         LIMIT ? OFFSET ?`,
        [...listParams, input.pageSize, (input.page - 1) * input.pageSize]
      ),
      pool.query<RowDataPacket[]>(
        `SELECT
          SUM(rc.status='NEW') newCount,
          SUM(rc.status='IN_PROGRESS') inProgressCount,
          SUM(rc.status='PASSED' AND rc.employee_id IS NULL) passedNotConvertedCount
         FROM recruitment_candidates rc JOIN sites s ON s.id=rc.site_id
         WHERE ${commonPredicate}`,
        commonParams
      ),
    ])
    res.json({
      data: rowsResult[0].map((row) => ({
        uid: String(row.uid),
        applicationNumber: String(row.applicationNumber),
        fullName: String(row.fullName),
        nationalIdMasked: maskedNik(row.nationalIdNumber),
        phone: String(row.phone),
        status: String(row.status),
        submittedAt: row.submittedAt,
        statusChangedAt: row.statusChangedAt,
        site: {
          uid: String(row.siteUid),
          code: String(row.siteCode),
          name: String(row.siteName),
        },
      })),
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        total: Number(countResult[0][0]?.total ?? 0),
      },
      summary: {
        new: Number(summaryResult[0][0]?.newCount ?? 0),
        inProgress: Number(summaryResult[0][0]?.inProgressCount ?? 0),
        passedNotConverted: Number(
          summaryResult[0][0]?.passedNotConvertedCount ?? 0
        ),
      },
    })
  } catch (error) {
    next(error)
  }
})

recruitmentRouter.get('/candidates/:uid', async (req, res, next) => {
  try {
    const uid = z.string().uuid().parse(req.params.uid)
    const auth = res.locals.auth as AuthContext
    const access = candidateAccessQuery(auth)
    const [rows] = await pool.query<RowDataPacket[]>(
      `${candidateBaseSelect} WHERE rc.uid=? AND ${access.sql} LIMIT 1`,
      [uid, ...access.params]
    )
    const candidate = rows[0]
    if (!candidate) throw new ApiError(404, 'Kandidat tidak ditemukan.')
    const [fileResult, historyResult] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT f.uid,rcf.file_kind kind,f.original_name originalName,
          f.mime_type mimeType,f.size_bytes sizeBytes
         FROM recruitment_candidate_files rcf
         JOIN files f ON f.id=rcf.file_id
         WHERE rcf.candidate_id=? ORDER BY FIELD(rcf.file_kind,'PHOTO','KTP','KK')`,
        [candidate.id]
      ),
      pool.query<RowDataPacket[]>(
        `SELECT rse.uid,rse.from_status fromStatus,rse.to_status toStatus,
          rse.event_source eventSource,rse.applicant_reason applicantReason,
          rse.internal_notes internalNotes,
          ${candidateDate('rse', 'occurred_at')} occurredAt,
          u.uid actorUid,u.full_name actorName
         FROM recruitment_status_events rse
         LEFT JOIN users u ON u.id=rse.actor_user_id
         WHERE rse.candidate_id=? ORDER BY rse.occurred_at DESC,rse.id DESC`,
        [candidate.id]
      ),
    ])
    const manageable = canManage(auth)
    const status = String(candidate.status) as RecruitmentStatus
    res.json({
      uid: String(candidate.uid),
      applicationNumber: String(candidate.applicationNumber),
      fullName: String(candidate.fullName),
      nationalIdMasked: maskedNik(candidate.nationalIdNumber),
      nationalIdNumber: String(candidate.nationalIdNumber),
      familyCardNumber: String(candidate.familyCardNumber),
      gender: String(candidate.gender),
      birthPlace: String(candidate.birthPlace),
      birthDate: String(candidate.birthDate),
      address: String(candidate.address),
      phone: String(candidate.phone),
      email: candidate.email ? String(candidate.email) : null,
      privacyConsentAt: candidate.privacyConsentAt,
      privacyNoticeVersion: String(candidate.privacyNoticeVersion),
      status,
      applicantRejectionReason: candidate.applicantRejectionReason
        ? String(candidate.applicantRejectionReason)
        : null,
      internalNotes: candidate.internalNotes
        ? String(candidate.internalNotes)
        : null,
      submittedAt: candidate.submittedAt,
      statusChangedAt: candidate.statusChangedAt,
      updatedAt: candidate.updatedAt,
      convertedAt: candidate.convertedAt,
      employeeUid: candidate.employeeUid ? String(candidate.employeeUid) : null,
      site: {
        uid: String(candidate.siteUid),
        code: String(candidate.siteCode),
        name: String(candidate.siteName),
      },
      files: fileResult[0].map((row) => ({
        uid: String(row.uid),
        kind: String(row.kind),
        originalName: String(row.originalName),
        mimeType: String(row.mimeType),
        sizeBytes: Number(row.sizeBytes),
      })),
      statusHistory: historyResult[0].map((row) => ({
        uid: String(row.uid),
        fromStatus: row.fromStatus ? String(row.fromStatus) : null,
        toStatus: String(row.toStatus),
        eventSource: String(row.eventSource),
        applicantReason: row.applicantReason
          ? String(row.applicantReason)
          : null,
        internalNotes: row.internalNotes ? String(row.internalNotes) : null,
        occurredAt: row.occurredAt,
        actorName: row.actorUid ? String(row.actorName) : null,
      })),
      canManage: manageable,
      allowedTransitions: allowedFor(status, manageable),
    })
  } catch (error) {
    next(error)
  }
})

recruitmentRouter.get(
  '/candidates/:uid/files/:fileUid',
  async (req, res, next) => {
    try {
      const candidateUid = z.string().uuid().parse(req.params.uid)
      const fileUid = z.string().uuid().parse(req.params.fileUid)
      const auth = res.locals.auth as AuthContext
      const access = candidateAccessQuery(auth)
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT rc.id candidateId,rc.site_id siteId,rc.uid candidateUid,
        f.uid fileUid,f.storage_path storagePath,f.original_name originalName,
        f.mime_type mimeType,rcf.file_kind fileKind
       FROM recruitment_candidates rc
       JOIN sites s ON s.id=rc.site_id
       JOIN recruitment_candidate_files rcf ON rcf.candidate_id=rc.id
       JOIN files f ON f.id=rcf.file_id
       WHERE rc.uid=? AND f.uid=? AND f.visibility='INTERNAL' AND ${access.sql}
       LIMIT 1`,
        [candidateUid, fileUid, ...access.params]
      )
      const file = rows[0]
      if (!file) throw new ApiError(404, 'Dokumen kandidat tidak ditemukan.')
      const body = await getPrivateRecruitmentObject(String(file.storagePath))
      await writeAudit({
        auth,
        request: req,
        module: 'RECRUITMENT',
        siteId: Number(file.siteId),
        action: 'OTHER',
        table: 'files',
        recordUid: String(file.fileUid),
        description: `Membuka dokumen ${String(file.fileKind)} kandidat.`,
        afterData: {
          candidateUid: String(file.candidateUid),
          fileKind: String(file.fileKind),
        },
      })
      const safeName = String(file.originalName).replace(/[\r\n"\\/]/g, '_')
      res.set({
        'Content-Type': String(file.mimeType),
        'Content-Length': String(body.length),
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      })
      res.send(body)
    } catch (error) {
      next(error)
    }
  }
)

recruitmentRouter.post(
  '/candidates/:uid/status',
  requirePermission('recruitment.manage'),
  async (req, res, next) => {
    let conn: PoolConnection | undefined
    try {
      const candidateUid = z.string().uuid().parse(req.params.uid)
      const input = transitionInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const access = candidateAccessQuery(auth)
      const eventKey = `internal:${createHash('sha256')
        .update(`${candidateUid}|${auth.uid}|${input.idempotencyKey}`)
        .digest('hex')}`
      conn = await pool.getConnection()
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(
        `${candidateBaseSelect} WHERE rc.uid=? AND ${access.sql} LIMIT 1 FOR UPDATE`,
        [candidateUid, ...access.params]
      )
      const candidate = rows[0]
      if (!candidate) throw new ApiError(404, 'Kandidat tidak ditemukan.')
      const [replayRows] = await conn.query<RowDataPacket[]>(
        `SELECT rse.uid eventUid,rse.from_status fromStatus,rse.to_status toStatus,
          rse.applicant_reason applicantReason,rse.internal_notes internalNotes,
          ${candidateDate('rse', 'occurred_at')} occurredAt,rc.uid candidateUid
         FROM recruitment_status_events rse
         JOIN recruitment_candidates rc ON rc.id=rse.candidate_id
         WHERE rse.idempotency_key=? LIMIT 1 FOR UPDATE`,
        [eventKey]
      )
      const replay = replayRows[0]
      if (replay) {
        const same =
          String(replay.candidateUid) === candidateUid &&
          replay.fromStatus === input.currentStatus &&
          replay.toStatus === input.toStatus &&
          (replay.applicantReason ?? null) ===
            (input.applicantReason ?? null) &&
          (replay.internalNotes ?? null) === (input.internalNotes ?? null)
        if (!same)
          throw new ApiError(
            409,
            'Permintaan yang sama berisi perubahan berbeda.'
          )
        await conn.commit()
        res.json({
          uid: candidateUid,
          status: String(replay.toStatus),
          statusChangedAt: replay.occurredAt,
          eventUid: String(replay.eventUid),
          replayed: true,
        })
        return
      }
      const currentStatus = String(candidate.status) as RecruitmentStatus
      if (currentStatus !== input.currentStatus) {
        throw new ApiError(
          409,
          'Status kandidat sudah berubah. Muat ulang data terbaru.'
        )
      }
      if (!(allowedTransitions[currentStatus] ?? []).includes(input.toStatus)) {
        throw new ApiError(
          422,
          'Perubahan status kandidat tidak diperbolehkan.'
        )
      }
      const eventUid = randomUUID()
      const [updated] = await conn.execute<ResultSetHeader>(
        `UPDATE recruitment_candidates
         SET status=?,applicant_rejection_reason=?,status_changed_at=CURRENT_TIMESTAMP(3),
             updated_by=?
         WHERE id=? AND status=?`,
        [
          input.toStatus,
          input.toStatus === 'REJECTED' ? input.applicantReason : null,
          auth.id,
          candidate.id,
          input.currentStatus,
        ]
      )
      if (updated.affectedRows !== 1) {
        throw new ApiError(
          409,
          'Status kandidat sudah berubah. Muat ulang data terbaru.'
        )
      }
      await conn.execute(
        `INSERT INTO recruitment_status_events
          (uid,candidate_id,from_status,to_status,event_source,applicant_reason,
           internal_notes,actor_user_id,idempotency_key,created_by)
         VALUES (?,?,?,?,'HR_USER',?,?,?,?,?)`,
        [
          eventUid,
          candidate.id,
          input.currentStatus,
          input.toStatus,
          input.toStatus === 'REJECTED' ? input.applicantReason : null,
          input.internalNotes ?? null,
          auth.id,
          eventKey,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'RECRUITMENT',
          siteId: Number(candidate.siteId),
          action: input.toStatus === 'REJECTED' ? 'REJECT' : 'UPDATE',
          table: 'recruitment_candidates',
          recordId: Number(candidate.id),
          recordUid: candidateUid,
          description: `Mengubah status kandidat dari ${statusLabels[input.currentStatus]} menjadi ${statusLabels[input.toStatus]}.`,
          beforeData: { status: input.currentStatus },
          afterData: { status: input.toStatus },
        },
        conn
      )
      const [changedRows] = await conn.query<RowDataPacket[]>(
        `SELECT ${candidateDate('rc', 'status_changed_at')} statusChangedAt
         FROM recruitment_candidates rc WHERE rc.id=?`,
        [candidate.id]
      )
      await conn.commit()
      res.json({
        uid: candidateUid,
        status: input.toStatus,
        statusChangedAt: changedRows[0]?.statusChangedAt,
        eventUid,
        replayed: false,
      })
    } catch (error) {
      if (conn) await conn.rollback()
      next(error)
    } finally {
      conn?.release()
    }
  }
)

recruitmentRouter.patch(
  '/candidates/:uid/internal-notes',
  requirePermission('recruitment.manage'),
  async (req, res, next) => {
    let conn: PoolConnection | undefined
    try {
      const candidateUid = z.string().uuid().parse(req.params.uid)
      const input = notesInput.parse(req.body)
      const normalizedNotes = input.internalNotes || null
      const auth = res.locals.auth as AuthContext
      const access = candidateAccessQuery(auth)
      conn = await pool.getConnection()
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(
        `${candidateBaseSelect} WHERE rc.uid=? AND ${access.sql} LIMIT 1 FOR UPDATE`,
        [candidateUid, ...access.params]
      )
      const candidate = rows[0]
      if (!candidate) throw new ApiError(404, 'Kandidat tidak ditemukan.')
      if (candidate.updatedAt !== input.currentUpdatedAt) {
        throw new ApiError(
          409,
          'Data kandidat sudah berubah. Muat ulang data terbaru.'
        )
      }
      if ((candidate.internalNotes ?? null) === normalizedNotes) {
        await conn.commit()
        res.json({
          uid: candidateUid,
          internalNotes: normalizedNotes,
          updatedAt: candidate.updatedAt,
        })
        return
      }
      const [updated] = await conn.execute<ResultSetHeader>(
        `UPDATE recruitment_candidates SET internal_notes=?,updated_by=?
         WHERE id=? AND updated_at=STR_TO_DATE(?,'%Y-%m-%dT%H:%i:%s.%f')`,
        [normalizedNotes, auth.id, candidate.id, input.currentUpdatedAt]
      )
      if (updated.affectedRows !== 1) {
        throw new ApiError(
          409,
          'Data kandidat sudah berubah. Muat ulang data terbaru.'
        )
      }
      await writeAudit(
        {
          auth,
          request: req,
          module: 'RECRUITMENT',
          siteId: Number(candidate.siteId),
          action: 'UPDATE',
          table: 'recruitment_candidates',
          recordId: Number(candidate.id),
          recordUid: candidateUid,
          description: 'Memperbarui catatan internal kandidat.',
          beforeData: { hadInternalNotes: Boolean(candidate.internalNotes) },
          afterData: { hasInternalNotes: Boolean(normalizedNotes) },
        },
        conn
      )
      const [changedRows] = await conn.query<RowDataPacket[]>(
        `SELECT ${candidateDate('rc', 'updated_at')} updatedAt FROM recruitment_candidates rc WHERE rc.id=?`,
        [candidate.id]
      )
      await conn.commit()
      res.json({
        uid: candidateUid,
        internalNotes: normalizedNotes,
        updatedAt: changedRows[0]?.updatedAt,
      })
    } catch (error) {
      if (conn) await conn.rollback()
      next(error)
    } finally {
      conn?.release()
    }
  }
)
