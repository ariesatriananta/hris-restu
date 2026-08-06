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
  AttendanceCorrectionListParams,
  AttendanceCorrectionInput,
  AttendanceCorrectionReviewInput,
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
  corrections: (params?: AttendanceCorrectionListParams) =>
    [...attendanceKeys.all, 'corrections', params] as const,
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
