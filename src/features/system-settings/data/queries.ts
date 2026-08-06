import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ContractSettings, UpdateContractSettingsInput } from '../domain'

const contractSettingsOptions = queryOptions({
  queryKey: ['system-settings', 'contracts'],
  staleTime: 30_000,
  refetchOnWindowFocus: false,
  queryFn: async () =>
    (await apiClient.get<ContractSettings>('/system/settings/contracts')).data,
})

export function useContractSettings() {
  return useQuery(contractSettingsOptions)
}

export function useUpdateContractSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateContractSettingsInput) =>
      (
        await apiClient.put<{ updatedCount: number }>(
          '/system/settings/contracts',
          input
        )
      ).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: contractSettingsOptions.queryKey,
      })
    },
  })
}
