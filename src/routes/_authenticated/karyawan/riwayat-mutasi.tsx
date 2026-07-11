import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { MutationPage } from '@/features/employees/components/mutation-page'

export const Route = createFileRoute('/_authenticated/karyawan/riwayat-mutasi')(
  {
    validateSearch: z.object({
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().min(10).max(50).optional(),
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
            'OTHER',
          ])
        )
        .optional(),
    }),
    component: RouteComponent,
  }
)

function RouteComponent() {
  return (
    <MutationPage search={Route.useSearch()} navigate={Route.useNavigate()} />
  )
}
