import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { DevicePage } from '@/features/attendance/device-page'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute(
  '/_authenticated/attendance/master-perangkat'
)({
  beforeLoad: () => requirePermission('attendance.manage_device'),
  validateSearch: z.object({
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    deviceType: z
      .array(z.enum(['MOBILE_CAMERA', 'USB_SCANNER', 'TERMINAL', 'OTHER']))
      .optional(),
    isActive: z.array(z.enum(['true', 'false'])).optional(),
  }),
  component: RouteComponent,
})

// Route module also exports TanStack Router's route definition.
// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <DevicePage search={Route.useSearch()} navigate={Route.useNavigate()} />
  )
}
