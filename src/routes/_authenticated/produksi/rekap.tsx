import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { ProductionRecapPage } from '@/features/production/production-recap-page'

export const Route = createFileRoute('/_authenticated/produksi/rekap')({
  beforeLoad: () => requirePermission('production.view'),
  validateSearch: z.object({
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    jobUid: z.array(z.string().uuid()).optional(),
    employeeType: z.array(z.string()).optional(),
    productionSectionUid: z.array(z.string().uuid()).optional(),
    workGroupUid: z.array(z.string().uuid()).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    view: z.enum(['employees', 'jobs', 'matrix']).optional(),
    cellMode: z.enum(['quantity', 'gross']).optional(),
    matrixPage: z.number().int().positive().optional(),
    matrixPageSize: z.number().int().min(1).max(500).optional(),
    detailType: z.enum(['employee', 'job']).optional(),
    detailUid: z.string().uuid().optional(),
    detailSite: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <ProductionRecapPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
