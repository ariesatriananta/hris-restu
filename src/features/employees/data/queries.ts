import {
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
  LookupOption,
  MutationInput,
} from '../domain'
import { httpEmployeeRepository } from './http-employee-repository'

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
}
export type EmployeeLookups = {
  sites: LookupOption[]
  departments: LookupOption[]
  positions: LookupOption[]
  workGroups: LookupOption[]
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
export const useEmployeeList = (params: EmployeeListParams) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.list(params),
      queryFn: () => httpEmployeeRepository.list(params),
    })
  )
export const useEmployee = (uid: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.detail(uid),
      queryFn: () => httpEmployeeRepository.getByUid(uid),
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
      queryFn: () => httpEmployeeRepository.documents(uid),
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
