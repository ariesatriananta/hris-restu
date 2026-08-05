import { apiClient } from '@/lib/api-client'
import type {
  EmployeeRepository,
  EmployeeListParams,
  Employee,
  EmploymentHistory,
  EmployeeContract,
  EmployeeDocument,
  EmployeeRecordListParams,
  ContractLifecycleAction,
  ContractConflictListParams,
  ContractConflictListResult,
  ContractKpiSummary,
  ContractBatchItem,
  ContractBatchResult,
  ContractReconcileResult,
  ScheduledEmployeeMutation,
  ScheduledEmployeeStatusChange,
  ScheduledStatusChangeAction,
  PaginatedResult,
  MutationInput,
  RegistrationCorrectionInput,
  BatchMutationItem,
  BatchMutationResult,
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
    const { photo, ...employee } = input
    const body = { ...employee, photoUid: photo?.uid || undefined }
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
  async historyList(input) {
    return (
      await apiClient.get<PaginatedResult<EmploymentHistory>>(
        '/employees/histories',
        {
          params: recordParams(input),
        }
      )
    ).data
  },
  async applyMutation(uid, input) {
    const { productionModuleUid: _productionModuleUid, ...body } = input
    const response = await apiClient.post<{ uid: string }>(
      `/employees/${uid}/mutations`,
      body
    )
    return { uid: response.data.uid, employeeUid: uid, ...input }
  },
  async correctRegistration(uid, input) {
    const { productionModuleUid: _productionModuleUid, ...body } = input
    await apiClient.post(`/employees/${uid}/registration-correction`, body)
  },
  async contracts(uid) {
    return (
      await apiClient.get<EmployeeContract[]>(
        uid ? `/employees/${uid}/contracts` : '/employees/contracts'
      )
    ).data
  },
  async saveContract(input, uid) {
    const body = {
      contractType: input.contractType,
      startDate: input.startDate,
      endDate: input.endDate,
      signedDate: input.signedDate,
      issuedFileUid: input.issuedFile?.uid,
      notes: input.notes,
    }
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
  changeType: input.changeType?.join(','),
  coverage: input.coverage?.join(','),
  action: input.action?.join(','),
  productionModule: input.productionModule?.join(','),
  productionSection: input.productionSection?.join(','),
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

export const getContractKpiSummary = async (
  input: Pick<
    EmployeeRecordListParams,
    'site' | 'productionModule' | 'productionSection'
  >
) =>
  (
    await apiClient.get<ContractKpiSummary>('/employees/contracts/summary', {
      params: {
        site: input.site?.join(','),
        productionModule: input.productionModule?.join(','),
        productionSection: input.productionSection?.join(','),
      },
    })
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

export const listContractConflicts = async (
  input: ContractConflictListParams
) =>
  (
    await apiClient.get<ContractConflictListResult>(
      '/employees/contracts/conflicts',
      { params: input }
    )
  ).data

export const reconcileContracts = async () =>
  (
    await apiClient.post<ContractReconcileResult>(
      '/employees/contracts/reconcile'
    )
  ).data

export const getContract = async (uid: string) =>
  (await apiClient.get<EmployeeContract>(`/employees/contracts/${uid}`)).data

export const getDocument = async (uid: string) =>
  (await apiClient.get<EmployeeDocument>(`/employees/documents/${uid}`)).data
export const transitionContract = async (
  uid: string,
  action: ContractLifecycleAction,
  input: { effectiveDate?: string; reason?: string }
) =>
  (
    await apiClient.post<EmployeeContract>(
      `/employees/contracts/${uid}/${action}`,
      input
    )
  ).data

export const listScheduledMutations = async (input: EmployeeRecordListParams) =>
  (
    await apiClient.get<PaginatedResult<ScheduledEmployeeMutation>>(
      '/employees/scheduled-mutations',
      { params: recordParams(input) }
    )
  ).data

export const scheduledMutationsForEmployee = async (employeeUid: string) =>
  (
    await apiClient.get<ScheduledEmployeeMutation[]>(
      `/employees/${employeeUid}/scheduled-mutations`
    )
  ).data

export const scheduleMutation = async (
  employeeUid: string,
  input: MutationInput
) => {
  const { productionModuleUid: _productionModuleUid, ...body } = input
  return (
    await apiClient.post<{ uid: string }>(
      `/employees/${employeeUid}/scheduled-mutations`,
      body
    )
  ).data
}

export const applyBatchMutation = async (items: BatchMutationItem[]) =>
  (
    await apiClient.post<BatchMutationResult>('/employees/mutations/batch', {
      items: items.map(({ employeeUid, input }) => {
        const { productionModuleUid: _productionModuleUid, ...body } = input
        return { employeeUid, input: body }
      }),
    })
  ).data

export const correctRegistration = async (
  employeeUid: string,
  input: RegistrationCorrectionInput
) => httpEmployeeRepository.correctRegistration(employeeUid, input)

export const saveContractsBatch = async (items: ContractBatchItem[]) =>
  (
    await apiClient.post<ContractBatchResult>('/employees/contracts/batch', {
      items,
    })
  ).data

export type EmployeeImportPreview = {
  rows: {
    rowNumber: number
    fullName?: string
    employeeType?: string
    site?: string
    valid: boolean
    issues: string[]
  }[]
  total: number
  valid: number
  invalid: number
}

export const previewEmployeeImport = async (items: unknown[]) =>
  (
    await apiClient.post<EmployeeImportPreview>('/employees/import/preview', {
      items,
    })
  ).data

export const importEmployees = async (items: unknown[]) =>
  (
    await apiClient.post<{
      created: { uid: string; employeeNumber: string }[]
    }>('/employees/import', { items })
  ).data

export const updateScheduledMutation = async (
  uid: string,
  input: MutationInput
) => {
  const { productionModuleUid: _productionModuleUid, ...body } = input
  await apiClient.patch(`/employees/scheduled-mutations/${uid}`, body)
}

export const cancelScheduledMutation = async (uid: string) => {
  await apiClient.post(`/employees/scheduled-mutations/${uid}/cancel`)
}

export const listScheduledStatusChanges = async (
  input: EmployeeRecordListParams
) =>
  (
    await apiClient.get<PaginatedResult<ScheduledEmployeeStatusChange>>(
      '/employees/scheduled-status-changes',
      { params: recordParams(input) }
    )
  ).data

export const scheduleStatusChange = async (
  contractUid: string,
  input: {
    action: ScheduledStatusChangeAction
    effectiveDate: string
    reason: string
  }
) =>
  (
    await apiClient.post<{ uid: string }>(
      `/employees/contracts/${contractUid}/scheduled-status-changes`,
      input
    )
  ).data

export const updateScheduledStatusChange = async (
  uid: string,
  input: {
    action: ScheduledStatusChangeAction
    effectiveDate: string
    reason: string
  }
) => {
  await apiClient.patch(`/employees/scheduled-status-changes/${uid}`, input)
}

export const cancelScheduledStatusChange = async (uid: string) => {
  await apiClient.post(`/employees/scheduled-status-changes/${uid}/cancel`)
}
