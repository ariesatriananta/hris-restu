import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { employeeKeys } from '../data/queries'
import type { Employee, EmployeeDeletionPreview } from '../domain'
import { EmployeeDeleteAction } from './employee-delete-action'

const employee = {
  uid: 'ca0a0392-71e3-4c52-af44-0c83c8296ee1',
  employeeNumber: 'PSMG-2607-11001',
  barcode: 'PSMG-2607-11001',
  fullName: 'Karyawan Fiktif',
  employeeType: 'BORONGAN',
  employeeStatus: 'INACTIVE',
  site: 'SEMARANG',
  joinDate: '2026-07-11',
  gender: 'LAKI-LAKI',
} satisfies Employee

async function renderAction(preview: EmployeeDeletionPreview) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  })
  client.setQueryData(employeeKeys.deletionPreview(employee.uid), preview)
  const screen = await render(
    <QueryClientProvider client={client}>
      <EmployeeDeleteAction
        employee={employee}
        returnTo='/karyawan/data-karyawan'
      />
    </QueryClientProvider>
  )
  await userEvent.click(screen.getByRole('button', { name: 'Aksi lainnya' }))
  await userEvent.click(screen.getByText('Hapus permanen data karyawan'))
  return screen
}

describe('EmployeeDeleteAction', () => {
  it('menampilkan hanya data administratif yang benar-benar terdampak', async () => {
    const screen = await renderAction({
      employee,
      canDelete: true,
      blockers: [],
      totalAffectedRecords: 3,
      dependencies: [
        {
          key: 'employmentHistories',
          label: 'Riwayat kekaryawanan',
          count: 1,
          action: 'DELETE',
        },
        {
          key: 'contracts',
          label: 'Kontrak kerja',
          count: 0,
          action: 'DELETE',
        },
        {
          key: 'recruitmentCandidates',
          label: 'Arsip kandidat rekrutmen',
          count: 1,
          action: 'UNLINK',
        },
      ],
    })

    await expect.element(screen.getByText('Siap dihapus')).toBeVisible()
    await expect.element(screen.getByText('Riwayat kekaryawanan')).toBeVisible()
    await expect
      .element(screen.getByText('Arsip kandidat rekrutmen'))
      .toBeVisible()
    await expect
      .element(screen.getByText('Kontrak kerja'))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Hapus permanen' }))
      .toBeDisabled()
  })

  it('menjelaskan blocker fakta operasional dan tidak menampilkan form hapus', async () => {
    const screen = await renderAction({
      employee,
      canDelete: false,
      blockers: ['Ditemukan 1 transaksi Produksi.'],
      totalAffectedRecords: 2,
      dependencies: [
        {
          key: 'employmentHistories',
          label: 'Riwayat kekaryawanan',
          count: 1,
          action: 'DELETE',
        },
      ],
    })

    await expect
      .element(screen.getByText('Data tidak dapat dihapus'))
      .toBeVisible()
    await expect
      .element(screen.getByText('Ditemukan 1 transaksi Produksi.'))
      .toBeVisible()
    await expect
      .element(screen.getByLabelText('Alasan penghapusan'))
      .not.toBeInTheDocument()
  })
})
