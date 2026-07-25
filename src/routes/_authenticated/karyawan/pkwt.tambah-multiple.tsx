import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { BatchContractFormPage } from '@/features/employees/components/batch-contract-form-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/pkwt/tambah-multiple'
)({
  validateSearch: z.object({
    returnTo: z.string().optional(),
    employeeUids: z.string().optional(),
  }),
  component: ContractBatchCreatePage,
})

function ContractBatchCreatePage() {
  const search = Route.useSearch()
  return (
    <BatchContractFormPage
      returnTo={search.returnTo}
      employeeUids={search.employeeUids}
    />
  )
}
