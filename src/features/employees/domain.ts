export type SiteCode = 'JEPARA' | 'SEMARANG' | 'KLATEN'
export type EmployeeTypeCode = 'BORONGAN' | 'BULANAN'
export type EmployeeStatusCode = 'ACTIVE' | 'LEAVE' | 'RESIGNED' | 'INACTIVE'
export type EmploymentChangeType =
  | 'INITIAL'
  | 'TRANSFER'
  | 'PROMOTION'
  | 'DEMOTION'
  | 'STATUS_CHANGE'
  | 'TYPE_CHANGE'
  | 'GROUP_CHANGE'
  | 'PRODUCTION_ASSIGNMENT_CHANGE'
  | 'OTHER'
export type MutationChangeType = Exclude<
  EmploymentChangeType,
  'INITIAL' | 'STATUS_CHANGE'
>
export type ContractStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'TERMINATED'
  | 'CANCELLED'
export type DocumentStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ARCHIVED'
export type ScheduledMutationStatus =
  | 'SCHEDULED'
  | 'APPLIED'
  | 'FAILED'
  | 'CANCELLED'

export interface LookupOption {
  uid: string
  code: string
  name: string
  siteCode?: SiteCode
  employeeNumberPrefix?: string
}
export interface ProductionModuleLookup extends LookupOption {
  siteCode: SiteCode
}
export interface ProductionModuleSectionLookup {
  uid: string
  moduleUid: string
  sectionUid: string
  sectionCode: string
  sectionName: string
  siteCode: SiteCode
  isActive?: boolean
}
export interface MockFileAttachment {
  uid: string
  originalName: string
  mimeType: string
  sizeBytes: number
  extension?: string
  temporaryUrl?: string
  url?: string
}
export interface Employee {
  uid: string
  employeeNumber: string
  barcode: string
  fullName: string
  nickname?: string
  employeeType: EmployeeTypeCode
  employeeStatus: EmployeeStatusCode
  site: SiteCode
  department?: string
  position?: string
  workGroup?: string
  productionModuleSectionUid?: string
  productionModuleUid?: string
  productionModuleCode?: string
  productionModule?: string
  productionSectionUid?: string
  productionSectionCode?: string
  productionSection?: string
  joinDate: string
  joinDateTraining?: string
  joinDateBorong?: string
  permanentDate?: string
  resignDate?: string
  resignReason?: string
  gender: 'LAKI-LAKI' | 'PEREMPUAN' | 'MALE' | 'FEMALE'
  birthPlace?: string
  birthDate?: string
  maritalStatus?:
    | 'BELUM_KAWIN'
    | 'KAWIN'
    | 'CERAI_HIDUP'
    | 'CERAI_MATI'
    | 'SINGLE'
    | 'MARRIED'
    | 'DIVORCED'
    | 'WIDOWED'
  religion?: string
  address?: string
  rtrw?: string
  kelurahan?: string
  kecamatan?: string
  city?: string
  province?: string
  postalCode?: string
  phone?: string
  email?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  emergencyContactRelation?: string
  nationalIdNumber?: string
  familyCardNumber?: string
  taxNumber?: string
  bankName?: string
  bankAccountNumber?: string
  bankAccountName?: string
  bpjsHealthNumber?: string
  bpjsEmploymentNumber?: string
  photo?: MockFileAttachment
  notes?: string
  terminatedAt?: string
  terminationReason?: string
}
export type ContractLifecycleAction =
  | 'schedule'
  | 'activate'
  | 'terminate'
  | 'resign'
  | 'cancel'
