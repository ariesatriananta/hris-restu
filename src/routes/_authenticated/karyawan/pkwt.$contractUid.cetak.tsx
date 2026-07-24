import { createFileRoute } from '@tanstack/react-router'
import { ContractPrintPage } from '@/features/employees/components/contract-print-page'

export const Route = createFileRoute('/_authenticated/karyawan/pkwt/$contractUid/cetak')({
  component: () => <ContractPrintPage contractUid={Route.useParams().contractUid} />,
})
