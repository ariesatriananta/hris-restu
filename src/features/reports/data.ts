import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  AuditActivityReportMeta,
  AuditActivityReportParams,
  AuditActivityReportResult,
  AttendanceCorrectionReportMeta,
  AttendanceCorrectionReportParams,
  AttendanceCorrectionReportResult,
  AttendanceClassificationReportMeta,
  AttendanceClassificationReportParams,
  AttendanceClassificationReportResult,
  AttendanceReportParams,
  AttendanceReportResult,
  ContractReportMeta,
  ContractReportParams,
  ContractReportResult,
  DeviceScanReportMeta,
  DeviceScanReportParams,
  DeviceScanReportResult,
  EmployeeReportParams,
  EmployeeReportResult,
  HeadcountChangeReportMeta,
  HeadcountChangeReportParams,
  HeadcountChangeReportResult,
  MutationReportMeta,
  MutationReportParams,
  MutationReportResult,
  PayrollFinalReportMeta,
  PayrollFinalReportParams,
  PayrollFinalReportResult,
  ReportMeta,
  ShiftAssignmentReportMeta,
  ShiftAssignmentReportParams,
  ShiftAssignmentReportResult,
  TenureTurnoverReportMeta,
  TenureTurnoverReportParams,
  TenureTurnoverReportResult,
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

export function useMutationReportMeta(
  dateFrom: string,
  dateTo: string,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'mutations', 'meta', dateFrom, dateTo],
    queryFn: async () =>
      (
        await apiClient.get<MutationReportMeta>('/reports/mutations/meta', {
          params: { dateFrom, dateTo },
        })
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useMutationReport(input: MutationReportParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'mutations', input],
    queryFn: async () =>
      (
        await apiClient.get<MutationReportResult>('/reports/mutations', {
          params: queryParams(input),
        })
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useExportMutationReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<MutationReportParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/mutations/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-mutasi-${input.dateFrom}-${input.dateTo}.xlsx`
      )
    },
  })
}

export function usePayrollFinalReportMeta(enabled = true) {
  return useQuery({
    queryKey: ['reports', 'payroll-final', 'meta'],
    queryFn: async () =>
      (
        await apiClient.get<PayrollFinalReportMeta>(
          '/reports/payroll-final/meta'
        )
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function usePayrollFinalReport(
  input: PayrollFinalReportParams,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'payroll-final', input],
    queryFn: async () =>
      (
        await apiClient.get<PayrollFinalReportResult>(
          '/reports/payroll-final',
          { params: queryParams(input) }
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useExportPayrollFinalReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<PayrollFinalReportParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/payroll-final/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-payroll-final-${input.dateFrom}-${input.dateTo}.xlsx`
      )
    },
  })
}

export function useAttendanceClassificationReportMeta(
  dateFrom: string,
  dateTo: string,
  enabled = true
) {
  return useQuery({
    queryKey: [
      'reports',
      'attendance-classifications',
      'meta',
      dateFrom,
      dateTo,
    ],
    queryFn: async () =>
      (
        await apiClient.get<AttendanceClassificationReportMeta>(
          '/reports/attendance-classifications/meta',
          { params: { dateFrom, dateTo } }
        )
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useAttendanceClassificationReport(
  input: AttendanceClassificationReportParams,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'attendance-classifications', input],
    queryFn: async () =>
      (
        await apiClient.get<AttendanceClassificationReportResult>(
          '/reports/attendance-classifications',
          { params: queryParams(input) }
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useExportAttendanceClassificationReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<AttendanceClassificationReportParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/attendance-classifications/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-cuti-sakit-izin-${input.dateFrom}-${input.dateTo}.xlsx`
      )
    },
  })
}

export function useAttendanceCorrectionReportMeta(
  dateFrom: string,
  dateTo: string,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'attendance-corrections', 'meta', dateFrom, dateTo],
    queryFn: async () =>
      (
        await apiClient.get<AttendanceCorrectionReportMeta>(
          '/reports/attendance-corrections/meta',
          { params: { dateFrom, dateTo } }
        )
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useAttendanceCorrectionReport(
  input: AttendanceCorrectionReportParams,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'attendance-corrections', input],
    queryFn: async () =>
      (
        await apiClient.get<AttendanceCorrectionReportResult>(
          '/reports/attendance-corrections',
          { params: queryParams(input) }
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useExportAttendanceCorrectionReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<AttendanceCorrectionReportParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/attendance-corrections/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-koreksi-attendance-${input.dateFrom}-${input.dateTo}.xlsx`
      )
    },
  })
}

export function useShiftAssignmentReportMeta(
  referenceDate: string,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'shift-assignments', 'meta', referenceDate],
    queryFn: async () =>
      (
        await apiClient.get<ShiftAssignmentReportMeta>(
          '/reports/shift-assignments/meta',
          { params: { referenceDate } }
        )
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useShiftAssignmentReport(
  input: ShiftAssignmentReportParams,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'shift-assignments', input],
    queryFn: async () =>
      (
        await apiClient.get<ShiftAssignmentReportResult>(
          '/reports/shift-assignments',
          { params: queryParams(input) }
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useExportShiftAssignmentReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<ShiftAssignmentReportParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/shift-assignments/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-penugasan-shift-${input.referenceDate}.xlsx`
      )
    },
  })
}

export function useDeviceScanReportMeta(
  dateFrom: string,
  dateTo: string,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'device-scans', 'meta', dateFrom, dateTo],
    queryFn: async () =>
      (
        await apiClient.get<DeviceScanReportMeta>(
          '/reports/device-scans/meta',
          {
            params: { dateFrom, dateTo },
          }
        )
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useDeviceScanReport(
  input: DeviceScanReportParams,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'device-scans', input],
    queryFn: async () =>
      (
        await apiClient.get<DeviceScanReportResult>('/reports/device-scans', {
          params: queryParams(input),
        })
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useExportDeviceScanReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<DeviceScanReportParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/device-scans/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-perangkat-scan-${input.dateFrom}-${input.dateTo}.xlsx`
      )
    },
  })
}

