import { apiClient } from '@/lib/api-client'
import type {
  AttendanceFoundation,
  AttendanceRepository,
  AttendanceDevice,
  AttendanceDeviceListParams,
  AttendanceDeviceActivation,
  ActivatedAttendanceDevice,
  AttendanceScanSuccess,
  PaginatedAttendanceResult,
  Shift,
  ShiftAssignment,
  ShiftAssignmentBatchResult,
  ShiftAssignmentCandidate,
  ShiftAssignmentListParams,
  ShiftListParams,
  AttendanceMonitoringListParams,
  AttendanceMonitoringResult,
  AttendanceReadiness,
  AttendanceRecordTimeline,
  AttendanceFinalization,
  AttendanceFinalizationListParams,
  AttendanceCorrection,
  AttendanceCorrectionListParams,
  AttendanceClassification,
  AttendanceClassificationDetail,
  AttendanceClassificationEmployee,
  AttendanceClassificationEmployeeListParams,
  AttendanceClassificationListParams,
  AttendanceBulkReviewResult,
  AttendanceRecapDayListParams,
  AttendanceRecapDayResult,
  AttendanceRecapListParams,
  AttendanceRecapResult,
  HistoricalShiftAssignmentApplyResult,
  HistoricalShiftAssignmentPreview,
} from '../domain'

const listParams = (
  input:
    | ShiftListParams
    | ShiftAssignmentListParams
    | AttendanceDeviceListParams
    | AttendanceMonitoringListParams
    | AttendanceFinalizationListParams
    | AttendanceCorrectionListParams
    | AttendanceClassificationEmployeeListParams
    | AttendanceClassificationListParams
    | AttendanceRecapListParams
    | AttendanceRecapDayListParams
) =>
  Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key === 'query' ? 'query' : key,
      Array.isArray(value) ? value.join(',') : value,
    ])
  )

