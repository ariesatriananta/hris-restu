import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute(
  '/_authenticated/attendance/monitoring-harian'
)({
  component: () => <ModulePlaceholder path='/attendance/monitoring-harian' />,
})
