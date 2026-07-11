import { queryOptions, useQuery } from '@tanstack/react-query'
import { mockDashboardRepository } from './mock-dashboard-repository'
import type { DashboardMockState, SiteCode } from './types'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overview: (site: SiteCode, mockState: DashboardMockState) =>
    [...dashboardKeys.all, 'overview', site, mockState] as const,
}

export function dashboardOverviewOptions(
  site: SiteCode,
  mockState: DashboardMockState
) {
  return queryOptions({
    queryKey: dashboardKeys.overview(site, mockState),
    queryFn: ({ signal }) =>
      mockDashboardRepository.getOverview({ site, mockState, signal }),
    retry: false,
  })
}

export function useDashboardOverview(
  site: SiteCode,
  mockState: DashboardMockState
) {
  return useQuery(dashboardOverviewOptions(site, mockState))
}
