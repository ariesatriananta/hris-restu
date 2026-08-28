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
  PayrollEmployeeResultDetail,
  PayrollEmployeeResultSummary,
  PayrollManualComponent,
  PayrollManualComponentRevision,
  PayrollRunDetail,
  PayrollRunSummary,
  PayrollSimulationMeta,
  PayrollApprovalQueueResult,
  PayrollWorkflow,
} from '../domain'

const keys = {
  all: ['payroll-periods'] as const,
  meta: () => [...keys.all, 'meta'] as const,
  list: (input: Record<string, unknown>) =>
    [...keys.all, 'list', input] as const,
  detail: (uid: string) => [...keys.all, 'detail', uid] as const,
  runs: (periodUid: string) => [...keys.all, periodUid, 'runs'] as const,
  run: (runUid: string) => [...keys.all, 'run', runUid] as const,
  employees: (runUid: string, input: Record<string, unknown>) =>
    [...keys.run(runUid), 'employees', input] as const,
  employee: (runUid: string, employeeUid: string) =>
    [...keys.run(runUid), 'employee', employeeUid] as const,
  simulationMeta: (periodUid: string) =>
    [...keys.all, periodUid, 'simulation-meta'] as const,
  manualComponents: (periodUid: string) =>
    [...keys.all, periodUid, 'manual-components'] as const,
  manualComponentRevisions: (periodUid: string, componentUid: string) =>
    [...keys.manualComponents(periodUid), componentUid, 'revisions'] as const,
  approvalQueue: (input: Record<string, unknown>) =>
    [...keys.all, 'approval-queue', input] as const,
  workflow: (periodUid: string) =>
    [...keys.all, periodUid, 'workflow'] as const,
}

export function usePayrollApprovalQueue(
  input: Record<string, unknown>,
  enabled = true
) {
  return useQuery({
    queryKey: keys.approvalQueue(input),
    queryFn: async () =>
      (
        await apiClient.get<PayrollApprovalQueueResult>(
          `/payroll/approvals?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function usePayrollWorkflow(periodUid?: string) {
  return useQuery({
    queryKey: keys.workflow(periodUid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollWorkflow }>(
          `/payroll/periods/${periodUid}/workflow`
        )
      ).data.data,
    enabled: Boolean(periodUid),
  })
}

type PayrollWorkflowMutationResult = {
  data: PayrollWorkflow
  meta: { replay: boolean }
}

function useWorkflowMutation(
  request: (input: {
    periodUid: string
    approvalUid?: string
    idempotencyKey: string
    reason?: string
    notes?: string
  }) => Promise<PayrollWorkflowMutationResult>
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useSubmitPayrollApproval() {
  return useWorkflowMutation(
    async ({ periodUid, idempotencyKey, notes }) =>
      (
        await apiClient.post<PayrollWorkflowMutationResult>(
          `/payroll/periods/${periodUid}/submit`,
          { idempotencyKey, notes: notes || undefined }
        )
      ).data
  )
}

export function useWithdrawPayrollApproval() {
  return useWorkflowMutation(
    async ({ approvalUid, idempotencyKey, reason }) =>
      (
        await apiClient.post<PayrollWorkflowMutationResult>(
          `/payroll/approvals/${approvalUid}/withdraw`,
          { idempotencyKey, reason }
        )
      ).data
  )
}

export function useApprovePayrollApproval() {
  return useWorkflowMutation(
    async ({ approvalUid, idempotencyKey, notes }) =>
      (
        await apiClient.post<PayrollWorkflowMutationResult>(
          `/payroll/approvals/${approvalUid}/approve`,
          { idempotencyKey, notes: notes || undefined }
        )
      ).data
  )
}

export function useRejectPayrollApproval() {
  return useWorkflowMutation(
    async ({ approvalUid, idempotencyKey, reason }) =>
      (
        await apiClient.post<PayrollWorkflowMutationResult>(
          `/payroll/approvals/${approvalUid}/reject`,
          { idempotencyKey, reason }
        )
      ).data
  )
}

export function useClosePayrollPeriod() {
  return useWorkflowMutation(
    async ({ periodUid, idempotencyKey }) =>
      (
        await apiClient.post<PayrollWorkflowMutationResult>(
          `/payroll/periods/${periodUid}/close`,
          { idempotencyKey }
        )
      ).data
  )
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

export function usePayrollPeriods(
  input: Record<string, unknown>,
  enabled = true
) {
  return useQuery({
    queryKey: keys.list(input),
    queryFn: async () =>
      (
        await apiClient.get<PayrollPeriodsResult>(
          `/payroll/periods?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
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

export function usePayrollRuns(periodUid?: string) {
  return useQuery({
    queryKey: keys.runs(periodUid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollRunSummary[] }>(
          `/payroll/periods/${periodUid}/runs`
        )
      ).data.data,
    enabled: Boolean(periodUid),
    refetchInterval: (query) =>
      Array.isArray(query.state.data) &&
      query.state.data.some((run) => run.status === 'PROCESSING')
        ? 2000
        : false,
  })
}

export function usePayrollRun(runUid?: string) {
  return useQuery({
    queryKey: keys.run(runUid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollRunDetail }>(
          `/payroll/runs/${runUid}`
        )
      ).data.data,
    enabled: Boolean(runUid),
    refetchInterval: (query) =>
      query.state.data?.status === 'PROCESSING' ? 2000 : false,
  })
}

export function usePayrollRunEmployees(
  runUid: string | undefined,
  input: Record<string, unknown>,
  enabled = true
) {
  return useQuery({
    queryKey: keys.employees(runUid ?? '', input),
    queryFn: async () =>
      (
        await apiClient.get<{
          data: PayrollEmployeeResultSummary[]
          meta: {
            page: number
            pageSize: number
            total: number
            totalPages: number
          }
        }>(`/payroll/runs/${runUid}/employees?${params(input)}`)
      ).data,
    enabled: Boolean(runUid) && enabled,
    placeholderData: keepPreviousData,
  })
}

export function usePayrollEmployeeResult(
  runUid?: string,
  employeeUid?: string,
  enabled = true
) {
  return useQuery({
    queryKey: keys.employee(runUid ?? '', employeeUid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollEmployeeResultDetail }>(
          `/payroll/runs/${runUid}/employees/${employeeUid}`
        )
      ).data.data,
    enabled: Boolean(runUid && employeeUid) && enabled,
  })
}

export function usePayrollSimulationMeta(periodUid?: string) {
  return useQuery({
    queryKey: keys.simulationMeta(periodUid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollSimulationMeta }>(
          `/payroll/periods/${periodUid}/simulation-meta`
        )
      ).data.data,
    enabled: Boolean(periodUid),
  })
}

export function usePayrollManualComponents(periodUid?: string) {
  return useQuery({
    queryKey: keys.manualComponents(periodUid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollManualComponent[] }>(
          `/payroll/periods/${periodUid}/manual-components`
        )
      ).data.data,
    enabled: Boolean(periodUid),
  })
}

