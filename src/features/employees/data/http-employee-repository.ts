import { apiClient } from '@/lib/api-client'
import type {
  EmployeeRepository,
  EmployeeListParams,
  Employee,
  EmploymentHistory,
  EmployeeContract,
  EmployeeDocument,
  EmployeeRecordListParams,
  PaginatedResult,
} from '../domain'

const params = (input: EmployeeListParams) => ({
  ...input,
  site: Array.isArray(input.site)
    ? input.site.join(',')
    : input.site === 'ALL'
      ? undefined
      : input.site,
  employeeType: Array.isArray(input.employeeType)
    ? input.employeeType.join(',')
    : input.employeeType === 'ALL'
      ? undefined
      : input.employeeType,
  employeeStatus: Array.isArray(input.employeeStatus)
    ? input.employeeStatus.join(',')
    : input.employeeStatus === 'ALL'
      ? undefined
      : input.employeeStatus,
  query: input.query,
})
export const httpEmployeeRepository: EmployeeRepository = {
  async list(input) {
    return (
      await apiClient.get<PaginatedResult<Employee>>('/employees', {
        params: params(input),
      })
    ).data
  },
  async getByUid(uid) {
    try {
      return (await apiClient.get<Employee>(`/employees/${uid}`)).data
    } catch (error) {
      if (
        (error as { response?: { status?: number } }).response?.status === 404
      )
        return null
      throw error
    }
  },
  async save(input, uid) {
    const body = { ...input, photoUid: input.photo?.uid }
    const response = uid
      ? await apiClient.patch(`/employees/${uid}`, body)
      : await apiClient.post<{ uid: string }>('/employees', body)
    return uid
      ? (await apiClient.get<Employee>(`/employees/${uid}`)).data
      : (await apiClient.get<Employee>(`/employees/${response.data.uid}`)).data
  },
  async histories(uid) {
    return (
      await apiClient.get<EmploymentHistory[]>(
        uid ? `/employees/${uid}/histories` : '/employees/histories'
      )
    ).data
  },
  async applyMutation(uid, input) {
    const response = await apiClient.post<{ uid: string }>(
      `/employees/${uid}/mutations`,
      input
    )
    return { uid: response.data.uid, employeeUid: uid, ...input }
  },
  async contracts(uid) {
    return (
      await apiClient.get<EmployeeContract[]>(
        uid ? `/employees/${uid}/contracts` : '/employees/contracts'
      )
    ).data
  },
  async saveContract(input, uid) {
    const body = { ...input, issuedFileUid: input.issuedFile?.uid }
    if (uid) {
      await apiClient.patch(`/employees/contracts/${uid}`, body)
      return { ...input, uid }
    }
    const response = await apiClient.post<{ uid: string }>(
      `/employees/${input.employeeUid}/contracts`,
      body
    )
    return { ...input, uid: response.data.uid }
  },
  async documents(uid) {
    return (
      await apiClient.get<EmployeeDocument[]>(
        uid ? `/employees/${uid}/documents` : '/employees/documents'
      )
    ).data
  },
  async saveDocument(input, uid) {
    const body = { ...input, fileUid: input.file.uid }
    if (uid) {
      await apiClient.patch(`/employees/documents/${uid}`, body)
      return { ...input, uid }
    }
    const response = await apiClient.post<{ uid: string }>(
      `/employees/${input.employeeUid}/documents`,
      body
    )
    return { ...input, uid: response.data.uid }
  },
  async reset() {
    throw new Error('Reset mock tidak tersedia pada API nyata.')
  },
}

const recordParams = (input: EmployeeRecordListParams) => ({
  ...input,
  site: input.site?.join(','),
  status: input.status?.join(','),
})

export const listContracts = async (input: EmployeeRecordListParams) =>
  (
    await apiClient.get<PaginatedResult<EmployeeContract>>(
      '/employees/contracts',
      {
        params: recordParams(input),
      }
    )
  ).data

export const listDocuments = async (input: EmployeeRecordListParams) =>
  (
    await apiClient.get<PaginatedResult<EmployeeDocument>>(
      '/employees/documents',
      {
        params: recordParams(input),
      }
    )
  ).data

export const getContract = async (uid: string) =>
  (await apiClient.get<EmployeeContract>(`/employees/contracts/${uid}`)).data

export const getDocument = async (uid: string) =>
  (await apiClient.get<EmployeeDocument>(`/employees/documents/${uid}`)).data
