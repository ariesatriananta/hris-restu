import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { IdCardPage } from '@/features/employees/components/id-card-page'

export const Route = createFileRoute('/_authenticated/karyawan/cetak-id-card')({
  beforeLoad: () => requirePermission('employees.view'),
  validateSearch: z.object({
    employeeUid: z.string().uuid().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    employeeType: z
      .array(z.enum(['BORONGAN', 'HARIAN', 'TRAINING', 'BULANAN']))
      .optional(),
    employeeStatus: z
      .array(z.enum(['ACTIVE', 'LEAVE', 'RESIGNED', 'INACTIVE']))
      .default(['ACTIVE']),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  const search = Route.useSearch()
  return (
    <IdCardPage
      employeeUid={search.employeeUid}
      search={search}
      navigate={Route.useNavigate()}
    />
  )
}
