export type ProductionSite = 'JEPARA' | 'SEMARANG' | 'KLATEN'
export type ProductionRateStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE'
export type ProductionAssignmentStatus =
  | 'ACTIVE'
  | 'UPCOMING'
  | 'ENDED'
  | 'CANCELLED'
export type ProductionAssignmentReadinessIssue =
  | 'ALL'
  | 'UNASSIGNED'
  | 'MISSING_PRIMARY'
  | 'AMBIGUOUS_PRIMARY'
  | 'READY'
export type ProductionAssignmentIssueCode = Exclude<
  ProductionAssignmentReadinessIssue,
  'ALL' | 'READY'
>

export type PaginatedProductionResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type WorkUnit = {
  uid: string
  code: string
  name: string
  decimalPrecision: number
  isActive: boolean
}

export type ProductionJob = {
  uid: string
  code: string
  name: string
  description?: string | null
  category?: string | null
  isActive: boolean
  defaultUnitUid: string
  defaultUnitCode: string
  defaultUnitName: string
  positionUid?: string | null
  positionName?: string | null
}

export type ProductionRate = {
  uid: string
  site: ProductionSite
  jobUid: string
  jobCode: string
  jobName: string
  unitUid: string
  unitCode: string
  unitName: string
  effectiveFrom: string
  effectiveTo?: string | null
  rateAmount: string
  currency: 'IDR'
  status: ProductionRateStatus
  referenceNumber?: string | null
  notes?: string | null
}

export type ProductionAssignment = {
  uid: string
  employee: { uid: string; employeeNumber: string; fullName: string }
  site: ProductionSite
  job: { uid: string; code: string; name: string }
  effectiveFrom: string
  effectiveTo?: string | null
  isPrimary: boolean
  status: ProductionAssignmentStatus
}

export type ProductionEligibleEmployee = {
  uid: string
  employeeNumber: string
  fullName: string
  site: ProductionSite
  employeeType: string
  productionSection?: { uid: string; code: string; name: string } | null
  assignments: Array<{
    uid: string
    jobUid: string
    jobCode: string
    jobName: string
    isPrimary: boolean
    unit: {
      uid: string
      code: string
      name: string
      decimalPrecision: number
    }
    rate: { uid: string; amount: string; currency: 'IDR' }
  }>
}

export type ProductionReadiness = {
  asOf: string
  sites: Array<{
    site: ProductionSite
    siteName: string
    status: 'READY' | 'BLOCKED'
    metrics: {
      eligibleEmployees: number
      employeesWithoutAssignment: number
      employeesWithoutPrimaryAssignment: number
      employeesWithAmbiguousPrimary: number
      assignedJobs: number
      assignedJobsWithoutActiveRate: number
      assignedJobsWithAmbiguousRate: number
      activeProductionAdmins: number
      readyProductionDevices: number
      inactiveAssignedJobs: number
      inactiveAssignedUnits: number
    }
    blockers: Array<{
      code: string
      count: number
      message: string
      actionUrl: string
    }>
  }>
}

export type ProductionAssignmentReadinessItem = {
  employee: {
    uid: string
    employeeNumber: string
    fullName: string
    employeeType: string
  }
  site: { code: ProductionSite; name: string }
  productionSection?: {
    uid: string
    code: string
    name: string
  } | null
  assignmentCount: number
  primaryAssignmentCount: number
  currentPrimaryJob?: {
    uid: string
    code: string
    name: string
  } | null
  issueCodes: ProductionAssignmentIssueCode[]
}

export type ProductionAssignmentReadinessResult =
  PaginatedProductionResult<ProductionAssignmentReadinessItem> & {
    asOf: string
    issue: ProductionAssignmentReadinessIssue
    facets: {
      employeeTypes: string[]
      productionSections: Array<{
        uid: string
        code: string
        name: string
        site: ProductionSite
      }>
    }
  }

export type ProductionAssignmentReadinessParams = ProductionListParams & {
  asOf?: string
  issue?: ProductionAssignmentReadinessIssue
  employeeType?: string[]
  productionSectionUid?: string[]
}

export type ProductionListParams = {
  page?: number
  pageSize?: number
  query?: string
  site?: ProductionSite[]
  status?: string[]
}

export type ProductionDeviceType = 'USB_SCANNER' | 'TERMINAL'

export type ActivatedProductionDevice = {
  device: {
    uid: string
    code: string
    name: string
    site: ProductionSite
    siteName: string
    deviceType: ProductionDeviceType
  }
  deviceToken: string
}

export type ProductionTerminalLookup = {
  businessDate: string
  serverTime: string
  device: ActivatedProductionDevice['device']
  employee: {
    uid: string
    employeeNumber: string
    fullName: string
    site: ProductionSite
    employeeType: string
    workGroup?: { uid: string; code: string; name: string } | null
    productionSection?: { uid: string; code: string; name: string } | null
  }
  attendance: {
    uid: string
    clockInAt: string
  }
  jobs: Array<{
    uid: string
    code: string
    name: string
    isPrimary: boolean
    unit: {
      uid: string
      code: string
      name: string
      decimalPrecision: number
    }
    rate: {
      uid: string
      amount: string
      currency: 'IDR'
    }
  }>
  defaultJobUid: string
}

