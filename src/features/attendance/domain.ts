export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LEAVE'
  | 'SICK'
  | 'PERMISSION'
  | 'HOLIDAY'

export type CorrectionApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'

export type AttendanceClassificationType = 'LEAVE' | 'SICK' | 'PERMISSION'
export type AttendanceClassificationApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
export type AttendanceClassificationDetailOutcome =
  | 'PENDING'
  | 'APPLIED'
  | 'SKIPPED_NON_WORKDAY'
  | 'SKIPPED_HOLIDAY'

export type AttendanceDeviceType =
  | 'MOBILE_CAMERA'
  | 'USB_SCANNER'
  | 'TERMINAL'
  | 'OTHER'

export interface AttendanceCapabilities {
  view: boolean
  scan: boolean
  correct: boolean
  approve: boolean
  manageShift: boolean
  manageDevice: boolean
  manageCalendar?: boolean
  finalize?: boolean
  export: boolean
}

export interface AttendanceSite {
  uid: string
  code: string
  name: string
  timezone: string
}

interface LookupOption<T extends string> {
  value: T
  label: string
}

export interface AttendanceFoundation {
  capabilities: AttendanceCapabilities
  sites: AttendanceSite[]
  lookups: {
    attendanceStatuses: LookupOption<AttendanceStatus>[]
    correctionApprovalStatuses: LookupOption<CorrectionApprovalStatus>[]
    classificationTypes: LookupOption<AttendanceClassificationType>[]
    classificationApprovalStatuses: LookupOption<AttendanceClassificationApprovalStatus>[]
    deviceTypes: LookupOption<AttendanceDeviceType>[]
    productionModules: AttendanceProductionModuleLookup[]
    productionSections: AttendanceProductionSectionLookup[]
  }
}

export interface AttendanceProductionModuleLookup {
  uid: string
  code: string
  name: string
  site: string
}

export interface AttendanceProductionSectionLookup {
  uid: string
  code: string
  name: string
  moduleUid: string
  site: string
}

export interface AttendanceRepository {
  getFoundation(): Promise<AttendanceFoundation>
  listShifts(input: ShiftListParams): Promise<PaginatedAttendanceResult<Shift>>
  saveShift(input: ShiftInput, uid?: string): Promise<void>
  deleteShift(uid: string): Promise<void>
  listShiftAssignments(
    input: ShiftAssignmentListParams
  ): Promise<PaginatedAttendanceResult<ShiftAssignment>>
  listShiftAssignmentCandidates(
    input: ShiftAssignmentCandidateListParams
  ): Promise<PaginatedAttendanceResult<ShiftAssignmentCandidate>>
  createShiftAssignments(input: ShiftAssignmentBatchInput): Promise<void>
  deleteShiftAssignment(uid: string): Promise<void>
  listDevices(
    input: AttendanceDeviceListParams
  ): Promise<PaginatedAttendanceResult<AttendanceDevice>>
  saveDevice(
    input: AttendanceDeviceInput,
    uid?: string
  ): Promise<AttendanceDeviceActivation | void>
  deleteDevice(uid: string): Promise<void>
  regenerateDeviceActivation(uid: string): Promise<AttendanceDeviceActivation>
  activateDevice(activationCode: string): Promise<ActivatedAttendanceDevice>
  scanAttendance(
    input: AttendanceScanInput,
    deviceToken: string
  ): Promise<AttendanceScanSuccess>
  listMonitoring(
    input: AttendanceMonitoringListParams
  ): Promise<AttendanceMonitoringResult>
  listFinalizations(
    input: AttendanceFinalizationListParams
  ): Promise<{ items: AttendanceFinalization[] }>
  runFinalization(
    input: AttendanceFinalizationRunInput
  ): Promise<AttendanceFinalization>
  listCorrections(
    input: AttendanceCorrectionListParams
  ): Promise<PaginatedAttendanceResult<AttendanceCorrection>>
  createCorrection(input: AttendanceCorrectionInput): Promise<void>
  reviewCorrection(
    uid: string,
    input: AttendanceCorrectionReviewInput
  ): Promise<void>
  listClassificationEmployees(
    input: AttendanceClassificationEmployeeListParams
  ): Promise<PaginatedAttendanceResult<AttendanceClassificationEmployee>>
  listClassifications(
    input: AttendanceClassificationListParams
  ): Promise<PaginatedAttendanceResult<AttendanceClassification>>
  getClassification(uid: string): Promise<AttendanceClassificationDetail>
  createClassification(
    input: AttendanceClassificationInput
  ): Promise<{ uid: string; approvalStatus: 'PENDING' }>
  reviewClassification(
    uid: string,
    input: AttendanceClassificationReviewInput
  ): Promise<AttendanceClassificationReviewResult>
  cancelClassification(uid: string): Promise<void>
  uploadClassificationAttachment(
    file: File
  ): Promise<AttendanceClassificationAttachment>
}

