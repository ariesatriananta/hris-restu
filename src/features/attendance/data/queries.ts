import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type {
  ShiftAssignmentBatchInput,
  ShiftAssignmentCandidateListParams,
  ShiftAssignmentListParams,
  ShiftInput,
  ShiftListParams,
  AttendanceDeviceInput,
  AttendanceDeviceListParams,
  AttendanceScanInput,
  AttendanceMonitoringListParams,
  AttendanceFinalizationListParams,
  AttendanceFinalizationRunInput,
  AttendanceCorrectionListParams,
  AttendanceCorrectionInput,
  AttendanceCorrectionReviewInput,
  AttendanceClassificationEmployeeListParams,
  AttendanceClassificationListParams,
  AttendanceClassificationInput,
  AttendanceClassificationReviewInput,
} from '../domain'
import { httpAttendanceRepository } from './http-attendance-repository'

export const attendanceKeys = {
  all: ['attendance'] as const,
  foundation: () => [...attendanceKeys.all, 'foundation'] as const,
  shifts: (params?: ShiftListParams) =>
    [...attendanceKeys.all, 'shifts', params] as const,
  assignments: (params?: ShiftAssignmentListParams) =>
    [...attendanceKeys.all, 'shift-assignments', params] as const,
  candidates: (params?: ShiftAssignmentCandidateListParams) =>
    [...attendanceKeys.all, 'shift-assignment-candidates', params] as const,
  devices: (params?: AttendanceDeviceListParams) =>
    [...attendanceKeys.all, 'devices', params] as const,
  monitoring: (params?: AttendanceMonitoringListParams) =>
    [...attendanceKeys.all, 'monitoring', params] as const,
  finalizations: (params: AttendanceFinalizationListParams) =>
    [...attendanceKeys.all, 'finalizations', params] as const,
  corrections: (params?: AttendanceCorrectionListParams) =>
    [...attendanceKeys.all, 'corrections', params] as const,
  classificationEmployees: (
    params: AttendanceClassificationEmployeeListParams
  ) => [...attendanceKeys.all, 'classification-employees', params] as const,
  classifications: (params?: AttendanceClassificationListParams) =>
    [...attendanceKeys.all, 'classifications', params] as const,
  classification: (uid: string) =>
    [...attendanceKeys.all, 'classifications', uid] as const,
}

export const attendanceFoundationOptions = () =>
  queryOptions({
    queryKey: attendanceKeys.foundation(),
    queryFn: () => httpAttendanceRepository.getFoundation(),
    staleTime: 5 * 60 * 1000,
  })

export function useAttendanceFoundation(enabled = true) {
  return useQuery({ ...attendanceFoundationOptions(), enabled })
}

export const useShifts = (params: ShiftListParams) =>
  useQuery({
    queryKey: attendanceKeys.shifts(params),
    queryFn: () => httpAttendanceRepository.listShifts(params),
    placeholderData: keepPreviousData,
  })

export const useShiftAssignments = (params: ShiftAssignmentListParams) =>
  useQuery({
    queryKey: attendanceKeys.assignments(params),
    queryFn: () => httpAttendanceRepository.listShiftAssignments(params),
    placeholderData: keepPreviousData,
  })

export const useShiftAssignmentCandidates = (
  params: ShiftAssignmentCandidateListParams,
  enabled = true
) =>
  useQuery({
    queryKey: attendanceKeys.candidates(params),
    queryFn: () =>
      httpAttendanceRepository.listShiftAssignmentCandidates(params),
    placeholderData: keepPreviousData,
    enabled,
  })

const useAttendanceMutation = <TInput, TResult = void>(
  mutationFn: (input: TInput) => Promise<TResult>
) => {
  const client = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: attendanceKeys.all }),
  })
}

export const useSaveShift = () =>
  useAttendanceMutation(({ input, uid }: { input: ShiftInput; uid?: string }) =>
    httpAttendanceRepository.saveShift(input, uid)
  )
export const useDeleteShift = () =>
  useAttendanceMutation((uid: string) =>
    httpAttendanceRepository.deleteShift(uid)
  )
export const useCreateShiftAssignments = () =>
  useAttendanceMutation((input: ShiftAssignmentBatchInput) =>
    httpAttendanceRepository.createShiftAssignments(input)
  )
export const useDeleteShiftAssignment = () =>
  useAttendanceMutation((uid: string) =>
    httpAttendanceRepository.deleteShiftAssignment(uid)
  )

