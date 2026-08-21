import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { ProductionTransactionsPage } from '@/features/production/production-transactions-page'

export const Route = createFileRoute('/_authenticated/produksi/transaksi')({
  beforeLoad: () => requirePermission('production.view'),
  validateSearch: z.object({
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    jobUid: z.array(z.string().uuid()).optional(),
    status: z.array(z.enum(['POSTED', 'VOID'])).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <ProductionTransactionsPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
