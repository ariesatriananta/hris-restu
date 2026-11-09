import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { ProductionDailySummaryPage } from '@/features/production/production-daily-summary-page'

export const Route = createFileRoute('/_authenticated/produksi/ringkasan')({
  beforeLoad: () => requirePermission('production.view'),
  validateSearch: z.object({
    date: z.string().date().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    moduleUid: z.array(z.string().uuid()).optional(),
    jobUid: z.string().uuid().optional(),
    filter: z.string().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <ProductionDailySummaryPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
