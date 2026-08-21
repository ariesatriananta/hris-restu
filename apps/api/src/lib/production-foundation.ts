import { z } from 'zod'

export const productionSiteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])

export const productionAssignmentReadinessIssue = z.enum([
  'ALL',
  'UNASSIGNED',
  'MISSING_PRIMARY',
  'AMBIGUOUS_PRIMARY',
  'READY',
])

export const productionEligibleEmployeeType = z.enum(['BORONGAN', 'TRAINING'])

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || undefined)

export const workUnitInput = z
  .object({
    code: z.string().trim().min(1).max(30),
    name: z.string().trim().min(1).max(100),
    decimalPrecision: z.coerce.number().int().min(0).max(4).default(0),
    isActive: z.boolean().default(true),
  })
  .strict()

export const productionJobInput = z
  .object({
    code: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(150),
    description: nullableText(500),
    defaultUnitUid: z.string().uuid(),
    positionUid: z.string().uuid().optional().nullable(),
    category: nullableText(50),
    isActive: z.boolean().default(true),
  })
  .strict()

export const productionRateInput = z
  .object({
    site: productionSiteCode,
    jobUid: z.string().uuid(),
    unitUid: z.string().uuid(),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().optional().nullable(),
    rateAmount: z.union([z.string(), z.number()]).transform(String),
    referenceNumber: nullableText(100),
    notes: nullableText(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Tanggal selesai tidak boleh mendahului tanggal mulai.',
      })
    }
    if (!/^\d+(\.\d{1,4})?$/.test(value.rateAmount)) {
      context.addIssue({
        code: 'custom',
        path: ['rateAmount'],
        message: 'Tarif maksimal memiliki empat angka desimal.',
      })
    }
  })

export const rateActivationInput = z
  .object({
    replaceActiveRateUid: z.string().uuid().optional().nullable(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict()

export const productionAssignmentInput = z
  .object({
    employeeUid: z.string().uuid(),
    jobUid: z.string().uuid(),
    site: productionSiteCode,
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().optional().nullable(),
    isPrimary: z.boolean().default(true),
    reason: z.string().trim().min(10).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Tanggal selesai tidak boleh mendahului tanggal mulai.',
      })
    }
  })

export const closeProductionAssignmentInput = z
  .object({
    effectiveTo: z.string().date(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict()

export const productionAssignmentCorrectionInput = z
  .object({
    jobUid: z.string().uuid(),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().optional().nullable(),
    isPrimary: z.boolean(),
    reason: z.string().trim().min(10).max(500),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'Tanggal selesai tidak boleh mendahului tanggal mulai.' })
    }
  })

export const productionRateExceptionInput = z.object({
  reason: z.string().trim().min(10).max(500),
  idempotencyKey: z.string().uuid(),
}).strict()

export const productionActiveRateCorrectionInput = productionRateExceptionInput.extend({
  rateAmount: z.union([z.string(), z.number()]).transform(String),
  effectiveTo: z.string().date().optional().nullable(),
  referenceNumber: nullableText(100),
  notes: nullableText(500),
}).strict().refine((value) => /^\d+(\.\d{1,4})?$/.test(value.rateAmount), {
  path: ['rateAmount'], message: 'Tarif maksimal memiliki empat angka desimal.',
})

export function pageParams(page: unknown, pageSize: unknown) {
  const parsedPage = Number(page ?? 1)
  const parsedPageSize = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize:
      Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(500, parsedPageSize)
        : 50,
  }
}

export function csvValues(value: unknown) {
  const input = Array.isArray(value) ? value.join(',') : String(value ?? '')
  return [...new Set(input.split(',').map((item) => item.trim()).filter(Boolean))]
}

export function booleanFilter(value: unknown) {
  const values = csvValues(value).filter(
    (item) => item === 'true' || item === 'false'
  )
  return values.length === 1 ? (values[0] === 'true' ? 1 : 0) : undefined
}

export function assignmentStatusSql(alias = 'a') {
  return `CASE
    WHEN ${alias}.status='CANCELLED' THEN 'CANCELLED'
    WHEN ${alias}.effective_from>CURDATE() THEN 'UPCOMING'
    WHEN ${alias}.effective_to IS NOT NULL AND ${alias}.effective_to<CURDATE() THEN 'ENDED'
    ELSE 'ACTIVE'
  END`
}
