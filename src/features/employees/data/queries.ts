import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  EmployeeContract,
  EmployeeDocument,
  EmployeeInput,
  EmployeeListParams,
  EmployeeRecordListParams,
  LookupOption,
  ProductionModuleLookup,
  ProductionModuleSectionLookup,
  MutationInput,
  ContractLifecycleAction,
} from '../domain'
import {
  httpEmployeeRepository,
  getContract,
  getDocument,
  transitionContract,
  listContracts,
  listContractConflicts,
  listDocuments,
} from './http-employee-repository'

export const employeeKeys = {
  all: ['employees'] as const,
  list: (params: EmployeeListParams) =>
    [...employeeKeys.all, 'list', params] as const,
  detail: (uid: string) => [...employeeKeys.all, 'detail', uid] as const,
  histories: (uid?: string) =>
    [...employeeKeys.all, 'histories', uid ?? 'all'] as const,
  contracts: (uid?: string) =>
    [...employeeKeys.all, 'contracts', uid ?? 'all'] as const,
  documents: (uid?: string) =>
    [...employeeKeys.all, 'documents', uid ?? 'all'] as const,
  lookups: () => [...employeeKeys.all, 'lookups'] as const,
  contractList: (params: EmployeeRecordListParams) =>
    [...employeeKeys.all, 'contract-list', params] as const,
  documentList: (params: EmployeeRecordListParams) =>
    [...employeeKeys.all, 'document-list', params] as const,
  contract: (uid: string) => [...employeeKeys.all, 'contract', uid] as const,
  contractConflicts: () => [...employeeKeys.all, 'contract-conflicts'] as const,
  document: (uid: string) => [...employeeKeys.all, 'document', uid] as const,
}
export type EmployeeLookups = {
  sites: LookupOption[]
  departments: LookupOption[]
  positions: LookupOption[]
  workGroups: LookupOption[]
  productionModules: ProductionModuleLookup[]
  productionModuleSections: ProductionModuleSectionLookup[]
  contractTypes: LookupOption[]
}
export const useEmployeeLookups = (enabled = true) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.lookups(),
      queryFn: async (): Promise<EmployeeLookups> =>
        (await apiClient.get<EmployeeLookups>('/employees/lookups')).data,
      staleTime: 5 * 60 * 1000,
      enabled,
    })
  )
export const useEmployeeList = (
  params: EmployeeListParams,
  options?: { keepPreviousData?: boolean }
) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.list(params),
      queryFn: () => httpEmployeeRepository.list(params),
      placeholderData: options?.keepPreviousData ? keepPreviousData : undefined,
    })
  )
export const useEmployee = (uid: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.detail(uid),
      queryFn: () => httpEmployeeRepository.getByUid(uid),
      enabled: Boolean(uid),
    })
  )
export const useHistories = (uid?: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.histories(uid),
      queryFn: () => httpEmployeeRepository.histories(uid),
    })
  )
export const useContracts = (uid?: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.contracts(uid),
      queryFn: () => httpEmployeeRepository.contracts(uid),
    })
  )
export const useDocuments = (uid?: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.documents(uid),
      queryFn: () => httpEmployeeRepository.documents(uid!),
      enabled: Boolean(uid),
    })
  )
export const useContractList = (params: EmployeeRecordListParams) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.contractList(params),
      queryFn: () => listContracts(params),
    })
  )
export const useContractConflicts = () =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.contractConflicts(),
      queryFn: listContractConflicts,
      staleTime: 30 * 1000,
    })
  )
export const useDocumentList = (params: EmployeeRecordListParams) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.documentList(params),
      queryFn: () => listDocuments(params),
    })
  )
export const useContract = (uid: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.contract(uid),
      queryFn: () => getContract(uid),
      enabled: Boolean(uid),
    })
  )
export const useDocument = (uid: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.document(uid),
      queryFn: () => getDocument(uid),
      enabled: Boolean(uid),
    })
  )
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: employeeKeys.all })
}
export function useSaveEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, uid }: { input: EmployeeInput; uid?: string }) =>
      httpEmployeeRepository.save(input, uid),
    onSuccess: () => invalidate(queryClient),
  })
}
export function useApplyMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      employeeUid,
      input,
    }: {
      employeeUid: string
      input: MutationInput
    }) => httpEmployeeRepository.applyMutation(employeeUid, input),
    onSuccess: () => invalidate(queryClient),
  })
}
export function useSaveContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      input,
      uid,
    }: {
      input: Omit<EmployeeContract, 'uid'>
      uid?: string
    }) => httpEmployeeRepository.saveContract(input, uid),
    onSuccess: () => invalidate(queryClient),
  })
}
export function useTransitionContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      uid,
      action,
      input,
    }: {
      uid: string
      action: ContractLifecycleAction
      input: { effectiveDate?: string; reason?: string }
    }) => transitionContract(uid, action, input),
    onSuccess: () => invalidate(queryClient),
  })
}
export function useSaveDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      input,
      uid,
    }: {
      input: Omit<EmployeeDocument, 'uid'>
      uid?: string
    }) => httpEmployeeRepository.saveDocument(input, uid),
    onSuccess: () => invalidate(queryClient),
  })
}
