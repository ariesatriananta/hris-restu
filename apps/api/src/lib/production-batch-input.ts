import { z } from 'zod'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { ApiError } from './errors.js'

export const productionBatchSelection = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    site: z.enum(['ALL', 'JEPARA', 'SEMARANG', 'KLATEN']),
  })
  .strict()
  .superRefine((value, context) => {
    const days =
      (Date.parse(value.dateTo) - Date.parse(value.dateFrom)) / 86400000
    if (days < 0 || days > 6)
      context.addIssue({
        code: 'custom',
        message: 'Rentang tanggal maksimal 7 hari dan harus berurutan.',
      })
  })
export const productionBatchRun = z
  .object({
    ...productionBatchSelection.shape,
    previewToken: z.string().min(1).max(4000),
    idempotencyKey: z.string().uuid(),
    reason: z.string().trim().min(10).max(400),
    confirmation: z.literal('PROSES'),
  })
  .strict()
  .superRefine((value, context) => {
    const validation = productionBatchSelection.safeParse({
      dateFrom: value.dateFrom,
      dateTo: value.dateTo,
      site: value.site,
    })
    if (!validation.success)
      for (const issue of validation.error.issues)
        context.addIssue({
          code: 'custom',
          path: issue.path,
          message: issue.message,
        })
  })
export type BatchSelection = z.infer<typeof productionBatchSelection>
export type BatchToken = BatchSelection & {
  actor: string
  seed: string
  hash: string
  count: number
  pairs: number
  expires: number
}
export const productionBatchHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function batchRandom(seed: string, key: string, max: number) {
  return (
    Number.parseInt(
      createHash('sha256').update(`${seed}:${key}`).digest('hex').slice(0, 8),
      16
    ) % max
  )
}
export function signProductionBatch(value: BatchToken, secret: string) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}
export function readProductionBatch(
  token: string,
  secret: string,
  actor: string,
  allowExpired = false
): BatchToken {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) throw new Error('token')
    const signature = Buffer.from(parts[1], 'base64url')
    const expected = createHmac('sha256', secret).update(parts[0]).digest()
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(signature, expected)
    )
      throw new Error('signature')
    const value = JSON.parse(
      Buffer.from(parts[0], 'base64url').toString()
    ) as BatchToken
    if (
      value.actor !== actor ||
      !Number.isFinite(value.expires) ||
      (!allowExpired && value.expires < Date.now())
    )
      throw new Error('expired')
    return value
  } catch {
    throw new ApiError(
      409,
      'Preview kedaluwarsa atau tidak valid. Klik Periksa kembali.'
    )
  }
}
