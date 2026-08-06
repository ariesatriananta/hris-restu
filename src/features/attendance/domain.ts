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
  }
}
