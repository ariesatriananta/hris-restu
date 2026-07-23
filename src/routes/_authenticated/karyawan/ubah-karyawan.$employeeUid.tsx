import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { EmployeeFormPage } from '@/features/employees/components/employee-form-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/ubah-karyawan/$employeeUid'
)({
  validateSearch: z.object({ returnTo: z.string().optional() }),
  component: RouteComponent,
})

// Route module also exports TanStack Router's route definition.
// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <EmployeeFormPage
      employeeUid={Route.useParams().employeeUid}
      returnTo={Route.useSearch().returnTo}
    />
  )
}
