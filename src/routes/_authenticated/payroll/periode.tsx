import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { PayrollPeriodsPage } from '@/features/payroll/payroll-periods-page'

export const Route = createFileRoute('/_authenticated/payroll/periode')({
  beforeLoad: () => requirePermission('payroll.view'),
  validateSearch: z.object({
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    status: z
      .array(z.enum(['DRAFT', 'CALCULATED', 'APPROVED', 'CLOSED', 'CANCELLED']))
      .optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    detailUid: z.string().uuid().optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <PayrollPeriodsPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
