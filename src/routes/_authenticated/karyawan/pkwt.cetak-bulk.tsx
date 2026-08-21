import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { ContractBulkPrintPage } from '@/features/employees/components/contract-print-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/pkwt/cetak-bulk'
)({
  validateSearch: z.object({
    contractUids: z.string().optional(),
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const contractUids = (Route.useSearch().contractUids ?? '')
    .split(',')
    .filter(Boolean)

  return <ContractBulkPrintPage contractUids={contractUids} />
}
