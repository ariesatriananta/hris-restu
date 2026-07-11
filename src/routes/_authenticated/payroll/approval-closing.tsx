import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute(
  '/_authenticated/payroll/approval-closing'
)({ component: () => <ModulePlaceholder path='/payroll/approval-closing' /> })
