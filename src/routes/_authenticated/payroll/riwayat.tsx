import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { PayrollHistoryPage } from '@/features/payroll/payroll-history-page'

export const Route = createFileRoute('/_authenticated/payroll/riwayat')({
  beforeLoad: () => requirePermission('payroll.view'),
  validateSearch: z.object({
    query: z.string().optional(),
    siteCode: z.string().trim().min(1).max(20).optional(),
    status: z.enum(['DRAFT', 'CALCULATED', 'APPROVED', 'CLOSED', 'CANCELLED']).optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    periodUid: z.string().uuid().optional(),
    baseRunUid: z.string().uuid().optional(),
    targetRunUid: z.string().uuid().optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return <PayrollHistoryPage search={Route.useSearch()} navigate={Route.useNavigate()} />
}
