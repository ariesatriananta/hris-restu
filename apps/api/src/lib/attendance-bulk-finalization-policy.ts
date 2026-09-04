import { z } from 'zod'

export const attendanceBulkFinalizationMaxReadyDates = 31
export const attendanceBulkFinalizationReason =
  'Finalisasi periode Attendance oleh pengguna.'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])

export const attendanceBulkFinalizationScopeInput = z
  .object({
    siteCode,
    mode: z.enum(['RANGE', 'ALL_PENDING']),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.mode === 'RANGE') {
      if (!input.dateFrom || !input.dateTo) {
        context.addIssue({
          code: 'custom',
          message: 'Tanggal awal dan akhir wajib diisi untuk rentang tanggal.',
        })
        return
      }
      if (input.dateFrom > input.dateTo) {
        context.addIssue({
          code: 'custom',
          message: 'Tanggal awal tidak boleh melewati tanggal akhir.',
        })
      } else if (inclusiveDateCount(input.dateFrom, input.dateTo) > 31) {
        context.addIssue({
          code: 'custom',
          message: 'Rentang finalisasi maksimal 31 hari kalender.',
        })
      }
    } else if (input.dateFrom || input.dateTo) {
      context.addIssue({
        code: 'custom',
        message: 'Mode semua tanggal tertunda tidak menerima rentang tanggal.',
      })
    }
  })

export const attendanceBulkFinalizationRunInput = z
  .object({
    siteCode,
    mode: z.enum(['RANGE', 'ALL_PENDING']),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    confirmedDates: z
      .array(z.string().date())
      .min(1)
      .max(attendanceBulkFinalizationMaxReadyDates),
  })
  .strict()
  .superRefine((input, context) => {
    const scope = attendanceBulkFinalizationScopeInput.safeParse({
      siteCode: input.siteCode,
      mode: input.mode,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    })
    if (!scope.success) {
      for (const issue of scope.error.issues) {
        context.addIssue({ code: 'custom', message: issue.message })
      }
    }
    if (new Set(input.confirmedDates).size !== input.confirmedDates.length) {
      context.addIssue({
        code: 'custom',
        message: 'Daftar tanggal konfirmasi tidak boleh berulang.',
      })
    }
  })

export type AttendanceBulkFinalizationScope = z.infer<
  typeof attendanceBulkFinalizationScopeInput
>

export type AttendanceBulkDateStatus = 'READY' | 'BLOCKED' | 'SKIPPED'

export type AttendanceBulkDateCode =
  | 'READY'
  | 'STRUCTURAL_ISSUE'
  | 'PENDING_FOLLOW_UP'
  | 'PAYROLL_LOCKED'
  | 'NOT_DUE'
  | 'RUNNING'
  | 'NOT_REQUIRED'
  | 'ALREADY_FINALIZED'

export function inclusiveDateCount(dateFrom: string, dateTo: string) {
  return (
    Math.floor(
      (Date.parse(`${dateTo}T00:00:00Z`) -
        Date.parse(`${dateFrom}T00:00:00Z`)) /
        86_400_000
    ) + 1
  )
}

export function enumerateDates(dateFrom: string, dateTo: string) {
  const dates: string[] = []
  const cursor = new Date(`${dateFrom}T00:00:00Z`)
  const end = new Date(`${dateTo}T00:00:00Z`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export function isCleanFinalization(input: {
  rawStatus?: string | null
  pendingDue?: number
  missingAssignment?: number
  ambiguousAssignment?: number
  ambiguousEmployment?: number
}) {
  return (
    input.rawStatus === 'SUCCEEDED' &&
    Number(input.pendingDue ?? 0) === 0 &&
    Number(input.missingAssignment ?? 0) === 0 &&
    Number(input.ambiguousAssignment ?? 0) === 0 &&
    Number(input.ambiguousEmployment ?? 0) === 0
  )
}
