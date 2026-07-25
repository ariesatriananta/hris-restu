import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { EmployeeRecordFormPage } from '@/features/employees/components/employee-record-form-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/pkwt/$contractUid/ubah'
)({
  validateSearch: z.object({ returnTo: z.string().optional() }),
  component: ContractEditPage,
})

function ContractEditPage() {
  return (
    <EmployeeRecordFormPage
      kind='contract'
      recordUid={Route.useParams().contractUid}
      returnTo={Route.useSearch().returnTo}
    />
  )
}
