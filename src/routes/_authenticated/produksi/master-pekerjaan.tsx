import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { ProductionJobMasterPage } from '@/features/production/production-rate-pages'

export const Route = createFileRoute(
  '/_authenticated/produksi/master-pekerjaan'
)({
  beforeLoad: () => requirePermission('production.view'),
  validateSearch: z.object({
    tab: z.enum(['jobs', 'units', 'assignments']).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    status: z.array(z.enum(['ACTIVE', 'UPCOMING', 'ENDED'])).optional(),
    issue: z
      .enum([
        'ALL',
        'UNASSIGNED',
        'MISSING_PRIMARY',
        'AMBIGUOUS_PRIMARY',
        'READY',
      ])
      .optional(),
    employeeType: z.array(z.string()).optional(),
    productionSectionUid: z.array(z.string().uuid()).optional(),
    asOf: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    assignmentView: z.enum(['readiness', 'history']).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <ProductionJobMasterPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
