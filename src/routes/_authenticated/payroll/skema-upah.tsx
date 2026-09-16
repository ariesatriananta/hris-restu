import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { PayrollConfigurationPage } from '@/features/payroll/payroll-configuration-page'

export const Route = createFileRoute('/_authenticated/payroll/skema-upah')({
  beforeLoad: () => requirePermission('payroll.view'),
  validateSearch: z.object({
    tab: z
      .enum(['policy', 'daily-rate', 'salary', 'minimum-wage', 'bpjs'])
      .optional(),
    site: z.string().trim().min(1).max(20).optional(),
    employeeType: z
      .enum(['BORONGAN', 'HARIAN', 'TRAINING', 'BULANAN'])
      .optional(),
    status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
    query: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(10).max(500).optional(),
    sortBy: z
      .enum([
        'employee',
        'site',
        'employeeType',
        'amount',
        'wageYear',
        'status',
        'updatedAt',
      ])
      .optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    bpjsNumberStatus: z.array(z.enum(['COMPLETE', 'INCOMPLETE'])).optional(),
    bpjsParticipationStatus: z
      .array(z.enum(['ALL_ACTIVE', 'ANY_DISABLED']))
      .optional(),
    bpjsSortBy: z.enum(['employee', 'site', 'numberStatus']).optional(),
    bpjsSortDirection: z.enum(['asc', 'desc']).optional(),
    detailUid: z.string().uuid().optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <PayrollConfigurationPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
