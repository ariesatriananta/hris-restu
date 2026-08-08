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

const historicalAssignmentBase = z
  .object({
    employeeUid: z.string().uuid(),
    shiftUid: z.string().uuid(),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date(),
    workDays: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Pilih minimal satu hari kerja.'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
      })
    }
    if (new Set(value.workDays).size !== value.workDays.length) {
      context.addIssue({
        code: 'custom',
        path: ['workDays'],
        message: 'Hari kerja tidak boleh duplikat.',
      })
    }
  })

export const historicalShiftAssignmentPreviewInput = historicalAssignmentBase
  .transform((value) => ({
    ...value,
    workDays: [...value.workDays].sort((a, b) => a - b),
  }))

export const historicalShiftAssignmentApplyInput = historicalAssignmentBase
  .safeExtend({
    reason: z.string().trim().min(10).max(500),
  })
  .transform((value) => ({
    ...value,
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

export function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

export function firstShiftAssignmentEligibility(input: {
  hasAssignmentHistory: boolean
  firstEligibleDate: string | null
  goLiveDate: string
  today: string
}) {
  const minimumEffectiveFrom = input.hasAssignmentHistory
    ? input.today
    : !input.firstEligibleDate
      ? input.today
      : input.firstEligibleDate > input.goLiveDate
        ? input.firstEligibleDate
        : input.goLiveDate
  return {
    hasAssignmentHistory: input.hasAssignmentHistory,
    minimumEffectiveFrom,
    canBackdateFirstAssignment:
      !input.hasAssignmentHistory &&
      Boolean(input.firstEligibleDate) &&
      minimumEffectiveFrom < input.today,
  }
}

export function backdatedAssignmentFinalizationRange(input: {
  effectiveFrom: string
  effectiveTo?: string | null
  today: string
}) {
  if (input.effectiveFrom >= input.today) return null
  const effectiveTo =
    input.effectiveTo && input.effectiveTo < input.today
      ? input.effectiveTo
      : input.today
  return { effectiveFrom: input.effectiveFrom, effectiveTo }
}

export type ShiftAssignmentTimelineItem = {
  id: number
  uid: string
  shiftId: number
  shiftUid: string
  shiftName: string
  effectiveFrom: string
  effectiveTo: string | null
  workDays: number[]
}

export type ShiftAssignmentTimelineSegment = Omit<
  ShiftAssignmentTimelineItem,
  'id' | 'uid'
> & {
  sourceId: number | null
  sourceUid: string | null
  change: 'UNCHANGED' | 'TRUNCATED' | 'SPLIT' | 'REPLACEMENT'
}

export function planHistoricalShiftTimeline(input: {
  existing: ShiftAssignmentTimelineItem[]
  replacement: Omit<ShiftAssignmentTimelineSegment, 'sourceId' | 'sourceUid' | 'change'>
}) {
  const from = input.replacement.effectiveFrom
  const to = input.replacement.effectiveTo ?? '9999-12-31'
  const segments: ShiftAssignmentTimelineSegment[] = []
  const affectedIds = new Set<number>()
  for (const item of input.existing) {
    const itemTo = item.effectiveTo ?? '9999-12-31'
    if (itemTo < from || item.effectiveFrom > to) {
      segments.push({
        ...item,
        sourceId: item.id,
        sourceUid: item.uid,
        change: 'UNCHANGED',
      })
      continue
    }
    affectedIds.add(item.id)
    if (item.effectiveFrom < from) {
      segments.push({
        shiftId: item.shiftId,
        shiftUid: item.shiftUid,
        shiftName: item.shiftName,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: previousDate(from),
        workDays: item.workDays,
        sourceId: item.id,
        sourceUid: item.uid,
        change: itemTo > to ? 'SPLIT' : 'TRUNCATED',
      })
    }
    if (itemTo > to) {
      segments.push({
        shiftId: item.shiftId,
        shiftUid: item.shiftUid,
        shiftName: item.shiftName,
        effectiveFrom: nextDate(to),
        effectiveTo: item.effectiveTo,
        workDays: item.workDays,
        sourceId: item.id,
        sourceUid: item.uid,
        change: item.effectiveFrom < from ? 'SPLIT' : 'TRUNCATED',
      })
    }
  }
  segments.push({
    ...input.replacement,
    sourceId: null,
    sourceUid: null,
    change: 'REPLACEMENT',
  })
  segments.sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom) ||
    (a.effectiveTo ?? '9999-12-31').localeCompare(
      b.effectiveTo ?? '9999-12-31'
    )
  )
  return { segments, affectedIds: [...affectedIds] }
}
