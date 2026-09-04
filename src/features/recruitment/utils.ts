import type { Employee, EmployeeInput } from '@/features/employees/domain'
import type {
  RecruitmentFileKind,
  RecruitmentListParams,
  RecruitmentSortBy,
  RecruitmentStatus,
} from './domain'

export const recruitmentStatusLabels: Record<RecruitmentStatus, string> = {
  NEW: 'Baru',
  IN_PROGRESS: 'Diproses',
  PASSED: 'Lolos',
  REJECTED: 'Tidak Lolos',
  CONVERTED: 'Sudah menjadi karyawan',
}

export function recruitmentStatusLabel(status: RecruitmentStatus) {
  return recruitmentStatusLabels[status]
}

export function recruitmentFileLabel(kind: RecruitmentFileKind) {
  return { PHOTO: 'Foto pelamar', KTP: 'Foto KTP', KK: 'Foto KK' }[kind]
}

export function recruitmentActionLabel(
  status: RecruitmentStatus,
  currentStatus?: RecruitmentStatus
) {
  if (currentStatus === 'PASSED' && status === 'IN_PROGRESS') {
    return 'Kembalikan ke Diproses'
  }
  return {
    NEW: 'Kembalikan ke Baru',
    IN_PROGRESS: 'Mulai proses',
    PASSED: 'Nyatakan lolos',
    REJECTED: 'Nyatakan tidak lolos',
    CONVERTED: 'Sudah menjadi karyawan',
  }[status]
}

export function formatRecruitmentDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function buildRecruitmentListParams(search: {
  filter?: string
  site?: string[]
  status?: RecruitmentStatus[]
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
  sortBy?: RecruitmentSortBy
  sortDirection?: 'asc' | 'desc'
}): RecruitmentListParams {
  return {
    search: search.filter,
    site: search.site,
    status: search.status,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
    sortBy: search.sortBy,
    sortDirection: search.sortDirection,
  }
}

export function visibleRecruitmentActions(
  canManage: boolean,
  allowedTransitions: RecruitmentStatus[]
) {
  return canManage ? allowedTransitions : []
}

export function recruitmentEmployeeDefaults(
  input: Record<string, unknown>
): Partial<Employee> {
  const gender =
    input.gender === 'FEMALE'
      ? 'PEREMPUAN'
      : input.gender === 'MALE'
        ? 'LAKI-LAKI'
        : (input.gender as Employee['gender'])
  return {
    ...(input as Partial<Employee>),
    employeeType:
      (input.employeeType as Employee['employeeType'] | null) ?? 'BORONGAN',
    employeeStatus: 'INACTIVE',
    gender,
  }
}

export function recruitmentConversionInput(input: EmployeeInput) {
  const {
    employeeStatus: _employeeStatus,
    photo: _photo,
    ...conversionInput
  } = input
  return conversionInput
}
