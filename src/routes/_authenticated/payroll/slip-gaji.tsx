import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute('/_authenticated/payroll/slip-gaji')({
  component: () => <ModulePlaceholder path='/payroll/slip-gaji' />,
})
