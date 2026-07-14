import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { EmployeeRecordFormPage } from '@/features/employees/components/employee-record-form-page'

export const Route = createFileRoute('/_authenticated/karyawan/dokumen/tambah')(
  {
    validateSearch: z.object({ employeeUid: z.string().uuid().optional() }),
    component: DocumentCreatePage,
  }
)

function DocumentCreatePage() {
  return (
    <EmployeeRecordFormPage
      kind='document'
      employeeUid={Route.useSearch().employeeUid}
    />
  )
}
