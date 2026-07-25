import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { EmployeeRecordFormPage } from '@/features/employees/components/employee-record-form-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/dokumen/$documentUid/ubah'
)({
  validateSearch: z.object({ returnTo: z.string().optional() }),
  component: DocumentEditPage,
})

function DocumentEditPage() {
  return (
    <EmployeeRecordFormPage
      kind='document'
      recordUid={Route.useParams().documentUid}
      returnTo={Route.useSearch().returnTo}
    />
  )
}
