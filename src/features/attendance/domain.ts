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
  | 'REVERSED'
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
  configuration: {
    goLiveDate: string
  }
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
  createShiftAssignments(
    input: ShiftAssignmentBatchInput
  ): Promise<ShiftAssignmentBatchResult>
  previewHistoricalShiftAssignment(
    input: HistoricalShiftAssignmentInput
  ): Promise<HistoricalShiftAssignmentPreview>
  applyHistoricalShiftAssignment(
    input: HistoricalShiftAssignmentApplyInput
  ): Promise<HistoricalShiftAssignmentApplyResult>
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
  getReadiness(input: AttendanceReadinessParams): Promise<AttendanceReadiness>
  getRecordTimeline(attendanceUid: string): Promise<AttendanceRecordTimeline>
  listFinalizations(
    input: AttendanceFinalizationListParams
  ): Promise<{ items: AttendanceFinalization[] }>
  runFinalization(
    input: AttendanceFinalizationRunInput
  ): Promise<AttendanceFinalization>
  listRecaps(input: AttendanceRecapListParams): Promise<AttendanceRecapResult>
  listRecapDays(
    employeeUid: string,
    input: AttendanceRecapDayListParams
  ): Promise<AttendanceRecapDayResult>
  exportRecaps(
    input: AttendanceRecapExportInput
  ): Promise<AttendanceRecapExport>
  listCorrections(
    input: AttendanceCorrectionListParams
  ): Promise<PaginatedAttendanceResult<AttendanceCorrection>>
  getCorrection(uid: string): Promise<AttendanceCorrection>
  createCorrection(input: AttendanceCorrectionInput): Promise<void>
  reviewCorrection(
    uid: string,
    input: AttendanceCorrectionReviewInput
  ): Promise<void>
  bulkReviewCorrections(
    input: AttendanceBulkReviewInput
  ): Promise<AttendanceBulkReviewResult>
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
  bulkReviewClassifications(
    input: AttendanceBulkReviewInput
  ): Promise<AttendanceBulkReviewResult>
  cancelClassification(uid: string): Promise<void>
  reverseClassification(
    uid: string,
    input: AttendanceClassificationReverseInput
  ): Promise<AttendanceClassificationReverseResult>
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
export type ShiftAssignmentEmployeeStatus =
  | 'ACTIVE'
  | 'LEAVE'
  | 'RESIGNED'
  | 'INACTIVE'

