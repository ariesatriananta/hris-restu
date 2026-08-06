import { apiClient } from '@/lib/api-client'
import type { PaginatedAttendanceResult } from '../domain'
import type {
  WorkCalendarEntry,
  WorkCalendarListParams,
  WorkCalendarRepository,
  WorkCalendarResolution,
} from '../work-calendar-domain'

const listParams = (input: WorkCalendarListParams) =>
  Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(',') : value,
    ])
  )

export const httpWorkCalendarRepository: WorkCalendarRepository = {
  async list(input) {
    return (
      await apiClient.get<PaginatedAttendanceResult<WorkCalendarEntry>>(
        '/attendance/work-calendar',
        { params: listParams(input) }
      )
    ).data
  },
  async resolve(siteCode, businessDate) {
    return (
      await apiClient.get<WorkCalendarResolution>(
        '/attendance/work-calendar/resolve',
        { params: { siteCode, businessDate } }
      )
    ).data
  },
  async createSiteRule(input) {
    return (await apiClient.post('/attendance/work-calendar', input)).data
  },
  async updateSiteRule(uid, input) {
    await apiClient.patch(`/attendance/work-calendar/${uid}`, input)
  },
  async cancel(uid, reason) {
    await apiClient.post(`/attendance/work-calendar/${uid}/cancel`, { reason })
  },
  async assignCollectiveLeaveSites(eventUid, siteCodes, reason) {
    await apiClient.put(
      `/attendance/work-calendar/collective-leave/${eventUid}/sites`,
      { siteCodes, reason }
    )
  },
}
