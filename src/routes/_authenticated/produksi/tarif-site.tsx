import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { ProductionRatePage } from '@/features/production/production-rate-pages'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/produksi/tarif-site')({
  beforeLoad: () => requirePermission('production.view'),
  validateSearch: z.object({
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    status: z.array(z.enum(['DRAFT', 'ACTIVE', 'INACTIVE'])).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return <ProductionRatePage search={Route.useSearch()} navigate={Route.useNavigate()} />
}
