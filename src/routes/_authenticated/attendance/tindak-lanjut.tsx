import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { AttendanceFollowUpPage } from '@/features/attendance/attendance-follow-up-page'
import { requireAnyPermission } from '@/features/auth/permissions'

export const Route = createFileRoute(
  '/_authenticated/attendance/tindak-lanjut'
)({
  beforeLoad: () =>
    requireAnyPermission(['attendance.correct', 'attendance.approve']),
  validateSearch: z.object({
    tab: z.enum(['correction', 'classification']).optional(),
    businessDate: z.string().date().optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    approvalStatus: z
      .array(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']))
      .optional(),
    classificationType: z
      .array(z.enum(['LEAVE', 'SICK', 'PERMISSION']))
      .optional(),
    employeeUid: z.string().uuid().optional(),
    employeeName: z.string().max(200).optional(),
    employeeNumber: z.string().max(100).optional(),
    employeeSite: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']).optional(),
    employeeType: z
      .enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'])
      .optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <AttendanceFollowUpPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
