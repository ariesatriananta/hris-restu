import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { MutationReportPage } from '@/features/reports/mutation-report-page'

const site = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const changeType = z.enum([
  'TRANSFER',
  'PROMOTION',
  'DEMOTION',
  'STATUS_CHANGE',
  'TYPE_CHANGE',
  'DEPARTMENT_CHANGE',
  'GROUP_CHANGE',
  'PRODUCTION_ASSIGNMENT_CHANGE',
  'OTHER',
])
const mutationStatus = z.enum(['APPLIED', 'SCHEDULED', 'FAILED', 'CANCELLED'])

export const Route = createFileRoute('/_authenticated/laporan/mutasi')({
  beforeLoad: () => {
    requirePermission('reports.view')
    requirePermission('employees.view')
  },
  validateSearch: z.object({
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    filter: z.string().optional(),
    site: z.array(site).optional(),
    sourceSite: z.array(site).optional(),
    employeeType: z
      .array(z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']))
      .optional(),
    productionSection: z.array(z.string().uuid()).optional(),
    changeType: z.array(changeType).optional(),
    mutationStatus: z.array(mutationStatus).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(50).max(500).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <MutationReportPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
