import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ProductionSite } from '../domain'

export type ProductionBatchInputParams = {
  dateFrom: string
  dateTo: string
  site: 'ALL' | ProductionSite
}

export type ProductionBatchInputPreview = ProductionBatchInputParams & {
  previewToken: string
  expiresAt: string
  canCreate: boolean
  summary: {
    employees: number
    planned: number
    blocked: number
    pairs: number
  }
  items: Array<{
    businessDate: string
    site: ProductionSite
    eligible: number
    planned: number
    blocked: number
    pairs: number
    blockers: Array<{ reason: string; count: number }>
  }>
}

export type ProductionBatchInputRun = ProductionBatchInputParams & {
  previewToken: string
  idempotencyKey: string
  reason: string
  confirmation: 'PROSES'
}

export function usePreviewProductionBatchInput() {
  return useMutation({
    mutationFn: async (input: ProductionBatchInputParams) =>
      (
        await apiClient.post<{ data: ProductionBatchInputPreview }>(
          '/production/transactions/batch-input/preview',
          input
        )
      ).data.data,
  })
}

export function useRunProductionBatchInput() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProductionBatchInputRun) =>
      (
        await apiClient.post<{
          data: {
            total: number
            created: number
            replayed: number
            pairs: number
          }
        }>('/production/transactions/batch-input/run', input)
      ).data.data,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['production-foundation'] }),
  })
}
