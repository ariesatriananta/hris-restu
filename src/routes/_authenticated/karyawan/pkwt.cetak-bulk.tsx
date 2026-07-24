import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ContractBulkPrintPage } from '@/features/employees/components/contract-print-page'

export const Route = createFileRoute('/_authenticated/karyawan/pkwt/cetak-bulk')({
  validateSearch: z.object({
    contractUids: z.string().optional(),
  }),
  component: () => {
    const contractUids = (Route.useSearch().contractUids ?? '')
      .split(',')
      .filter(Boolean)

    return <ContractBulkPrintPage contractUids={contractUids} />
  },
})