export interface ShiftAssignment {
  uid: string
  employeeUid: string
  employeeNumber: string
  employeeName: string
  employeeType: AttendanceEmployeeType
  employeeStatus: ShiftAssignmentEmployeeStatus
  position?: string
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
  hasAssignmentHistory: boolean
  minimumEffectiveFrom: string
  canBackdateFirstAssignment: boolean
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

export interface ShiftAssignmentBatchResult {
  createdCount: number
  closedPreviousCount: number
  backdatedFirstAssignmentCount: number
  invalidatedFinalizationCount: number
}

export interface HistoricalShiftAssignmentInput {
  employeeUid: string
  shiftUid: string
  effectiveFrom: string
  effectiveTo: string | null
  workDays: number[]
}

export type HistoricalShiftAssignmentApplyInput =
  HistoricalShiftAssignmentInput & {
    reason: string
  }

export interface HistoricalShiftAssignmentTimelineItem {
  shiftUid: string
  shiftName: string
  effectiveFrom: string
  effectiveTo?: string | null
  workDays: number[]
  sourceUid: string | null
  change: 'UNCHANGED' | 'TRUNCATED' | 'SPLIT' | 'REPLACEMENT'
}

export interface HistoricalShiftAssignmentPreview {
  employee: {
    uid: string
    employeeNumber: string
    fullName: string
    site: AttendanceSiteCode
  }
  replacement: {
    shiftUid: string
    shiftName: string
    site: AttendanceSiteCode
    effectiveFrom: string
    effectiveTo: string | null
    workDays: number[]
  }
  impactThroughDate: string
  timeline: HistoricalShiftAssignmentTimelineItem[]
  impact: {
    affectedAssignmentCount: number
    attendanceRecordCount: number
    rawScanCount: number
    approvedClassificationCount: number
    approvedCorrectionCount: number
    postedProductionCount: number
    lockedPayrollPeriodCount: number
    payrollAttendanceSnapshotCount: number
    runningFinalizationCount: number
    finalizationToInvalidateCount: number
  }
  blockers: string[]
  warnings: string[]
  canApply: boolean
}

export interface HistoricalShiftAssignmentApplyResult {
  assignmentUid: string
  adjustedAssignmentCount: number
  deletedAssignmentCount: number
  splitAssignmentCount: number
  reconciledAttendanceCount: number
  removedSyntheticAttendanceCount: number
  invalidatedFinalizationCount: number
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
  position?: string | null
  productionModule?: string | null
  productionSection?: string | null
  hasAppliedClassification: boolean
  pendingCorrectionUid?: string | null
  pendingCorrectionType?: AttendanceCorrectionType | null
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
  employeeType?: AttendanceEmployeeType[]
  productionSection?: string[]
  attendanceStatus?: AttendanceStatus[]
  qualityStatus?: AttendanceQualityStatus[]
  abnormalReason?: AttendanceAbnormalReason[]
  page: number
  pageSize: number
}

export interface AttendanceReadinessParams {
  site?: AttendanceSiteCode[]
}

export interface AttendanceReadinessSite {
  site: AttendanceSiteCode
  siteName: string
  shift: {
    eligibleEmployeeCount: number
    withoutAssignmentCount: number
    ambiguousAssignmentCount: number
    ready: boolean
  }
  devices: {
    totalCount: number
    readyCount: number
    notReadyCount: number
    hasReadyDevice: boolean
  }
  calendar: {
    nationalHolidayCount: number
    collectiveLeaveAvailableCount: number
    collectiveLeaveSelectedCount: number
    evidenceStatus: 'CONFIGURED' | 'NOT_CONFIGURED'
  }
  finalization: {
    rerunRequiredCount: number
    rerunRequiredDates: string[]
  }
  followUp: {
    pendingCorrectionCount: number
    pendingClassificationCount: number
    totalCount: number
  }
  attentionCount: number
}

export interface AttendanceReadiness {
  asOfDate: string
  calendarYear: number
  items: AttendanceReadinessSite[]
  totals: {
    siteCount: number
    attentionCount: number
    withoutAssignmentCount: number
    notReadyDeviceCount: number
    finalizationRerunCount: number
    pendingFollowUpCount: number
  }
}

export type AttendanceTimelineType =
  | 'SCAN'
  | 'CORRECTION'
  | 'CLASSIFICATION'
  | 'FINALIZATION'

export interface AttendanceRecordTimeline {
  attendance: {
    uid: string
    employeeUid: string
    employeeNumber: string
    employeeName: string
    site: AttendanceSiteCode
    businessDate: string
    status: AttendanceStatus
    shiftName?: string | null
  }
  items: Array<{
    uid: string
    type: AttendanceTimelineType
    occurredAt: string
    title: string
    status: string
    description: string
    actorName?: string | null
    metadata?: Record<string, unknown> | null
  }>
}

export type AttendanceRecapStatus = AttendanceStatus | 'WEEKLY_OFF'

export interface AttendanceRecapGroup {
  employeeUid: string
  employeeNumber: string
  employeeName: string
  site: AttendanceSiteCode
  siteName: string
  employeeType: AttendanceEmployeeType
  positions: string[]
  productionModules: string[]
  productionSectionUids: string[]
  productionSections: string[]
  shiftNames: string[]
  scheduledDays: number
  present: number
  presentWorkday: number
  presentHoliday: number
  absent: number
  leave: number
  sick: number
  permission: number
  holiday: number
  weeklyOff: number
  lateDays: number
  lateMinutes: number
  earlyLeaveDays: number
  earlyLeaveMinutes: number
  workedMinutes: number
  abnormal: number
}

export interface AttendanceRecapSummary {
  groups: number
  scheduledDays: number
  present: number
  presentWorkday: number
  presentHoliday: number
  absent: number
  leave: number
  sick: number
  permission: number
  holiday: number
  weeklyOff: number
  lateDays: number
  lateMinutes: number
  earlyLeaveDays: number
  earlyLeaveMinutes: number
  workedMinutes: number
  abnormal: number
}

export type AttendanceRecapCompletenessStatus =
  | AttendanceFinalizationStatus
  | 'PRE_GO_LIVE'

export interface AttendanceRecapCompletenessSite {
  site: AttendanceSiteCode
  date: string
  status: AttendanceRecapCompletenessStatus
  reasons: string[]
}

export interface AttendanceRecapCompleteness {
  exportAllowed: boolean
  official: boolean
  blockedReasons: string[]
  sites: AttendanceRecapCompletenessSite[]
}

export interface AttendanceRecapResult extends PaginatedAttendanceResult<AttendanceRecapGroup> {
  summary: AttendanceRecapSummary
  completeness: AttendanceRecapCompleteness
}

export interface AttendanceRecapListParams {
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

export interface AttendanceRecapDay {
  employeeUid: string
  employeeNumber: string
  employeeName: string
  businessDate: string
  dayName: string
  site: AttendanceSiteCode
  siteName: string
  employeeType: AttendanceEmployeeType
  department?: string | null
  position?: string | null
  productionModule?: string | null
  productionSection?: string | null
  workGroup?: string | null
  shiftUid?: string | null
  shiftCode?: string | null
  shiftName?: string | null
  shiftStartTime?: string | null
  shiftEndTime?: string | null
  status: AttendanceRecapStatus
  virtual: boolean
  calendarDayType: 'WORKDAY' | 'HOLIDAY' | 'NON_WORKDAY'
  calendarReasonType: string
  calendarName?: string | null
  clockInAt?: string | null
  clockOutAt?: string | null
  lateMinutes: number
  earlyLeaveMinutes: number
  workedMinutes?: number | null
  clockInSource?: string | null
  clockOutSource?: string | null
  isCorrected: boolean
  notes?: string | null
  qualityStatus: AttendanceQualityStatus
  abnormalReasons: AttendanceAbnormalReason[]
}

export interface AttendanceRecapDayListParams {
  dateFrom: string
  dateTo: string
  site?: AttendanceSiteCode
  employeeType?: AttendanceEmployeeType
  productionSection?: string[]
  attendanceStatus?: AttendanceRecapStatus[]
  page: number
  pageSize: number
}

export interface AttendanceRecapDayResult extends PaginatedAttendanceResult<AttendanceRecapDay> {
  completeness: AttendanceRecapCompleteness
}

export type AttendanceRecapExportInput = Omit<
  AttendanceRecapListParams,
  'page' | 'pageSize'
>

export interface AttendanceRecapExport {
  blob: Blob
  fileName: string
}

export type AttendanceFinalizationStatus =
  | 'NOT_STARTED'
  | 'NOT_REQUIRED'
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
  productionSectionUid?: string | null
  productionSection?: string | null
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
  employeeType?: AttendanceEmployeeType[]
  productionSection?: string[]
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

export interface AttendanceBulkReviewInput {
  site: AttendanceSiteCode
  uids: string[]
  decision: 'APPROVED'
  reviewNotes?: string
}

export interface AttendanceBulkReviewFailure {
  uid: string
  message: string
}

export interface AttendanceBulkReviewResult {
  requested: number
  approved: number
  failed: number
  failures: AttendanceBulkReviewFailure[]
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
    productionSectionUid?: string | null
    productionSection?: string | null
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
  reversedCount: number
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
  employeeType?: AttendanceEmployeeType[]
  productionSection?: string[]
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

export interface AttendanceClassificationReverseInput {
  reason: string
}

export interface AttendanceClassificationReverseResult {
  uid: string
  approvalStatus: 'CANCELLED'
  reversedCount: number
}

export function canReverseAttendanceClassification(
  approvalStatus: AttendanceClassificationApprovalStatus,
  canApprove: boolean
) {
  return canApprove && approvalStatus === 'APPROVED'
}

export function attendanceClassificationReverseReasonError(reason: string) {
  const length = reason.trim().length
  if (length < 10) return 'Alasan pembatalan minimal 10 karakter.'
  if (length > 500) return 'Alasan pembatalan maksimal 500 karakter.'
  return null
}
