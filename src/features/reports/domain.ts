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

export type MutationChangeType =
  | 'TRANSFER'
  | 'PROMOTION'
  | 'DEMOTION'
  | 'STATUS_CHANGE'
  | 'TYPE_CHANGE'
  | 'DEPARTMENT_CHANGE'
  | 'GROUP_CHANGE'
  | 'PRODUCTION_ASSIGNMENT_CHANGE'
  | 'OTHER'

export type MutationReportStatus =
  | 'APPLIED'
  | 'SCHEDULED'
  | 'FAILED'
  | 'CANCELLED'

export interface MutationReportPlacement {
  site: ReportOption | null
  employeeType: ReportOption | null
  department: Pick<ReportOption, 'uid' | 'name'> | null
  position: Pick<ReportOption, 'uid' | 'name'> | null
  workGroup: Pick<ReportOption, 'uid' | 'name'> | null
  productionModule: Pick<ReportOption, 'uid' | 'name'> | null
  productionSection: ReportOption | null
}

export interface MutationReportItem {
  mutationUid: string
  recordSource: 'HISTORY' | 'SCHEDULE'
  employeeUid: string
  employeeNumber: string
  employeeName: string
  changeType: MutationChangeType
  mutationStatus: MutationReportStatus
  effectiveDate: string
  referenceNumber: string | null
  reason: string | null
  notes: string | null
  failureReason: string | null
  source: MutationReportPlacement
  target: MutationReportPlacement
}

export interface MutationReportMeta extends ReportMeta {
  changeTypes: Array<{ code: MutationChangeType; name: string }>
  mutationStatuses: Array<{ code: MutationReportStatus; name: string }>
}

export interface MutationReportSummary {
  total: number
  applied: number
  scheduled: number
  failed: number
  cancelled: number
  transfer: number
  promotion: number
  demotion: number
  statusChange: number
}

export interface MutationReportResult {
  items: MutationReportItem[]
  summary: MutationReportSummary
  page: number
  pageSize: number
  total: number
  dateFrom: string
  dateTo: string
}

export interface MutationReportParams {
  dateFrom: string
  dateTo: string
  query?: string
  site?: string[]
  sourceSite?: string[]
  employeeType?: string[]
  productionSection?: string[]
  changeType?: MutationChangeType[]
  mutationStatus?: MutationReportStatus[]
  page: number
  pageSize: number
}

export type PayrollReportBasis = 'PIECE_RATE' | 'TIME_BASED'
export type PayrollReportFrequency = 'WEEKLY' | 'MONTHLY'

export interface PayrollFinalReportMeta {
  sites: Array<{ code: string; name: string }>
  employeeTypes: Array<{ code: string; name: string }>
  payrollBases: Array<{ code: PayrollReportBasis; name: string }>
  payFrequencies: Array<{ code: PayrollReportFrequency; name: string }>
  canExport: boolean
}

export interface PayrollFinalReportItem {
  resultUid: string
  employeeUid: string
  employeeNumber: string
  employeeName: string
  period: {
    uid: string
    code: string
    name: string
    start: string
    end: string
    paymentDate: string | null
    closedAt: string
    payrollBasis: PayrollReportBasis
    payFrequency: PayrollReportFrequency
    employeeType: string
  }
  run: {
    uid: string
    number: number
    type: 'FINAL'
    status: 'COMPLETED'
    calculationFinishedAt: string
  }
  site: { uid: string; code: string; name: string }
  employeeType: string
  departmentName: string | null
  positionName: string | null
  workGroupName: string | null
  attendanceDays: number
  productionTransactionCount: number
  amounts: {
    pieceRate: string
    basicSalary: string
    additionalEarnings: string
    grossEarnings: string
    totalDeductions: string
    netPay: string
  }
  bank: {
    name: string | null
    accountLast4: string | null
  }
}

export interface PayrollFinalReportSummary {
  total: number
  periodCount: number
  siteCount: number
  employeeCount: number
  totalPieceRate: string
  totalBasicSalary: string
  totalAdditionalEarnings: string
  totalGrossEarnings: string
  totalDeductions: string
  totalNetPay: string
}

export interface PayrollFinalReportResult {
  summary: PayrollFinalReportSummary
  items: PayrollFinalReportItem[]
  total: number
  page: number
  pageSize: number
  dateFrom: string
  dateTo: string
  official: true
  closedDoesNotMeanPaid: true
}

