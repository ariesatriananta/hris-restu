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
  PayrollPeriodPreview,
  PayrollPeriodReadinessEmployee,
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
  PayrollHistoryResult,
  PayrollPayslipBundle,
  PayrollRunComparison,
  PayrollConfigurationMeta,
  PayrollPolicyListResult,
  PayrollPolicyPreview,
  PayrollPolicyVersion,
  PayrollEmployeeRate,
  PayrollEmployeeRateListResult,
  PayrollTrainingPreflight,
} from '../domain'

const keys = {
  all: ['payroll-periods'] as const,
  meta: () => [...keys.all, 'meta'] as const,
  list: (input: Record<string, unknown>) =>
    [...keys.all, 'list', input] as const,
  detail: (uid: string) => [...keys.all, 'detail', uid] as const,
  periodEmployees: (uid: string) => [...keys.detail(uid), 'employees'] as const,
  periodPreview: () => [...keys.all, 'preview'] as const,
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
  history: (input: Record<string, unknown>) =>
    [...keys.all, 'history', input] as const,
  comparison: (periodUid: string, baseRunUid: string, targetRunUid: string) =>
    [...keys.all, periodUid, 'comparison', baseRunUid, targetRunUid] as const,
  payslips: (runUid: string, employeeResultUid?: string) =>
    [...keys.run(runUid), 'payslips', employeeResultUid ?? 'all'] as const,
  configuration: ['payroll-configuration'] as const,
  configurationMeta: () => [...keys.configuration, 'meta'] as const,
  policies: (input: Record<string, unknown>) =>
    [...keys.configuration, 'policies', input] as const,
  dailyRates: (input: Record<string, unknown>) =>
    [...keys.configuration, 'daily-rates', input] as const,
  salaries: (input: Record<string, unknown>) =>
    [...keys.configuration, 'salaries', input] as const,
  trainingPreflight: (site?: string) =>
    [...keys.configuration, 'training-preflight', site ?? 'all'] as const,
}

export type PayrollPolicyInput = {
  siteUid: string
  employeeType: 'BORONGAN' | 'HARIAN' | 'TRAINING' | 'BULANAN'
  wageBasis: 'PIECE_RATE' | 'TIME_BASED'
  payFrequency: 'WEEKLY' | 'MONTHLY'
  cutoffType: 'WEEK_END' | 'LAST_DAY' | 'DAY_OF_MONTH'
  cutoffDay?: number
  effectiveFrom: string
}

export type PayrollRateInput = {
  employeeUid: string
  siteUid: string
  amount: string
  effectiveFrom: string
  effectiveTo?: string
  notes?: string
}

export function usePayrollConfigurationMeta() {
  return useQuery({
    queryKey: keys.configurationMeta(),
    queryFn: async () =>
      normalizeConfigurationMeta(
        (
          await apiClient.get<{ data: BackendConfigurationMeta }>(
            '/payroll/configuration/meta'
          )
        ).data.data
      ),
  })
}

export function usePayrollPolicies(
  input: Record<string, unknown>,
  enabled = true
) {
  return useQuery({
    queryKey: keys.policies(input),
    queryFn: async () =>
      normalizePolicies(
        (
          await apiClient.get<{
            data: BackendPolicy[]
            meta: { total: number }
          }>(`/payroll/configuration/policies?${params(input)}`)
        ).data
      ),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function usePreviewPayrollPolicy() {
  return useMutation({
    mutationFn: async (input: PayrollPolicyInput) =>
      normalizePolicyPreview(
        (
          await apiClient.post<{ data: BackendPolicyPreview }>(
            '/payroll/configuration/policies/preview',
            input
          )
        ).data.data
      ),
  })
}

export function useCreatePayrollPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: PayrollPolicyInput & { reason: string; idempotencyKey: string }
    ) =>
      normalizePolicy(
        (
          await apiClient.post<{ data: BackendPolicy }>(
            '/payroll/configuration/policies',
            input
          )
        ).data.data,
        1
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.configuration }),
  })
}

export function usePayrollDailyRates(
  input: Record<string, unknown>,
  enabled = true
) {
  return usePayrollEmployeeRates('daily-rates', input, enabled)
}

export function usePayrollSalaries(
  input: Record<string, unknown>,
  enabled = true
) {
  return usePayrollEmployeeRates('salaries', input, enabled)
}

function usePayrollEmployeeRates(
  resource: 'daily-rates' | 'salaries',
  input: Record<string, unknown>,
  enabled: boolean
) {
  const queryKey =
    resource === 'daily-rates' ? keys.dailyRates(input) : keys.salaries(input)
  return useQuery({
    queryKey,
    queryFn: async () =>
      normalizeNominalList(
        (
          await apiClient.get<{
            data: BackendNominal[]
            meta: { total: number }
          }>(`/payroll/configuration/${resource}?${params(input)}`)
        ).data,
        resource
      ),
    placeholderData: keepPreviousData,
    enabled,
  })
}

