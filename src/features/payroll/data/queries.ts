import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  PayrollPeriodDetail,
  PayrollPeriodMeta,
  PayrollPeriodSummary,
  PayrollPeriodsResult,
} from '../domain'

const keys = {
  all: ['payroll-periods'] as const,
  meta: () => [...keys.all, 'meta'] as const,
  list: (input: Record<string, unknown>) =>
    [...keys.all, 'list', input] as const,
  detail: (uid: string) => [...keys.all, 'detail', uid] as const,
}

function params(input: Record<string, unknown>) {
  const output = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      if (value.length) output.set(key, value.join(','))
    } else if (value !== undefined && value !== null && value !== '') {
      output.set(key, String(value))
    }
  }
  return output
}

export function usePayrollPeriodMeta() {
  return useQuery({
    queryKey: keys.meta(),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollPeriodMeta }>(
          '/payroll/periods/meta'
        )
      ).data.data,
  })
}

export function usePayrollPeriods(input: Record<string, unknown>) {
  return useQuery({
    queryKey: keys.list(input),
    queryFn: async () =>
      (
        await apiClient.get<PayrollPeriodsResult>(
          `/payroll/periods?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function usePayrollPeriod(uid?: string) {
  return useQuery({
    queryKey: keys.detail(uid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollPeriodDetail }>(
          `/payroll/periods/${uid}`
        )
      ).data.data,
    enabled: Boolean(uid),
  })
}

export function useCreatePayrollPeriod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      siteUid: string
      periodStart: string
      periodEnd: string
      paymentDate?: string | null
      periodName?: string
      notes?: string
    }) =>
      (
        await apiClient.post<{ data: PayrollPeriodSummary }>(
          '/payroll/periods',
          body
        )
      ).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useCancelPayrollPeriod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ uid, reason }: { uid: string; reason: string }) =>
      (
        await apiClient.post<{ data: PayrollPeriodSummary }>(
          `/payroll/periods/${uid}/cancel`,
          { reason }
        )
      ).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}
