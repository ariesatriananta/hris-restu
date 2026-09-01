import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { HeadcountChangeReportPage } from '@/features/reports/headcount-change-report-page'

const site = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const movementType = z.enum([
  'JOIN',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'RESIGN',
  'DEACTIVATED',
  'REACTIVATED',
  'STATUS_CHANGE',
])

export const Route = createFileRoute(
  '/_authenticated/laporan/perubahan-karyawan'
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
    movementType: z.array(movementType).optional(),
    detailUid: z.string().uuid().optional(),
    detailMovement: movementType.optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(50).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <HeadcountChangeReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
