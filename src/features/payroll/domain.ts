export type PayrollPeriodStatus =
  | 'DRAFT'
  | 'CALCULATED'
  | 'APPROVED'
  | 'CLOSED'
  | 'CANCELLED'

export type PayrollReadinessStatus = 'READY' | 'ATTENTION' | 'BLOCKED'

export interface PayrollSite {
  uid: string
  code: string
  name: string
}

export interface PayrollReadinessIssue {
  code: string
  message: string
  count: number
  severity: 'BLOCKER' | 'WARNING'
  group:
    | 'PERIOD'
    | 'ATTENDANCE'
    | 'EMPLOYMENT'
    | 'PRODUCTION'
    | 'COMPONENT'
    | 'PAYMENT'
    | 'POLICY'
    | 'RATE'
    | 'CONTRACT'
  actionUrl: string | null
}

export interface PayrollReadinessDetail {
  status: PayrollReadinessStatus
  evaluatedAt: string
  populationCount: number
  productionEmployeeCount: number
  componentOnlyEmployeeCount: number
  blockerCount: number
  warningCount: number
  blockers: PayrollReadinessIssue[]
  warnings: PayrollReadinessIssue[]
  facts: {
    periodFinished: boolean
    expectedAttendanceDays: number
    finalizedAttendanceDays: number
    pendingAttendanceCorrections: number
    pendingAttendanceClassifications: number
    ambiguousEmploymentEmployees: number
    conflictingProductionTransactions: number
    unsupportedFormulaComponents: number
    missingBankAccounts: number
    postedTransactionCount: number
    productionGrossAmount: number
    activeComponentCount: number
    recurringComponentCount: number
    attendance: { absent: number; late: number; earlyLeave: number }
    scheduledWorkDays?: number
    payablePresentDays?: number
    offdayPresentDays?: number
    alphaDays?: number
    permissionDays?: number
    coveredRateEmployees?: number
    coveredSalaryEmployees?: number
    missingAttendanceEmployees?: number
    unsupportedCurrencyEmployees?: number
    invalidSalarySegmentEmployees?: number
  }
  employees?: PayrollPeriodReadinessEmployee[]
}

export interface PayrollPeriodReadinessEmployee {
  employeeUid: string
  employeeNumber: string
  fullName: string
  employeeType: PayrollEmployeeType
  eligibleFrom: string
  eligibleTo: string
  payablePresentDays: number
  offdayPresentDays: number
  alphaDays: number
  permissionDays: number
  eligibleCalendarDays: number
  scheduledWorkDays: number
  baseAmount: string | null
  estimatedGrossAmount: string
  estimatedDeductionAmount: string
  estimatedNetAmount: string
  currency: string | null
  baseCoverage: 'COVERED' | 'MISSING' | 'AMBIGUOUS'
  contractCoverage: 'VALID' | 'INVALID'
  manualComponentCount: number
  missingBaseDays?: number
  ambiguousBaseDays?: number
  invalidContractDays?: number
  duplicateAttendanceDays?: number
  missingAttendanceDays?: number
  unsupportedCurrencyDays?: number
  rateSegmentCount?: number
  bankAccountComplete?: boolean
  issues?: Array<{
    code: string
    severity: 'BLOCKER' | 'WARNING'
    count: number
    message: string
    actionUrl: string | null
  }>
}

export interface PayrollPeriodSummary {
  uid: string
  periodCode: string
  periodName: string
  periodStart: string
  periodEnd: string
  paymentDate: string | null
  payrollBasis: PayrollWageBasis
  employeeType?: PayrollEmployeeType
  payFrequency?: PayrollPayFrequency
  policyVersionUid?: string | null
  status: PayrollPeriodStatus
  notes: string | null
  site: PayrollSite
  createdAt: string
  cancelledAt: string | null
  cancellationReason: string | null
  readiness: Pick<PayrollReadinessDetail, 'status' | 'populationCount'> & {
    blockerCount: number
    warningCount: number
  }
}

export interface PayrollPeriodDetail extends Omit<
  PayrollPeriodSummary,
  'readiness'
> {
  readiness: PayrollReadinessDetail
  policySnapshot?: Partial<PayrollPolicyVersion> | null
}

export interface PayrollPeriodMeta {
  sites: PayrollSite[]
  statuses: PayrollPeriodStatus[]
  maxPeriodDays: number
  payrollBasis?: PayrollWageBasis
  employeeTypes?: PayrollEmployeeType[]
  payrollBases?: PayrollWageBasis[]
  payFrequencies?: PayrollPayFrequency[]
}

