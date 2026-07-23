import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { ProductionStructurePage } from '@/features/production-structure/production-structure-page'

export const Route = createFileRoute(
  '/_authenticated/administrasi/master-data'
)({
  validateSearch: z.object({
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    isActive: z.array(z.enum(['true', 'false'])).optional(),
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <ProductionStructurePage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