export const httpAttendanceRepository: AttendanceRepository = {
  async getFoundation() {
    const { data } = await apiClient.get<AttendanceFoundation>(
      '/attendance/foundation'
    )
    return data
  },
  async listShifts(input) {
    return (
      await apiClient.get<PaginatedAttendanceResult<Shift>>(
        '/attendance/shifts',
        { params: listParams(input) }
      )
    ).data
  },
  async saveShift(input, uid) {
    if (uid) await apiClient.patch(`/attendance/shifts/${uid}`, input)
    else await apiClient.post('/attendance/shifts', input)
  },
  async deleteShift(uid) {
    await apiClient.delete(`/attendance/shifts/${uid}`)
  },
  async listShiftAssignments(input) {
    return (
      await apiClient.get<PaginatedAttendanceResult<ShiftAssignment>>(
        '/attendance/shift-assignments',
        { params: listParams(input) }
      )
    ).data
  },
  async listShiftAssignmentCandidates(input) {
    return (
      await apiClient.get<PaginatedAttendanceResult<ShiftAssignmentCandidate>>(
        '/attendance/shift-assignment-candidates',
        { params: listParams(input) }
      )
    ).data
  },
  async createShiftAssignments(input) {
    return (
      await apiClient.post<ShiftAssignmentBatchResult>(
        '/attendance/shift-assignments/batch',
        input
      )
    ).data
  },
  async previewHistoricalShiftAssignment(input) {
    return (
      await apiClient.post<HistoricalShiftAssignmentPreview>(
        '/attendance/shift-assignments/history/preview',
        input
      )
    ).data
  },
  async applyHistoricalShiftAssignment(input) {
    return (
      await apiClient.post<HistoricalShiftAssignmentApplyResult>(
        '/attendance/shift-assignments/history/apply',
        input
      )
    ).data
  },
  async deleteShiftAssignment(uid) {
    await apiClient.delete(`/attendance/shift-assignments/${uid}`)
  },
  async listDevices(input) {
    return (
      await apiClient.get<PaginatedAttendanceResult<AttendanceDevice>>(
        '/attendance/devices',
        { params: listParams(input) }
      )
    ).data
  },
  async saveDevice(input, uid) {
    if (uid) {
      await apiClient.patch(`/attendance/devices/${uid}`, input)
      return
    }
    return (
      await apiClient.post<AttendanceDeviceActivation>(
        '/attendance/devices',
        input
      )
    ).data
  },
  async deleteDevice(uid) {
    await apiClient.delete(`/attendance/devices/${uid}`)
  },
  async regenerateDeviceActivation(uid) {
    return (
      await apiClient.post<AttendanceDeviceActivation>(
        `/attendance/devices/${uid}/regenerate-activation`
      )
    ).data
  },
  async activateDevice(activationCode) {
    return (
      await apiClient.post<ActivatedAttendanceDevice>(
        '/attendance/devices/activate',
        { activationCode }
      )
    ).data
  },
  async scanAttendance(input, deviceToken) {
    return (
      await apiClient.post<AttendanceScanSuccess>(
        '/attendance/terminal/scan',
        input,
        { headers: { 'X-Attendance-Device-Token': deviceToken } }
      )
    ).data
  },
  async listMonitoring(input) {
    return (
      await apiClient.get<AttendanceMonitoringResult>(
        '/attendance/monitoring',
        {
          params: listParams(input),
        }
      )
    ).data
  },
  async getReadiness(input) {
    const params = new URLSearchParams()
    input.site?.forEach((site) => params.append('site', site))
    return (
      await apiClient.get<AttendanceReadiness>('/attendance/readiness', {
        params,
      })
    ).data
  },
  async getRecordTimeline(attendanceUid) {
    return (
      await apiClient.get<AttendanceRecordTimeline>(
        `/attendance/records/${attendanceUid}/timeline`
      )
    ).data
  },
  async listFinalizations(input) {
    return (
      await apiClient.get<{ items: AttendanceFinalization[] }>(
        '/attendance/finalizations',
        { params: listParams(input) }
      )
    ).data
  },
  async runFinalization(input) {
    return (
      await apiClient.post<AttendanceFinalization>(
        '/attendance/finalizations/run',
        input
      )
    ).data
  },
  async listRecaps(input) {
    return (
      await apiClient.get<AttendanceRecapResult>('/attendance/recaps', {
        params: listParams(input),
      })
    ).data
  },
  async listRecapDays(employeeUid, input) {
    return (
      await apiClient.get<AttendanceRecapDayResult>(
        `/attendance/recaps/${employeeUid}/days`,
        { params: listParams(input) }
      )
    ).data
  },
  async exportRecaps(input) {
    const response = await apiClient.post<Blob>(
      '/attendance/recaps/export',
      input,
      { responseType: 'blob' }
    )
    const disposition = String(response.headers['content-disposition'] ?? '')
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1]
    return {
      blob: response.data,
      fileName:
        (encoded && decodeURIComponent(encoded)) ||
        plain ||
        `rekap-attendance-${input.dateFrom}-${input.dateTo}.xlsx`,
    }
  },
  async listCorrections(input) {
    return (
      await apiClient.get<PaginatedAttendanceResult<AttendanceCorrection>>(
        '/attendance/corrections',
        { params: listParams(input) }
      )
    ).data
  },
  async getCorrection(uid) {
    return (
      await apiClient.get<AttendanceCorrection>(
        `/attendance/corrections/${uid}`
      )
    ).data
  },
  async createCorrection(input) {
    await apiClient.post('/attendance/corrections', input)
  },
  async reviewCorrection(uid, input) {
    await apiClient.post(`/attendance/corrections/${uid}/review`, input)
  },
  async bulkReviewCorrections(input) {
    return (
      await apiClient.post<AttendanceBulkReviewResult>(
        '/attendance/corrections/batch-review',
        input
      )
    ).data
  },
  async listClassificationEmployees(input) {
    return (
      await apiClient.get<
        PaginatedAttendanceResult<AttendanceClassificationEmployee>
      >('/attendance/classification-employees', { params: listParams(input) })
    ).data
  },
  async listClassifications(input) {
    return (
      await apiClient.get<PaginatedAttendanceResult<AttendanceClassification>>(
        '/attendance/classifications',
        { params: listParams(input) }
      )
    ).data
  },
  async getClassification(uid) {
    return (
      await apiClient.get<AttendanceClassificationDetail>(
        `/attendance/classifications/${uid}`
      )
    ).data
  },
  async createClassification(input) {
    return (
      await apiClient.post<{ uid: string; approvalStatus: 'PENDING' }>(
        '/attendance/classifications',
        input
      )
    ).data
  },
  async reviewClassification(uid, input) {
    return (
      await apiClient.post(`/attendance/classifications/${uid}/review`, input)
    ).data
  },
  async bulkReviewClassifications(input) {
    return (
      await apiClient.post<AttendanceBulkReviewResult>(
        '/attendance/classifications/batch-review',
        input
      )
    ).data
  },
  async cancelClassification(uid) {
    await apiClient.post(`/attendance/classifications/${uid}/cancel`)
  },
  async reverseClassification(uid, input) {
    return (
      await apiClient.post<{
        uid: string
        approvalStatus: 'CANCELLED'
        reversedCount: number
      }>(`/attendance/classifications/${uid}/reverse`, input)
    ).data
  },
  async uploadClassificationAttachment(file) {
    const body = new FormData()
    body.append('file', file)
    body.append('purpose', 'ATTENDANCE_CLASSIFICATION')
    return (await apiClient.post('/files', body)).data
  },
}