function usePayrollRateMutation(
  request: (input: {
    resource: 'daily-rates' | 'salaries'
    uid?: string
    payload: Record<string, unknown>
  }) => Promise<PayrollEmployeeRate>
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.configuration }),
  })
}

export function useCreatePayrollRate() {
  return usePayrollRateMutation(
    async ({ resource, payload }) =>
      (
        await apiClient.post<{ data: PayrollEmployeeRate }>(
          `/payroll/configuration/${resource}`,
          payload
        )
      ).data.data
  )
}

export function useCorrectPayrollRate() {
  return usePayrollRateMutation(
    async ({ resource, uid, payload }) =>
      (
        await apiClient.post<{ data: PayrollEmployeeRate }>(
          `/payroll/configuration/${resource}/${uid}/correct`,
          payload
        )
      ).data.data
  )
}

export function useCancelPayrollRate() {
  return usePayrollRateMutation(
    async ({ resource, uid, payload }) =>
      (
        await apiClient.post<{ data: PayrollEmployeeRate }>(
          `/payroll/configuration/${resource}/${uid}/cancel`,
          payload
        )
      ).data.data
  )
}

export function usePayrollTrainingPreflight(site?: string, enabled = true) {
  return useQuery({
    queryKey: keys.trainingPreflight(site),
    queryFn: async () =>
      normalizeTrainingPreflight(
        (
          await apiClient.get<{ data: BackendTrainingPreflight }>(
            `/payroll/configuration/training-preflight?${params({ site })}`
          )
        ).data.data
      ),
    enabled,
  })
}

type BackendConfigurationMeta = {
  sites: PayrollConfigurationMeta['sites']
  employeeTypes: PayrollPolicyInput['employeeType'][]
  wageMatrix: Record<
    PayrollPolicyInput['employeeType'],
    {
      wageBasis: PayrollPolicyInput['wageBasis']
      payFrequency: PayrollPolicyInput['payFrequency']
    }
  >
  capabilities: {
    canManagePolicy: boolean
    canManageRates: boolean
    canSeeNominal: boolean
  }
  employees?: PayrollConfigurationMeta['employees']
}

type BackendPeriodPreview = { start: string; end: string }
type BackendPolicy = Omit<
  PayrollPolicyVersion,
  'version' | 'reason' | 'createdAt' | 'createdByName' | 'nextPeriods'
> & {
  notes: string | null
  nextPeriods: BackendPeriodPreview[]
}
type BackendPolicyPreview = { nextPeriods: BackendPeriodPreview[] }
type BackendNominal = {
  uid: string
  employee: Omit<PayrollEmployeeRate['employee'], 'site'>
  site: PayrollEmployeeRate['site']
  dailyRate?: string | null
  basicSalary?: string | null
  nominalMasked: boolean
  currency: 'IDR'
  effectiveFrom: string
  effectiveTo: string | null
  status: PayrollEmployeeRate['status']
  notes: string | null
}
type BackendTrainingPreflight = {
  status: 'READY' | 'BLOCKED'
  summary: {
    trainingEmployees: number
    productionFacts: number
    immutablePayrollRows: number
  }
  blockers: Array<{ code: string; message: string; count: number }>
  notes: string[]
}

function normalizeConfigurationMeta(
  input: BackendConfigurationMeta
): PayrollConfigurationMeta {
  return {
    sites: input.sites,
    employees: input.employees ?? [],
    employeeTypes: input.employeeTypes.map((code) => ({
      code,
      name: code,
      wageBasis: input.wageMatrix[code].wageBasis,
      payFrequency: input.wageMatrix[code].payFrequency,
    })),
    capabilities: {
      canManagePolicy: input.capabilities.canManagePolicy,
      canManageRates: input.capabilities.canManageRates,
      canViewAmounts: input.capabilities.canSeeNominal,
    },
  }
}

function normalizePeriods(periods: BackendPeriodPreview[]) {
  return periods.map((period) => ({
    periodStart: period.start,
    periodEnd: period.end,
  }))
}

function normalizePolicy(
  input: BackendPolicy,
  version: number
): PayrollPolicyVersion {
  return {
    ...input,
    version,
    reason: input.notes,
    createdAt: null,
    createdByName: null,
    nextPeriods: normalizePeriods(input.nextPeriods),
  }
}

function normalizePolicies(input: {
  data: BackendPolicy[]
  meta: { total: number }
}): PayrollPolicyListResult {
  return {
    data: input.data.map((policy, index) =>
      normalizePolicy(policy, input.data.length - index)
    ),
    meta: {
      sites: [],
      employeeTypes: [],
      capabilities: {
        canManagePolicy: false,
        canManageRates: false,
        canViewAmounts: false,
      },
    },
  }
}

function normalizePolicyPreview(
  input: BackendPolicyPreview
): PayrollPolicyPreview {
  return { nextPeriods: normalizePeriods(input.nextPeriods), warnings: [] }
}

