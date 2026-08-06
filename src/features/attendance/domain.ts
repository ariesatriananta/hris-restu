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
  }
}

export interface AttendanceRepository {
  getFoundation(): Promise<AttendanceFoundation>
}
