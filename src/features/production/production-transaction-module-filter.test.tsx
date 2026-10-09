import '@/styles/index.css'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { ProductionTransaction } from './domain'
import { ProductionTransactionsPage } from './production-transactions-page'

const { modules, transactions, navigate } = vi.hoisted(() => ({
  modules: vi.fn(),
  transactions: vi.fn(),
  navigate: vi.fn(),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      session: {
        user: {
          role: 'PRODUCTION_ADMIN',
          roles: ['PRODUCTION_ADMIN'],
          siteAccess: ['JEPARA', 'KLATEN', 'SEMARANG'],
        },
        permissions: ['production.view'],
      },
    }),
}))
vi.mock('@/features/production/data/queries', async () => ({
  ...(await vi.importActual<typeof import('./data/queries')>(
    '@/features/production/data/queries'
  )),
  useProductionTransactionModuleOptions: modules,
  useProductionTransactions: transactions,
  useProductionJobs: () => ({ data: { items: [] } }),
  useProductionTransaction: () => ({ data: undefined, isPending: false }),
}))

const jepara = '11111111-1111-4111-8111-111111111111'
const klaten = '22222222-2222-4222-8222-222222222222'
afterEach(async () => {
  await page.viewport(1280, 720)
})
beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  localStorage.removeItem('hris-rsia-production-transactions-kpi-visible-v1')
  modules.mockReturnValue({
    data: {
      items: [
        {
          uid: jepara,
          name: 'Modul Jepara',
          site: 'JEPARA',
          siteName: 'Jepara',
        },
      ],
    },
  })
  transactions.mockReturnValue({
    data: {
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      summary: {
        transactionCount: 0,
        employeeCount: 0,
        totalGrossAmount: '0',
        quantityTotals: [],
      },
    },
    isPending: false,
    isError: false,
    isFetching: false,
  })
})

function deposit(
  overrides: Partial<ProductionTransaction> = {}
): ProductionTransaction {
  return {
    uid: 'deposit-linting',
    transactionNumber: 'PR-TEST-1',
    businessDate: '2026-10-09',
    transactionAt: '2026-10-09T08:20:00+07:00',
    status: 'POSTED',
    quantity: '100',
    rateSnapshot: '100',
    deductionPercentage: '3',
    grossAmount: '10000',
    employee: {
      uid: 'employee-test',
      employeeNumber: 'EMP-TEST',
      fullName: 'Karyawan Uji',
    },
    site: 'JEPARA',
    siteName: 'Jepara',
    productionModule: { uid: jepara, code: 'MOD-TEST', name: 'Modul Uji' },
    job: {
      uid: 'job-linting',
      code: 'BORONGAN-LINTING',
      name: 'Pekerjaan Linting',
    },
    unit: { uid: 'unit-pcs', code: 'PCS', name: 'Batang', decimalPrecision: 0 },
    device: null,
    qc: {
      brand: { uid: 'brand-test', code: 'BR-0001', name: 'Brand Snapshot' },
      weight1Grams: '71.29',
      weight2Grams: '70.05',
      defects: [
        {
          uid: 'defect-b',
          code: 'DF-0002',
          name: 'Defect B',
          sortOrder: 2,
          quantity: 0,
        },
        {
          uid: 'defect-a',
          code: 'DF-0001',
          name: 'Defect A',
          sortOrder: 1,
          quantity: 3,
        },
      ],
    },
    ...overrides,
  }
}

function setDeposits(items: ProductionTransaction[]) {
  transactions.mockReturnValue({
    data: {
      items,
      total: items.length,
      page: 1,
      pageSize: 50,
      summary: {
        transactionCount: items.length,
        employeeCount: 1,
        totalGrossAmount: '10000',
        quantityTotals: [],
      },
    },
    isPending: false,
    isError: false,
    isFetching: false,
  })
}

