import { z } from 'zod'

export const attendanceCalendarTypes = [
  'NATIONAL_HOLIDAY',
  'COLLECTIVE_LEAVE',
  'SITE_HOLIDAY',
  'WORKDAY_OVERRIDE',
] as const

export type AttendanceCalendarType = (typeof attendanceCalendarTypes)[number]

export type CalendarRuleCandidate = {
  calendarType: AttendanceCalendarType
  name: string
  eventId?: number | null
  eventUid?: string | null
  siteRuleId?: number | null
  siteRuleUid?: string | null
}

export type ResolvedCalendarDay = {
  dayType: 'WORKDAY' | 'HOLIDAY' | 'NON_WORKDAY'
  reasonType:
    | 'SHIFT_WEEKDAY'
    | 'WEEKLY_OFF'
    | AttendanceCalendarType
  name: string | null
  eventId: number | null
  eventUid: string | null
  siteRuleId: number | null
  siteRuleUid: string | null
}

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])

export const attendanceCalendarSiteRuleInput = z
  .object({
    calendarType: z.enum(['SITE_HOLIDAY', 'WORKDAY_OVERRIDE']),
    siteCode,
    businessDate: z.string().date(),
    name: z.string().trim().min(3).max(150),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()

export const attendanceCalendarSiteRuleUpdateInput = z
  .object({
    name: z.string().trim().min(3).max(150),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()

export const attendanceCalendarCancelInput = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict()

export const attendanceCollectiveLeaveSitesInput = z
  .object({
    siteCodes: z.array(siteCode).max(3),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .transform((value) => ({
    ...value,
    siteCodes: [...new Set(value.siteCodes)],
  }))

export function resolveCalendarDay(input: {
  scheduledByShift: boolean
  rules: CalendarRuleCandidate[]
}): ResolvedCalendarDay {
  const precedence: AttendanceCalendarType[] = [
    'WORKDAY_OVERRIDE',
    'SITE_HOLIDAY',
    'COLLECTIVE_LEAVE',
    'NATIONAL_HOLIDAY',
  ]
  const selected = precedence
    .map((type) => input.rules.find((rule) => rule.calendarType === type))
    .find(Boolean)
  if (selected?.calendarType === 'WORKDAY_OVERRIDE') {
    return {
      dayType: 'WORKDAY',
      reasonType: selected.calendarType,
      name: selected.name,
      eventId: selected.eventId ?? null,
      eventUid: selected.eventUid ?? null,
      siteRuleId: selected.siteRuleId ?? null,
      siteRuleUid: selected.siteRuleUid ?? null,
    }
  }
  if (selected) {
    return {
      dayType: 'HOLIDAY',
      reasonType: selected.calendarType,
      name: selected.name,
      eventId: selected.eventId ?? null,
      eventUid: selected.eventUid ?? null,
      siteRuleId: selected.siteRuleId ?? null,
      siteRuleUid: selected.siteRuleUid ?? null,
    }
  }
  return {
    dayType: input.scheduledByShift ? 'WORKDAY' : 'NON_WORKDAY',
    reasonType: input.scheduledByShift ? 'SHIFT_WEEKDAY' : 'WEEKLY_OFF',
    name: null,
    eventId: null,
    eventUid: null,
    siteRuleId: null,
    siteRuleUid: null,
  }
}
