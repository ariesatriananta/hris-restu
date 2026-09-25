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
  PayrollPeriodResetPreview,
  PayrollPeriodResetResult,
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
  PayrollHandoverPreview,
  PayrollProductionDailySummary,
  PayrollPayslipBundle,
  PayrollRunComparison,
  PayrollConfigurationMeta,
  PayrollPolicyListResult,
  PayrollPolicyPreview,
  PayrollPolicyVersion,
  PayrollEmployeeRate,
  PayrollEmployeeRateListResult,
  PayrollMinimumWage,
  PayrollMinimumWageListResult,
  PayrollBpjsConfiguration,
  PayrollBpjsEnrollment,
  PayrollBpjsEnrollmentImportPreview,
  PayrollBpjsEnrollmentImportRow,
  PayrollBpjsPolicy,
} from '../domain'

const keys = {
  all: ['payroll-periods'] as const,
  meta: () => [...keys.all, 'meta'] as const,
  list: (input: Record<string, unknown>) =>
    [...keys.all, 'list', input] as const,
  detail: (uid: string) => [...keys.all, 'detail', uid] as const,
  periodEmployees: (uid: string) => [...keys.detail(uid), 'employees'] as const,
  resetPreview: (uid: string) =>
    [...keys.detail(uid), 'reset-preview'] as const,
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
  handoverPreview: (runUid: string, moduleUid?: string, sectionUid?: string) =>
    [
      ...keys.run(runUid),
      'handover-preview',
      sectionUid ?? 'sections',
      moduleUid ?? 'modules',
    ] as const,
  productionDailySummary: (runUid: string, sectionUid?: string) =>
    [
      ...keys.run(runUid),
      'production-daily-summary',
      sectionUid ?? 'all-sections',
    ] as const,
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
  minimumWages: (input: Record<string, unknown>) =>
    [...keys.configuration, 'minimum-wages', input] as const,
  bpjs: (input: Record<string, unknown>) =>
    [...keys.configuration, 'bpjs', input] as const,
  bpjsEnrollments: (input: Record<string, unknown>) =>
    [...keys.configuration, 'bpjs-enrollments', input] as const,
}

export type PayrollPolicyInput = {
  siteUid: string
  employeeType: 'BORONGAN' | 'HARIAN' | 'TRAINING' | 'BULANAN'
  wageBasis: 'PIECE_RATE' | 'TIME_BASED'
  payFrequency: 'WEEKLY' | 'MONTHLY'
  cutoffType: 'WEEK_END' | 'LAST_DAY' | 'DAY_OF_MONTH'
  cutoffDay?: number
}

type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type PayrollRateInput = {
  employeeUid: string
  siteUid: string
  amount: string
  notes?: string
}

export type PayrollMinimumWageInput = {
  siteUid: string
  wageYear: number
  amount: string
  currency: 'IDR'
  regulationReference?: string | null
  notes?: string | null
  reason: string
  idempotencyKey: string
}

export type PayrollBpjsPolicyInput = Omit<
  PayrollBpjsPolicy,
  'uid' | 'status' | 'updatedAt'
> & { reason: string; idempotencyKey: string }

export function usePayrollBpjsConfiguration(
  input: Record<string, unknown>,
  enabled = true
) {
  return useQuery({
    queryKey: keys.bpjs(input),
    queryFn: async () =>
      (
        await apiClient.get<PayrollBpjsConfiguration>(
          `/payroll/configuration/bpjs?${params(input)}`
        )
      ).data,
    enabled,
  })
}

export function useSavePayrollBpjsPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: PayrollBpjsPolicyInput) =>
      (
        await apiClient.post<{ data: PayrollBpjsPolicy }>(
          '/payroll/configuration/bpjs/policy',
          input
        )
      ).data.data,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.configuration }),
  })
}

