import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { AttendanceCorrectionPage } from '@/features/attendance/correction-page'
import { requireAnyPermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/attendance/koreksi')({
  beforeLoad: () =>
    requireAnyPermission(['attendance.correct', 'attendance.approve']),
  validateSearch: z.object({
    businessDate: z.string().date().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    approvalStatus: z
      .array(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']))
      .optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <AttendanceCorrectionPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
