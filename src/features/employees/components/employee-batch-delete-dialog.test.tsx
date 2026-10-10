import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import * as XLSX from 'xlsx'
import { apiClient } from '@/lib/api-client'
import type { EmployeeBatchDeletionPreview } from '../domain'
import { EmployeeBatchDeleteDialog } from './employee-batch-delete-dialog'

vi.mock('xlsx', async (original) => ({
  ...(await original<typeof import('xlsx')>()),
  writeFile: vi.fn(),
}))

const summary: EmployeeBatchDeletionPreview = {
  page: 1,
  pageSize: 100,
  total: 2,
  rows: [
    {
      employee: {
        uid: 'ready-uid',
        employeeNumber: 'TEST-001',
        fullName: 'Karyawan Siap',
        site: 'KLATEN',
      },
      canDelete: true,
      blockers: [],
      dependencies: [
        {
          key: 'contracts',
          label: 'Kontrak kerja',
          count: 1,
          action: 'DELETE',
        },
      ],
      totalAffectedRecords: 1,
    },
    {
      employee: {
        uid: 'blocked-uid',
        employeeNumber: 'TEST-002',
        fullName: 'Karyawan Terblokir',
        site: 'KLATEN',
      },
      canDelete: false,
      blockers: ['Memiliki hasil Payroll.'],
      dependencies: [],
      totalAffectedRecords: 0,
    },
  ],
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const close = vi.fn()
  const view = (open = true) => (
    <QueryClientProvider client={client}>
      <EmployeeBatchDeleteDialog open={open} onOpenChange={close} />
    </QueryClientProvider>
  )
  const screen = await render(view())
  return { screen, close, view }
}
async function completeConfirmation(
  screen: Awaited<ReturnType<typeof setup>>['screen']
) {
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Pilih Karyawan Siap', exact: true })
  )
  await userEvent.fill(
    screen.getByLabelText('Alasan penghapusan'),
    'Data lama salah input'
  )
  await userEvent.fill(
    screen.getByLabelText('Ketik HAPUS untuk konfirmasi'),
    'HAPUS'
  )
}
afterEach(() => vi.restoreAllMocks())