export function usePayrollBpjsEnrollments(
  input: Record<string, unknown>,
  enabled = true
) {
  return useQuery({
    queryKey: keys.bpjsEnrollments(input),
    queryFn: async () =>
      (
        await apiClient.get<{
          data: PayrollBpjsEnrollment[]
          meta: {
            page: number
            pageSize: number
            total: number
            totalPages: number
          }
        }>(`/payroll/configuration/bpjs/enrollments?${params(input)}`)
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useSavePayrollBpjsEnrollment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      employeeUid,
      ...input
    }: {
      employeeUid: string
      configurationMode: 'GLOBAL' | 'CUSTOM'
      healthEmployerEnabled: boolean
      healthEmployeeEnabled: boolean
      jhtEmployerEnabled: boolean
      jhtEmployeeEnabled: boolean
      jkkEmployerEnabled: boolean
      jkmEmployerEnabled: boolean
      jpEmployerEnabled: boolean
      jpEmployeeEnabled: boolean
      reason: string
      idempotencyKey: string
    }) =>
      (
        await apiClient.post(
          `/payroll/configuration/bpjs/enrollments/${employeeUid}`,
          input
        )
      ).data,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.configuration }),
  })
}

export async function fetchAllPayrollBpjsEnrollments(
  input: Record<string, unknown>
) {
  const first = await apiClient.get<{
    data: PayrollBpjsEnrollment[]
    meta: PaginationMeta
  }>(
    `/payroll/configuration/bpjs/enrollments?${params({ ...input, page: 1, pageSize: 500 })}`
  )
  const rows = [...first.data.data]
  for (let page = 2; page <= first.data.meta.totalPages; page += 1) {
    const response = await apiClient.get<{
      data: PayrollBpjsEnrollment[]
      meta: PaginationMeta
    }>(
      `/payroll/configuration/bpjs/enrollments?${params({ ...input, page, pageSize: 500 })}`
    )
    rows.push(...response.data.data)
  }
  return rows
}

export function usePreviewPayrollBpjsEnrollmentImport() {
  return useMutation({
    mutationFn: async (rows: PayrollBpjsEnrollmentImportRow[]) =>
      (
        await apiClient.post<{ data: PayrollBpjsEnrollmentImportPreview }>(
          '/payroll/configuration/bpjs/enrollments/import/preview',
          { rows }
        )
      ).data.data,
  })
}

export function useImportPayrollBpjsEnrollments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      rows,
      idempotencyKey,
    }: {
      rows: PayrollBpjsEnrollmentImportRow[]
      idempotencyKey: string
    }) =>
      (
        await apiClient.post<{
          data: { total: number; changed: number; replayed: number }
        }>('/payroll/configuration/bpjs/enrollments/import', {
          rows,
          idempotencyKey,
        })
      ).data.data,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.configuration }),
  })
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
            meta: PaginationMeta
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

export function usePayrollMinimumWages(
  input: Record<string, unknown>,
  enabled = true
) {
  return useQuery({
    queryKey: keys.minimumWages(input),
    queryFn: async () =>
      (
        await apiClient.get<PayrollMinimumWageListResult>(
          `/payroll/configuration/minimum-wages?${params(input)}`
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

function usePayrollMinimumWageMutation(
  request: (input: {
    uid?: string
    payload: Record<string, unknown>
  }) => Promise<PayrollMinimumWage>
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.configuration }),
  })
}

export function useCreatePayrollMinimumWage() {
  return usePayrollMinimumWageMutation(
    async ({ payload }) =>
      (
        await apiClient.post<{ data: PayrollMinimumWage }>(
          '/payroll/configuration/minimum-wages',
          payload
        )
      ).data.data
  )
}

export function useCorrectPayrollMinimumWage() {
  return usePayrollMinimumWageMutation(
    async ({ uid, payload }) =>
      (
        await apiClient.post<{ data: PayrollMinimumWage }>(
          `/payroll/configuration/minimum-wages/${uid}/correct`,
          payload
        )
      ).data.data
  )
}

export function useChangePayrollMinimumWageStatus() {
  return usePayrollMinimumWageMutation(async ({ uid, payload }) => {
    const action = payload.action
    const body = { ...payload }
    delete body.action
    return (
      await apiClient.post<{ data: PayrollMinimumWage }>(
        `/payroll/configuration/minimum-wages/${uid}/${action}`,
        body
      )
    ).data.data
  })
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
            meta: PaginationMeta
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
  status: PayrollEmployeeRate['status']
  notes: string | null
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
  meta: PaginationMeta
}): PayrollPolicyListResult {
  return {
    data: input.data.map((policy, index) =>
      normalizePolicy(policy, input.data.length - index)
    ),
    meta: input.meta,
  }
}

