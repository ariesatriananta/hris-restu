import type { AttendanceSiteCode, PaginatedAttendanceResult } from './domain'

export type WorkCalendarType =
  | 'NATIONAL_HOLIDAY'
  | 'COLLECTIVE_LEAVE'
  | 'SITE_HOLIDAY'
  | 'WORKDAY_OVERRIDE'

export type WorkCalendarScope = 'GLOBAL' | 'CATALOG' | 'SITE'
export type WorkCalendarStatus = 'ACTIVE' | 'CANCELLED'
export type WorkCalendarEffectiveStatus =
  | 'GLOBAL_ACTIVE'
  | 'SELECTED'
  | 'NOT_SELECTED'
  | 'SITE_ACTIVE'
  | 'CANCELLED'

export interface WorkCalendarEntry {
  uid: string
  calendarType: WorkCalendarType
  businessDate: string
  name: string
  scope: WorkCalendarScope
  sites: AttendanceSiteCode[]
  sourceDocument: string | null
  sourceUrl: string | null
  isReadOnly: boolean
  status: WorkCalendarStatus
  effectiveStatus: WorkCalendarEffectiveStatus
  attendanceCount: number
  reason?: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkCalendarListParams {
  query?: string
  site?: AttendanceSiteCode[]
  type?: WorkCalendarType[]
  dateFrom: string
  dateTo: string
  page: number
  pageSize: number
}

export interface WorkCalendarSiteRuleInput {
  calendarType: 'SITE_HOLIDAY' | 'WORKDAY_OVERRIDE'
  siteCode: AttendanceSiteCode
  businessDate: string
  name: string
  reason: string
}

export interface WorkCalendarUpdateInput {
  name: string
  reason: string
}

export interface WorkCalendarResolution {
  businessDate: string
  siteCode: AttendanceSiteCode
  calendarType: WorkCalendarType | null
  dayType: 'WORKDAY' | 'HOLIDAY' | null
  name: string | null
  eventUid: string | null
  siteRuleUid: string | null
}

export interface WorkCalendarRepository {
  list(
    input: WorkCalendarListParams
  ): Promise<PaginatedAttendanceResult<WorkCalendarEntry>>
  resolve(
    siteCode: AttendanceSiteCode,
    businessDate: string
  ): Promise<WorkCalendarResolution>
  createSiteRule(input: WorkCalendarSiteRuleInput): Promise<{ uid: string }>
  updateSiteRule(uid: string, input: WorkCalendarUpdateInput): Promise<void>
  cancel(uid: string, reason: string): Promise<void>
  assignCollectiveLeaveSites(
    eventUid: string,
    siteCodes: AttendanceSiteCode[],
    reason: string
  ): Promise<void>
}
