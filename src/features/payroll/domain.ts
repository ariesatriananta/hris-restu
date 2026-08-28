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
  actionUrl: string | null
}

export interface PayrollReadinessDetail {
  status: PayrollReadinessStatus
  evaluatedAt: string
  populationCount: number
  productionEmployeeCount: number
  componentOnlyEmployeeCount: number
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
  }
}

export interface PayrollPeriodSummary {
  uid: string
  periodCode: string
  periodName: string
  periodStart: string
  periodEnd: string
  paymentDate: string | null
  payrollBasis: 'PIECE_RATE'
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
}

export interface PayrollPeriodMeta {
  sites: PayrollSite[]
  statuses: PayrollPeriodStatus[]
  maxPeriodDays: number
  payrollBasis: 'PIECE_RATE'
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
