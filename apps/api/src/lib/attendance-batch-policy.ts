import { z } from 'zod'

export const attendanceBatchSite = z.enum([
  'ALL',
  'JEPARA',
  'SEMARANG',
  'KLATEN',
])

export const attendanceBatchInputPreviewInput = z
  .object({
    businessDate: z.string().date(),
    site: attendanceBatchSite,
    mode: z.enum(['RANDOM', 'FULL_PRESENT']),
  })
  .strict()

export const attendanceBatchInputRunInput = attendanceBatchInputPreviewInput
  .extend({
    reason: z.string().trim().min(5).max(500),
    confirmation: z.literal('PROSES'),
  })
  .strict()

export const attendanceBatchDeleteSummaryInput = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    site: attendanceBatchSite,
  })
  .strict()

export const attendanceBatchDeleteInput = z
  .object({
    businessDates: z.array(z.string().date()).min(1).max(31),
    site: attendanceBatchSite,
    reason: z.string().trim().min(5).max(500),
    confirmation: z.literal('HAPUS'),
  })
  .strict()

const attendanceImportRow = z
  .object({
    rowNumber: z.number().int().min(2),
    businessDate: z.string().date(),
    employeeNumber: z.string().trim().min(1).max(50),
    employeeName: z.string().trim().max(255).optional().default(''),
    status: z.string().trim().min(1).max(20),
    clockIn: z.string().trim().max(5).optional().default(''),
    clockOut: z.string().trim().max(5).optional().default(''),
    notes: z.string().trim().max(500).optional().default(''),
  })
  .strict()

export const attendanceImportPreviewInput = z
  .object({
    rows: z.array(attendanceImportRow).min(1).max(2000),
  })
  .strict()

export const attendanceImportRunInput = attendanceImportPreviewInput
  .extend({
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: z.string().uuid(),
  })
  .strict()

export type AttendanceBatchSite = z.infer<typeof attendanceBatchSite>
export type AttendanceBatchMode = z.infer<
  typeof attendanceBatchInputPreviewInput
>['mode']