export type ProductionTransactionStatus = 'POSTED' | 'VOID'

export type ProductionTransaction = {
  uid: string
  transactionNumber: string
  businessDate: string
  transactionAt: string
  status: ProductionTransactionStatus
  entrySource?: 'TERMINAL' | 'HISTORICAL' | 'CORRECTION'
  quantity: string
  rateSnapshot: string
  grossAmount: string
  employee: {
    uid: string
    employeeNumber: string
    fullName: string
  }
  site: ProductionSite
  siteName: string
  notes?: string | null
  job: {
    uid: string
    code: string
    name: string
  }
  unit: {
    uid: string
    code: string
    name: string
    decimalPrecision: number
  }
  device: {
    uid: string
    code: string
    name: string
  } | null
  payrollLocked?: boolean
  payrollLockedAt?: string | null
  payrollLockReasons?: string[]
  canCorrect?: boolean
  canVoid?: boolean
  voidedAt?: string | null
  voidReason?: string | null
  voidedBy?: ProductionTransactionActor | null
  replacementTransaction?: ProductionTransactionLink | null
  replacedTransaction?: ProductionTransactionLink | null
  revisions?: ProductionTransactionRevision[]
}

export type ProductionTransactionActor = {
  uid?: string
  name: string
}

export type ProductionTransactionLink = {
  uid: string
  transactionNumber: string
  status?: ProductionTransactionStatus
}

export type ProductionTransactionRevision = {
  uid: string
  revisionNumber?: number
  type: 'CORRECTION' | 'VOID' | string
  reason: string
  revisedAt?: string
  revisedBy?: ProductionTransactionActor | null
  replacementTransactionUid?: string | null
  before?: ProductionRevisionSnapshot | null
  after?: ProductionRevisionSnapshot | null
}

export type ProductionRevisionSnapshot = {
  uid?: string
  transactionNumber?: string
  businessDate?: string
  transactionAt?: string
  jobUid?: string
  unitUid?: string
  job?: { uid?: string; code?: string; name?: string } | null
  unit?: { uid?: string; code?: string; name?: string } | null
  quantity?: string | null
  rateSnapshot?: string | null
  grossAmount?: string | null
  status?: ProductionTransactionStatus | null
}

export type ProductionCorrectionJob = {
  uid: string
  code: string
  name: string
  isPrimary: boolean
  unit: {
    uid: string
    code: string
    name: string
    decimalPrecision: number
  }
  rate: {
    uid: string
    amount: string
    currency: 'IDR'
  }
}

export type ProductionPayrollLock = {
  locked: boolean
  reasons: string[]
}

export type ProductionCorrectionContext = {
  transaction: ProductionTransaction
  jobs: ProductionCorrectionJob[]
  payrollLock: ProductionPayrollLock
  canCorrect: boolean
  canVoid: boolean
}

export type ProductionCorrectionPreview = {
  source: ProductionTransaction
  targetEmployee?: ProductionTransaction['employee']
  proposed: {
    job: { uid: string; code: string; name: string }
    unit: ProductionCorrectionJob['unit']
    rate: ProductionCorrectionJob['rate']
    quantity: string
    rateSnapshot: string
    grossAmount: string
  }
  delta: {
    quantity: string
    grossAmount: string
  }
  payrollLock: ProductionPayrollLock
  canApply: boolean
}

export type ProductionHistoricalPreview = {
  employee: ProductionTransaction['employee']
  site: ProductionSite
  businessDate: string
  attendance: { uid: string; clockInAt: string }
  jobs: ProductionCorrectionJob[]
  proposed: ProductionCorrectionPreview['proposed']
  payrollLock: ProductionPayrollLock
  canApply: boolean
}

export type ProductionAssignmentCorrectionPreview = {
  source: {
    uid?: string
    employeeUid: string
    site: ProductionSite
    jobUid: string
    jobCode: string
    jobName: string
    effectiveFrom: string
    effectiveTo?: string | null
    isPrimary: boolean | number
  }
  proposed: {
    job: { uid: string; code: string; name: string }
    effectiveFrom: string
    effectiveTo?: string | null
    isPrimary: boolean
  }
  impact?: { postedTransactions?: number; payrollLocked?: boolean }
  canApply: boolean
}

export type ProductionRateCorrectionPreview = {
  source: ProductionRate
  proposed: Pick<
    ProductionRate,
    'rateAmount' | 'effectiveTo' | 'referenceNumber' | 'notes'
  >
  impact?: { transactionCount?: number }
  canApply: boolean
}

export type ProductionRateCancellationPreview = {
  source: ProductionRate
  proposed?: { status: 'INACTIVE' }
  canApply: boolean
}

export type ProductionVoidPreview = {
  source: ProductionTransaction
  impact: {
    quantity: string
    grossAmount: string
  }
  payrollLock: ProductionPayrollLock
  canApply: boolean
}

