import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { AttendanceSiteCode } from '../domain'
import type {
  WorkCalendarListParams,
  WorkCalendarSiteRuleInput,
  WorkCalendarUpdateInput,
} from '../work-calendar-domain'
import { httpWorkCalendarRepository } from './http-work-calendar-repository'

export const workCalendarKeys = {
  all: ['attendance', 'work-calendar'] as const,
  list: (params: WorkCalendarListParams) =>
    [...workCalendarKeys.all, 'list', params] as const,
  resolution: (siteCode: string, businessDate: string) =>
    [...workCalendarKeys.all, 'resolution', siteCode, businessDate] as const,
}

export const useWorkCalendar = (params: WorkCalendarListParams) =>
  useQuery({
    queryKey: workCalendarKeys.list(params),
    queryFn: () => httpWorkCalendarRepository.list(params),
    placeholderData: keepPreviousData,
  })

export const useWorkCalendarResolution = (
  siteCode: AttendanceSiteCode | '',
  businessDate: string
) =>
  useQuery({
    queryKey: workCalendarKeys.resolution(siteCode, businessDate),
    queryFn: () =>
      httpWorkCalendarRepository.resolve(
        siteCode as AttendanceSiteCode,
        businessDate
      ),
    enabled: Boolean(siteCode && businessDate),
  })

function useCalendarMutation<TInput, TResult = void>(
  mutationFn: (input: TInput) => Promise<TResult>
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: workCalendarKeys.all }),
  })
}

export const useCreateWorkCalendarRule = () =>
  useCalendarMutation((input: WorkCalendarSiteRuleInput) =>
    httpWorkCalendarRepository.createSiteRule(input)
  )

export const useUpdateWorkCalendarRule = () =>
  useCalendarMutation(
    ({ uid, input }: { uid: string; input: WorkCalendarUpdateInput }) =>
      httpWorkCalendarRepository.updateSiteRule(uid, input)
  )

export const useCancelWorkCalendar = () =>
  useCalendarMutation(({ uid, reason }: { uid: string; reason: string }) =>
    httpWorkCalendarRepository.cancel(uid, reason)
  )

export const useAssignCollectiveLeaveSites = () =>
  useCalendarMutation(
    ({
      eventUid,
      siteCodes,
      reason,
    }: {
      eventUid: string
      siteCodes: WorkCalendarSiteRuleInput['siteCode'][]
      reason: string
    }) =>
      httpWorkCalendarRepository.assignCollectiveLeaveSites(
        eventUid,
        siteCodes,
        reason
      )
  )
