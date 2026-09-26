import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { BatchContractFormPage } from '@/features/employees/components/batch-contract-form-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/pkwt/tambah-multiple'
)({
  validateSearch: z.object({
    returnTo: z.string().optional(),
    employeeUids: z.string().optional(),
    contractUids: z.string().optional(),
    onboarding: z.boolean().optional(),
  }),
  component: ContractBatchCreatePage,
})

// Route module also exports TanStack Router's route definition.
// eslint-disable-next-line react-refresh/only-export-components
function ContractBatchCreatePage() {
  const search = Route.useSearch()
  return (
    <BatchContractFormPage
      returnTo={search.returnTo}
      employeeUids={search.employeeUids}
      contractUids={search.contractUids}
      onboarding={search.onboarding === true}
    />
  )
}
