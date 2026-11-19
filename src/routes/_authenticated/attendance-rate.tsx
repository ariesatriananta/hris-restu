import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { AttendanceRatePage } from '@/features/attendance-rate/attendance-rate-page'
import { requireAttendanceRateAccess } from '@/features/auth/attendance-rate-access'

export const Route = createFileRoute('/_authenticated/attendance-rate')({
  beforeLoad: requireAttendanceRateAccess,
  validateSearch: z.object({
    site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']).optional(),
    date: z
      .string()
      .date()
      .refine((value) => value >= '1000-01-15')
      .optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <AttendanceRatePage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