export function usePayrollManualComponentRevisions(
  periodUid?: string,
  componentUid?: string
) {
  return useQuery({
    queryKey: keys.manualComponentRevisions(
      periodUid ?? '',
      componentUid ?? ''
    ),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollManualComponentRevision[] }>(
          `/payroll/periods/${periodUid}/manual-components/${componentUid}/revisions`
        )
      ).data.data,
    enabled: Boolean(periodUid && componentUid),
  })
}

export function useCalculatePayroll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      periodUid,
      idempotencyKey,
    }: {
      periodUid: string
      idempotencyKey: string
    }) =>
      (
        await apiClient.post<{ data: PayrollRunSummary }>(
          `/payroll/periods/${periodUid}/calculate`,
          { idempotencyKey }
        )
      ).data.data,
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useCreatePayrollManualComponent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      periodUid,
      ...body
    }: {
      periodUid: string
      employeeUid: string
      componentTypeUid: string
      amount: string
      notes?: string
      idempotencyKey: string
    }) =>
      (
        await apiClient.post<{ data: PayrollManualComponent }>(
          `/payroll/periods/${periodUid}/manual-components`,
          body
        )
      ).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useCancelPayrollManualComponent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      periodUid,
      componentUid,
      reason,
      idempotencyKey,
    }: {
      periodUid: string
      componentUid: string
      reason: string
      idempotencyKey: string
    }) =>
      (
        await apiClient.post<{ data: PayrollManualComponent }>(
          `/payroll/periods/${periodUid}/manual-components/${componentUid}/cancel`,
          { reason, idempotencyKey }
        )
      ).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useUpdatePayrollManualComponent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      periodUid,
      componentUid,
      ...body
    }: {
      periodUid: string
      componentUid: string
      amount: string
      notes?: string | null
      reason: string
      idempotencyKey: string
    }) =>
      (
        await apiClient.patch<{ data: PayrollManualComponent }>(
          `/payroll/periods/${periodUid}/manual-components/${componentUid}`,
          body
        )
      ).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useRecoverStalePayrollRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (runUid: string) =>
      (
        await apiClient.post<{ data: PayrollRunSummary }>(
          `/payroll/runs/${runUid}/recover-stale`
        )
      ).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}
