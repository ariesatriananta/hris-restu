import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { ContractReportPage } from '@/features/reports/contract-report-page'

export const Route = createFileRoute('/_authenticated/laporan/kontrak')({
  beforeLoad: () => {
    requirePermission('reports.view')
    requirePermission('employees.view')
  },
  validateSearch: z.object({
    referenceDate: z.string().date().optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    employeeType: z
      .array(z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']))
      .optional(),
    contractType: z.array(z.string().uuid()).optional(),
    contractStatus: z
      .array(
        z.enum([
          'DRAFT',
          'SCHEDULED',
          'ACTIVE',
          'EXPIRED',
          'TERMINATED',
          'CANCELLED',
          'UNKNOWN',
        ])
      )
      .optional(),
    expiryState: z.array(z.enum(['UPCOMING', 'EXPIRED'])).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(50).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <ContractReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
