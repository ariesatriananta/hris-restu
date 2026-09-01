import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { DeviceScanReportPage } from '@/features/reports/device-scan-report-page'

export const Route = createFileRoute('/_authenticated/laporan/perangkat-scan')({
  beforeLoad: () => {
    requirePermission('reports.view')
    requirePermission('attendance.view')
  },
  validateSearch: z.object({
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    deviceType: z
      .array(z.enum(['MOBILE_CAMERA', 'USB_SCANNER', 'TERMINAL', 'OTHER']))
      .optional(),
    resultStatus: z.array(z.enum(['SUCCESS', 'REJECTED', 'ERROR'])).optional(),
    activityStatus: z
      .array(
        z.enum([
          'HEALTHY',
          'ATTENTION',
          'NO_ACTIVITY',
          'NOT_ACTIVATED',
          'INACTIVE',
        ])
      )
      .optional(),
    detailUid: z.string().uuid().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <DeviceScanReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
