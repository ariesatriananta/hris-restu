import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { EmployeesPage } from '@/features/employees/components/employees-page'

export const Route = createFileRoute('/_authenticated/karyawan/data-karyawan')({
  validateSearch: z.object({
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    employeeType: z.array(z.enum(['BORONGAN', 'BULANAN'])).optional(),
    employeeStatus: z
      .array(z.enum(['ACTIVE', 'LEAVE', 'RESIGNED', 'INACTIVE']))
      .optional(),
  }),
  component: RouteComponent,
})

// Route module also exports TanStack Router's route definition.
// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <EmployeesPage search={Route.useSearch()} navigate={Route.useNavigate()} />
  )
}
