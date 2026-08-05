import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  ContractReconcileResult,
  CronRunListParams,
  CronRunListResult,
} from '../domain'

export const cronMonitoringKeys = {
  all: ['system', 'cron-runs'] as const,
  list: (params: CronRunListParams) =>
    [...cronMonitoringKeys.all, 'list', params] as const,
}

export function cronRunsOptions(params: CronRunListParams) {
  return queryOptions({
    queryKey: cronMonitoringKeys.list(params),
    queryFn: async ({ signal }): Promise<CronRunListResult> =>
      (
        await apiClient.get<CronRunListResult>('/system/cron-runs', {
          params,
          signal,
        })
      ).data,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function useCronRuns(params: CronRunListParams) {
  return useQuery(cronRunsOptions(params))
}

export function useRunContractsReconcile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<ContractReconcileResult> =>
      (
        await apiClient.post<ContractReconcileResult>(
          '/employees/contracts/reconcile'
        )
      ).data,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cronMonitoringKeys.all }),
  })
}
