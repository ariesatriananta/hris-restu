import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import { canAccessAttendanceRate } from '@/features/auth/attendance-rate-access'
import type { AttendanceRateOptions, AttendanceRateResponse } from './types'

function useReadScope() {
  const session = useAuthStore((state) => state.session)
  return {
    enabled: canAccessAttendanceRate(session),
    scope: session
      ? [
          session.user.uid,
          session.user.role,
          session.user.roles,
          session.user.siteAccess,
          session.permissions,
        ]
      : null,
  }
}

export function useAttendanceRateOptions() {
  const { enabled, scope } = useReadScope()
  return useQuery({
    queryKey: ['attendance-rate', scope, 'options'],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<AttendanceRateOptions>('/attendance-rate/options', {
          signal,
          timeout: 30_000,
        })
      ).data,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 0,
  })
}

export function useAttendanceRateReport(
  site: string | undefined,
  date: string | undefined,
  ready: boolean
) {
  const { enabled, scope } = useReadScope()
  return useQuery({
    queryKey: ['attendance-rate', scope, 'report', site, date],
    enabled: enabled && ready && Boolean(site && date),
    queryFn: async ({ signal }) =>
      (
        await apiClient.get<AttendanceRateResponse>('/attendance-rate', {
          params: { site, date },
          signal,
          timeout: 30_000,
        })
      ).data,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 0,
  })
}