export interface PayrollFinalReportParams {
  dateFrom: string
  dateTo: string
  query?: string
  site?: string[]
  employeeType?: string[]
  payrollBasis?: PayrollReportBasis[]
  payFrequency?: PayrollReportFrequency[]
  page: number
  pageSize: number
}

export type AttendanceClassificationType = 'LEAVE' | 'SICK' | 'PERMISSION'
export type AttendanceClassificationApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'

export interface AttendanceClassificationReportMeta extends ReportMeta {
  classificationTypes: Array<{
    code: AttendanceClassificationType
    name: string
  }>
  approvalStatuses: Array<{
    code: AttendanceClassificationApprovalStatus
    name: string
  }>
  canExport: boolean
}

export interface AttendanceClassificationReportItem {
  classificationUid: string
  employeeUid: string
  employeeNumber: string
  employeeName: string
  site: ReportOption
  employeeType: ReportOption | null
  productionModule: Pick<ReportOption, 'uid' | 'name'> | null
  productionSection: ReportOption | null
  classificationType: AttendanceClassificationType
  startDate: string
  endDate: string
  calendarDays: number
  approvalStatus: AttendanceClassificationApprovalStatus
  requestedAt: string
  requestedByName: string
  reviewedAt: string | null
  reviewedByName: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  historyStatus: 'VALID' | 'AMBIGUOUS' | 'MISSING'
  outcomes: {
    total: number
    applied: number
    pending: number
    skipped: number
    reversed: number
  }
}

export interface AttendanceClassificationReportSummary {
  total: number
  pending: number
  approved: number
  rejected: number
  cancelled: number
  totalCalendarDays: number
  appliedDays: number
}

export interface AttendanceClassificationReportResult {
  items: AttendanceClassificationReportItem[]
  summary: AttendanceClassificationReportSummary
  page: number
  pageSize: number
  total: number
  dateFrom: string
  dateTo: string
}

export interface AttendanceClassificationReportParams {
  dateFrom: string
  dateTo: string
  query?: string
  site?: string[]
  employeeType?: string[]
  productionSection?: string[]
  classificationType?: AttendanceClassificationType[]
  approvalStatus?: AttendanceClassificationApprovalStatus[]
  page: number
  pageSize: number
}

export type AttendanceCorrectionType =
  | 'CLOCK_IN'
  | 'CLOCK_OUT'
  | 'BOTH'
  | 'STATUS'
export type AttendanceCorrectionApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'

export interface AttendanceCorrectionReportMeta extends ReportMeta {
  correctionTypes: Array<{ code: AttendanceCorrectionType; name: string }>
  approvalStatuses: Array<{
    code: AttendanceCorrectionApprovalStatus
    name: string
  }>
  canExport: boolean
}

export interface AttendanceCorrectionReportItem {
  correctionUid: string
  attendanceUid: string
  employeeUid: string
  employeeNumber: string
  employeeName: string
  site: ReportOption
  employeeType: ReportOption | null
  productionModule: Pick<ReportOption, 'uid' | 'name'> | null
  productionSection: ReportOption | null
  historyStatus: 'VALID' | 'MISSING' | 'AMBIGUOUS'
  businessDate: string
  correctionType: AttendanceCorrectionType
  changes: {
    clockIn: { before: string | null; after: string | null }
    clockOut: { before: string | null; after: string | null }
    status: { before: string | null; after: string | null }
  }
  approvalStatus: AttendanceCorrectionApprovalStatus
  requestedAt: string
  requestedByName: string
  reviewedAt: string | null
  reviewedByName: string | null
  appliedAt: string | null
}

export interface AttendanceCorrectionReportSummary {
  total: number
  pending: number
  approved: number
  rejected: number
  cancelled: number
  applied: number
}

export interface AttendanceCorrectionReportResult {
  items: AttendanceCorrectionReportItem[]
  summary: AttendanceCorrectionReportSummary
  page: number
  pageSize: number
  total: number
  dateFrom: string
  dateTo: string
}

export interface AttendanceCorrectionReportParams {
  dateFrom: string
  dateTo: string
  query?: string
  site?: string[]
  employeeType?: string[]
  productionSection?: string[]
  correctionType?: AttendanceCorrectionType[]
  approvalStatus?: AttendanceCorrectionApprovalStatus[]
  page: number
  pageSize: number
}

