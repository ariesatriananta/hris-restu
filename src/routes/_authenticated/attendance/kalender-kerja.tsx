import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { WorkCalendarPage } from '@/features/attendance/work-calendar-page'
import { requirePermission } from '@/features/auth/permissions'

const calendarType = z.enum([
  'NATIONAL_HOLIDAY',
  'COLLECTIVE_LEAVE',
  'SITE_HOLIDAY',
  'WORKDAY_OVERRIDE',
])

export const Route = createFileRoute(
  '/_authenticated/attendance/kalender-kerja'
)({
  beforeLoad: () => requirePermission('attendance.view'),
  validateSearch: z.object({
    tab: z.enum(['calendar', 'list']).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    month: z.number().int().min(1).max(12).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    type: z.array(calendarType).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <WorkCalendarPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
