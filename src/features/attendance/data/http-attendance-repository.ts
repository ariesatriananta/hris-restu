import { apiClient } from '@/lib/api-client'
import type {
  AttendanceFoundation,
  AttendanceRepository,
  PaginatedAttendanceResult,
  Shift,
  ShiftAssignment,
  ShiftAssignmentCandidate,
  ShiftAssignmentListParams,
  ShiftListParams,
} from '../domain'

const listParams = (input: ShiftListParams | ShiftAssignmentListParams) =>
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
    await apiClient.post('/attendance/shift-assignments/batch', input)
  },
  async deleteShiftAssignment(uid) {
    await apiClient.delete(`/attendance/shift-assignments/${uid}`)
  },
}
