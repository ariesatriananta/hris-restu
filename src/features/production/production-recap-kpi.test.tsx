import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { ProductionRecapPage } from './production-recap-page'

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ session: null }),
}))
vi.mock('@/features/production/data/queries', () => ({
  useProductionRecaps: () => ({
    data: {
      summary: {
        employeeCount: 0,
        transactionCount: 0,
        jobCount: 0,
        totalGrossAmount: '0',
      },
      quantityTotals: [
        {
          quantity: '1980',
          unit: { uid: 'pcs', code: 'PCS', decimalPrecision: 0 },
        },
      ],
    },
    isPending: false,
  }),
  useProductionRecapMatrix: () => ({ isPending: false }),
  useProductionEmployeeRecap: () => ({ isPending: false }),
  useProductionJobRecap: () => ({ isPending: false }),
  useExportProductionRecaps: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/production/production-recap-matrix-table', () => ({
  ProductionRecapMatrixTable: () => <div>Rincian produksi</div>,
}))

const key = 'hris-rsia-production-recap-kpi-visible-v1'
beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.removeItem(key)
})

describe('KPI Rekap Produksi', () => {
  it('shows KPI by default, removes extra information, and remembers hide/show independently', async () => {
    localStorage.setItem(
      'hris-rsia-production-transactions-kpi-visible-v1',
      'false'
    )
    const first = await render(
      <ProductionRecapPage search={{}} navigate={vi.fn()} />
    )
    await expect
      .element(first.getByText('Karyawan tercatat', { exact: true }))
      .toBeInTheDocument()
    await expect
      .element(first.getByText(/Hanya transaksi/))
      .not.toBeInTheDocument()
    await expect
      .element(first.getByText('Hasil per satuan', { exact: true }))
      .not.toBeInTheDocument()
    await first.getByRole('button', { name: 'Opsi Rekap Produksi' }).click()
    const toggle = first.getByRole('menuitemcheckbox', {
      name: 'Tampilkan KPI',
    })
    await expect.element(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect
      .element(first.getByText('Karyawan tercatat', { exact: true }))
      .not.toBeInTheDocument()
    expect(localStorage.getItem(key)).toBe('false')
    await first.unmount()

    const second = await render(
      <ProductionRecapPage search={{}} navigate={vi.fn()} />
    )
    await expect
      .element(second.getByText('Karyawan tercatat', { exact: true }))
      .not.toBeInTheDocument()
    await second.getByRole('button', { name: 'Opsi Rekap Produksi' }).click()
    await second
      .getByRole('menuitemcheckbox', { name: 'Tampilkan KPI' })
      .click()
    await expect
      .element(second.getByText('Karyawan tercatat', { exact: true }))
      .toBeInTheDocument()
    expect(localStorage.getItem(key)).toBe('true')
    expect(
      localStorage.getItem('hris-rsia-production-transactions-kpi-visible-v1')
    ).toBe('false')
    localStorage.removeItem('hris-rsia-production-transactions-kpi-visible-v1')
  })

  it('keeps hide/show usable when browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    const screen = await render(
      <ProductionRecapPage search={{}} navigate={vi.fn()} />
    )
    await expect
      .element(screen.getByText('Karyawan tercatat', { exact: true }))
      .toBeInTheDocument()
    await screen.getByRole('button', { name: 'Opsi Rekap Produksi' }).click()
    await screen
      .getByRole('menuitemcheckbox', { name: 'Tampilkan KPI' })
      .click()
    await expect
      .element(screen.getByText('Karyawan tercatat', { exact: true }))
      .not.toBeInTheDocument()
  })
})