export interface PayrollPeriodPreview {
  site: PayrollSite
  period: { periodStart: string; periodEnd: string }
  policy: Partial<PayrollPolicyVersion> & {
    versionUid: string
    employeeType: PayrollEmployeeType
    wageBasis: PayrollWageBasis
    payFrequency: PayrollPayFrequency
  }
  employees: PayrollPeriodReadinessEmployee[]
  readiness: PayrollReadinessDetail
  summary: {
    populationCount: number
    payablePresentDays: number
    offdayPresentDays: number
    missingBaseAmountEmployees: number
    ambiguousBaseAmountEmployees: number
    invalidContractEmployees: number
    duplicateAttendanceEmployees: number
    missingAttendanceEmployees: number
    unsupportedCurrencyEmployees: number
    invalidSalarySegmentEmployees: number
    estimatedGrossAmount: string
    estimatedDeductionAmount: string
    estimatedNetAmount: string
  }
}

export interface PayrollPeriodsResult {
  data: PayrollPeriodSummary[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    summary?: {
      total: number
      draft: number
      needsAttention: number
      closed: number
    }
  }
}

export type PayrollRunStatus =
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export interface PayrollRunSummary {
  uid: string
  periodUid: string
  runNumber: number
  runType: 'SIMULATION' | 'FINAL'
  status: PayrollRunStatus
  startedAt: string
  finishedAt: string | null
  employeeCount: number
  totalPieceRateAmount: string
  totalEarnings: string
  totalDeductions: string
  totalNetPay: string
  errorMessage: string | null
  isCurrent: boolean
}

export type PayrollHistoryRun = Omit<
  PayrollRunSummary,
  'periodUid' | 'errorMessage'
>

export interface PayrollHistoryPeriod {
  uid: string
  periodCode: string
  periodName: string
  periodStart: string
  periodEnd: string
  paymentDate: string | null
  status: PayrollPeriodStatus
  payrollBasis: 'PIECE_RATE'
  site: Pick<PayrollSite, 'code' | 'name'>
  currentRun: PayrollHistoryRun | null
  runCount: number
  completedRunCount: number
  failedRunCount: number
  createdAt: string
  closedAt: string | null
}

export interface PayrollHistoryResult {
  data: PayrollHistoryPeriod[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    sites: PayrollSite[]
    capabilities: {
      canExport: boolean
      canPaymentExport: boolean
      canPrint: boolean
    }
  }
}

export interface PayrollRunAmounts {
  pieceRateAmount: string
  additionalEarnings: string
  grossEarnings: string
  totalDeductions: string
  netPay: string
}

export interface PayrollRunComparison {
  period: {
    uid: string
    periodCode: string
    periodName: string
    site: Pick<PayrollSite, 'code' | 'name'>
    periodStart: string
    periodEnd: string
  }
  baseRun: PayrollHistoryRun
  targetRun: PayrollHistoryRun
  summary: {
    employeeCountDelta: number
    totalPieceRateAmountDelta: string
    totalEarningsDelta: string
    totalDeductionsDelta: string
    totalNetPayDelta: string
  }
  employees: Array<{
    employeeUid: string
    employeeNumber: string
    fullName: string
    change: 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED'
    base: PayrollRunAmounts | null
    target: PayrollRunAmounts | null
    deltas: PayrollRunAmounts
  }>
}

export interface PayrollPayslipBundle {
  period: {
    uid: string
    periodCode: string
    periodName: string
    periodStart: string
    periodEnd: string
    paymentDate: string | null
    status: PayrollPeriodStatus
    site: Pick<PayrollSite, 'code' | 'name'>
  }
  run: PayrollHistoryRun
  document: {
    kind: 'SIMULATION' | 'OFFICIAL'
    watermark: 'SIMULASI' | null
    official: boolean
    closedDoesNotMeanPaid: true
    company: {
      companyName: string
      legalAddress: string | null
      phone: string | null
      email: string | null
      website: string | null
      taxNumber: string | null
      logoFileUid: string | null
      logoUrl: string | null
      snapshotSource: 'CLOSE' | 'LEGACY_BACKFILL' | 'LIVE_PREVIEW'
    }
  }
  employees: Array<{
    employeeResultUid: string
    employeeNumber: string
    fullName: string
    employeeType: string
    departmentName: string | null
    positionName: string | null
    bank: { bankName: string | null; accountLast4: string | null }
    attendance: {
      scheduledDays: number
      presentDays: number
      absentDays: number
      leaveDays: number
      sickDays: number
      permissionDays: number
      holidayDays: number
      lateMinutes: number
      earlyLeaveMinutes: number
    } | null
    totals: PayrollRunAmounts
    components: Array<{
      code: string
      name: string
      category: 'EARNING' | 'DEDUCTION'
      amount: string
      notes: string | null
    }>
    productionSummary: Array<{
      jobName: string
      unitName: string
      quantity: string
      amount: string
    }>
  }>
}

