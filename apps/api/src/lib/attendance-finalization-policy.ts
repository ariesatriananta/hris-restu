import { z } from 'zod'

export const attendanceFinalizationGoLiveDate = '2026-08-06'
export const attendanceFinalizationGraceMinutes = 60

export const attendanceFinalizationInput = z
  .object({
    siteCode: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
    businessDate: z.string().date(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()

export function jakartaDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`
}

export function previousBusinessDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return value.toISOString().slice(0, 10)
}

export function shiftFinalizationDueAt(input: {
  businessDate: string
  endTime: string
  crossesMidnight: boolean
  graceMinutes?: number
}) {
  const value = new Date(`${input.businessDate}T${input.endTime.slice(0, 8)}Z`)
  if (input.crossesMidnight) value.setUTCDate(value.getUTCDate() + 1)
  value.setUTCMinutes(
    value.getUTCMinutes() +
      (input.graceMinutes ?? attendanceFinalizationGraceMinutes)
  )
  return value.toISOString().slice(0, 19).replace('T', ' ')
}

export function isShiftFinalizationDue(input: {
  businessDate: string
  endTime: string
  crossesMidnight: boolean
  asOfJakarta: string
}) {
  return shiftFinalizationDueAt(input) <= input.asOfJakarta
}

export function finalizationStatus(input: {
  rawStatus?: string | null
  pendingDue?: number
  blockingIssues?: number
  finalizationRequired?: boolean
}) {
  if (input.finalizationRequired === false) return 'NOT_REQUIRED' as const
  if (!input.rawStatus) return 'NOT_STARTED' as const
  if (input.rawStatus === 'FAILED') return 'FAILED' as const
  if (
    input.rawStatus === 'RUNNING' ||
    input.rawStatus === 'SKIPPED' ||
    Number(input.pendingDue ?? 0) > 0 ||
    Number(input.blockingIssues ?? 0) > 0
  ) {
    return 'PARTIAL' as const
  }
  return 'FINALIZED' as const
}

export function canRunFinalization(input: {
  businessDate: string
  today: string
  hasDueShift: boolean
  running?: boolean
  finalizationRequired?: boolean
}) {
  return (
    input.businessDate >= attendanceFinalizationGoLiveDate &&
    input.businessDate <= input.today &&
    input.finalizationRequired !== false &&
    input.hasDueShift &&
    !input.running
  )
}

export function isAttendanceFinalizationRequired(input: {
  effectiveTargets: number
  resolvedNonWorkdayTargets: number
  unresolvedTargets: number
}) {
  return !(
    input.unresolvedTargets === 0 &&
    input.resolvedNonWorkdayTargets === input.effectiveTargets
  )
}

export function finalizationRecordDecision(input: {
  dayType: 'WORKDAY' | 'HOLIDAY' | 'NON_WORKDAY'
  hasExistingAttendance: boolean
}) {
  if (input.hasExistingAttendance) return 'PRESERVE' as const
  if (input.dayType === 'NON_WORKDAY') return 'WEEKLY_OFF' as const
  return input.dayType === 'HOLIDAY'
    ? ('CREATE_HOLIDAY' as const)
    : ('CREATE_ABSENT' as const)
}

export function hasFinalizationBlockingIssues(counts: {
  pendingDue?: number
  missingAssignment?: number
  ambiguousAssignment?: number
  ambiguousEmployment?: number
}) {
  return (
    Number(counts.pendingDue ?? 0) +
      Number(counts.missingAssignment ?? 0) +
      Number(counts.ambiguousAssignment ?? 0) +
      Number(counts.ambiguousEmployment ?? 0) >
    0
  )
}
