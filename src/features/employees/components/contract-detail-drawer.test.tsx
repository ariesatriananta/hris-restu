import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { flexRender, type CellContext } from '@tanstack/react-table'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { apiClient } from '@/lib/api-client'
import type { Employee, EmployeeContract } from '../domain'
import { ContractDetailDrawer } from './contract-detail-drawer'
import { createEmployeeColumns } from './employees-columns'

const clients: QueryClient[] = []
afterEach(() => {
  vi.restoreAllMocks()
  clients.splice(0).forEach((client) => client.clear())
})
const contract: EmployeeContract = {
  uid: 'synthetic-contract',
  employeeUid: 'synthetic-employee',
  contractNumber: 'PKWT-SYNTHETIC',
  contractType: 'PKWT',
  sequenceNumber: 1,
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  status: 'TERMINATED',
}
function client() {
  const value = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(value)
  return value
}

function ClickHarness() {
  const [selected, setSelected] = useState<Employee>()
  const employee: Employee = {
    uid: 'synthetic-employee',
    fullName: 'Synthetic employee',
    employeeNumber: 'SYNTHETIC',
    barcode: 'SYNTHETIC',
    employeeType: 'HARIAN',
    employeeStatus: 'INACTIVE',
    site: 'KLATEN',
    gender: 'LAKI-LAKI',
    joinDate: '2025-01-01',
    contractSummary: contract,
  }
  const column = createEmployeeColumns(
    () => {},
    () => {},
    undefined,
    undefined,
    undefined,
    setSelected
  ).find((item) => item.id === 'contractSummary')!
  return (
    <>
      {flexRender(column.cell, { row: { original: employee } } as CellContext<
        Employee,
        unknown
      >)}
      <ContractDetailDrawer
        contractUid={selected?.contractSummary?.uid}
        open={Boolean(selected)}
        onOpenChange={() => setSelected(undefined)}
      />
    </>
  )
}

it('clicks the table contract number to fetch its drawer by public UID and show missing physical document status', async () => {
  const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: contract })
  const screen = await render(
    <QueryClientProvider client={client()}>
      <ClickHarness />
    </QueryClientProvider>
  )
  expect(get).not.toHaveBeenCalled()
  await screen
    .getByRole('button', { name: 'PKWT-SYNTHETIC', exact: true })
    .click()
  await expect
    .element(screen.getByText('Belum diupload', { exact: true }))
    .toBeVisible()
  expect(get).toHaveBeenCalledWith('/employees/contracts/synthetic-contract')
  expect(document.querySelector('iframe')).toBeNull()
})

it('previews the uploaded contract and offers open and download actions', async () => {
  vi.spyOn(apiClient, 'get').mockResolvedValue({
    data: {
      ...contract,
      issuedFile: {
        uid: 'synthetic-file',
        originalName: 'signed.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4,
        url: 'about:blank',
      },
    },
  })
  const screen = await render(
    <QueryClientProvider client={client()}>
      <ContractDetailDrawer
        contractUid={contract.uid}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>
  )
  await expect
    .element(screen.getByText('Sudah diupload', { exact: true }))
    .toBeVisible()
  expect(document.querySelector('iframe')?.getAttribute('src')).toBe(
    'about:blank'
  )
  await expect
    .element(screen.getByRole('link', { name: 'Buka file' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('link', { name: 'Download' }))
    .toBeVisible()
})

it('offers retry on load failure instead of falsely claiming no file exists', async () => {
  const get = vi
    .spyOn(apiClient, 'get')
    .mockRejectedValueOnce(new Error('Synthetic request failed'))
    .mockResolvedValueOnce({ data: contract })
  const screen = await render(
    <QueryClientProvider client={client()}>
      <ContractDetailDrawer
        contractUid={contract.uid}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>
  )
  await expect
    .element(
      screen.getByText('Detail kontrak belum dapat dimuat.', { exact: true })
    )
    .toBeVisible()
  await expect
    .element(screen.getByText('Belum diupload', { exact: true }))
    .not.toBeInTheDocument()
  await screen.getByRole('button', { name: 'Coba lagi' }).click()
  await expect
    .element(screen.getByText('Belum diupload', { exact: true }))
    .toBeVisible()
  expect(get).toHaveBeenCalledTimes(2)
})
