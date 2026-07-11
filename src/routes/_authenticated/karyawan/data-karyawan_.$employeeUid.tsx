import { createFileRoute } from '@tanstack/react-router'
import { EmployeeDetail } from '@/features/employees/components/employee-detail'

export const Route = createFileRoute(
  '/_authenticated/karyawan/data-karyawan_/$employeeUid'
)({
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return <EmployeeDetail employeeUid={Route.useParams().employeeUid} />
}
