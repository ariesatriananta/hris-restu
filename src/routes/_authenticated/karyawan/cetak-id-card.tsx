import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { IdCardPage } from '@/features/employees/components/id-card-page'

export const Route = createFileRoute('/_authenticated/karyawan/cetak-id-card')({
  validateSearch: z.object({ employeeUid: z.string().optional() }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return <IdCardPage employeeUid={Route.useSearch().employeeUid} />
}
