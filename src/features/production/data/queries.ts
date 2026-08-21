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
  ProductionAssignmentCorrectionPreview,
  ProductionAssignmentReadinessParams,
  ProductionAssignmentReadinessResult,
  ProductionCorrectionContext,
  ProductionCorrectionPreview,
  ProductionEligibleEmployee,
  ProductionHistoricalPreview,
  ProductionJob,
  ProductionListParams,
  ProductionRate,
  ProductionRateCancellationPreview,
  ProductionRateCorrectionPreview,
  ProductionRecapParams,
  ProductionRecapResult,
  ProductionEmployeeRecapDetail,
  ProductionJobRecapDetail,
  ProductionReadiness,
  ProductionPostResult,
  ProductionTerminalLookup,
  ProductionTransactionListParams,
  ProductionTransactionResult,
  ProductionRevisionResult,
  ProductionVoidPreview,
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
  correctionContext: (uid: string) =>
    [...keys.all, 'transaction', uid, 'correction-context'] as const,
  eligibleEmployees: (input: Record<string, unknown>) =>
    [...keys.all, 'eligible-employees', input] as const,
  recaps: (input: ProductionRecapParams) =>
    [...keys.all, 'recaps', input] as const,
  employeeRecap: (uid: string, input: Record<string, unknown>) =>
    [...keys.all, 'recaps', 'employees', uid, input] as const,
  jobRecap: (uid: string, input: Record<string, unknown>) =>
    [...keys.all, 'recaps', 'jobs', uid, input] as const,
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

function recapParams(value: Record<string, unknown> | undefined) {
  const output = new URLSearchParams()
  Object.entries(value ?? {}).forEach(([key, item]) => {
    if (Array.isArray(item)) {
      if (item.length) output.set(key, item.join(','))
    } else if (item !== undefined && item !== null && item !== '') {
      output.set(key, String(item))
    }
  })
  return output
}