function normalizePolicyPreview(
  input: BackendPolicyPreview
): PayrollPolicyPreview {
  return { nextPeriods: normalizePeriods(input.nextPeriods), warnings: [] }
}

function normalizeNominalList(
  input: { data: BackendNominal[]; meta: PaginationMeta },
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
      status: item.status,
      notes: item.notes,
      createdAt: '',
    })),
    meta: input.meta,
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

export function usePayrollHandoverPreview(
  runUid?: string,
  moduleUid?: string,
  sectionUid?: string
) {
  return useQuery({
    queryKey: keys.handoverPreview(runUid ?? '', moduleUid, sectionUid),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollHandoverPreview }>(
          `/payroll/runs/${runUid}/handover-preview?${params({ moduleUid, sectionUid })}`
        )
      ).data.data,
    enabled: Boolean(runUid),
    placeholderData: keepPreviousData,
  })
}

export function usePayrollProductionDailySummary(
  runUid?: string,
  sectionUid?: string
) {
  return useQuery({
    queryKey: keys.productionDailySummary(runUid ?? '', sectionUid),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollProductionDailySummary }>(
          `/payroll/runs/${runUid}/production-daily-summary?${params({ sectionUid })}`
        )
      ).data.data,
    enabled: Boolean(runUid),
    placeholderData: keepPreviousData,
  })
}

export type PayrollHandoverInput = {
  moduleUid: string
  sectionUid: string
  foremanName: string
  handoverDate: string
}

export type PayrollHandoverExportInput = {
  moduleUid?: string
  sectionUid?: string
  foremanName?: string
  handoverDate: string
}

export async function recordPayrollHandoverPrint(
  runUid: string,
  input: PayrollHandoverInput
) {
  await apiClient.post(`/payroll/runs/${runUid}/handover-print`, {
    ...input,
    idempotencyKey: crypto.randomUUID(),
  })
}

export async function exportPayrollHandover(
  runUid: string,
  input: PayrollHandoverExportInput
) {
  const response = await apiClient.post<Blob>(
    `/payroll/runs/${runUid}/handover-export`,
    { ...input, idempotencyKey: crypto.randomUUID() },
    { responseType: 'blob' }
  )
  const disposition = response.headers['content-disposition'] as
    | string
    | undefined
  const filename =
    disposition?.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1] ??
    'daftar-serah-terima-upah.xlsx'
  const href = URL.createObjectURL(response.data)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = decodeURIComponent(filename)
  anchor.click()
  URL.revokeObjectURL(href)
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
      deductBpjs?: boolean
      bpjsContributionMonth?: string | null
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
      deductBpjs?: boolean
      bpjsContributionMonth?: string | null
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

export function usePayrollPeriodResetPreview(uid?: string, enabled = true) {
  return useQuery({
    queryKey: keys.resetPreview(uid ?? ''),
    queryFn: async () =>
      (
        await apiClient.get<{ data: PayrollPeriodResetPreview }>(
          `/payroll/periods/${uid}/reset-preview`
        )
      ).data.data,
    enabled: Boolean(uid) && enabled,
  })
}

export function useResetPayrollPeriod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      uid,
      confirmation,
      reason,
    }: {
      uid: string
      confirmation: string
      reason: string
    }) =>
      (
        await apiClient.post<{ data: PayrollPeriodResetResult }>(
          `/payroll/periods/${uid}/reset`,
          { confirmation, reason }
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
            productionSections: Array<{ uid: string; name: string }>
            productionModules: Array<{ uid: string; name: string }>
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
