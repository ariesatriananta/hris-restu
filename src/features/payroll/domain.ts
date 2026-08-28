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
