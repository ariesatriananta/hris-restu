import { createHash, randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Router, type RequestHandler } from 'express'
import multer from 'multer'
import type { ResultSetHeader } from 'mysql2'
import { env } from '../config.js'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { matchesAttendanceAttachmentSignature } from '../lib/attendance-classification-policy.js'
import { matchesCompanyLogoSignature } from '../lib/company-settings.js'
import { ApiError } from '../lib/errors.js'
import { authenticate, type AuthContext } from '../middleware/authenticate.js'

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})
const allowed = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) =>
    callback(null, allowed.has(file.mimetype)),
})

export const filesRouter = Router()

const mayUpload: RequestHandler = (_req, res, next) => {
  const auth = res.locals.auth as AuthContext
  if (
    auth.roles.includes('SUPER_ADMIN') ||
    auth.permissions.includes('employees.manage') ||
    auth.permissions.includes('documents.manage') ||
    (auth.roles.includes('HR_OFFICER') &&
      auth.permissions.includes('attendance.correct'))
  ) {
    return next()
  }
  return next(new ApiError(403, 'Anda tidak memiliki izin untuk mengunggah file.'))
}

filesRouter.post(
  '/',
  authenticate,
  mayUpload,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new ApiError(400, 'File wajib diisi dan formatnya harus didukung.')
      }
      const auth = res.locals.auth as AuthContext
      const requestedPurpose = String(req.body.purpose ?? '').trim()
      if (
        requestedPurpose &&
        !['ATTENDANCE_CLASSIFICATION', 'COMPANY_LOGO'].includes(
          requestedPurpose
        )
      ) {
        throw new ApiError(422, 'Tujuan upload file tidak didukung.')
      }
      const purpose = requestedPurpose || undefined
      const attendanceOnly =
        !auth.roles.includes('SUPER_ADMIN') &&
        !auth.permissions.includes('employees.manage') &&
        !auth.permissions.includes('documents.manage')

      if (attendanceOnly && purpose !== 'ATTENDANCE_CLASSIFICATION') {
        throw new ApiError(
          403,
          'Upload Attendance wajib menyertakan purpose yang valid.'
        )
      }
      if (
        purpose === 'ATTENDANCE_CLASSIFICATION' &&
        !auth.roles.includes('SUPER_ADMIN') &&
        (!auth.roles.includes('HR_OFFICER') ||
          !auth.permissions.includes('attendance.correct'))
      ) {
        throw new ApiError(
          403,
          'Anda tidak memiliki izin mengunggah lampiran Attendance.'
        )
      }
      if (
        purpose === 'ATTENDANCE_CLASSIFICATION' &&
        !matchesAttendanceAttachmentSignature(
          req.file.buffer,
          req.file.mimetype
        )
      ) {
        throw new ApiError(
          422,
          'Lampiran Attendance hanya mendukung image atau PDF yang valid.'
        )
      }
      if (
        purpose === 'COMPANY_LOGO' &&
        (!auth.roles.includes('SUPER_ADMIN') ||
          !auth.permissions.includes('settings.manage'))
      ) {
        throw new ApiError(
          403,
          'Logo perusahaan hanya dapat dikelola oleh Super Admin.'
        )
      }
      if (
        purpose === 'COMPANY_LOGO' &&
        !matchesCompanyLogoSignature(req.file.buffer, req.file.mimetype)
      ) {
        throw new ApiError(
          422,
          'Logo perusahaan hanya mendukung JPG, PNG, atau WebP yang valid.'
        )
      }

      const employeeKey =
        typeof req.body.employeeKey === 'string' &&
        /^[a-zA-Z0-9_-]{1,100}$/.test(req.body.employeeKey)
          ? req.body.employeeKey
          : undefined
      const uid = randomUUID()
      const extension = extname(req.file.originalname)
        .replace('.', '')
        .toLowerCase()
      const storedName = `${uid}${extension ? `.${extension}` : ''}`
      const prefix = env.R2_KEY_PREFIX.replace(/\/?$/, '/')
      const folder =
        purpose === 'ATTENDANCE_CLASSIFICATION'
          ? 'attendance-classifications/'
          : purpose === 'COMPANY_LOGO'
            ? 'settings/company-logo/'
            : employeeKey
              ? `employees/${employeeKey}/`
              : ''
      const key = `${prefix}${folder}${storedName}`

      await client.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      )
      const checksum = createHash('sha256')
        .update(req.file.buffer)
        .digest('hex')
      const [inserted] = await pool.execute<ResultSetHeader>(
        `INSERT INTO files
           (uid,storage_provider,storage_path,original_name,stored_name,
            mime_type,extension,size_bytes,checksum_sha256,visibility,
            uploaded_by,created_by,updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,'INTERNAL',?,?,?)`,
        [
          uid,
          'S3',
          key,
          req.file.originalname,
          storedName,
          req.file.mimetype,
          extension || null,
          req.file.size,
          checksum,
          auth.id,
          auth.id,
          auth.id,
        ]
      )
      await writeAudit({
        auth,
        request: req,
        module:
          purpose === 'ATTENDANCE_CLASSIFICATION'
            ? 'ATTENDANCE'
            : purpose === 'COMPANY_LOGO'
              ? 'SETTINGS'
              : undefined,
        action: 'CREATE',
        table: 'files',
        recordId: inserted.insertId,
        recordUid: uid,
        description:
          purpose === 'COMPANY_LOGO'
            ? 'Mengunggah logo perusahaan.'
            : `Mengunggah file ${req.file.originalname}.`,
      })
      res.status(201).json({
        uid,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        extension: extension || undefined,
        url: `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`,
      })
    } catch (error) {
      next(error)
    }
  }
)
