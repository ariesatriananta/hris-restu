import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { ContractsDocumentsPage } from '@/features/employees/components/contracts-documents-page'

export const Route = createFileRoute('/_authenticated/karyawan/pkwt-dokumen')({
  validateSearch: z.object({
    contractPage: z.number().int().positive().optional(),
    contractPageSize: z.number().int().min(1).max(500).optional(),
    contractFilter: z.string().optional(),
    contractSite: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    contractStatus: z
      .array(z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED']))
      .optional(),
    contractCoverage: z
      .array(
        z.enum(['ACTIVE_WITHOUT_VALID_CONTRACT', 'EXPIRING_WITHIN_7_DAYS'])
      )
      .optional(),
    documentPage: z.number().int().positive().optional(),
    documentPageSize: z.number().int().min(1).max(500).optional(),
    documentFilter: z.string().optional(),
    documentSite: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    documentStatus: z
      .array(z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']))
      .optional(),
    statusChangePage: z.number().int().positive().optional(),
    statusChangePageSize: z.number().int().min(1).max(500).optional(),
    statusChangeFilter: z.string().optional(),
    statusChangeSite: z
      .array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN']))
      .optional(),
    statusChangeStatus: z
      .array(z.enum(['SCHEDULED', 'APPLIED', 'FAILED', 'CANCELLED']))
      .optional(),
    statusChangeAction: z.array(z.enum(['TERMINATE', 'RESIGN'])).optional(),
  }),
  component: RouteComponent,
})
// Route module also exports TanStack Router's route definition.
// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <ContractsDocumentsPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
