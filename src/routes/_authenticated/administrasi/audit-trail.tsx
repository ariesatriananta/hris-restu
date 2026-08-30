import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { AuditTrailPage } from '@/features/audit-trail/audit-trail-page'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute(
  '/_authenticated/administrasi/audit-trail'
)({
  validateSearch: z.object({
    filter: z.string().optional(),
    module: z.array(z.string()).optional(),
    action: z.array(z.string()).optional(),
    site: z.array(z.string()).optional(),
    userUid: z.string().uuid().optional(),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }),
  beforeLoad: () => requirePermission('audit.view'),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <AuditTrailPage search={Route.useSearch()} navigate={Route.useNavigate()} />
  )
}
