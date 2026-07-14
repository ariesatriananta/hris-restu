import { createFileRoute } from '@tanstack/react-router'
import { EmployeeFormPage } from '@/features/employees/components/employee-form-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/data-karyawan/tambah'
)({
  component: EmployeeFormPage,
})
