export type RecruitmentStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'PASSED'
  | 'REJECTED'
  | 'CONVERTED'

export type RecruitmentFileKind = 'PHOTO' | 'KTP' | 'KK'

export type RecruitmentSortBy =
  | 'submittedAt'
  | 'statusChangedAt'
  | 'fullName'
  | 'applicationNumber'

export interface RecruitmentSite {
  uid: string
  code: string
  name: string
}

export interface RecruitmentCandidateListItem {
  uid: string
  applicationNumber: string
  fullName: string
  nationalIdMasked: string
  phone: string
  status: RecruitmentStatus
  submittedAt: string
  statusChangedAt: string
  site: RecruitmentSite
}

export interface RecruitmentListResult {
  data: RecruitmentCandidateListItem[]
  meta: { page: number; pageSize: number; total: number }
  summary: { new: number; inProgress: number; passedNotConverted: number }
}

export interface RecruitmentMeta {
  sites: RecruitmentSite[]
  statuses: Array<{ value: RecruitmentStatus; label: string }>
}

export interface RecruitmentPublicLink {
  site: RecruitmentSite
  url: string | null
}

export interface RecruitmentPublicLinksResult {
  data: RecruitmentPublicLink[]
}

export interface RecruitmentCandidateFile {
  uid: string
  kind: RecruitmentFileKind
  originalName: string
  mimeType: string
  sizeBytes: number
}

export interface RecruitmentStatusEvent {
  uid: string
  fromStatus: RecruitmentStatus | null
  toStatus: RecruitmentStatus
  eventSource: 'PUBLIC_SUBMISSION' | 'HR_USER' | 'SYSTEM'
  applicantReason: string | null
  internalNotes: string | null
  actorName: string | null
  occurredAt: string
}

export interface RecruitmentCandidateDetail extends RecruitmentCandidateListItem {
  nationalIdNumber: string
  familyCardNumber: string
  gender: 'MALE' | 'FEMALE'
  birthPlace: string
  birthDate: string
  address: string
  email: string | null
  internalNotes: string | null
  updatedAt: string
  files: RecruitmentCandidateFile[]
  statusHistory: RecruitmentStatusEvent[]
  allowedTransitions: RecruitmentStatus[]
  canManage: boolean
  employeeUid: string | null
}

export interface RecruitmentListParams {
  search?: string
  site?: string[]
  status?: RecruitmentStatus[]
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
  sortBy?: RecruitmentSortBy
  sortDirection?: 'asc' | 'desc'
}

export interface RecruitmentConversionPrefill {
  candidate: {
    uid: string
    applicationNumber: string
    status: 'PASSED'
    updatedAt: string
    site: RecruitmentSite
    files: RecruitmentCandidateFile[]
  }
  employeeInput: {
    fullName: string
    nickname: string | null
    employeeType: null
    employeeStatus: 'INACTIVE'
    site: 'JEPARA' | 'SEMARANG' | 'KLATEN'
    department: string | null
    position: string | null
    workGroup: string | null
    productionModuleSectionUid: string | null
    joinDate: string
    gender: 'MALE' | 'FEMALE'
    birthPlace: string | null
    birthDate: string | null
    address: string | null
    phone: string | null
    email: string | null
    nationalIdNumber: string
    familyCardNumber: string
    [key: string]: unknown
  }
}

export interface RecruitmentConversionResult {
  candidateUid: string
  status: 'CONVERTED'
  employee: { uid: string; employeeNumber: string }
  replayed: boolean
}
