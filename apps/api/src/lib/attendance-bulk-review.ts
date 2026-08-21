import { z } from 'zod'
import { ApiError } from './errors.js'

export const attendanceBulkApprovalInput = z
  .object({
    site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
    uids: z
      .array(z.string().uuid())
      .min(1)
      .max(50)
      .refine((uids) => new Set(uids).size === uids.length, {
        message: 'UID tidak boleh duplikat.',
      }),
    decision: z.literal('APPROVED'),
    reviewNotes: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .transform((value) => value || undefined),
  })
  .strict()

export function safeBulkReviewMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : 'Data gagal diproses karena terjadi gangguan pada layanan.'
}
