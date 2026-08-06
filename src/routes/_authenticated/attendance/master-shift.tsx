import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { MasterShiftPage } from '@/features/attendance/master-shift-page'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/attendance/master-shift')(
  {
    beforeLoad: () => requirePermission('attendance.manage_shift'),
    validateSearch: z.object({
      tab: z.enum(['shift', 'assignment']).optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().min(1).max(500).optional(),
      filter: z.string().optional(),
      site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
      isActive: z.array(z.enum(['true', 'false'])).optional(),
      employeeType: z
        .array(z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']))
        .optional(),
      productionModule: z.array(z.string()).optional(),
      productionSection: z.array(z.string()).optional(),
      shiftUid: z.array(z.string()).optional(),
      status: z.array(z.enum(['CURRENT', 'UPCOMING', 'ENDED'])).optional(),
    }),
    component: RouteComponent,
  }
)

// Route module also exports TanStack Router's route definition.
// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <MasterShiftPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
