import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { EmployeeFormPage } from '@/features/employees/components/employee-form-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/tambah-karyawan'
)({
  validateSearch: z.object({ returnTo: z.string().optional() }),
  component: RouteComponent,
})

function RouteComponent() {
  return <EmployeeFormPage returnTo={Route.useSearch().returnTo} />
}
