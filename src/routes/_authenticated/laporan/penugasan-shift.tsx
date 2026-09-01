import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { ShiftAssignmentReportPage } from '@/features/reports/shift-assignment-report-page'

const readinessStatus = z.enum([
  'READY',
  'NO_ASSIGNMENT',
  'ENDED',
  'UPCOMING',
  'OVERLAP',
  'SITE_MISMATCH',
  'SHIFT_INACTIVE',
  'NO_WORK_DAYS',
  'EMPLOYMENT_AMBIGUOUS',
])

export const Route = createFileRoute('/_authenticated/laporan/penugasan-shift')(
  {
    beforeLoad: () => {
      requirePermission('reports.view')
      requirePermission('attendance.view')
    },
    validateSearch: z.object({
      referenceDate: z.string().date().optional(),
      filter: z.string().optional(),
      site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
      employeeType: z
        .array(z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']))
        .optional(),
      productionSection: z.array(z.string().uuid()).optional(),
      shift: z.array(z.string().uuid()).optional(),
      readinessStatus: z.array(readinessStatus).optional(),
      detailUid: z.string().uuid().optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().min(1).max(500).optional(),
    }),
    component: RouteComponent,
  }
)

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <ShiftAssignmentReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