export type ShiftAssignmentReadinessStatus =
  | 'READY'
  | 'NO_ASSIGNMENT'
  | 'ENDED'
  | 'UPCOMING'
  | 'OVERLAP'
  | 'SITE_MISMATCH'
  | 'SHIFT_INACTIVE'
  | 'NO_WORK_DAYS'
  | 'EMPLOYMENT_AMBIGUOUS'

export interface ShiftAssignmentReportMeta extends ReportMeta {
  shifts: ReportOption[]
  readinessStatuses: Array<{
    code: ShiftAssignmentReadinessStatus
    name: string
  }>
  canExport: boolean
}

export interface ShiftAssignmentReportItem {
  employeeUid: string
  employeeNumber: string
  employeeName: string
  site: ReportOption
  employeeType: ReportOption
  productionModule: Pick<ReportOption, 'uid' | 'name'> | null
  productionSection: ReportOption | null
  assignmentUid: string | null
  shift: ReportOption | null
  shiftSite: ReportOption | null
  startTime: string | null
  endTime: string | null
  crossesMidnight: boolean
  effectiveFrom: string | null
  effectiveTo: string | null
  workDays: number[]
  readinessStatus: ShiftAssignmentReadinessStatus
}

export interface ShiftAssignmentReportSummary {
  total: number
  ready: number
  attention: number
  noAssignment: number
  ended: number
  overlap: number
  siteMismatch: number
}

export interface ShiftAssignmentReportResult {
  items: ShiftAssignmentReportItem[]
  summary: ShiftAssignmentReportSummary
  page: number
  pageSize: number
  total: number
  referenceDate: string
}

export interface ShiftAssignmentReportParams {
  referenceDate: string
  query?: string
  site?: string[]
  employeeType?: string[]
  productionSection?: string[]
  shift?: string[]
  readinessStatus?: ShiftAssignmentReadinessStatus[]
  page: number
  pageSize: number
}

export type ReportDeviceType =
  | 'MOBILE_CAMERA'
  | 'USB_SCANNER'
  | 'TERMINAL'
  | 'OTHER'
export type ScanResultStatus = 'SUCCESS' | 'REJECTED' | 'ERROR'
export type DeviceActivityStatus =
  | 'HEALTHY'
  | 'ATTENTION'
  | 'NO_ACTIVITY'
  | 'NOT_ACTIVATED'
  | 'INACTIVE'

export interface DeviceScanReportMeta {
  sites: ReportOption[]
  deviceTypes: Array<{ code: ReportDeviceType; name: string }>
  resultStatuses: Array<{ code: ScanResultStatus; name: string }>
  activityStatuses: Array<{ code: DeviceActivityStatus; name: string }>
  canExport: boolean
}

export interface DeviceScanReportItem {
  deviceUid: string
  deviceCode: string
  deviceName: string
  site: ReportOption
  deviceType: ReportDeviceType
  locationDescription: string | null
  isActive: boolean
  isAttendanceActivated: boolean
  activatedAt: string | null
  lastSeenAt: string | null
  firstScanAt: string | null
  lastScanAt: string | null
  activityStatus: DeviceActivityStatus
  scans: {
    total: number
    clockIn: number
    clockOut: number
    successful: number
    rejected: number
    error: number
    uniqueEmployees: number
  }
}

export interface DeviceScanReportSummary {
  totalDevices: number
  healthyDevices: number
  attentionDevices: number
  noActivityDevices: number
  notActivatedDevices: number
  inactiveDevices: number
  totalScans: number
  successfulScans: number
  rejectedScans: number
  errorScans: number
}

export interface DeviceScanReportResult {
  items: DeviceScanReportItem[]
  summary: DeviceScanReportSummary
  page: number
  pageSize: number
  total: number
  dateFrom: string
  dateTo: string
}

export interface DeviceScanReportParams {
  dateFrom: string
  dateTo: string
  query?: string
  site?: string[]
  deviceType?: ReportDeviceType[]
  resultStatus?: ScanResultStatus[]
  activityStatus?: DeviceActivityStatus[]
  page: number
  pageSize: number
}

export type AuditActivityAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VOID'
  | 'APPROVE'
  | 'REJECT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'EXPORT'
  | 'PRINT'
  | 'CLOSE'
  | 'OTHER'

export interface AuditActivityActor {
  uid: string
  name: string
  username: string
}

export interface AuditActivityReportMeta {
  sites: ReportOption[]
  modules: Array<{ code: string; name: string }>
  actions: Array<{ code: AuditActivityAction; name: string }>
  actors: AuditActivityActor[]
  canExport: boolean
}