export interface PayrollEmployeeResultSummary {
  uid: string
  employeeNumber: string
  fullName: string
  employeeType: string
  departmentName: string | null
  positionName: string | null
  productionTransactionCount: number
  pieceRateAmount: string
  additionalEarnings: string
  grossEarnings: string
  totalDeductions: string
  netPay: string
  bank: {
    bankName: string | null
    accountLast4: string | null
    complete: boolean
  }
  issues: Array<'NEGATIVE_NET' | 'MISSING_BANK'>
}

export interface PayrollProductionSnapshot {
  transactionNumber: string
  businessDate: string
  jobName: string
  unitName: string
  quantity: string
  rate: string
  amount: string
}

export interface PayrollComponentSnapshot {
  code: string
  name: string
  category: 'EARNING' | 'DEDUCTION'
  sourceType: 'RECURRING' | 'MANUAL' | 'SYSTEM'
  amount: string
  notes: string | null
}

export interface PayrollEmployeeResultDetail {
  uid: string
  employee: {
    uid: string
    employeeNumber: string
    fullName: string
    employeeType: string
    departmentName: string | null
    positionName: string | null
    workGroupName: string | null
  }
  totals: {
    pieceRateAmount: string
    additionalEarnings: string
    grossEarnings: string
    totalDeductions: string
    netPay: string
  }
  bank: {
    bankName: string | null
    accountNumber: string | null
    accountLast4: string | null
    accountName: string | null
    complete: boolean
  }
  attendance: {
    scheduledDays: number
    presentDays: number
    absentDays: number
    leaveDays: number
    sickDays: number
    permissionDays: number
    holidayDays: number
    lateMinutes: number
    earlyLeaveMinutes: number
    workedMinutes: number
  } | null
  production: PayrollProductionSnapshot[]
  components: PayrollComponentSnapshot[]
  formulaTrace: {
    pieceRate: string
    recurring: string
    manual: string
    net: string
  }
}

export interface PayrollRunDetail extends PayrollRunSummary {
  issues: { negativeNetEmployees: number; missingBankEmployees: number }
}

export interface PayrollSimulationMeta {
  employees: Array<{
    uid: string
    employeeNumber: string
    fullName: string
  }>
  componentTypes: Array<{
    uid: string
    code: string
    name: string
    category: 'EARNING' | 'DEDUCTION'
  }>
}

export interface PayrollManualComponent {
  uid: string
  status: 'ACTIVE' | 'CANCELLED'
  employee: { uid: string; employeeNumber: string; fullName: string }
  componentType: {
    uid: string
    code: string
    name: string
    category: 'EARNING' | 'DEDUCTION'
  }
  amount: string
  notes: string | null
  createdAt: string
  cancelledAt: string | null
  cancellationReason: string | null
}

export interface PayrollManualComponentRevision {
  uid: string
  revisionType: 'CREATION' | 'CORRECTION' | 'CANCELLATION'
  beforeData: Record<string, unknown> | null
  afterData: Record<string, unknown> | null
  reason: string | null
  revisedAt: string
  revisedBy: { uid: string | null; name: string }
}

export type PayrollApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'

export type PayrollWorkflowAction =
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'WITHDRAW'
  | 'CLOSE'

export interface PayrollWorkflowIssue {
  code: string
  message: string
  count: number
}

