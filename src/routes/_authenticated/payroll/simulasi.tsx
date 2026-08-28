import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { PayrollSimulationPage } from '@/features/payroll/payroll-simulation-page'

export const Route = createFileRoute('/_authenticated/payroll/simulasi')({
  beforeLoad: () => requirePermission('payroll.view'),
  validateSearch: z.object({
    periodUid: z.string().uuid().optional(),
    runUid: z.string().uuid().optional(),
    employeeUid: z.string().uuid().optional(),
    filter: z.string().optional(),
    issue: z.enum(['NEGATIVE_NET', 'MISSING_BANK']).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <PayrollSimulationPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