export interface AuditActivityReportItem {
  activityUid: string
  module: string
  action: AuditActivityAction
  tableName: string
  recordUid: string | null
  description: string | null
  reason: string | null
  requestId: string | null
  occurredAt: string
  actor: AuditActivityActor | null
  site: ReportOption | null
}

export interface AuditActivityReportSummary {
  totalActivities: number
  uniqueActors: number
  uniqueModules: number
  dataChanges: number
  decisions: number
  outputs: number
  accountActivities: number
}

export interface AuditActivityReportResult {
  items: AuditActivityReportItem[]
  summary: AuditActivityReportSummary
  total: number
  page: number
  pageSize: number
  dateFrom: string
  dateTo: string
}

export interface AuditActivityReportParams {
  dateFrom: string
  dateTo: string
  query?: string
  site?: string[]
  module?: string[]
  action?: AuditActivityAction[]
  actorUid?: string[]
  page: number
  pageSize: number
}

export type HeadcountMovementType =
  | 'JOIN'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RESIGN'
  | 'DEACTIVATED'
  | 'REACTIVATED'
  | 'STATUS_CHANGE'

export interface HeadcountChangeReportMeta {
  sites: ReportOption[]
  employeeTypes: ReportOption[]
  productionSections: Array<ReportOption & { moduleName: string }>
  movementTypes: Array<{ code: HeadcountMovementType; name: string }>
  canExport: boolean
}

export interface HeadcountChangeReportItem {
  historyUid: string
  movementType: HeadcountMovementType
  effectiveDate: string
  employeeUid: string
  employeeNumber: string
  employeeName: string
  eventSite: ReportOption
  sourceSite: ReportOption | null
  targetSite: ReportOption | null
  sourceStatus: ReportOption | null
  targetStatus: ReportOption | null
  employeeType: ReportOption
  productionSection: ReportOption | null
  referenceNumber: string | null
}

export interface HeadcountChangeReportSummary {
  openingHeadcount: number
  closingHeadcount: number
  netChange: number
  joined: number
  transferredIn: number
  transferredOut: number
  resigned: number
  statusChanges: number
  ambiguousOpening: number
  ambiguousClosing: number
}

export interface HeadcountChangeReportResult {
  items: HeadcountChangeReportItem[]
  summary: HeadcountChangeReportSummary
  total: number
  page: number
  pageSize: number
  dateFrom: string
  dateTo: string
}

export interface HeadcountChangeReportParams {
  dateFrom: string
  dateTo: string
  query?: string
  site?: string[]
  employeeType?: string[]
  productionSection?: string[]
  movementType?: HeadcountMovementType[]
  page: number
  pageSize: number
}

export type TenureBand = 'LT_1_YEAR' | 'Y1_TO_3' | 'Y3_TO_5' | 'GTE_5_YEARS'
export type TenureTurnoverView = 'TENURE' | 'TURNOVER'

export interface TenureTurnoverReportMeta {
  sites: ReportOption[]
  employeeTypes: ReportOption[]
  productionSections: Array<ReportOption & { moduleName: string }>
  tenureBands: Array<{ code: TenureBand; name: string }>
  canExport: boolean
}

export interface TenureTurnoverReportItem {
  recordUid: string
  employeeUid: string
  employeeNumber: string
  employeeName: string
  joinDate: string
  referenceDate: string | null
  site: ReportOption
  employeeType: ReportOption
  productionSection: ReportOption | null
  tenureDays: number
  tenureMonths: number
  tenureBand: TenureBand
  referenceNumber: string | null
}

export interface TenureTurnoverReportSummary {
  openingHeadcount: number
  closingHeadcount: number
  averageHeadcount: number
  joined: number
  resigned: number
  turnoverRate: number
  averageTenureMonths: number
  lessThanOneYear: number
  oneToThreeYears: number
  threeToFiveYears: number
  fiveYearsOrMore: number
  ambiguousOpening: number
  ambiguousClosing: number
}

export interface TenureTurnoverReportResult {
  items: TenureTurnoverReportItem[]
  summary: TenureTurnoverReportSummary
  total: number
  page: number
  pageSize: number
  dateFrom: string
  dateTo: string
  view: TenureTurnoverView
}

export interface TenureTurnoverReportParams {
  dateFrom: string
  dateTo: string
  query?: string
  site?: string[]
  employeeType?: string[]
  productionSection?: string[]
  tenureBand?: TenureBand[]
  view: TenureTurnoverView
  page: number
  pageSize: number
}
