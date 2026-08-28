import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { PayrollApprovalClosingPage } from '@/features/payroll/payroll-approval-closing-page'

export const Route = createFileRoute(
  '/_authenticated/payroll/approval-closing'
)({
  beforeLoad: () => requirePermission('payroll.view'),
  validateSearch: z.object({
    periodUid: z.string().uuid().optional(),
    status: z
      .enum(['PENDING', 'CALCULATED', 'APPROVED', 'CLOSED', 'ALL'])
      .optional(),
    siteCode: z.string().optional(),
    query: z.string().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <PayrollApprovalClosingPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
