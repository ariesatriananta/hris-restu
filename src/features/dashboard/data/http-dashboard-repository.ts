import { apiClient } from '@/lib/api-client'
import type { DashboardOverview, DashboardRepository } from './types'

export const httpDashboardRepository: DashboardRepository = {
  async getOverview({ site, signal }) {
    const response = await apiClient.get<{ data: DashboardOverview }>(
      '/dashboard/overview',
      {
        params: site ? { site } : undefined,
        signal,
      }
    )
    return response.status === 204 ? null : response.data.data
  },
}