export type AttendanceSiteCode = 'JEPARA' | 'SEMARANG' | 'KLATEN'
export type AttendanceEmployeeType =
  | 'BORONGAN'
  | 'HARIAN'
  | 'BULANAN'
  | 'TRAINING'

export interface PaginatedAttendanceResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface Shift {
  uid: string
  code: string
  name: string
  site: AttendanceSiteCode
  siteName: string
  startTime: string
  endTime: string
  crossesMidnight: boolean
  lateToleranceMinutes: number
  earlyLeaveToleranceMinutes: number
  isActive: boolean
  hasAttendance: boolean
  assignmentCount: number
}

export interface ShiftInput {
  siteCode: AttendanceSiteCode
  code: string
  name: string
  startTime: string
  endTime: string
  lateToleranceMinutes: number
  earlyLeaveToleranceMinutes: number
  isActive: boolean
}

export interface ShiftListParams {
  query?: string
  site?: AttendanceSiteCode[]
  isActive?: ('true' | 'false')[]
  page: number
  pageSize: number
}

export type ShiftAssignmentStatus = 'CURRENT' | 'UPCOMING' | 'ENDED'

export interface ShiftAssignment {
  uid: string
  employeeUid: string
  employeeNumber: string
  employeeName: string
  employeeType: AttendanceEmployeeType
  site: AttendanceSiteCode
  productionModule?: string
  productionSection?: string
  shiftUid: string
  shiftCode: string
  shiftName: string
  startTime: string
  endTime: string
  effectiveFrom: string
  effectiveTo?: string
  workDays: number[]
  status: ShiftAssignmentStatus
}

export interface ShiftAssignmentCandidate {
  uid: string
  employeeNumber: string
  fullName: string
  employeeType: AttendanceEmployeeType
  site: AttendanceSiteCode
  productionModuleUid?: string
  productionModule?: string
  productionSectionUid?: string
  productionSection?: string
  currentShiftName?: string
  currentShiftEffectiveFrom?: string
}

export interface ShiftAssignmentListParams {
  query?: string
  site?: AttendanceSiteCode[]
  employeeType?: AttendanceEmployeeType[]
  productionModule?: string[]
  productionSection?: string[]
  shiftUid?: string[]
  status?: ShiftAssignmentStatus[]
  page: number
  pageSize: number
}

export type ShiftAssignmentCandidateListParams = Omit<
  ShiftAssignmentListParams,
  'shiftUid' | 'status'
>

export interface ShiftAssignmentBatchInput {
  shiftUid: string
  employeeUids: string[]
  effectiveFrom: string
  effectiveTo?: string
  workDays: number[]
}

export interface AttendanceDevice {
  uid: string
  code: string
  name: string
  site: AttendanceSiteCode
  siteName: string
  deviceType: AttendanceDeviceType
  locationDescription?: string | null
  lastSeenAt?: string | null
  isActive: boolean
  isActivated: boolean
  activationPending: boolean
  activationCodeExpiresAt?: string | null
  scanCount: number
}

