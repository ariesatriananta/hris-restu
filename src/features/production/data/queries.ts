import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  ActivatedProductionDevice,
  PaginatedProductionResult,
  ProductionAssignment,
  ProductionAssignmentReadinessParams,
  ProductionAssignmentReadinessResult,
  ProductionJob,
  ProductionListParams,
  ProductionRate,
  ProductionReadiness,
  ProductionPostResult,
  ProductionTerminalLookup,
  ProductionTransactionListParams,
  ProductionTransactionResult,
  WorkUnit,
} from '../domain'

const keys = {
  all: ['production-foundation'] as const,
  units: (params?: Record<string, unknown>) =>
    [...keys.all, 'units', params] as const,
  jobs: (params?: Record<string, unknown>) =>
    [...keys.all, 'jobs', params] as const,
  rates: (params?: ProductionListParams) =>
    [...keys.all, 'rates', params] as const,
  assignments: (params?: ProductionListParams) =>
    [...keys.all, 'assignments', params] as const,
  assignmentReadiness: (params?: ProductionAssignmentReadinessParams) =>
    [...keys.all, 'assignment-readiness', params] as const,
  readiness: (params?: { site?: string[]; asOf?: string }) =>
    [...keys.all, 'readiness', params] as const,
  transactions: (input: ProductionTransactionListParams) =>
    [...keys.all, 'transactions', input] as const,
  transaction: (uid: string) => [...keys.all, 'transaction', uid] as const,
}

function params(value: Record<string, unknown> | undefined) {
  const output = new URLSearchParams()
  Object.entries(value ?? {}).forEach(([key, item]) => {
    if (Array.isArray(item))
      item.forEach((entry) => output.append(key, String(entry)))
    else if (item !== undefined && item !== null && item !== '')
      output.set(key, String(item))
  })
  return output
}

export function useProductionUnits(input = { pageSize: 500, isActive: true }) {
  return useQuery({
    queryKey: keys.units(input),
    queryFn: async () =>
      (
        await apiClient.get<PaginatedProductionResult<WorkUnit>>(
          `/production-structure/work-units?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function useProductionJobs(input = { pageSize: 500, isActive: true }) {
  return useQuery({
    queryKey: keys.jobs(input),
    queryFn: async () =>
      (
        await apiClient.get<PaginatedProductionResult<ProductionJob>>(
          `/production-structure/jobs?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function useProductionRates(input: ProductionListParams) {
  return useQuery({
    queryKey: keys.rates(input),
    queryFn: async () =>
      (
        await apiClient.get<PaginatedProductionResult<ProductionRate>>(
          `/production-structure/rates?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function useProductionAssignments(input: ProductionListParams) {
  return useQuery({
    queryKey: keys.assignments(input),
    queryFn: async () =>
      (
        await apiClient.get<PaginatedProductionResult<ProductionAssignment>>(
          `/production-structure/assignments?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function useProductionAssignmentReadiness(
  input: ProductionAssignmentReadinessParams,
  enabled = true
) {
  return useQuery({
    queryKey: keys.assignmentReadiness(input),
    queryFn: async () =>
      (
        await apiClient.get<ProductionAssignmentReadinessResult>(
          `/production-structure/assignment-readiness?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useProductionReadiness(input?: {
  site?: string[]
  asOf?: string
}) {
  return useQuery({
    queryKey: keys.readiness(input),
    queryFn: async () =>
      (
        await apiClient.get<ProductionReadiness>(
          `/production-structure/readiness?${params(input)}`
        )
      ).data,
  })
}

export function useProductionCommand() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      method = 'post',
      path,
      body,
    }: {
      method?: 'post' | 'patch'
      path: string
      body: unknown
    }) => apiClient.request({ method, url: path, data: body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useActivateProductionDevice() {
  return useMutation({
    mutationFn: async (activationCode: string) =>
      (
        await apiClient.post<ActivatedProductionDevice>(
          '/production/terminal/activate',
          { activationCode }
        )
      ).data,
  })
}

export function useProductionTerminalLookup() {
  return useMutation({
    mutationFn: async ({
      barcode,
      deviceToken,
    }: {
      barcode: string
      deviceToken: string
    }) =>
      (
        await apiClient.post<ProductionTerminalLookup>(
          '/production/terminal/lookup',
          { barcode },
          { headers: { 'X-Production-Device-Token': deviceToken } }
        )
      ).data,
  })
}

export function usePostProductionTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      input,
      deviceToken,
    }: {
      input: {
        barcode: string
        jobUid: string
        quantity: string
        idempotencyKey: string
      }
      deviceToken: string
    }) =>
      (
        await apiClient.post<ProductionPostResult>(
          '/production/terminal/post',
          input,
          { headers: { 'X-Production-Device-Token': deviceToken } }
        )
      ).data,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [...keys.all, 'transactions'],
      }),
  })
}

export function useProductionTransactions(
  input: ProductionTransactionListParams
) {
  return useQuery({
    queryKey: keys.transactions(input),
    queryFn: async () =>
      (
        await apiClient.get<ProductionTransactionResult>(
          `/production/transactions?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function useProductionTransaction(uid?: string) {
  return useQuery({
    queryKey: keys.transaction(uid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<{
          transaction: ProductionPostResult['transaction']
        }>(`/production/transactions/${uid}`)
      ).data.transaction,
    enabled: Boolean(uid),
  })
}
