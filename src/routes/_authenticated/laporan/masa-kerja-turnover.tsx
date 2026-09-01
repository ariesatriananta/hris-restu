import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { TenureTurnoverReportPage } from '@/features/reports/tenure-turnover-report-page'

const site = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const tenureBand = z.enum(['LT_1_YEAR', 'Y1_TO_3', 'Y3_TO_5', 'GTE_5_YEARS'])

export const Route = createFileRoute(
  '/_authenticated/laporan/masa-kerja-turnover'
)({
  beforeLoad: () => {
    requirePermission('reports.view')
    requirePermission('employees.view')
  },
  validateSearch: z.object({
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    filter: z.string().optional(),
    site: z.array(site).optional(),
    employeeType: z
      .array(z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']))
      .optional(),
    productionSection: z.array(z.string().uuid()).optional(),
    tenureBand: z.array(tenureBand).optional(),
    view: z.enum(['TENURE', 'TURNOVER']).optional(),
    detailUid: z.string().uuid().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(50).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <TenureTurnoverReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
