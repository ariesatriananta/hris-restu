import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { AuditActivityReportPage } from '@/features/reports/audit-activity-report-page'

const action = z.enum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'VOID',
  'APPROVE',
  'REJECT',
  'LOGIN',
  'LOGOUT',
  'EXPORT',
  'PRINT',
  'CLOSE',
  'OTHER',
])

export const Route = createFileRoute('/_authenticated/laporan/audit-aktivitas')(
  {
    beforeLoad: () => {
      requirePermission('reports.view')
      requirePermission('audit.view')
    },
    validateSearch: z.object({
      dateFrom: z.string().date().optional(),
      dateTo: z.string().date().optional(),
      filter: z.string().optional(),
      site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
      module: z.array(z.string().min(1).max(50)).optional(),
      action: z.array(action).optional(),
      actorUid: z.array(z.string().uuid()).optional(),
      detailUid: z.string().uuid().optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().min(1).max(500).optional(),
    }),
    component: RouteComponent,
  }
)

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <AuditActivityReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
