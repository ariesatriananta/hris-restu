import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { ProductionReportPage } from '@/features/reports/production-report-page'

export const Route = createFileRoute(
  '/_authenticated/laporan/produksi-borongan'
)({
  beforeLoad: () => {
    requirePermission('reports.view')
    requirePermission('production.view')
  },
  validateSearch: z.object({
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    jobUid: z.array(z.string().uuid()).optional(),
    employeeType: z.array(z.string()).optional(),
    productionSectionUid: z.array(z.string().uuid()).optional(),
    workGroupUid: z.array(z.string().uuid()).optional(),
    view: z.enum(['employees', 'jobs']).optional(),
    detailType: z.enum(['employee', 'job']).optional(),
    detailUid: z.string().uuid().optional(),
    detailSite: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(50).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <ProductionReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