export interface AttendanceDeviceInput {
  siteCode: AttendanceSiteCode
  code: string
  name: string
  deviceType: AttendanceDeviceType
  locationDescription?: string | null
  isActive: boolean
}

export interface AttendanceDeviceListParams {
  query?: string
  site?: AttendanceSiteCode[]
  deviceType?: AttendanceDeviceType[]
  isActive?: ('true' | 'false')[]
  page: number
  pageSize: number
}

export interface AttendanceDeviceActivation {
  uid?: string
  activationCode: string
  activationCodeExpiresAt: string
}

export interface ActivatedAttendanceDevice {
  device: Pick<
    AttendanceDevice,
    'uid' | 'code' | 'name' | 'site' | 'deviceType'
  >
  deviceToken: string
}

export type AttendanceScanEventType = 'CLOCK_IN' | 'CLOCK_OUT'

export interface AttendanceScanInput {
  eventType: AttendanceScanEventType
  barcode: string
  idempotencyKey: string
}

export interface AttendanceScanSuccess {
  result: 'SUCCESS'
  duplicate: boolean
  eventType: AttendanceScanEventType
  businessDate: string
  scannedAt: string
  message: string
  employee: {
    uid: string
    employeeNumber: string
    fullName: string
  }
  attendance: {
    uid: string
    clockInAt?: string | null
    clockOutAt?: string | null
    lateMinutes: number
    earlyLeaveMinutes: number
    workedMinutes?: number | null
    qualityStatus: AttendanceQualityStatus
    abnormalReasons: AttendanceAbnormalReason[]
  }
  warnings: AttendanceWarning[]
}

export type AttendanceQualityStatus = 'NORMAL' | 'ABNORMAL'
export type AttendanceAbnormalReason = 'MISSING_CLOCK_IN' | 'MISSING_CLOCK_OUT'

export interface AttendanceWarning {
  code: AttendanceAbnormalReason | (string & {})
  message: string
}

export interface AttendanceMonitoringRecord {
  uid: string
  businessDate: string
  attendanceStatus: AttendanceStatus
  qualityStatus: AttendanceQualityStatus
  abnormalReasons: AttendanceAbnormalReason[]
  clockInAt?: string | null
  clockOutAt?: string | null
  lateMinutes: number
  earlyLeaveMinutes: number
  workedMinutes?: number | null
  notes?: string | null
  employeeUid: string
  employeeNumber: string
  employeeName: string
  employeeType: AttendanceEmployeeType
  site: AttendanceSiteCode
  shiftUid?: string | null
  shiftName?: string | null
}

export interface AttendanceMonitoringSummary {
  total: number
  present: number
  absent: number
  leave: number
  sick: number
  permission: number
  holiday: number
  abnormal: number
  missingClockIn: number
  missingClockOut: number
}

export interface AttendanceMonitoringResult extends PaginatedAttendanceResult<AttendanceMonitoringRecord> {
  summary: AttendanceMonitoringSummary
}

export interface AttendanceMonitoringListParams {
  businessDate: string
  query?: string
  site?: AttendanceSiteCode[]
  attendanceStatus?: AttendanceStatus[]
  qualityStatus?: AttendanceQualityStatus[]
  abnormalReason?: AttendanceAbnormalReason[]
  page: number
  pageSize: number
}

export type AttendanceFinalizationStatus =
  | 'NOT_STARTED'
  | 'PARTIAL'
  | 'FINALIZED'
  | 'FAILED'

export interface AttendanceFinalizationCounts {
  eligible: number
  absent: number
  holiday: number
  preserved: number
  weeklyOff: number
  missingAssignment: number
  ambiguousAssignment: number
  ambiguousEmployment: number
  pendingDue: number
}

export interface AttendanceFinalization {
  uid: string | null
  site: AttendanceSiteCode
  businessDate: string
  status: AttendanceFinalizationStatus
  lastRunAt?: string | null
  source?: 'MANUAL' | 'CRON' | null
  counts: AttendanceFinalizationCounts
  warnings: string[]
  errorMessage?: string | null
  canRun: boolean
}

