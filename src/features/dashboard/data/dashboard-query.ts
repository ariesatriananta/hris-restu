import { queryOptions, useQuery } from '@tanstack/react-query'
import { httpDashboardRepository } from './http-dashboard-repository'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overview: (site?: string) =>
    [...dashboardKeys.all, 'overview', site] as const,
}

export function dashboardOverviewOptions(site?: string) {
  return queryOptions({
    queryKey: dashboardKeys.overview(site),
    queryFn: ({ signal }) =>
      httpDashboardRepository.getOverview({ site, signal }),
    staleTime: 60_000,
    retry: 1,
  })
}

export function useDashboardOverview(site?: string) {
  return useQuery(dashboardOverviewOptions(site))
}