export function useAuditActivityReportMeta(
  dateFrom: string,
  dateTo: string,
  site?: string[],
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'audit-activities', 'meta', dateFrom, dateTo, site],
    queryFn: async () =>
      (
        await apiClient.get<AuditActivityReportMeta>(
          '/reports/audit-activities/meta',
          { params: queryParams({ dateFrom, dateTo, site }) }
        )
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useAuditActivityReport(
  input: AuditActivityReportParams,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'audit-activities', input],
    queryFn: async () =>
      (
        await apiClient.get<AuditActivityReportResult>(
          '/reports/audit-activities',
          { params: queryParams(input) }
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useExportAuditActivityReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<AuditActivityReportParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/audit-activities/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-audit-aktivitas-${input.dateFrom}-${input.dateTo}.xlsx`
      )
    },
  })
}

export function useHeadcountChangeReportMeta(
  dateFrom: string,
  dateTo: string,
  site?: string[],
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'headcount-changes', 'meta', dateFrom, dateTo, site],
    queryFn: async () =>
      (
        await apiClient.get<HeadcountChangeReportMeta>(
          '/reports/headcount-changes/meta',
          { params: queryParams({ dateFrom, dateTo, site }) }
        )
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useHeadcountChangeReport(
  input: HeadcountChangeReportParams,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'headcount-changes', input],
    queryFn: async () =>
      (
        await apiClient.get<HeadcountChangeReportResult>(
          '/reports/headcount-changes',
          { params: queryParams(input) }
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useExportHeadcountChangeReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<HeadcountChangeReportParams, 'page' | 'pageSize'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/headcount-changes/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-perubahan-jumlah-karyawan-${input.dateFrom}-${input.dateTo}.xlsx`
      )
    },
  })
}

export function useTenureTurnoverReportMeta(
  dateFrom: string,
  dateTo: string,
  site?: string[],
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'tenure-turnover', 'meta', dateFrom, dateTo, site],
    queryFn: async () =>
      (
        await apiClient.get<TenureTurnoverReportMeta>(
          '/reports/tenure-turnover/meta',
          { params: queryParams({ dateFrom, dateTo, site }) }
        )
      ).data,
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useTenureTurnoverReport(
  input: TenureTurnoverReportParams,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'tenure-turnover', input],
    queryFn: async () =>
      (
        await apiClient.get<TenureTurnoverReportResult>(
          '/reports/tenure-turnover',
          { params: queryParams(input) }
        )
      ).data,
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useExportTenureTurnoverReport() {
  return useMutation({
    mutationFn: async (
      input: Omit<TenureTurnoverReportParams, 'page' | 'pageSize' | 'view'>
    ) => {
      const response = await apiClient.post<Blob>(
        '/reports/tenure-turnover/export',
        input,
        { responseType: 'blob' }
      )
      return reportExport(
        response.data,
        response.headers['content-disposition'],
        `laporan-masa-kerja-turnover-${input.dateFrom}-${input.dateTo}.xlsx`
      )
    },
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
