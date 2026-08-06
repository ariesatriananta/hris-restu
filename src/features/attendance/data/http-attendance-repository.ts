import { apiClient } from '@/lib/api-client'
import type { AttendanceFoundation, AttendanceRepository } from '../domain'

export const httpAttendanceRepository: AttendanceRepository = {
  async getFoundation() {
    const { data } = await apiClient.get<AttendanceFoundation>(
      '/attendance/foundation'
    )
    return data
  },
}