export interface AttendanceFinalizationListParams {
  businessDate: string
  site?: AttendanceSiteCode[]
}

export interface AttendanceFinalizationRunInput {
  siteCode: AttendanceSiteCode
  businessDate: string
  reason: string
}

export type AttendanceCorrectionType =
  | 'CLOCK_IN'
  | 'CLOCK_OUT'
  | 'BOTH'
  | 'STATUS'

export interface AttendanceCorrection {
  uid: string
  attendanceUid: string
  employeeUid: string
  employeeNumber: string
  employeeName: string
  employeeType: AttendanceEmployeeType
  site: AttendanceSiteCode
  businessDate: string
  correctionType: AttendanceCorrectionType
  oldClockInAt?: string | null
  newClockInAt?: string | null
  oldClockOutAt?: string | null
  newClockOutAt?: string | null
  oldStatus?: AttendanceStatus | null
  newStatus?: AttendanceStatus | null
  reason: string
  approvalStatus: CorrectionApprovalStatus
  requestedByName: string
  requestedAt: string
  reviewedByName?: string | null
  reviewedAt?: string | null
  reviewNotes?: string | null
  appliedAt?: string | null
}

export interface AttendanceCorrectionListParams {
  businessDate?: string
  query?: string
  site?: AttendanceSiteCode[]
  approvalStatus?: CorrectionApprovalStatus[]
  page: number
  pageSize: number
}

export interface AttendanceCorrectionInput {
  attendanceUid: string
  correctionType: AttendanceCorrectionType
  newClockInAt?: string | null
  newClockOutAt?: string | null
  newStatus?: AttendanceStatus | null
  reason: string
}

export interface AttendanceCorrectionReviewInput {
  decision: 'APPROVED' | 'REJECTED'
  reviewNotes?: string
}

export interface AttendanceClassificationEmployee {
  uid: string
  employeeNumber: string
  fullName: string
  employeeType: AttendanceEmployeeType
  site: AttendanceSiteCode
  shiftName?: string | null
}

export interface AttendanceClassificationEmployeeListParams {
  query?: string
  site?: AttendanceSiteCode
  page: number
  pageSize: number
}

export interface AttendanceClassificationAttachment {
  uid: string
  originalName: string
  mimeType: string
  sizeBytes: number
  extension?: string
  url?: string
}

export interface AttendanceClassification {
  uid: string
  employee: {
    uid: string
    employeeNumber: string
    fullName: string
    employeeType: AttendanceEmployeeType
  }
  site: AttendanceSiteCode
  classificationType: AttendanceClassificationType
  startDate: string
  endDate: string
  reason: string
  approvalStatus: AttendanceClassificationApprovalStatus
  requestedAt: string
  requestedByName: string
  reviewedAt?: string | null
  reviewedByName?: string | null
  reviewNotes?: string | null
  detailCount: number
  appliedCount: number
  skippedCount: number
  attachment?: AttendanceClassificationAttachment | null
}

export interface AttendanceClassificationDetailItem {
  uid: string
  businessDate: string
  outcome: AttendanceClassificationDetailOutcome
  attendanceUid?: string | null
  shiftName?: string | null
  notes?: string | null
}

export interface AttendanceClassificationDetail extends AttendanceClassification {
  details: AttendanceClassificationDetailItem[]
}

export interface AttendanceClassificationListParams {
  query?: string
  site?: AttendanceSiteCode[]
  classificationType?: AttendanceClassificationType[]
  approvalStatus?: AttendanceClassificationApprovalStatus[]
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
}

export interface AttendanceClassificationInput {
  employeeUid: string
  startDate: string
  endDate: string
  classificationType: AttendanceClassificationType
  reason: string
  fileUid?: string | null
}

export interface AttendanceClassificationReviewInput {
  decision: 'APPROVED' | 'REJECTED'
  reviewNotes?: string | null
}

export interface AttendanceClassificationReviewResult {
  uid: string
  approvalStatus: 'APPROVED' | 'REJECTED'
  appliedCount: number
  skippedCount: number
}
