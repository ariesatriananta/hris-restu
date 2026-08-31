import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { AttendanceReportPage } from '@/features/reports/attendance-report-page'

export const Route = createFileRoute('/_authenticated/laporan/attendance')({
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
    attendanceStatus: z
      .array(
        z.enum([
          'PRESENT',
          'ABSENT',
          'LEAVE',
          'SICK',
          'PERMISSION',
          'HOLIDAY',
          'WEEKLY_OFF',
        ])
      )
      .optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <AttendanceReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
