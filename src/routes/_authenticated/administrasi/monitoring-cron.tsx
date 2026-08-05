import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { CronMonitoringPage } from '@/features/system-monitoring/cron-monitoring-page'

const searchSchema = z.object({
  page: optionalInteger(1),
  pageSize: optionalInteger(1, 500),
  status: z.enum(['RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED']).optional(),
})

function optionalInteger(minimum: number, maximum?: number) {
  return z
    .union([z.number(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return undefined
      const parsed = Number(value)
      return Number.isInteger(parsed) &&
        parsed >= minimum &&
        (maximum === undefined || parsed <= maximum)
        ? parsed
        : undefined
    })
}

export const Route = createFileRoute(
  '/_authenticated/administrasi/monitoring-cron'
)({
  validateSearch: searchSchema,
  component: RouteComponent,
})

function RouteComponent() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <CronMonitoringPage
      search={search}
      onSearchChange={(next) => void navigate({ search: next })}
    />
  )
}
