import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { AttendanceCorrectionReportPage } from '@/features/reports/attendance-correction-report-page'

export const Route = createFileRoute(
  '/_authenticated/laporan/koreksi-attendance'
)({
  beforeLoad: () => {
    requirePermission('reports.view')
    requirePermission('attendance.view')
  },
  validateSearch: z.object({
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    employeeType: z
      .array(z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']))
      .optional(),
    productionSection: z.array(z.string().uuid()).optional(),
    correctionType: z
      .array(z.enum(['CLOCK_IN', 'CLOCK_OUT', 'BOTH', 'STATUS']))
      .optional(),
    approvalStatus: z
      .array(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']))
      .optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(50).max(500).optional(),
    detailUid: z.string().uuid().optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <AttendanceCorrectionReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
