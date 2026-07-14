import { createFileRoute } from '@tanstack/react-router'
import { EmployeeFormPage } from '@/features/employees/components/employee-form-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/tambah-karyawan'
)({
  component: EmployeeFormPage,
})