describe('compact production QC table', () => {
  it('shows module/job, snapshot brand and QC with expandable defect columns and keeps Status filtering', async () => {
    await page.viewport(1440, 900)
    localStorage.setItem(
      'hris-rsia-production-transactions-kpi-visible-v1',
      'false'
    )
    setDeposits([
      deposit(),
      deposit({
        uid: 'deposit-legacy',
        qc: null,
        productionModule: null,
        deductionPercentage: undefined,
      }),
      deposit({
        uid: 'deposit-brand-only',
        deductionPercentage: '3.125',
        job: { uid: 'packing', code: 'BORONGAN-PACKING', name: 'Packing' },
        qc: {
          brand: { uid: 'brand-test', code: 'BR-0001', name: 'Brand Snapshot' },
          weight1Grams: null,
          weight2Grams: null,
          defects: [],
        },
      }),
    ])
    const screen = await render(
      <ProductionTransactionsPage search={{}} navigate={navigate} />
    )
    const table = screen.getByRole('table')
    const headers = () =>
      Array.from(document.querySelectorAll('thead th')).map((el) =>
        el.textContent?.trim()
      )
    expect(headers()).toEqual([
      'Waktu',
      'Karyawan',
      'Pekerjaan',
      'Brand',
      'Hasil Setoran',
      'QC',
      'Adjustment',
      'Hasil Dibayar & Tarif Dasar',
      'Nilai Bruto',
      'Aksi',
    ])
    await expect
      .element(table.getByText('Modul Uji', { exact: true }).first())
      .toBeInTheDocument()
    await expect
      .element(table.getByText('Pekerjaan Linting', { exact: true }).first())
      .toBeInTheDocument()
    await expect
      .element(table.getByText('Reject: 3', { exact: true }))
      .toBeInTheDocument()
    expect(document.querySelector('tbody tr')?.children[3].textContent).toBe(
      'Brand Snapshot'
    )
    expect(
      document.querySelector('tbody tr')?.children[5].textContent
    ).toContain('71,29')
    const rows = document.querySelectorAll('tbody tr')
    expect(rows[1].children[5].textContent?.trim()).toBe('-')
    expect(rows[2].children[5].textContent?.trim()).toBe('-')
    expect(rows[0].children[6].textContent?.trim()).toBe('97%')
    expect(rows[1].children[6].textContent?.trim()).toBe('100%')
    expect(rows[2].children[6].textContent?.trim()).toBe('96,875%')
    expect(rows[0].children[8].textContent).toContain('Tercatat')
    const toggle = screen.getByRole('button', {
      name: 'Detail Defect',
      exact: true,
    })
    await toggle.click()
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(headers().slice(5, 9)).toEqual([
      'QC',
      'Defect A',
      'Defect B',
      'Adjustment',
    ])
    expect(
      document.querySelector('tbody tr')?.children[6].textContent?.trim()
    ).toBe('3')
    expect(
      document.querySelector('tbody tr')?.children[7].textContent?.trim()
    ).toBe('-')
    expect(
      document.querySelectorAll('tbody tr')[1].children[6].textContent?.trim()
    ).toBe('-')
    await toggle.click()
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelectorAll('thead th')[6].className).toContain(
      'animate-out'
    )
    await expect.poll(() => headers()).not.toContain('Defect A')
    await screen.getByRole('button', { name: 'Status', exact: true }).click()
    await screen
      .getByRole('option', { name: 'Dibatalkan', exact: true })
      .click()
    expect(
      navigate.mock.calls[navigate.mock.calls.length - 1]?.[0].search({})
    ).toMatchObject({
      status: ['VOID'],
      page: undefined,
    })
  })

  it('keeps the first three columns fixed when the table scrolls horizontally', async () => {
    await page.viewport(1440, 900)
    setDeposits([deposit()])
    const screen = await render(
      <div style={{ width: 900 }}>
        <ProductionTransactionsPage search={{}} navigate={navigate} />
      </div>
    )
    await screen
      .getByRole('button', { name: 'Detail Defect', exact: true })
      .click()
    const container = document.querySelector<HTMLElement>(
      '[data-slot="table-container"]'
    )!
    const cells = Array.from(
      document.querySelectorAll<HTMLElement>('tbody tr:first-child td')
    ).slice(0, 3)
    await expect
      .poll(() => container.scrollWidth > container.clientWidth)
      .toBe(true)
    const before = cells.map((cell) => cell.getBoundingClientRect().left)
    await screen.getByRole('button', { name: 'Geser tabel ke kanan' }).click()
    await expect.poll(() => container.scrollLeft).toBeGreaterThan(0)
    await expect
      .poll(() =>
        cells.map((cell) => Math.round(cell.getBoundingClientRect().left))
      )
      .toEqual(before.map(Math.round))
    cells.forEach((cell) =>
      expect(getComputedStyle(cell).position).toBe('sticky')
    )
    await screen.getByRole('button', { name: 'Geser tabel ke kiri' }).click()
    await expect.poll(() => container.scrollLeft).toBe(0)
  })
})

