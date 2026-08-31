import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { EmployeeReportPage } from '@/features/reports/employee-report-page'

export const Route = createFileRoute('/_authenticated/laporan/karyawan')({
  beforeLoad: () => {
    requirePermission('reports.view')
    requirePermission('employees.view')
  },
  validateSearch: z.object({
    asOf: z.string().date().optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    employeeType: z
      .array(z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']))
      .optional(),
    employeeStatus: z
      .array(z.enum(['ACTIVE', 'INACTIVE', 'RESIGNED', 'LEAVE']))
      .optional(),
    productionSection: z.array(z.string().uuid()).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <EmployeeReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
