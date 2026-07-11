import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type {
  EmployeeContract,
  EmployeeDocument,
  EmployeeInput,
  EmployeeListParams,
  MutationInput,
} from '../domain'
import { mockEmployeeRepository } from './mock-employee-repository'

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
}
export const useEmployeeList = (params: EmployeeListParams) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.list(params),
      queryFn: () => mockEmployeeRepository.list(params),
    })
  )
export const useEmployee = (uid: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.detail(uid),
      queryFn: () => mockEmployeeRepository.getByUid(uid),
    })
  )
export const useHistories = (uid?: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.histories(uid),
      queryFn: () => mockEmployeeRepository.histories(uid),
    })
  )
export const useContracts = (uid?: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.contracts(uid),
      queryFn: () => mockEmployeeRepository.contracts(uid),
    })
  )
export const useDocuments = (uid?: string) =>
  useQuery(
    queryOptions({
      queryKey: employeeKeys.documents(uid),
      queryFn: () => mockEmployeeRepository.documents(uid),
    })
  )
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: employeeKeys.all })
}
export function useSaveEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, uid }: { input: EmployeeInput; uid?: string }) =>
      mockEmployeeRepository.save(input, uid),
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
    }) => mockEmployeeRepository.applyMutation(employeeUid, input),
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
    }) => mockEmployeeRepository.saveContract(input, uid),
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
    }) => mockEmployeeRepository.saveDocument(input, uid),
    onSuccess: () => invalidate(queryClient),
  })
}