describe('production table KPI preference', () => {
  const key = 'hris-rsia-production-transactions-kpi-visible-v1'

  it('defaults to visible and persists hide/show without granting batch access', async () => {
    const first = await render(
      <ProductionTransactionsPage search={{}} navigate={navigate} />
    )
    await expect
      .element(first.getByText('Nilai Bruto', { exact: true }))
      .toBeInTheDocument()
    await first.getByRole('button', { name: 'Opsi tabel Produksi' }).click()
    await expect
      .element(first.getByRole('menuitem', { name: 'Import Excel' }))
      .not.toBeInTheDocument()
    await expect
      .element(first.getByRole('menuitem', { name: 'Hapus Transaksi Batch' }))
      .not.toBeInTheDocument()
    const toggle = first.getByRole('menuitemcheckbox', {
      name: 'Tampilkan KPI',
    })
    await expect.element(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect.element(toggle).toHaveAttribute('aria-checked', 'false')
    await expect
      .element(first.getByText('Nilai Bruto', { exact: true }))
      .not.toBeInTheDocument()
    expect(localStorage.getItem(key)).toBe('false')
    await first.unmount()

    const second = await render(
      <ProductionTransactionsPage search={{}} navigate={navigate} />
    )
    await expect
      .element(second.getByText('Nilai Bruto', { exact: true }))
      .not.toBeInTheDocument()
    await second.getByRole('button', { name: 'Opsi tabel Produksi' }).click()
    await second
      .getByRole('menuitemcheckbox', { name: 'Tampilkan KPI' })
      .click()
    await expect
      .element(second.getByText('Nilai Bruto', { exact: true }))
      .toBeInTheDocument()
    expect(localStorage.getItem(key)).toBe('true')
  })

  it('defaults to show for an invalid preference', async () => {
    localStorage.setItem(key, '{invalid')
    const screen = await render(
      <ProductionTransactionsPage search={{}} navigate={navigate} />
    )
    await expect
      .element(screen.getByText('Nilai Bruto', { exact: true }))
      .toBeInTheDocument()
  })

  it('keeps the toggle working when browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    const screen = await render(
      <ProductionTransactionsPage search={{}} navigate={navigate} />
    )
    await screen.getByRole('button', { name: 'Opsi tabel Produksi' }).click()
    await screen
      .getByRole('menuitemcheckbox', { name: 'Tampilkan KPI' })
      .click()
    await expect
      .element(screen.getByText('Nilai Bruto', { exact: true }))
      .not.toBeInTheDocument()
  })
})
describe('site-scoped production module filter', () => {
  it('saves employee type with the current site and module and resets pagination', async () => {
    const search = { site: ['JEPARA'], moduleUid: [jepara], page: 9 }
    const screen = await render(
      <ProductionTransactionsPage search={search} navigate={navigate} />
    )
    await screen.getByRole('button', { name: 'Jenis Karyawan' }).click()
    await screen.getByRole('option', { name: 'Training', exact: true }).click()
    const change = navigate.mock.calls[navigate.mock.calls.length - 1][0]
    expect(change.search(search)).toMatchObject({
      site: ['JEPARA'],
      moduleUid: [jepara],
      employeeType: ['TRAINING'],
      page: undefined,
    })
  })
  it('lists site module options and saves selection to URL while resetting pagination', async () => {
    const search = { site: ['JEPARA'], page: 9 }
    const screen = await render(
      <ProductionTransactionsPage search={search} navigate={navigate} />
    )
    expect(modules).toHaveBeenCalledWith(['JEPARA'])
    await screen.getByRole('button', { name: 'Modul Produksi' }).click()
    await screen.getByRole('option', { name: 'Modul Jepara · Jepara' }).click()
    const change = navigate.mock.calls[navigate.mock.calls.length - 1][0]
    expect(change.search(search)).toMatchObject({
      site: ['JEPARA'],
      moduleUid: [jepara],
      page: undefined,
    })
  })
  it('clears a module from the old site without disturbing other filters', async () => {
    const search = {
      site: ['JEPARA'],
      moduleUid: [klaten],
      jobUid: ['job'],
      page: 9,
      filter: 'test',
    }
    await render(
      <ProductionTransactionsPage search={search} navigate={navigate} />
    )
    expect(transactions).toHaveBeenCalledWith(
      expect.objectContaining({ moduleUid: [klaten], site: ['JEPARA'] })
    )
    const change = navigate.mock.calls[navigate.mock.calls.length - 1][0]
    expect(change.replace).toBe(true)
    expect(change.search(search)).toMatchObject({
      site: ['JEPARA'],
      moduleUid: undefined,
      page: undefined,
      jobUid: ['job'],
      filter: 'test',
    })
  })
  it('does not discard URL selections while options are loading', async () => {
    modules.mockReturnValue({ data: undefined })
    await render(
      <ProductionTransactionsPage
        search={{ site: ['JEPARA'], moduleUid: [jepara] }}
        navigate={navigate}
      />
    )
    expect(navigate).not.toHaveBeenCalled()
  })
})
