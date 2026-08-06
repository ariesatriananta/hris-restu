import type { RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import {
  resolveCalendarDay,
  type CalendarRuleCandidate,
  type ResolvedCalendarDay,
} from './attendance-calendar-policy.js'

type Executor = Pool | PoolConnection

export async function resolveAttendanceCalendarDay(input: {
  siteId: number
  businessDate: string
  scheduledByShift: boolean
  executor?: Executor
}): Promise<ResolvedCalendarDay> {
  const rules = await getAttendanceCalendarRules({
    siteId: input.siteId,
    businessDate: input.businessDate,
    executor: input.executor,
  })
  return resolveCalendarDay({ scheduledByShift: input.scheduledByShift, rules })
}

export async function getAttendanceCalendarRules(input: {
  siteId: number
  businessDate: string
  executor?: Executor
}): Promise<CalendarRuleCandidate[]> {
  const executor = input.executor ?? pool
  const [rows] = await executor.query<RowDataPacket[]>(
    `SELECT ace.id eventId,ace.uid eventUid,NULL siteRuleId,NULL siteRuleUid,
            ace.event_type calendarType,ace.name
       FROM attendance_calendar_events ace
      WHERE ace.event_date=? AND ace.event_type='NATIONAL_HOLIDAY'
        AND ace.cancelled_at IS NULL
      UNION ALL
     SELECT ace.id eventId,ace.uid eventUid,acsr.id siteRuleId,
            acsr.uid siteRuleUid,acsr.rule_type calendarType,acsr.name
       FROM attendance_calendar_site_rules acsr
       LEFT JOIN attendance_calendar_events ace ON ace.id=acsr.calendar_event_id
      WHERE acsr.site_id=? AND acsr.business_date=?
        AND acsr.cancelled_at IS NULL
        AND (ace.id IS NULL OR ace.cancelled_at IS NULL)`,
    [input.businessDate, input.siteId, input.businessDate]
  )
  return rows.map(
      (row): CalendarRuleCandidate => ({
        calendarType: row.calendarType,
        name: String(row.name),
        eventId: row.eventId === null ? null : Number(row.eventId),
        eventUid: row.eventUid ? String(row.eventUid) : null,
        siteRuleId: row.siteRuleId === null ? null : Number(row.siteRuleId),
        siteRuleUid: row.siteRuleUid ? String(row.siteRuleUid) : null,
      })
    )
}
