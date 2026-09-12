import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { AttendanceRecapPage } from '@/features/attendance/recap-page'
import { requirePermission } from '@/features/auth/permissions'

const site = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const employeeType = z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'])

export const Route = createFileRoute('/_authenticated/attendance/rekap')({
  beforeLoad: () => requirePermission('attendance.view'),
  validateSearch: z.object({
    view: z.enum(['summary', 'matrix']).optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    filter: z.string().optional(),
    site: z.array(site).optional(),
    employeeType: z.array(employeeType).optional(),
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
    matrixPage: z.number().int().positive().optional(),
    matrixPageSize: z.number().int().min(1).max(500).optional(),
    employeeUid: z.string().uuid().optional(),
    detailSite: site.optional(),
    detailEmployeeType: employeeType.optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <AttendanceRecapPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