describe('EmployeeBatchDeleteDialog', () => {
  it('downloads ready and blocked rows from the loaded page as Excel, with explicit scope', async () => {
    vi.mocked(XLSX.writeFile).mockClear()
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: summary })
    const { screen } = await setup()
    await userEvent.click(
      screen.getByRole('button', { name: 'Download halaman ini' })
    )
    await expect.poll(() => vi.mocked(XLSX.writeFile).mock.calls.length).toBe(1)
    const [workbook, filename] = vi.mocked(XLSX.writeFile).mock.calls[0]
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Hasil Pemeriksaan'])
    expect(rows).toEqual([
      expect.objectContaining({
        'ID Karyawan': 'TEST-001',
        Kesiapan: 'Siap dihapus',
        'Dampak Administratif': 'Kontrak kerja: 1 (dihapus)',
      }),
      expect.objectContaining({
        'ID Karyawan': 'TEST-002',
        Kesiapan: 'Terblokir',
        Blocker: 'Memiliki hasil Payroll.',
      }),
    ])
    expect(filename).toBe('hasil-pemeriksaan-hapus-karyawan-halaman-1.xlsx')
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets.Informasi, { header: 1 })
    ).toContainEqual(['Jumlah diekspor', 2])
    await userEvent.fill(screen.getByLabelText('Cari karyawan'), 'Baru')
    await expect
      .element(screen.getByRole('button', { name: 'Download halaman ini' }))
      .not.toBeInTheDocument()
  })
  it('hanya memilih karyawan siap, menampilkan blocker dan dampak administratif', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: summary })
    const { screen } = await setup()
    await expect
      .element(screen.getByText('Memiliki hasil Payroll.'))
      .toBeVisible()
    await expect
      .element(
        screen.getByRole('checkbox', { name: 'Pilih Karyawan Terblokir' })
      )
      .toBeDisabled()
    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Pilih semua karyawan siap di halaman ini',
      })
    )
    await expect
      .element(
        screen.getByRole('checkbox', {
          name: 'Pilih Karyawan Siap',
          exact: true,
        })
      )
      .toBeChecked()
    await expect
      .element(screen.getByText('Kontrak kerja: 1 (dihapus)'))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Hapus 1 karyawan' }))
      .toBeDisabled()
  })
  it('mengirim satu batch atomik, mengunci kontrol selama proses dan menutup setelah sukses', async () => {
    const deletion = deferred<{
      data: {
        deletedEmployees: number
        deletedRecords: number
        unlinkedRecords: number
      }
    }>()
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: summary })
      .mockImplementationOnce(() => deletion.promise)
    const { screen, close } = await setup()
    await expect.element(screen.getByText('Siap dihapus')).toBeVisible()
    await completeConfirmation(screen)
    await userEvent.click(
      screen.getByRole('button', { name: 'Hapus 1 karyawan' })
    )
    await expect
      .element(screen.getByRole('button', { name: 'Batal', exact: true }))
      .toBeDisabled()
    await expect.element(screen.getByLabelText('Cari karyawan')).toBeDisabled()
    expect(post).toHaveBeenLastCalledWith('/employees/batch-delete', {
      employeeUids: ['ready-uid'],
      reason: 'Data lama salah input',
      confirmation: 'HAPUS',
    })
    expect(post).toHaveBeenCalledTimes(2)
    deletion.resolve({
      data: { deletedEmployees: 1, deletedRecords: 1, unlinkedRecords: 0 },
    })
    await vi.waitFor(() => expect(close).toHaveBeenCalledWith(false))
  })
  it('membuang ringkasan dan pilihan saat filter berubah, menolak respons lama', async () => {
    const pending = deferred<{ data: EmployeeBatchDeletionPreview }>()
    vi.spyOn(apiClient, 'post')
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce({ data: summary })
    const { screen } = await setup()
    await userEvent.fill(screen.getByLabelText('Cari karyawan'), 'baru')
    pending.resolve({ data: summary })
    await expect
      .element(screen.getByText('Karyawan Siap', { exact: true }))
      .not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Muat ringkasan' })
    )
    await expect.element(screen.getByText('Siap dihapus')).toBeVisible()
    await completeConfirmation(screen)
    await userEvent.fill(screen.getByLabelText('Cari karyawan'), 'lain')
    await expect
      .element(
        screen.getByRole('button', { name: 'Hapus karyawan', exact: true })
      )
      .toBeDisabled()
    await expect
      .element(screen.getByLabelText('Ketik HAPUS untuk konfirmasi'))
      .toHaveValue('')
  })
  it('mengosongkan target saat ganti halaman', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: { ...summary, total: 102 } })
      .mockResolvedValueOnce({
        data: { ...summary, rows: [], page: 2, total: 102 },
      })
    const { screen } = await setup()
    await expect.element(screen.getByText('Siap dihapus')).toBeVisible()
    await completeConfirmation(screen)
    await userEvent.click(screen.getByRole('button', { name: 'Berikutnya' }))
    await expect
      .element(screen.getByText('Tidak ada karyawan sesuai filter.'))
      .toBeVisible()
    expect(post).toHaveBeenLastCalledWith(
      '/employees/batch-delete/preview',
      expect.objectContaining({ page: 2 })
    )
    await expect
      .element(screen.getByLabelText('Ketik HAPUS untuk konfirmasi'))
      .toHaveValue('')
  })
  it('mengharuskan ringkasan baru setelah gagal eksekusi', async () => {
    vi.spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: summary })
      .mockRejectedValueOnce(new Error('blocked'))
    const { screen } = await setup()
    await expect.element(screen.getByText('Siap dihapus')).toBeVisible()
    await completeConfirmation(screen)
    await userEvent.click(
      screen.getByRole('button', { name: 'Hapus 1 karyawan' })
    )
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Penghapusan batch gagal')
    await expect
      .element(
        screen.getByRole('button', { name: 'Hapus karyawan', exact: true })
      )
      .toBeDisabled()
    await expect
      .element(screen.getByText('Karyawan Siap', { exact: true }))
      .not.toBeInTheDocument()
  })
  it('tidak membawa pilihan atau respons tertunda ke pembukaan berikutnya', async () => {
    const old = deferred<{ data: EmployeeBatchDeletionPreview }>()
    vi.spyOn(apiClient, 'post')
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce({ data: { ...summary, rows: [], total: 0 } })
    const { screen, view } = await setup()
    await screen.rerender(view(false))
    await screen.rerender(view(true))
    old.resolve({ data: summary })
    await expect
      .element(screen.getByText('Tidak ada karyawan sesuai filter.'))
      .toBeVisible()
    await expect
      .element(screen.getByText('Karyawan Siap', { exact: true }))
      .not.toBeInTheDocument()
  })
})
