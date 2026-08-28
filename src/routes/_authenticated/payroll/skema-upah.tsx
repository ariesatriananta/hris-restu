import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { PayrollConfigurationPage } from '@/features/payroll/payroll-configuration-page'

export const Route = createFileRoute('/_authenticated/payroll/skema-upah')({
  beforeLoad: () => requirePermission('payroll.view'),
  validateSearch: z.object({
    tab: z.enum(['policy', 'daily-rate', 'salary', 'preflight']).optional(),
    site: z.string().trim().min(1).max(20).optional(),
    employeeType: z
      .enum(['BORONGAN', 'HARIAN', 'TRAINING', 'BULANAN'])
      .optional(),
    status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
    query: z.string().optional(),
    detailUid: z.string().uuid().optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <PayrollConfigurationPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
