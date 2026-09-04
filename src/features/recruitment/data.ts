import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  RecruitmentCandidateDetail,
  RecruitmentConversionPrefill,
  RecruitmentConversionResult,
  RecruitmentListParams,
  RecruitmentListResult,
  RecruitmentMeta,
  RecruitmentStatus,
} from './domain'

function params(input: RecruitmentListParams) {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(',') : value,
      ])
  )
}

const keys = {
  all: ['recruitment'] as const,
  list: (input: RecruitmentListParams) =>
    ['recruitment', 'list', input] as const,
  detail: (uid?: string) => ['recruitment', 'detail', uid] as const,
  conversionPrefill: (uid?: string) =>
    ['recruitment', 'conversion-prefill', uid] as const,
}

export function useRecruitmentMeta() {
  return useQuery({
    queryKey: ['recruitment', 'meta'],
    queryFn: async () =>
      (await apiClient.get<RecruitmentMeta>('/recruitment/meta')).data,
    staleTime: 5 * 60 * 1000,
  })
}

export function useRecruitmentCandidates(input: RecruitmentListParams) {
  return useQuery({
    queryKey: keys.list(input),
    queryFn: async () =>
      (
        await apiClient.get<RecruitmentListResult>('/recruitment/candidates', {
          params: params(input),
        })
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function useRecruitmentCandidate(uid?: string) {
  return useQuery({
    queryKey: keys.detail(uid),
    queryFn: async () =>
      (
        await apiClient.get<RecruitmentCandidateDetail>(
          `/recruitment/candidates/${uid}`
        )
      ).data,
    enabled: Boolean(uid),
  })
}

export function useRecruitmentConversionPrefill(uid?: string) {
  return useQuery({
    queryKey: keys.conversionPrefill(uid),
    queryFn: async () =>
      (
        await apiClient.get<RecruitmentConversionPrefill>(
          `/recruitment/candidates/${uid}/conversion-prefill`
        )
      ).data,
    enabled: Boolean(uid),
  })
}

function useInvalidateRecruitment() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: keys.all })
}

export function useTransitionRecruitmentCandidate() {
  const invalidate = useInvalidateRecruitment()
  return useMutation({
    mutationFn: ({
      uid,
      ...input
    }: {
      uid: string
      toStatus: RecruitmentStatus
      currentStatus: RecruitmentStatus
      idempotencyKey: string
      applicantReason?: string
      internalNotes?: string
    }) => apiClient.post(`/recruitment/candidates/${uid}/status`, input),
    onSuccess: invalidate,
  })
}

export function useSaveRecruitmentNotes() {
  const invalidate = useInvalidateRecruitment()
  return useMutation({
    mutationFn: ({
      uid,
      ...input
    }: {
      uid: string
      internalNotes: string | null
      currentUpdatedAt: string
    }) =>
      apiClient.patch(`/recruitment/candidates/${uid}/internal-notes`, input),
    onSuccess: invalidate,
  })
}

export function useConvertRecruitmentCandidate() {
  const invalidate = useInvalidateRecruitment()
  return useMutation({
    mutationFn: ({
      uid,
      ...body
    }: {
      uid: string
      currentUpdatedAt: string
      idempotencyKey: string
      input: Record<string, unknown>
    }) =>
      apiClient
        .post<RecruitmentConversionResult>(
          `/recruitment/candidates/${uid}/convert`,
          body
        )
        .then((response) => response.data),
    onSuccess: invalidate,
  })
}

export async function getRecruitmentFile(
  candidateUid: string,
  fileUid: string
) {
  return (
    await apiClient.get<Blob>(
      `/recruitment/candidates/${candidateUid}/files/${fileUid}`,
      { responseType: 'blob' }
    )
  ).data
}
