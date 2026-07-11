import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { ContractsDocumentsPage } from '@/features/employees/components/contracts-documents-page'

export const Route = createFileRoute('/_authenticated/karyawan/pkwt-dokumen')({
  validateSearch: z.object({
    contractPage: z.number().int().positive().optional(),
    contractPageSize: z.number().int().min(10).max(50).optional(),
    contractFilter: z.string().optional(),
    contractSite: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    contractStatus: z
      .array(z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED']))
      .optional(),
    documentPage: z.number().int().positive().optional(),
    documentPageSize: z.number().int().min(10).max(50).optional(),
    documentFilter: z.string().optional(),
    documentSite: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    documentStatus: z
      .array(z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']))
      .optional(),
  }),
  component: RouteComponent,
})
function RouteComponent() {
  return (
    <ContractsDocumentsPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
