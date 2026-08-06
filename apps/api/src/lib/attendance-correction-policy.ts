import { z } from 'zod'

export const attendanceStatusValues = [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'SICK',
  'PERMISSION',
  'HOLIDAY',
] as const

export const attendanceCorrectionTypes = [
  'CLOCK_IN',
  'CLOCK_OUT',
  'BOTH',
  'STATUS',
] as const

export const attendanceAbnormalReasons = [
  'MISSING_CLOCK_IN',
  'MISSING_CLOCK_OUT',
] as const

const localDateTime = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/,
    'Waktu wajib berformat tanggal dan jam lokal.'
  )
  .transform((value) => {
    const normalized = value.replace('T', ' ')
    return normalized.length === 16 ? `${normalized}:00` : normalized
  })

export const attendanceCorrectionRequestInput = z
  .object({
    attendanceUid: z.string().uuid(),
    correctionType: z.enum(attendanceCorrectionTypes),
    newClockInAt: localDateTime.optional().nullable(),
    newClockOutAt: localDateTime.optional().nullable(),
    newStatus: z.enum(attendanceStatusValues).optional().nullable(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.correctionType === 'CLOCK_IN' || value.correctionType === 'BOTH') &&
      value.newClockInAt === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['newClockInAt'],
        message: 'Jam masuk baru wajib diisi atau dinyatakan kosong.',
      })
    }
    if (
      (value.correctionType === 'CLOCK_OUT' || value.correctionType === 'BOTH') &&
      value.newClockOutAt === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['newClockOutAt'],
        message: 'Jam pulang baru wajib diisi atau dinyatakan kosong.',
      })
    }
    if (value.correctionType === 'STATUS' && !value.newStatus) {
      context.addIssue({
        code: 'custom',
        path: ['newStatus'],
        message: 'Status Attendance baru wajib dipilih.',
      })
    }
  })

export const attendanceCorrectionReviewInput = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reviewNotes: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .transform((value) => value || undefined),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === 'REJECTED' && !value.reviewNotes) {
      context.addIssue({
        code: 'custom',
        path: ['reviewNotes'],
        message: 'Catatan penolakan wajib diisi.',
      })
    }
  })

export type AttendanceAbnormalReason =
  (typeof attendanceAbnormalReasons)[number]

export function deriveAttendanceQuality(input: {
  attendanceStatus: string
  clockInAt: unknown
  clockOutAt: unknown
  scheduledEndAt?: unknown
  asOf?: unknown
}) {
  const abnormalReasons: AttendanceAbnormalReason[] = []
  if (input.attendanceStatus === 'PRESENT') {
    if (!input.clockInAt && input.clockOutAt) {
      abnormalReasons.push('MISSING_CLOCK_IN')
    }
    if (
      input.clockInAt &&
      !input.clockOutAt &&
      input.scheduledEndAt &&
      input.asOf &&
      String(input.asOf) > String(input.scheduledEndAt)
    ) {
      abnormalReasons.push('MISSING_CLOCK_OUT')
    }
  }
  return {
    qualityStatus: abnormalReasons.length ? ('ABNORMAL' as const) : ('NORMAL' as const),
    abnormalReasons,
  }
}

export function validateClockOrder(clockInAt: unknown, clockOutAt: unknown) {
  return !clockInAt || !clockOutAt || String(clockOutAt) >= String(clockInAt)
}
