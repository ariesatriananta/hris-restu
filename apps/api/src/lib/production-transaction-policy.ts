import { z } from 'zod'
import { ApiError } from './errors.js'

const decimalInput = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+(?:\.\d{1,4})?$/.test(value), {
    message: 'Kuantitas maksimal memiliki empat angka desimal.',
  })

export const productionTerminalLookupInput = z
  .object({ barcode: z.string().trim().min(1).max(100) })
  .strict()

export const productionTerminalPostInput = z
  .object({
    barcode: z.string().trim().min(1).max(100),
    jobUid: z.string().uuid(),
    quantity: decimalInput,
    idempotencyKey: z.string().uuid(),
  })
  .strict()

const historicalBase = z.object({
  employeeUid: z.string().uuid(),
  site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
  businessDate: z.string().date(),
  jobUid: z.string().uuid(),
  quantity: decimalInput,
})

export const productionHistoricalPreviewInput = historicalBase.strict()

export const productionHistoricalPostInput = historicalBase
  .extend({
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: z.string().uuid(),
  })
  .strict()

export const productionCorrectionPreviewInput = z
  .object({
    employeeUid: z.string().uuid().optional(),
    jobUid: z.string().uuid(),
    quantity: decimalInput,
  })
  .strict()

export const productionCorrectionInput = productionCorrectionPreviewInput
  .extend({
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: z.string().uuid(),
  })
  .strict()

export const productionVoidPreviewInput = z.object({}).strict()

export const productionVoidInput = z
  .object({
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: z.string().uuid(),
  })
  .strict()

export function normalizeQuantity(value: string, precision: number) {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value)
  if (!match) throw new ApiError(422, 'Kuantitas tidak valid.')
  const integer = match[1]
  const fraction = match[2] ?? ''
  if (integer.length > 14 || Number(precision) < 0 || Number(precision) > 4) {
    throw new ApiError(422, 'Kuantitas melebihi batas yang diizinkan.')
  }
  if (fraction.length > Number(precision)) {
    throw new ApiError(
      422,
      `Kuantitas hanya boleh memiliki ${precision} angka desimal untuk satuan ini.`
    )
  }
  const normalizedInteger = integer.replace(/^0+(?=\d)/, '') || '0'
  const normalizedFraction = fraction.padEnd(4, '0')
  if (BigInt(`${normalizedInteger}${normalizedFraction}`) <= 0n) {
    throw new ApiError(422, 'Kuantitas harus lebih besar dari nol.')
  }
  return `${normalizedInteger}.${normalizedFraction}`
}

function decimalToScaled(value: string, scale: number) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value)
  if (!match) throw new ApiError(500, 'Snapshot nominal Produksi tidak valid.')
  return BigInt(`${match[1]}${(match[2] ?? '').padEnd(scale, '0').slice(0, scale)}`)
}

export function calculateGrossAmount(quantity: string, rate: string) {
  const productScale8 = decimalToScaled(quantity, 4) * decimalToScaled(rate, 4)
  const roundedScale2 = (productScale8 + 500_000n) / 1_000_000n
  const integer = roundedScale2 / 100n
  const fraction = String(roundedScale2 % 100n).padStart(2, '0')
  if (String(integer).length > 16) {
    throw new ApiError(422, 'Nilai bruto setoran melebihi batas yang diizinkan.')
  }
  return `${integer}.${fraction}`
}

export function normalizeStoredDecimal(value: unknown, scale = 4) {
  const raw = String(value ?? '0')
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw)
  if (!match) return raw
  return `${match[1].replace(/^0+(?=\d)/, '') || '0'}.${(match[2] ?? '')
    .padEnd(scale, '0')
    .slice(0, scale)}`
}

export function subtractDecimal(left: string, right: string, scale: number) {
  const difference = decimalToScaled(left, scale) - decimalToScaled(right, scale)
  const sign = difference < 0n ? '-' : ''
  const absolute = difference < 0n ? -difference : difference
  const divisor = 10n ** BigInt(scale)
  return `${sign}${absolute / divisor}.${String(absolute % divisor).padStart(scale, '0')}`
}
