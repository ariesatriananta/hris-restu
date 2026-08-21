import { z } from 'zod'

export const attendanceClassificationTypes = [
  'LEAVE',
  'SICK',
  'PERMISSION',
] as const

export const attendanceClassificationApprovalStatuses = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const

export const attendanceClassificationOutcomes = [
  'PENDING',
  'APPLIED',
  'REVERSED',
  'SKIPPED_NON_WORKDAY',
  'SKIPPED_HOLIDAY',
] as const

export const attendanceClassificationReversalInput = z
  .object({
    reason: z.string().trim().min(10).max(500),
  })
  .strict()

export const attendanceClassificationRequestInput = z
  .object({
    employeeUid: z.string().uuid(),
    startDate: z.string().date(),
    endDate: z.string().date(),
    classificationType: z.enum(attendanceClassificationTypes),
    reason: z.string().trim().min(3).max(500),
    fileUid: z.string().uuid().optional().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
      })
      return
    }
    if (enumerateDates(value.startDate, value.endDate, 367).length > 366) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Rentang klasifikasi maksimal 366 hari.',
      })
    }
  })
  .transform((value) => ({ ...value, fileUid: value.fileUid ?? undefined }))

export const attendanceClassificationReviewInput = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reviewNotes: z.string().trim().min(3).max(500).optional().nullable(),
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

export function enumerateDates(startDate: string, endDate: string, limit = 366) {
  const dates: string[] = []
  const cursor = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  while (cursor <= end && dates.length < limit) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export function isoWeekday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

export function parseWorkDays(value: unknown) {
  if (Array.isArray(value)) return value.map(Number)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(Number) : []
  } catch {
    return []
  }
}

export function isScheduledWorkday(date: string, workDays: unknown) {
  return parseWorkDays(workDays).includes(isoWeekday(date))
}

export function matchesAttendanceAttachmentSignature(
  bytes: Uint8Array,
  mimeType: string
) {
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte)
  if (mimeType === 'application/pdf') {
    return startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])
  }
  if (mimeType === 'image/jpeg') {
    return startsWith([0xff, 0xd8, 0xff])
  }
  if (mimeType === 'image/png') {
    return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  }
  if (mimeType === 'image/webp') {
    return (
      startsWith([0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    )
  }
  return false
}
