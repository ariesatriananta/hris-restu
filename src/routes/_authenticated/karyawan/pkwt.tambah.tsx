import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { EmployeeRecordFormPage } from '@/features/employees/components/employee-record-form-page'

export const Route = createFileRoute('/_authenticated/karyawan/pkwt/tambah')({
  validateSearch: z.object({ employeeUid: z.string().uuid().optional() }),
  component: ContractCreatePage,
})

function ContractCreatePage() {
  return (
    <EmployeeRecordFormPage
      kind='contract'
      employeeUid={Route.useSearch().employeeUid}
    />
  )
}
