import { Router, type RequestHandler } from 'express'
import multer, { MulterError } from 'multer'
import { z } from 'zod'
import { ApiError } from '../lib/errors.js'
import { educationLevelSchema } from '../lib/education-level.js'
import { sanitizeRecruitmentImage } from '../lib/recruitment-images.js'
import {
  assertPublicRecruitmentConfigured,
  recruitmentSiteCodeFromToken,
} from '../lib/recruitment-public-config.js'
import {
  checkRecruitmentEligibility,
  createRecruitmentSubmission,
  findPublicRecruitmentSite,
  publicRecruitmentConfig,
  type PublicSite,
  type RecruitmentFileKind,
} from '../lib/recruitment-public-service.js'
import { createPublicRateLimit } from '../lib/recruitment-rate-limit.js'
import { verifyRecruitmentTurnstile } from '../lib/recruitment-turnstile.js'

const PRIVACY_NOTICE_VERSION = 'recruitment-privacy-v1'
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 3,
    fields: 2,
    fieldSize: 64 * 1024,
    parts: 5,
  },
  fileFilter: (_req, file, callback) =>
    callback(null, allowedMimeTypes.has(file.mimetype)),
})

const identitySchema = z.object({
  nationalIdNumber: z.string().regex(/^\d{16}$/),
  familyCardNumber: z.string().regex(/^\d{16}$/),
  birthDate: z
    .string()
    .date()
    .refine(
      (value) => new Date(`${value}T00:00:00.000Z`).getTime() <= Date.now(),
      'Tanggal lahir tidak valid.'
    ),
  turnstileToken: z.string().min(1).optional(),
})

const submissionSchema = identitySchema.omit({ turnstileToken: true }).extend({
  fullName: z.string().trim().min(2).max(150),
  gender: z.enum(['MALE', 'FEMALE']),
  birthPlace: z.string().trim().min(2).max(100),
  educationLevel: educationLevelSchema,
  address: z.string().trim().min(5).max(2_000),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s().-]/g, ''))
    .pipe(z.string().regex(/^\+?\d{8,15}$/)),
  email: z
    .union([z.email().max(191), z.literal(''), z.null()])
    .optional()
    .transform((value) => value || undefined),
  privacyConsent: z.literal(true),
  privacyNoticeVersion: z.literal(PRIVACY_NOTICE_VERSION),
  idempotencyKey: z.uuid(),
})

const configLimit = createPublicRateLimit({
  namespace: 'recruitment-config',
  windowMs: 60_000,
  limit: 60,
})
const checkLimit = createPublicRateLimit({
  namespace: 'recruitment-check',
  windowMs: 15 * 60_000,
  limit: 10,
})
const submitLimit = createPublicRateLimit({
  namespace: 'recruitment-submit',
  windowMs: 60 * 60_000,
  limit: 5,
})

export const publicRecruitmentRouter = Router()

function token(req: Parameters<RequestHandler>[0]) {
  const raw = req.params.siteToken
  return Array.isArray(raw) ? raw[0] ?? '' : raw ?? ''
}

async function resolveSite(siteToken: string) {
  assertPublicRecruitmentConfigured()
  const siteCode = recruitmentSiteCodeFromToken(siteToken)
  if (!siteCode) throw new ApiError(404, 'Tautan Form Data Pelamar tidak valid.')
  const site = await findPublicRecruitmentSite(siteCode)
  if (!site) throw new ApiError(404, 'Tautan Form Data Pelamar tidak valid.')
  return site
}

function multipartUpload(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2]) {
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'ktp', maxCount: 1 },
    { name: 'kk', maxCount: 1 },
  ])(req, res, (error) => {
    if (error instanceof MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Ukuran setiap foto maksimal 5 MB.'
          : 'Lampiran harus berisi tepat satu foto diri, KTP, dan KK.'
      return next(new ApiError(422, message))
    }
    if (error) return next(new ApiError(422, 'Lampiran foto tidak valid.'))
    next()
  })
}

function fileFromRequest(
  req: Parameters<RequestHandler>[0],
  field: 'photo' | 'ktp' | 'kk'
) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined
  return files?.[field]?.[0]
}

publicRecruitmentRouter.get('/:siteToken/config', configLimit, async (req, res, next) => {
  try {
    const site = await resolveSite(token(req))
    res.json(await publicRecruitmentConfig(site))
  } catch (error) {
    next(error)
  }
})

publicRecruitmentRouter.post('/:siteToken/check', checkLimit, async (req, res, next) => {
  try {
    const site = await resolveSite(token(req))
    const input = identitySchema.parse(req.body)
    await verifyRecruitmentTurnstile({
      token: input.turnstileToken,
      remoteIp: req.ip,
      expectedAction: 'recruitment-check',
    })
    res.json(
      await checkRecruitmentEligibility({
        siteId: site.id,
        nationalIdNumber: input.nationalIdNumber,
        familyCardNumber: input.familyCardNumber,
        birthDate: input.birthDate,
      })
    )
  } catch (error) {
    next(error)
  }
})

const verifySubmitTurnstile: RequestHandler = async (req, _res, next) => {
  try {
    await verifyRecruitmentTurnstile({
      token: req.get('x-turnstile-token'),
      remoteIp: req.ip,
      expectedAction: 'recruitment-submit',
    })
    next()
  } catch (error) {
    next(error)
  }
}

const resolveSubmitSite: RequestHandler = async (req, res, next) => {
  try {
    res.locals.recruitmentSite = await resolveSite(token(req))
    next()
  } catch (error) {
    next(error)
  }
}

publicRecruitmentRouter.post(
  '/:siteToken/submit',
  submitLimit,
  resolveSubmitSite,
  verifySubmitTurnstile,
  multipartUpload,
  async (req, res, next) => {
    try {
      const site = res.locals.recruitmentSite as PublicSite
      if (typeof req.body.payload !== 'string') {
        throw new ApiError(422, 'Data pelamar belum lengkap.')
      }
      let rawPayload: unknown
      try {
        rawPayload = JSON.parse(req.body.payload)
      } catch {
        throw new ApiError(422, 'Data pelamar belum valid.')
      }
      const submission = submissionSchema.parse(rawPayload)
      const rawFiles = {
        PHOTO: fileFromRequest(req, 'photo'),
        KTP: fileFromRequest(req, 'ktp'),
        KK: fileFromRequest(req, 'kk'),
      }
      if (!rawFiles.PHOTO || !rawFiles.KTP || !rawFiles.KK) {
        throw new ApiError(
          422,
          'Foto diri, foto KTP, dan foto KK masing-masing wajib diisi.'
        )
      }
      const sanitizedEntries = await Promise.all(
        (Object.entries(rawFiles) as [RecruitmentFileKind, Express.Multer.File][]).map(
          async ([kind, file]) => [kind, await sanitizeRecruitmentImage(file)] as const
        )
      )
      const result = await createRecruitmentSubmission({
        site,
        submission,
        files: Object.fromEntries(sanitizedEntries) as Parameters<
          typeof createRecruitmentSubmission
        >[0]['files'],
      })
      res.status(result.replayed ? 200 : 201).json({
        applicationNumber: result.applicationNumber,
        message: result.replayed
          ? 'Pendaftaran sebelumnya sudah diterima.'
          : 'Pendaftaran berhasil diterima.',
      })
    } catch (error) {
      next(error)
    }
  }
)
