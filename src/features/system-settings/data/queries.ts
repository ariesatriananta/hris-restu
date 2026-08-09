import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  AttendanceSystemSettings,
  CompanyLogo,
  CompanyProfileSettings,
  ContractSettings,
  UpdateCompanyProfileInput,
  UpdateContractSettingsInput,
} from '../domain'

const contractSettingsOptions = queryOptions({
  queryKey: ['system-settings', 'contracts'],
  staleTime: 30_000,
  refetchOnWindowFocus: false,
  queryFn: async () =>
    (await apiClient.get<ContractSettings>('/system/settings/contracts')).data,
})

export function useContractSettings() {
  return useQuery(contractSettingsOptions)
}

export function useUpdateContractSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateContractSettingsInput) =>
      (
        await apiClient.put<{ updatedCount: number }>(
          '/system/settings/contracts',
          input
        )
      ).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: contractSettingsOptions.queryKey,
      })
    },
  })
}

const companyProfileSettingsOptions = queryOptions({
  queryKey: ['system-settings', 'company-profile'],
  staleTime: 30_000,
  refetchOnWindowFocus: false,
  queryFn: async () =>
    (
      await apiClient.get<CompanyProfileSettings>(
        '/system/settings/company-profile'
      )
    ).data,
})

export function useCompanyProfileSettings() {
  return useQuery(companyProfileSettingsOptions)
}

export function useUpdateCompanyProfileSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateCompanyProfileInput) =>
      (
        await apiClient.put<{ updated: boolean }>(
          '/system/settings/company-profile',
          input
        )
      ).data,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: companyProfileSettingsOptions.queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: ['system-settings', 'contracts'],
        }),
      ])
    },
  })
}

export function useUploadCompanyLogo() {
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('file', file)
      body.append('purpose', 'COMPANY_LOGO')
      return (await apiClient.post<CompanyLogo>('/files', body)).data
    },
  })
}

const attendanceSettingsOptions = queryOptions({
  queryKey: ['system-settings', 'attendance'],
  staleTime: 30_000,
  refetchOnWindowFocus: false,
  queryFn: async () =>
    (
      await apiClient.get<AttendanceSystemSettings>(
        '/system/settings/attendance'
      )
    ).data,
})

export function useAttendanceSystemSettings() {
  return useQuery(attendanceSettingsOptions)
}