export const useAttendanceDevices = (params: AttendanceDeviceListParams) =>
  useQuery({
    queryKey: attendanceKeys.devices(params),
    queryFn: () => httpAttendanceRepository.listDevices(params),
    placeholderData: keepPreviousData,
  })

export const useSaveAttendanceDevice = () =>
  useAttendanceMutation(
    ({ input, uid }: { input: AttendanceDeviceInput; uid?: string }) =>
      httpAttendanceRepository.saveDevice(input, uid)
  )

export const useDeleteAttendanceDevice = () =>
  useAttendanceMutation((uid: string) =>
    httpAttendanceRepository.deleteDevice(uid)
  )

export const useRegenerateDeviceActivation = () =>
  useAttendanceMutation((uid: string) =>
    httpAttendanceRepository.regenerateDeviceActivation(uid)
  )

export const useActivateAttendanceDevice = () =>
  useMutation({
    mutationFn: (activationCode: string) =>
      httpAttendanceRepository.activateDevice(activationCode),
  })

export const useAttendanceScan = () =>
  useMutation({
    mutationFn: ({
      input,
      deviceToken,
    }: {
      input: AttendanceScanInput
      deviceToken: string
    }) => httpAttendanceRepository.scanAttendance(input, deviceToken),
  })

export const useAttendanceMonitoring = (
  params: AttendanceMonitoringListParams
) =>
  useQuery({
    queryKey: attendanceKeys.monitoring(params),
    queryFn: () => httpAttendanceRepository.listMonitoring(params),
    placeholderData: keepPreviousData,
  })

export const useAttendanceFinalizations = (
  params: AttendanceFinalizationListParams
) =>
  useQuery({
    queryKey: attendanceKeys.finalizations(params),
    queryFn: () => httpAttendanceRepository.listFinalizations(params),
  })

export const useRunAttendanceFinalization = () =>
  useAttendanceMutation((input: AttendanceFinalizationRunInput) =>
    httpAttendanceRepository.runFinalization(input)
  )

export const useAttendanceCorrections = (
  params: AttendanceCorrectionListParams
) =>
  useQuery({
    queryKey: attendanceKeys.corrections(params),
    queryFn: () => httpAttendanceRepository.listCorrections(params),
    placeholderData: keepPreviousData,
  })

export const useCreateAttendanceCorrection = () =>
  useAttendanceMutation((input: AttendanceCorrectionInput) =>
    httpAttendanceRepository.createCorrection(input)
  )

export const useReviewAttendanceCorrection = () =>
  useAttendanceMutation(
    ({ uid, input }: { uid: string; input: AttendanceCorrectionReviewInput }) =>
      httpAttendanceRepository.reviewCorrection(uid, input)
  )

export const useAttendanceClassificationEmployees = (
  params: AttendanceClassificationEmployeeListParams,
  enabled = true
) =>
  useQuery({
    queryKey: attendanceKeys.classificationEmployees(params),
    queryFn: () => httpAttendanceRepository.listClassificationEmployees(params),
    placeholderData: keepPreviousData,
    enabled,
  })

export const useAttendanceClassifications = (
  params: AttendanceClassificationListParams
) =>
  useQuery({
    queryKey: attendanceKeys.classifications(params),
    queryFn: () => httpAttendanceRepository.listClassifications(params),
    placeholderData: keepPreviousData,
  })

export const useAttendanceClassification = (uid?: string) =>
  useQuery({
    queryKey: attendanceKeys.classification(uid ?? ''),
    queryFn: () => httpAttendanceRepository.getClassification(uid!),
    enabled: Boolean(uid),
  })

export const useCreateAttendanceClassification = () =>
  useAttendanceMutation((input: AttendanceClassificationInput) =>
    httpAttendanceRepository.createClassification(input)
  )

export const useReviewAttendanceClassification = () =>
  useAttendanceMutation(
    ({
      uid,
      input,
    }: {
      uid: string
      input: AttendanceClassificationReviewInput
    }) => httpAttendanceRepository.reviewClassification(uid, input)
  )

export const useCancelAttendanceClassification = () =>
  useAttendanceMutation((uid: string) =>
    httpAttendanceRepository.cancelClassification(uid)
  )

export const uploadAttendanceClassificationAttachment = (file: File) =>
  httpAttendanceRepository.uploadClassificationAttachment(file)
