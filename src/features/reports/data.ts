import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  AttendanceReportParams,
  AttendanceReportResult,
  ContractReportMeta,
  ContractReportParams,
  ContractReportResult,
  EmployeeReportParams,
  EmployeeReportResult,
  ReportMeta,
} from './domain'

function queryParams<T extends object>(input: T) {
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(',') : value,
      ])
  )
}

export function useEmployeeReportMeta(asOf: string) {
  return useQuery({
    queryKey: ['reports', 'employees', 'meta', asOf],
    queryFn: async () =>
      (
        await apiClient.get<ReportMeta>('/reports/employees/meta', {
          params: { asOf },
        })
      ).data,
    staleTime: 5 * 60 * 1000,
  })
}

export function useEmployeeReport(input: EmployeeReportParams) {
  return useQuery({
    queryKey: ['reports', 'employees', input],
    queryFn: async () =>
      (
        await apiClient.get<EmployeeReportResult>('/reports/employees', {
          params: queryParams(input),
        })
      ).data,
    placeholderData: keepPreviousData,
  })
}

export function useExportEmployeeReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<EmployeeReportParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/employees/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-karyawan-${input.asOf}.xlsx`
      )
    },
  })
}

export function useContractReportMeta(
  referenceDate: string,
  dateFrom: string,
  dateTo: string,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'contracts', 'meta', referenceDate, dateFrom, dateTo],
    queryFn: async () =>
      (
        await apiClient.get<ContractReportMeta>('/reports/contracts/meta', {
          params: { referenceDate, dateFrom, dateTo },
        })
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useContractReport(input: ContractReportParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'contracts', input],
    queryFn: async () =>
      (
        await apiClient.get<ContractReportResult>('/reports/contracts', {
          params: queryParams(input),
        })
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useExportContractReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<ContractReportParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/contracts/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-kontrak-${input.dateFrom}-${input.dateTo}.xlsx`
      )
    },
  })
}

export function useAttendanceReportMeta(
  dateFrom: string,
  dateTo: string,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'attendance', 'meta', dateFrom, dateTo],
    queryFn: async () =>
      (
        await apiClient.get<ReportMeta>('/reports/attendance/meta', {
          params: { dateFrom, dateTo },
        })
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useAttendanceReport(
  input: AttendanceReportParams,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'attendance', input],
    queryFn: async () =>
      (
        await apiClient.get<AttendanceReportResult>('/reports/attendance', {
          params: queryParams(input),
        })
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

function reportExport(
  blob: Blob,
  contentDisposition: unknown,
  fallbackFileName: string
) {
  const disposition = String(contentDisposition ?? '')
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  return {
    blob,
    fileName:
      (encoded && decodeURIComponent(encoded)) || plain || fallbackFileName,
  }
}
