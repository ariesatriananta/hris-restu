import { createFileRoute } from '@tanstack/react-router'
import { EmployeeFormPage } from '@/features/employees/components/employee-form-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/data-karyawan_/$employeeUid/edit'
)({
  component: RouteComponent,
})

// Route module also exports TanStack Router's route definition.
// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return <EmployeeFormPage employeeUid={Route.useParams().employeeUid} />
}