export type ProductionRevisionResult = {
  duplicate: boolean
  message: string
  transaction: ProductionTransaction
  sourceTransaction?: ProductionTransaction
  revision: ProductionTransactionRevision
}

export type ProductionPostResult = {
  duplicate: boolean
  message: string
  transaction: ProductionTransaction
}

export type ProductionTransactionListParams = {
  site?: ProductionSite[]
  dateFrom?: string
  dateTo?: string
  query?: string
  jobUid?: string[]
  status?: ProductionTransactionStatus[]
  page: number
  pageSize: number
}

export type ProductionTransactionResult =
  PaginatedProductionResult<ProductionTransaction> & {
    summary: {
      transactionCount: number
      employeeCount: number
      totalQuantity: string | null
      quantityTotals?: ProductionRecapQuantity[]
      totalGrossAmount: string
    }
  }

export type ProductionPayrollSnapshotStatus = 'NONE' | 'PARTIAL' | 'SNAPSHOTTED'

export type ProductionRecapQuantity = {
  unit: {
    uid: string
    code: string
    name: string
    decimalPrecision: number
  }
  quantity: string
}

export type ProductionRecapJobBreakdown = {
  job: { uid: string; code: string; name: string }
  transactionCount: number
  quantityTotals: ProductionRecapQuantity[]
  grossAmount: string
}

export type ProductionRecapEmployee = {
  employee: { uid: string; employeeNumber: string; fullName: string }
  site: { code: ProductionSite; name: string }
  placement: {
    employeeType: { code: string; name: string }
    position?: { uid: string; name: string } | null
    department?: { uid: string; name: string } | null
    productionSection?: { uid: string; code: string; name: string } | null
    workGroup?: { uid: string; code: string; name: string } | null
  }
  placementChanged: boolean
  transactionCount: number
  jobCount: number
  grossAmount: string
  payrollStatus: ProductionPayrollSnapshotStatus
  quantityTotals: ProductionRecapQuantity[]
  jobs: ProductionRecapJobBreakdown[]
}

export type ProductionRecapJob = ProductionRecapJobBreakdown & {
  job: { uid: string; code: string; name: string }
  employeeCount: number
  sites: Array<{ code: ProductionSite; name: string }>
  payrollStatus: ProductionPayrollSnapshotStatus
}

export type ProductionRecapFacet = { value: string; label: string }

export type ProductionRecapParams = {
  dateFrom: string
  dateTo: string
  query?: string
  site?: ProductionSite[]
  jobUid?: string[]
  employeeType?: string[]
  productionSectionUid?: string[]
  workGroupUid?: string[]
  page: number
  pageSize: number
}

export type ProductionRecapResult = {
  period: {
    dateFrom: string
    dateTo: string
    dayCount: number
    maxDays: number
    live: boolean
  }
  summary: {
    employeeCount: number
    transactionCount: number
    jobCount: number
    totalGrossAmount: string
  }
  quantityTotals: ProductionRecapQuantity[]
  employees: PaginatedProductionResult<ProductionRecapEmployee>
  jobs: ProductionRecapJob[]
  facets: {
    sites: ProductionRecapFacet[]
    jobs: ProductionRecapFacet[]
    employeeTypes: ProductionRecapFacet[]
    productionSections: ProductionRecapFacet[]
    workGroups: ProductionRecapFacet[]
  }
}

export type ProductionRecapTransaction = Pick<
  ProductionTransaction,
  | 'uid'
  | 'transactionNumber'
  | 'businessDate'
  | 'transactionAt'
  | 'quantity'
  | 'rateSnapshot'
  | 'grossAmount'
  | 'job'
  | 'unit'
> & {
  payrollSnapshotted: boolean
  correctionSource?: {
    uid: string
    transactionNumber: string
    reason: string
  } | null
}

export type ProductionRecapPlacementHistory =
  ProductionRecapEmployee['placement'] & {
    uid: string
    effectiveFrom: string
    effectiveTo?: string | null
  }

export type ProductionEmployeeRecapDetail = {
  period: ProductionRecapResult['period']
  employee: ProductionRecapEmployee['employee']
  site: ProductionRecapEmployee['site']
  summary: ProductionRecapEmployee
  placementTimeline: ProductionRecapPlacementHistory[]
  transactions: ProductionRecapTransaction[]
}

export type ProductionJobRecapDetail = {
  period: ProductionRecapResult['period']
  job: ProductionRecapJob['job']
  summary: ProductionRecapJob
  employees: ProductionRecapEmployee[]
  transactions: ProductionRecapTransaction[]
}

export function canOfferProductionRevision(
  transaction: Pick<ProductionTransaction, 'status' | 'payrollLocked'>,
  hasCorrectPermission: boolean,
  apiAllowsAction = true
) {
  return (
    hasCorrectPermission &&
    transaction.status === 'POSTED' &&
    transaction.payrollLocked !== true &&
    apiAllowsAction
  )
}

export function productionEntrySourceLabel(
  source: ProductionTransaction['entrySource']
) {
  if (source === 'HISTORICAL') return 'Setoran susulan oleh HR'
  if (source === 'CORRECTION') return 'Hasil koreksi HR'
  return 'Terminal Produksi'
}
