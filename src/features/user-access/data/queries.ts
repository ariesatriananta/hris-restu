import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type {
  ResetPasswordInput,
  RoleInput,
  UserInput,
  UserListParams,
} from '../domain'
import { httpUserAccessRepository } from './http-user-access-repository'

const keys = {
  all: ['user-access'] as const,
  meta: () => ['user-access', 'meta'] as const,
  users: (params: UserListParams) => ['user-access', 'users', params] as const,
  user: (uid: string) => ['user-access', 'user', uid] as const,
  roles: () => ['user-access', 'roles'] as const,
  role: (uid: string) => ['user-access', 'role', uid] as const,
}

export const useAccessMeta = () =>
  useQuery({
    queryKey: keys.meta(),
    queryFn: () => httpUserAccessRepository.getMeta(),
    staleTime: 5 * 60 * 1000,
  })

export const useManagedUsers = (params: UserListParams) =>
  useQuery({
    queryKey: keys.users(params),
    queryFn: () => httpUserAccessRepository.listUsers(params),
    placeholderData: keepPreviousData,
  })

export const useManagedUser = (uid?: string) =>
  useQuery({
    queryKey: keys.user(uid ?? ''),
    queryFn: () => httpUserAccessRepository.getUser(uid!),
    enabled: Boolean(uid),
  })

export const useManagedRoles = () =>
  useQuery({
    queryKey: keys.roles(),
    queryFn: () => httpUserAccessRepository.listRoles(),
  })

export const useManagedRole = (uid?: string) =>
  useQuery({
    queryKey: keys.role(uid ?? ''),
    queryFn: () => httpUserAccessRepository.getRole(uid!),
    enabled: Boolean(uid),
  })

function useAccessMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  })
}

export const useCreateManagedUser = () =>
  useAccessMutation((input: UserInput) =>
    httpUserAccessRepository.createUser(input)
  )

export const useUpdateManagedUser = () =>
  useAccessMutation(({ uid, input }: { uid: string; input: UserInput }) =>
    httpUserAccessRepository.updateUser(uid, input)
  )

export const useResetManagedUserPassword = () =>
  useAccessMutation(
    ({ uid, input }: { uid: string; input: ResetPasswordInput }) =>
      httpUserAccessRepository.resetPassword(uid, input)
  )

export const useUpdateManagedRole = () =>
  useAccessMutation(({ uid, input }: { uid: string; input: RoleInput }) =>
    httpUserAccessRepository.updateRole(uid, input)
  )