export interface PayrollWorkflow {
  periodUid: string
  periodStatus: PayrollPeriodStatus
  currentRun: {
    uid: string
    runNumber: number
    status: PayrollRunStatus
    runType: 'SIMULATION' | 'FINAL'
    employeeCount: number
    totalPieceRateAmount: string
    totalEarnings: string
    totalDeductions: string
    totalNetPay: string
  } | null
  approval: {
    uid: string
    status: PayrollApprovalStatus
    requestedAt: string
    requestedByName: string
    reviewedAt: string | null
    reviewedByName: string | null
    notes: string | null
    superAdminOverride: boolean
  } | null
  capabilities: {
    canSubmit: boolean
    canWithdraw: boolean
    canApprove: boolean
    canReject: boolean
    canClose: boolean
  }
  integrity: {
    valid: boolean
    issues: PayrollWorkflowIssue[]
  }
  history: Array<{
    uid: string
    action: PayrollWorkflowAction
    reason: string | null
    superAdminOverride: boolean
    performedAt: string
    performedByName: string
  }>
}

export interface PayrollApprovalQueueItem {
  approvalUid: string
  periodUid: string
  periodCode: string
  periodName: string
  siteCode: string
  siteName: string
  runUid: string
  runNumber: number
  employeeCount: number
  totalNetPay: string
  requestedAt: string
  requestedByName: string
  superAdminOverride: boolean
}

export interface PayrollApprovalQueueResult {
  data: PayrollApprovalQueueItem[]
  meta: { page: number; pageSize: number; total: number }
}

export type PayrollWageBasis = 'PIECE_RATE' | 'TIME_BASED'
export type PayrollPayFrequency = 'WEEKLY' | 'MONTHLY'
export type PayrollEmployeeType = 'BORONGAN' | 'HARIAN' | 'TRAINING' | 'BULANAN'
export type PayrollConfigurationStatus = 'ACTIVE' | 'CANCELLED'
export type PayrollCutoffType = 'WEEK_END' | 'LAST_DAY' | 'DAY_OF_MONTH'

export interface PayrollConfigurationMeta {
  sites: PayrollSite[]
  employees?: PayrollEmployeeOption[]
  employeeTypes: Array<{
    code: PayrollEmployeeType
    name: string
    wageBasis: PayrollWageBasis
    payFrequency: PayrollPayFrequency
  }>
  capabilities: {
    canManagePolicy: boolean
    canManageRates: boolean
    canViewAmounts: boolean
  }
}

export interface PayrollPolicyPeriodPreview {
  periodStart: string
  periodEnd: string
  label?: string
}

export interface PayrollPolicyVersion {
  uid: string
  version: number
  site: PayrollSite
  employeeType: PayrollEmployeeType
  wageBasis: PayrollWageBasis
  payFrequency: PayrollPayFrequency
  cutoffType: PayrollCutoffType
  cutoffDay: number | null
  roundingMode: 'HALF_UP'
  roundingScale: number
  effectiveFrom: string
  effectiveTo: string | null
  status: PayrollConfigurationStatus
  reason: string | null
  createdAt: string | null
  createdByName: string | null
  nextPeriods: PayrollPolicyPeriodPreview[]
}

export interface PayrollPolicyListResult {
  data: PayrollPolicyVersion[]
  meta: PayrollConfigurationMeta
}

export interface PayrollPolicyPreview {
  nextPeriods: PayrollPolicyPeriodPreview[]
  warnings: Array<{ code: string; message: string }>
}

export interface PayrollEmployeeOption {
  uid: string
  employeeNumber: string
  fullName: string
  employeeType: PayrollEmployeeType
  site: PayrollSite
}

export interface PayrollEmployeeRate {
  uid: string
  employee: PayrollEmployeeOption
  site: PayrollSite
  amount: string | null
  amountMasked: boolean
  currency: 'IDR'
  effectiveFrom: string
  effectiveTo: string | null
  status: PayrollConfigurationStatus
  notes: string | null
  createdAt: string
}

export interface PayrollEmployeeRateListResult {
  data: PayrollEmployeeRate[]
  meta: {
    sites: PayrollSite[]
    employees: PayrollEmployeeOption[]
    capabilities: PayrollConfigurationMeta['capabilities']
  }
}

export interface PayrollTrainingPreflightIssue {
  code: string
  severity: 'BLOCKER' | 'WARNING' | 'INFO'
  count: number
  title: string
  message: string
  actionHint: string | null
}

export interface PayrollTrainingPreflight {
  status: 'READY' | 'ATTENTION' | 'BLOCKED'
  evaluatedAt: string
  summary: {
    trainingEmployees: number
    employmentHistories: number
    productionTransactions: number
    payrollSnapshots: number
    immutablePayrollSnapshots: number
  }
  issues: PayrollTrainingPreflightIssue[]
}
