import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  AuditDetail,
  AuditListParams,
  AuditListResult,
  AuditMeta,
} from './domain'

const params = (input: AuditListParams) =>
  Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(',') : value,
    ])
  )
export const useAuditMeta = () =>
  useQuery({
    queryKey: ['audit-trail', 'meta'],
    queryFn: async () =>
      (await apiClient.get<AuditMeta>('/system/audit-trail/meta')).data,
    staleTime: 5 * 60 * 1000,
  })
export const useAuditEntries = (input: AuditListParams) =>
  useQuery({
    queryKey: ['audit-trail', 'entries', input],
    queryFn: async () =>
      (
        await apiClient.get<AuditListResult>('/system/audit-trail/entries', {
          params: params(input),
        })
      ).data,
    placeholderData: keepPreviousData,
  })
export const useAuditDetail = (uid?: string) =>
  useQuery({
    queryKey: ['audit-trail', 'entries', uid],
    queryFn: async () =>
      (await apiClient.get<AuditDetail>(`/system/audit-trail/entries/${uid}`))
        .data,
    enabled: Boolean(uid),
  })
