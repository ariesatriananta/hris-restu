import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { MutationPage } from '@/features/employees/components/mutation-page'

export const Route = createFileRoute('/_authenticated/karyawan/riwayat-mutasi')(
  {
    validateSearch: z.object({
      tab: z.enum(['history', 'scheduled']).optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().min(1).max(500).optional(),
      filter: z.string().optional(),
      site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
      changeType: z
        .array(
          z.enum([
            'INITIAL',
            'TRANSFER',
            'PROMOTION',
            'DEMOTION',
            'STATUS_CHANGE',
            'TYPE_CHANGE',
            'GROUP_CHANGE',
            'PRODUCTION_ASSIGNMENT_CHANGE',
            'OTHER',
          ])
        )
        .optional(),
      scheduledPage: z.number().int().positive().optional(),
      scheduledPageSize: z.number().int().min(1).max(500).optional(),
      scheduledFilter: z.string().optional(),
      scheduledSite: z
        .array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN']))
        .optional(),
      scheduledStatus: z
        .array(z.enum(['SCHEDULED', 'APPLIED', 'FAILED', 'CANCELLED']))
        .optional(),
    }),
    component: RouteComponent,
  }
)

// Route module also exports TanStack Router's route definition.
// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <MutationPage search={Route.useSearch()} navigate={Route.useNavigate()} />
  )
}