function normalizeNominalList(
  input: { data: BackendNominal[]; meta: { total: number } },
  resource: 'daily-rates' | 'salaries'
): PayrollEmployeeRateListResult {
  return {
    data: input.data.map((item) => ({
      uid: item.uid,
      employee: { ...item.employee, site: item.site },
      site: item.site,
      amount:
        resource === 'daily-rates'
          ? (item.dailyRate ?? null)
          : (item.basicSalary ?? null),
      amountMasked: item.nominalMasked,
      currency: item.currency,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo,
      status: item.status,
      notes: item.notes,
      createdAt: '',
    })),
    meta: {
      sites: [],
      employees: [],
      capabilities: {
        canManagePolicy: false,
        canManageRates: false,
        canViewAmounts: false,
      },
    },
  }
}

function normalizeTrainingPreflight(
  input: BackendTrainingPreflight
): PayrollTrainingPreflight {
  return {
    status: input.status,
    evaluatedAt: new Date().toISOString(),
    summary: {
      trainingEmployees: input.summary.trainingEmployees,
      employmentHistories: 0,
      productionTransactions: input.summary.productionFacts,
      payrollSnapshots: input.summary.immutablePayrollRows,
      immutablePayrollSnapshots: input.summary.immutablePayrollRows,
    },
    issues: [
      ...input.blockers.map((issue) => ({
        code: issue.code,
        severity: 'BLOCKER' as const,
        count: issue.count,
        title: 'Payroll Training immutable ditemukan',
        message: issue.message,
        actionHint: 'Lakukan remediasi owner sebelum cutover skema Training.',
      })),
      ...input.notes.map((message, index) => ({
        code: `NOTE_${index + 1}`,
        severity: 'INFO' as const,
        count: 0,
        title: 'Catatan preflight',
        message,
        actionHint: null,
      })),
    ],
  }
}

export function usePayrollHistory(input: Record<string, unknown>) {
  return useQuery({
    queryKey: keys.history(input),
    queryFn: async () =>
      (
        await apiClient.get<PayrollHistoryResult>(
          `/payroll/history?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function usePayrollRunComparison(
  periodUid?: string,
  baseRunUid?: string,
  targetRunUid?: string
) {
  return useQuery({
    queryKey: keys.comparison(
      periodUid ?? '',
      baseRunUid ?? '',
      targetRunUid ?? ''
    ),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollRunComparison }>(
          `/payroll/periods/${periodUid}/compare?${params({ baseRunUid, targetRunUid })}`
        )
      ).data.data,
    enabled: Boolean(periodUid && baseRunUid && targetRunUid),
  })
}

export function usePayrollPayslips(
  runUid?: string,
  employeeResultUid?: string
) {
  return useQuery({
    queryKey: keys.payslips(runUid ?? '', employeeResultUid),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollPayslipBundle }>(
          `/payroll/runs/${runUid}/payslips?${params({ employeeResultUid })}`
        )
      ).data.data,
    enabled: Boolean(runUid),
  })
}

export function useIssuePayrollPayslips() {
  return useMutation({
    mutationFn: async ({
      runUid,
      employeeResultUids,
      idempotencyKey,
    }: {
      runUid: string
      employeeResultUids?: string[]
      idempotencyKey: string
    }) =>
      (
        await apiClient.post<{
          data: PayrollPayslipBundle
          meta: { issuanceUid?: string; replay?: boolean }
        }>(`/payroll/runs/${runUid}/payslips/issue`, {
          employeeResultUids,
          idempotencyKey,
        })
      ).data,
  })
}

export async function exportPayrollRun(
  runUid: string,
  type: 'SUMMARY' | 'PAYMENT'
) {
  const response = await apiClient.post<Blob>(
    `/payroll/runs/${runUid}/export`,
    { type, idempotencyKey: crypto.randomUUID() },
    { responseType: 'blob' }
  )
  const disposition = response.headers['content-disposition'] as
    | string
    | undefined
  const filename =
    disposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1] ??
    `payroll-${type.toLowerCase()}.xlsx`
  const href = URL.createObjectURL(response.data)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = decodeURIComponent(filename)
  anchor.click()
  URL.revokeObjectURL(href)
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

export function usePayrollPeriodEmployees(uid?: string) {
  return useQuery({
    queryKey: keys.periodEmployees(uid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<{
          data: PayrollPeriodReadinessEmployee[]
          meta: { summary: PayrollPeriodPreview['summary'] }
        }>(`/payroll/periods/${uid}/employees`)
      ).data,
    enabled: Boolean(uid),
  })
}

export function useCreatePayrollPeriod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      siteUid: string
      employeeType: 'BORONGAN' | 'HARIAN' | 'TRAINING' | 'BULANAN'
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

export function usePreviewPayrollPeriod() {
  return useMutation({
    mutationFn: async (body: {
      siteUid: string
      employeeType: 'BORONGAN' | 'HARIAN' | 'TRAINING' | 'BULANAN'
      periodStart: string
      periodEnd: string
    }) =>
      (
        await apiClient.post<{ data: PayrollPeriodPreview }>(
          '/payroll/periods/preview',
          body
        )
      ).data.data,
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
