import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { PayrollFinalReportPage } from '@/features/reports/payroll-final-report-page'

export const Route = createFileRoute('/_authenticated/laporan/payroll-final')({
  beforeLoad: () => {
    requirePermission('reports.view')
    requirePermission('payroll.view')
  },
  validateSearch: z.object({
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    employeeType: z
      .array(z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']))
      .optional(),
    payrollBasis: z.array(z.enum(['PIECE_RATE', 'TIME_BASED'])).optional(),
    payFrequency: z.array(z.enum(['WEEKLY', 'MONTHLY'])).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(50).max(500).optional(),
    detailUid: z.string().uuid().optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <PayrollFinalReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
