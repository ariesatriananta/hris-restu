import { queryOptions, useQuery } from '@tanstack/react-query'
import { httpAttendanceRepository } from './http-attendance-repository'

export const attendanceKeys = {
  all: ['attendance'] as const,
  foundation: () => [...attendanceKeys.all, 'foundation'] as const,
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
