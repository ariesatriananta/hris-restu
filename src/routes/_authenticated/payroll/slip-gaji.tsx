import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { PayrollPayslipsPage } from '@/features/payroll/payroll-payslips-page'

export const Route = createFileRoute('/_authenticated/payroll/slip-gaji')({
  beforeLoad: () => requirePermission('payroll.view'),
  validateSearch: z.object({
    periodUid: z.string().uuid().optional(),
    runUid: z.string().uuid().optional(),
    query: z.string().optional(),
    employeeResultUid: z.string().uuid().optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return <PayrollPayslipsPage search={Route.useSearch()} navigate={Route.useNavigate()} />
}
