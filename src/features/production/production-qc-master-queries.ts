import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { PaginatedProductionResult, ProductionSite } from './domain'

export type QcMasterKind = 'brands' | 'defects'
export type QcMasterItem = {
  uid: string
  code: string
  name: string
  isActive: boolean
  sortOrder: number
  site?: ProductionSite
}
export type QcMasterInput = {
  name: string
  isActive: boolean
  sortOrder: number
  site?: ProductionSite
}

export function useQcMasterList(
  kind: QcMasterKind,
  input: {
    query: string
    page: number
    pageSize: number
    site?: ProductionSite
    isActive?: boolean
  }
) {
  return useQuery({
    queryKey: ['production-foundation', 'qc-master', kind, input],
    queryFn: async () =>
      (
        await apiClient.get<PaginatedProductionResult<QcMasterItem>>(
          `/production-structure/${kind}`,
          { params: input }
        )
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function useSaveQcMaster(kind: QcMasterKind) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({
      uid,
      input,
    }: {
      uid?: string
      input: QcMasterInput
    }) =>
      uid
        ? apiClient.patch(`/production-structure/${kind}/${uid}`, input)
        : apiClient.post(`/production-structure/${kind}`, input),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['production-foundation'] }),
        client.invalidateQueries({ queryKey: ['production-qc'] }),
      ])
    },
  })
}
