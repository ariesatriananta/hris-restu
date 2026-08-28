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
  runType: 'SIMULATION'
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
