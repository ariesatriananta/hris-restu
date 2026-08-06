import { z } from 'zod'

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Waktu wajib berformat HH:mm.')

export const shiftInput = z
  .object({
    siteCode: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
    code: z.string().trim().min(1).max(30),
    name: z.string().trim().min(1).max(100),
    startTime: time,
    endTime: time,
    lateToleranceMinutes: z.number().int().min(0).max(720),
    earlyLeaveToleranceMinutes: z.number().int().min(0).max(720),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((value) => value.startTime !== value.endTime, {
    path: ['endTime'],
    message: 'Jam masuk dan jam pulang tidak boleh sama.',
  })

export const shiftAssignmentBatchInput = z
  .object({
    shiftUid: z.string().uuid(),
    employeeUids: z
      .array(z.string().uuid())
      .min(1, 'Pilih minimal satu karyawan.')
      .max(500, 'Satu batch maksimal 500 karyawan.'),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().optional().nullable(),
    workDays: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Pilih minimal satu hari kerja.')
      .default([1, 2, 3, 4, 5]),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.employeeUids).size !== value.employeeUids.length) {
      context.addIssue({
        code: 'custom',
        path: ['employeeUids'],
        message: 'Karyawan tidak boleh dipilih lebih dari sekali.',
      })
    }
    if (new Set(value.workDays).size !== value.workDays.length) {
      context.addIssue({
        code: 'custom',
        path: ['workDays'],
        message: 'Hari kerja tidak boleh duplikat.',
      })
    }
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
      })
    }
  })
  .transform((value) => ({
    ...value,
    effectiveTo: value.effectiveTo ?? undefined,
    workDays: [...value.workDays].sort((a, b) => a - b),
  }))

export function deriveCrossesMidnight(startTime: string, endTime: string) {
  return endTime < startTime
}

export function jakartaBusinessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function previousDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}
