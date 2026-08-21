import { createFileRoute } from '@tanstack/react-router'
import { ContractPrintPage } from '@/features/employees/components/contract-print-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/pkwt/$contractUid/cetak'
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <ContractPrintPage contractUid={Route.useParams().contractUid} />
}