export function useProductionUnits(
  input: ProductionListParams & { isActive?: boolean } = {
    pageSize: 500,
    isActive: true,
  }
) {
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

export function useProductionJobs(
  input: ProductionListParams & { isActive?: boolean } = {
    pageSize: 500,
    isActive: true,
  }
) {
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

export function useProductionEligibleEmployees(
  input: {
    site: string
    asOf: string
    query?: string
    page?: number
    pageSize?: number
  },
  enabled = true
) {
  return useQuery({
    queryKey: keys.eligibleEmployees(input),
    queryFn: async () =>
      (
        await apiClient.get<
          PaginatedProductionResult<ProductionEligibleEmployee>
        >(`/production-structure/eligible-employees?${params(input)}`)
      ).data,
    placeholderData: keepPreviousData,
    enabled: enabled && Boolean(input.site) && Boolean(input.asOf),
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

export function useProductionRecaps(
  input: ProductionRecapParams,
  enabled = true
) {
  return useQuery({
    queryKey: keys.recaps(input),
    queryFn: async () =>
      (
        await apiClient.get<ProductionRecapResult>(
          `/production/recaps?${recapParams(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useProductionEmployeeRecap(
  uid: string | undefined,
  input: Record<string, unknown>
) {
  return useQuery({
    queryKey: keys.employeeRecap(uid ?? '', input),
    queryFn: async () =>
      (
        await apiClient.get<ProductionEmployeeRecapDetail>(
          `/production/recaps/employees/${uid}?${recapParams(input)}`
        )
      ).data,
    enabled: Boolean(uid),
  })
}

export function useProductionJobRecap(
  uid: string | undefined,
  input: Record<string, unknown>
) {
  return useQuery({
    queryKey: keys.jobRecap(uid ?? '', input),
    queryFn: async () =>
      (
        await apiClient.get<ProductionJobRecapDetail>(
          `/production/recaps/jobs/${uid}?${recapParams(input)}`
        )
      ).data,
    enabled: Boolean(uid),
  })
}

export function useExportProductionRecaps() {
  return useMutation({
    mutationFn: async (
      input: Omit<ProductionRecapParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/production/recaps/export',
        input,
        { responseType: 'blob' }
      )
      const disposition = response.headers['content-disposition'] as
        | string
        | undefined
      const encodedName = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      const plainName = disposition?.match(/filename="?([^";]+)"?/i)?.[1]
      return {
        blob: response.data,
        fileName: encodedName
          ? decodeURIComponent(encodedName)
          : (plainName ?? 'rekap-produksi.xlsx'),
      }
    },
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

export function useProductionCorrectionContext(uid?: string, enabled = true) {
  return useQuery({
    queryKey: keys.correctionContext(uid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<ProductionCorrectionContext>(
          `/production/transactions/${uid}/correction-context`
        )
      ).data,
    enabled: Boolean(uid) && enabled,
  })
}

function useProductionRevisionMutation<TInput extends object, TResult>(
  uid: string | undefined,
  suffix: string,
  invalidateAfterSuccess = false
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TInput) =>
      (
        await apiClient.post<TResult>(
          `/production/transactions/${uid}/${suffix}`,
          input
        )
      ).data,
    onSuccess: async () => {
      if (!invalidateAfterSuccess) return
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [...keys.all, 'transactions'],
        }),
        queryClient.invalidateQueries({
          queryKey: keys.transaction(uid ?? ''),
        }),
        queryClient.invalidateQueries({
          queryKey: keys.correctionContext(uid ?? ''),
        }),
      ])
    },
  })
}

export function usePreviewProductionCorrection(uid?: string) {
  return useProductionRevisionMutation<
    { employeeUid?: string; jobUid: string; quantity: string },
    ProductionCorrectionPreview
  >(uid, 'correction-preview')
}

export function useCorrectProductionTransaction(uid?: string) {
  return useProductionRevisionMutation<
    {
      employeeUid?: string
      jobUid: string
      quantity: string
      reason: string
      idempotencyKey: string
    },
    ProductionRevisionResult
  >(uid, 'correct', true)
}

export function usePreviewProductionVoid(uid?: string) {
  return useProductionRevisionMutation<
    Record<string, never>,
    ProductionVoidPreview
  >(uid, 'void-preview')
}

export function useVoidProductionTransaction(uid?: string) {
  return useProductionRevisionMutation<
    { reason: string; idempotencyKey: string },
    ProductionRevisionResult
  >(uid, 'void', true)
}

export function usePreviewHistoricalProduction() {
  return useMutation({
    mutationFn: async (input: {
      employeeUid: string
      site: string
      businessDate: string
      jobUid: string
      quantity: string
    }) =>
      (
        await apiClient.post<ProductionHistoricalPreview>(
          '/production/transactions/historical-preview',
          input
        )
      ).data,
  })
}

export function useCreateHistoricalProduction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      employeeUid: string
      site: string
      businessDate: string
      jobUid: string
      quantity: string
      reason: string
      idempotencyKey: string
    }) =>
      (
        await apiClient.post<ProductionPostResult>(
          '/production/transactions/historical',
          input
        )
      ).data,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [...keys.all, 'transactions'],
      }),
  })
}

function useProductionFoundationAction<TInput extends object, TResult>(
  path: string
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TInput) =>
      (await apiClient.post<TResult>(path, input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function usePreviewProductionAssignmentCorrection(uid?: string) {
  return useProductionFoundationAction<
    {
      jobUid: string
      effectiveFrom: string
      effectiveTo: string | null
      isPrimary: boolean
    },
    ProductionAssignmentCorrectionPreview
  >(`/production-structure/assignments/${uid}/correction-preview`)
}

export function useCorrectProductionAssignment(uid?: string) {
  return useProductionFoundationAction<
    {
      jobUid: string
      effectiveFrom: string
      effectiveTo: string | null
      isPrimary: boolean
      reason: string
      idempotencyKey: string
    },
    ProductionAssignmentCorrectionPreview
  >(`/production-structure/assignments/${uid}/correct`)
}

export function usePreviewProductionRateCancellation(uid?: string) {
  return useProductionFoundationAction<
    Record<string, never>,
    ProductionRateCancellationPreview
  >(`/production-structure/rates/${uid}/cancellation-preview`)
}

export function useCancelProductionRate(uid?: string) {
  return useProductionFoundationAction<
    { reason: string; idempotencyKey: string },
    ProductionRateCancellationPreview
  >(`/production-structure/rates/${uid}/cancel`)
}

export function usePreviewProductionRateCorrection(uid?: string) {
  return useProductionFoundationAction<
    {
      rateAmount: string
      effectiveTo: string | null
      referenceNumber: string | null
      notes: string | null
    },
    ProductionRateCorrectionPreview
  >(`/production-structure/rates/${uid}/correction-preview`)
}

export function useCorrectProductionRate(uid?: string) {
  return useProductionFoundationAction<
    {
      rateAmount: string
      effectiveTo: string | null
      referenceNumber: string | null
      notes: string | null
      reason: string
      idempotencyKey: string
    },
    ProductionRateCorrectionPreview
  >(`/production-structure/rates/${uid}/correct`)
}
