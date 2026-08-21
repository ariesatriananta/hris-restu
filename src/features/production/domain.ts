export type ProductionSite = 'JEPARA' | 'SEMARANG' | 'KLATEN'
export type ProductionRateStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE'
export type ProductionAssignmentStatus = 'ACTIVE' | 'UPCOMING' | 'ENDED'
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
      totalQuantity: string
      totalGrossAmount: string
    }
  }
