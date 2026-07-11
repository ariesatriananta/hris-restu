import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { EmployeesPage } from '@/features/employees/components/employees-page'

export const Route = createFileRoute('/_authenticated/karyawan/data-karyawan')({
  validateSearch: z.object({
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(10).max(50).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    employeeType: z.array(z.enum(['BORONGAN', 'BULANAN'])).optional(),
    employeeStatus: z
      .array(z.enum(['ACTIVE', 'LEAVE', 'RESIGNED', 'INACTIVE']))
      .optional(),
    mockState: z.enum(['normal', 'empty', 'error']).optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  const requested = Route.useSearch().mockState
  const mockState = import.meta.env.DEV ? requested : undefined
  return (
    <EmployeesPage
      mockState={mockState}
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
