import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { AttendanceMonitoringPage } from '@/features/attendance/monitoring-page'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute(
  '/_authenticated/attendance/monitoring-harian'
)({
  beforeLoad: () => requirePermission('attendance.view'),
  validateSearch: z.object({
    businessDate: z.string().date().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    employeeType: z
      .array(z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']))
      .optional(),
    productionSection: z.array(z.string().uuid()).optional(),
    attendanceStatus: z
      .array(
        z.enum(['PRESENT', 'ABSENT', 'LEAVE', 'SICK', 'PERMISSION', 'HOLIDAY'])
      )
      .optional(),
    qualityStatus: z.array(z.enum(['NORMAL', 'ABNORMAL'])).optional(),
    abnormalReason: z
      .array(z.enum(['MISSING_CLOCK_IN', 'MISSING_CLOCK_OUT']))
      .optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <AttendanceMonitoringPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
