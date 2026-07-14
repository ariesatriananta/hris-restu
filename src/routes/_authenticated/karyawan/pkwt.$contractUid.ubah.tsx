import { createFileRoute } from '@tanstack/react-router'
import { EmployeeRecordFormPage } from '@/features/employees/components/employee-record-form-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/pkwt/$contractUid/ubah'
)({
  component: ContractEditPage,
})

function ContractEditPage() {
  return (
    <EmployeeRecordFormPage
      kind='contract'
      recordUid={Route.useParams().contractUid}
    />
  )
}