export interface EmploymentHistory {
  uid: string
  employeeUid: string
  employeeName?: string
  employeeNumber?: string
  site: SiteCode
  department?: string
  position?: string
  workGroup?: string
  productionModuleUid?: string
  productionModule?: string
  productionSectionUid?: string
  productionSection?: string
  employeeType: EmployeeTypeCode
  employeeStatus: EmployeeStatusCode
  effectiveFrom: string
  effectiveTo?: string
  changeType: EmploymentChangeType
  referenceNumber?: string
  reason?: string
  notes?: string
}
export interface EmployeeContract {
  uid: string
  employeeUid: string
  contractNumber: string
  contractType: string
  sequenceNumber: number
  startDate: string
  endDate?: string
  signedDate?: string
  status: ContractStatus
  terminatedAt?: string
  terminationReason?: string
  positionNameSnapshot?: string
  siteNameSnapshot?: string
  salaryOrRateNotes?: string
  notes?: string
  issuedFile?: MockFileAttachment
  employeeName?: string
  site?: SiteCode
}
export interface ContractKpiSummary {
  activeValid: number
  expiringWithin7Days: number
  overdueActive: number
  drafts: number
  scheduled: number
  totalContracts: number
}
export interface EmployeeDocument {
  uid: string
  employeeUid: string
  documentType: string
  documentNumber?: string
  name: string
  issuedDate?: string
  expiryDate?: string
  status: DocumentStatus
  notes?: string
  file: MockFileAttachment
  employeeName?: string
  site?: SiteCode
}
export interface EmployeeInput extends Omit<
  Employee,
  | 'uid'
  | 'photo'
  | 'employeeNumber'
  | 'barcode'
  | 'productionModuleUid'
  | 'productionModuleCode'
  | 'productionModule'
  | 'productionSectionUid'
  | 'productionSectionCode'
  | 'productionSection'
> {
  photo?: MockFileAttachment
  productionModuleSectionUid?: string
}
export interface MutationInput {
  site: SiteCode
  department?: string
  position?: string
  workGroup?: string
  productionModuleUid?: string
  productionModuleSectionUid?: string
  employeeType: EmployeeTypeCode
  effectiveFrom: string
  changeType: MutationChangeType
  referenceNumber?: string
  reason?: string
  notes?: string
}
export interface ScheduledEmployeeMutation {
  uid: string
  employeeUid: string
  employeeName: string
  employeeNumber: string
  sourceSite: SiteCode
  site: SiteCode
  department?: string
  position?: string
  workGroup?: string
  employeeType: EmployeeTypeCode
  productionModuleSectionUid?: string
  productionModuleUid?: string
  productionModule?: string
  productionSectionUid?: string
  productionSection?: string
  effectiveFrom: string
  changeType: MutationChangeType
  referenceNumber?: string
  reason?: string
  notes?: string
  status: ScheduledMutationStatus
  failureReason?: string
  appliedAt?: string
}
export interface EmployeeListParams {
  query?: string
  site?: SiteCode | SiteCode[] | 'ALL'
  employeeType?: EmployeeTypeCode | EmployeeTypeCode[] | 'ALL'
  employeeStatus?: EmployeeStatusCode | EmployeeStatusCode[] | 'ALL'
  page?: number
  pageSize?: number
}
export interface EmployeeRecordListParams {
  query?: string
  site?: SiteCode[]
  status?: string[]
  page?: number
  pageSize?: number
}
export interface ContractLifecycleConflict {
  employeeUid: string
  employeeNumber: string
  fullName: string
  site: SiteCode
  reason: string
  contractNumbers: string[]
}
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
export interface EmployeeRepository {
  list(params: EmployeeListParams): Promise<PaginatedResult<Employee>>
  getByUid(uid: string): Promise<Employee | null>
  save(input: EmployeeInput, uid?: string): Promise<Employee>
  histories(employeeUid?: string): Promise<EmploymentHistory[]>
  applyMutation(
    employeeUid: string,
    input: MutationInput
  ): Promise<{ uid: string }>
  contracts(employeeUid?: string): Promise<EmployeeContract[]>
  saveContract(
    input: Omit<EmployeeContract, 'uid'>,
    uid?: string
  ): Promise<EmployeeContract>
  documents(employeeUid?: string): Promise<EmployeeDocument[]>
  saveDocument(
    input: Omit<EmployeeDocument, 'uid'>,
    uid?: string
  ): Promise<EmployeeDocument>
  reset(): Promise<void>
}
