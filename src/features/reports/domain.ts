import type {
  AttendanceEmployeeType,
  AttendanceRecapGroup,
  AttendanceRecapStatus,
  AttendanceRecapSummary,
  AttendanceSiteCode,
} from '@/features/attendance/domain'

export interface ReportOption {
  uid: string
  code: string
  name: string
}

export interface ReportProductionSection extends ReportOption {
  moduleUid: string
  moduleName: string
}

export interface ReportMeta {
  sites: ReportOption[]
  employeeTypes: ReportOption[]
  employeeStatuses?: ReportOption[]
  productionSections: ReportProductionSection[]
}

export interface EmployeeReportItem {
  employeeUid: string
  employeeNumber: string
  employeeName: string
  site: ReportOption
  employeeType: ReportOption
  employeeStatus: ReportOption
  department: Pick<ReportOption, 'uid' | 'name'> | null
  position: Pick<ReportOption, 'uid' | 'name'> | null
  productionModule: Pick<ReportOption, 'uid' | 'name'> | null
  productionSection: ReportOption | null
  workGroup: Pick<ReportOption, 'uid' | 'name'> | null
  effectiveFrom: string
  effectiveTo: string | null
  historyStatus: 'VALID' | 'AMBIGUOUS'
}

export interface EmployeeReportSummary {
  total: number
  active: number
  inactive: number
  resigned: number
  leave: number
  ambiguousHistory: number
  bySite: Array<{ siteCode: string; siteName: string; total: number }>
}

export interface EmployeeReportResult {
  items: EmployeeReportItem[]
  summary: EmployeeReportSummary
  page: number
  pageSize: number
  total: number
  asOf: string
}

export interface EmployeeReportParams {
  asOf: string
  query?: string
  site?: string[]
  employeeType?: string[]
  employeeStatus?: string[]
  productionSection?: string[]
  page: number
  pageSize: number
}

export type ContractReportStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'TERMINATED'
  | 'CANCELLED'
  | 'UNKNOWN'

export type ContractExpiryState = 'UPCOMING' | 'EXPIRED'

export interface ContractReportMeta extends ReportMeta {
  contractTypes: ReportOption[]
  contractStatuses: Array<{ code: ContractReportStatus; name: string }>
  expiryStates: Array<{ code: ContractExpiryState; name: string }>
}

export interface ContractReportItem {
  contractUid: string
  contractNumber: string
  employeeUid: string
  employeeNumber: string
  employeeName: string
  site: ReportOption | null
  siteResolution: 'SNAPSHOT' | 'HISTORY' | 'UNRESOLVED'
  historyStatus: 'VALID' | 'AMBIGUOUS' | 'MISSING'
  employeeType: ReportOption | null
  contractType: ReportOption
  startDate: string
  endDate: string
  contractStatus: ContractReportStatus
  statusResolution: 'LIFECYCLE' | 'UNRESOLVED'
  expiryState: ContractExpiryState
  latestLifecycle: {
    uid: string
    fromStatus: string | null
    toStatus: string
    effectiveDate: string
    source: string
  } | null
}

export interface ContractReportSummary {
  total: number
  upcoming: number
  expired: number
  active: number
  scheduled: number
  expiredStatus: number
  ambiguousHistory: number
  missingHistory: number
  unresolvedSite: number
  unresolvedStatus: number
}

export interface ContractReportResult {
  items: ContractReportItem[]
  summary: ContractReportSummary
  page: number
  pageSize: number
  total: number
  referenceDate: string
  dateFrom: string
  dateTo: string
}

export interface ContractReportParams {
  referenceDate: string
  dateFrom: string
  dateTo: string
  query?: string
  site?: string[]
  employeeType?: string[]
  contractType?: string[]
  contractStatus?: ContractReportStatus[]
  expiryState?: ContractExpiryState[]
  page: number
  pageSize: number
}

export interface AttendanceReportFinalizationSite {
  site: string
  date: string
  status: string
  reasons: string[]
}

export interface AttendanceReportFinalization {
  status: 'OFFICIAL' | 'PROVISIONAL'
  official: boolean
  exportAllowed: boolean
  blockedReasons: string[]
  sites: AttendanceReportFinalizationSite[]
}

export interface AttendanceReportResult {
  items: AttendanceRecapGroup[]
  summary: AttendanceRecapSummary
  finalization: AttendanceReportFinalization
  page: number
  pageSize: number
  total: number
  dateFrom: string
  dateTo: string
}

export interface AttendanceReportParams {
  dateFrom: string
  dateTo: string
  query?: string
  site?: AttendanceSiteCode[]
  employeeType?: AttendanceEmployeeType[]
  productionSection?: string[]
  attendanceStatus?: AttendanceRecapStatus[]
  page: number
  pageSize: number
}
