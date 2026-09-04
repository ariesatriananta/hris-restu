import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { RecruitmentPage } from '@/features/recruitment/recruitment-page'

export const Route = createFileRoute('/_authenticated/karyawan/rekrutmen')({
  beforeLoad: () => requirePermission('recruitment.view'),
  validateSearch: z.object({
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    status: z
      .array(z.enum(['NEW', 'IN_PROGRESS', 'PASSED', 'REJECTED', 'CONVERTED']))
      .optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(50).max(500).optional(),
    sortBy: z
      .enum(['submittedAt', 'statusChangedAt', 'fullName', 'applicationNumber'])
      .optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    detailUid: z.string().uuid().optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <RecruitmentPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
