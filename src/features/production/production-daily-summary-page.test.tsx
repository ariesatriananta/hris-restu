import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { ProductionDailySummaryPage } from './production-daily-summary-page'

const mocks = vi.hoisted(() => ({
  tabs: vi.fn(),
  employees: vi.fn(),
  deposits: vi.fn(),
  modules: vi.fn(),
  navigate: vi.fn(),
  state: { role: 'QC' },
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      session: {
        user: {
          uid: 'user',
          role: mocks.state.role,
          roles: [mocks.state.role],
          siteAccess: ['KLATEN'],
        },
        permissions: ['production.view', 'production.correct'],
      },
    }),
}))
vi.mock('@/features/production/data/queries', () => ({
  useProductionDailyTabs: mocks.tabs,
  useProductionDailyEmployees: mocks.employees,
  useProductionDailyTransactions: mocks.deposits,
  useProductionTransactionModuleOptions: mocks.modules,
}))
vi.mock('@/features/production/production-transactions-page', () => ({
  TransactionDetailSheet: ({ uid }: { uid?: string }) =>
    uid ? <p>Transaksi dibuka: {uid}</p> : null,
}))
const unit = { uid: 'unit', code: 'PCS', name: 'Batang', decimalPrecision: 0 }
const employee = {
  employee: {
    uid: 'worker',
    employeeNumber: 'EMP001',
    fullName: 'Pekerja Satu',
  },
  site: { uid: 'site', code: 'KLATEN', name: 'Klaten' },
  job: { uid: 'linting', code: 'LINTING', name: 'Linting' },
  unit,
  quantity: '1200',
  payableQuantity: '1164',
  transactionCount: 2,
  rejectOccurrences: 3,
  lastSubmittedAt: '2026-11-09T09:00:00+07:00',
  modules: [{ uid: 'module', name: 'Modul A', code: 'A' }],
  grossAmount: '12345',
}
const metadata = {
  effectiveDate: '2026-11-09',
  serverToday: '2026-11-09',
  canChangeDate: false,
  canViewWages: false,
}
const result = (data: unknown) => ({
  data,
  isError: false,
  isPending: false,
  isFetching: false,
  dataUpdatedAt: Date.now(),
  refetch: vi.fn(),
})
function view(search: Record<string, unknown> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductionDailySummaryPage search={search} navigate={mocks.navigate} />
    </QueryClientProvider>
  )
}
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.state.role = 'QC'
  await page.viewport(1280, 800)
  mocks.tabs.mockReturnValue(
    result({
      ...metadata,
      tabs: [
        {
          jobUid: 'linting',
          jobCode: 'LINTING',
          jobName: 'Linting',
          employeeCount: 1,
          transactionCount: 2,
          units: [
            {
              ...unit,
              unitUid: unit.uid,
              unitCode: unit.code,
              quantity: '1200',
              decimalPrecision: 0,
              rejectOccurrences: 3,
            },
          ],
        },
        {
          jobUid: 'batil',
          jobCode: 'BATIL',
          jobName: 'Batil',
          employeeCount: 1,
          transactionCount: 1,
          units: [],
        },
      ],
    })
  )
  mocks.employees.mockReturnValue(
    result({
      ...metadata,
      items: [employee],
      summary: { units: [] },
      total: 1,
      page: 1,
      pageSize: 50,
    })
  )
  mocks.modules.mockReturnValue(
    result({
      items: [
        { uid: 'module', name: 'Modul A', site: 'KLATEN', siteName: 'Klaten' },
      ],
    })
  )
  mocks.deposits.mockReturnValue(
    result({
      ...metadata,
      items: [
        {
          ...employee,
          uid: 'deposit',
          transactionNumber: 'PR-001',
          transactionAt: '2026-11-09T09:00:00+07:00',
          quantity: '1200',
          payableQuantity: '1164',
          module: null,
          qc: {
            brand: { uid: 'brand', name: 'Brand A', code: 'A' },
            weight1Grams: '70.25',
            weight2Grams: '71',
            defects: [{ uid: 'defect', name: 'Cowong', quantity: 3 }],
          },
          rejectOccurrences: 3,
        },
      ],
      total: 1,
    })
  )
})
describe('Ringkasan Produksi lapangan', () => {
  it('expands every job summary together without changing jobs or requesting extra lists', async () => {
    const screen = await view({ filter: 'Pekerja', page: 2 })
    const toggle = screen.getByRole('button', {
      name: 'Buka ringkasan semua pekerjaan',
    })
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      document.querySelectorAll('dl[aria-label^="Ringkasan "]')
    ).toHaveLength(0)
    mocks.navigate.mockClear()
    await toggle.click()
    await expect
      .element(
        screen.getByRole('button', { name: 'Tutup ringkasan semua pekerjaan' })
      )
      .toHaveAttribute('aria-expanded', 'true')
    const summaries = document.querySelectorAll('dl[aria-label^="Ringkasan "]')
    expect(summaries).toHaveLength(2)
    expect(summaries[0]?.textContent).toContain('1.200 PCS')
    expect(summaries[0]?.textContent).toContain('Jumlah Setoran2')
    expect(summaries[0]?.textContent).toContain('Defect Tercatat3')
    expect(summaries[1]?.textContent).toContain('Defect Tercatat\u2014')
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(
      mocks.tabs.mock.calls[mocks.tabs.mock.calls.length - 1]?.[0]
    ).not.toHaveProperty('query')
    expect(
      mocks.employees.mock.calls[mocks.employees.mock.calls.length - 1]?.[0]
    ).toMatchObject({
      query: 'Pekerja',
      page: 2,
    })
    expect(
      mocks.deposits.mock.calls[mocks.deposits.mock.calls.length - 1]?.[0]
    ).toBeUndefined()
    await screen.getByRole('tab', { name: /Batil/ }).click()
    await screen.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ProductionDailySummaryPage
          search={{ jobUid: 'batil' }}
          navigate={mocks.navigate}
        />
      </QueryClientProvider>
    )
    await expect
      .element(screen.getByRole('tab', { name: /Batil/ }))
      .toHaveAttribute('aria-selected', 'true')
    expect(
      document.querySelectorAll('dl[aria-label^="Ringkasan "]')
    ).toHaveLength(2)
    await screen
      .getByRole('button', { name: 'Tutup ringkasan semua pekerjaan' })
      .click()
    expect(
      document.querySelectorAll('dl[aria-label^="Ringkasan "]')
    ).toHaveLength(0)
  })
  it('keeps raw totals per unit and excludes payroll fields from all job cards', async () => {
    const original = mocks.tabs().data
    mocks.tabs.mockReturnValue(
      result({
        ...original,
        tabs: original.tabs.map((tab: { units: unknown[] }) => ({
          ...tab,
          units: [
            ...tab.units,
            {
              unitUid: 'kg',
              unitCode: 'KG',
              quantity: '12.345',
              decimalPrecision: 3,
              rejectOccurrences: 2,
              payableQuantity: '11',
              grossAmount: '999999',
              deductionPercentage: '3',
            },
          ],
        })),
      })
    )
    const screen = await view()
    await screen
      .getByRole('button', { name: 'Buka ringkasan semua pekerjaan' })
      .click()
    const summary = document.querySelector('dl[aria-label="Ringkasan Linting"]')
    expect(summary?.textContent).toContain('1.200 PCS')
    expect(summary?.textContent).toContain('12,345 KG')
    expect(summary?.textContent).toContain('Defect Tercatat5')
    expect([...summary!.querySelectorAll('dd')][0]?.children).toHaveLength(2)
    expect(summary?.textContent).not.toMatch(
      /Dibayar|Bruto|Adjustment|Potongan|999999|Rp/
    )
  })
  it('keeps the global toggle outside the scrollable tabs on mobile with no page overflow', async () => {
    await page.viewport(390, 844)
    const screen = await view()
    await screen
      .getByRole('button', { name: 'Buka ringkasan semua pekerjaan' })
      .click()
    const toggle = document.querySelector<HTMLButtonElement>(
      'button[aria-expanded="true"][aria-controls]'
    )!
    const scroller = document.getElementById(
      toggle.getAttribute('aria-controls')!
    )!
    expect(scroller.contains(toggle)).toBe(false)
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
    expect(toggle.getBoundingClientRect().right).toBeLessThanOrEqual(390)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
    toggle.focus()
    await userEvent.keyboard('{Enter}')
    await expect
      .element(
        screen.getByRole('button', { name: 'Buka ringkasan semua pekerjaan' })
      )
      .toHaveAttribute('aria-expanded', 'false')
  })
  it('preserves arrow-key job navigation with expanded summaries', async () => {
    const screen = await view()
    await screen
      .getByRole('button', { name: 'Buka ringkasan semua pekerjaan' })
      .click()
    const firstTab = document.querySelector<HTMLButtonElement>(
      '[role="tab"][data-state="active"]'
    )!
    firstTab.focus()
    mocks.navigate.mockClear()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement?.textContent).toContain('Batil')
    const update =
      mocks.navigate.mock.calls[mocks.navigate.mock.calls.length - 1]?.[0]
        .search
    expect(update({})).toMatchObject({ jobUid: 'batil' })
    expect(
      document.querySelectorAll('dl[aria-label^="Ringkasan "]')
    ).toHaveLength(2)
  })
  it('removes KPI and refresh captions while showing operational defect and average columns', async () => {
    const screen = await view()
    await expect
      .element(screen.getByText(/^Diperbarui /))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText(/Otomatis setiap 60 detik/))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Pekerja', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Jumlah Setoran', { exact: true }))
      .not.toBeInTheDocument()
    // Only the table header remains; the total KPI is gone.
    expect(document.querySelectorAll('thead')).toHaveLength(1)
    expect(
      [...document.querySelectorAll('p')].some(
        (node) => node.textContent === 'Hasil Setoran'
      )
    ).toBe(false)
    const headers = [...document.querySelectorAll('thead th')].map(
      (node) => node.textContent
    )
    expect(
      headers.slice(headers.indexOf('Setoran'), headers.indexOf('Terakhir') + 1)
    ).toEqual(['Setoran', 'Defect Tercatat', 'Rata-rata / Setoran', 'Terakhir'])
    await expect
      .element(screen.getByRole('cell', { name: '600 PCS', exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('cell', { name: '3', exact: true }))
      .toBeVisible()
    expect(
      document.querySelector('tbody [title*="bukan jumlah PCS reject unik"]')
        ?.textContent
    ).toBe('3')
  })
  it('uses a dash for zero-count averages and missing defect occurrences without NaN or Infinity', async () => {
    mocks.employees.mockReturnValue(
      result({
        ...metadata,
        items: [{ ...employee, transactionCount: 0, rejectOccurrences: 0 }],
        total: 1,
      })
    )
    await view()
    const cells = [...document.querySelectorAll('tbody td')].map(
      (node) => node.textContent
    )
    expect(cells[4]).toBe('\u2014')
    expect(cells[5]).toBe('\u2014')
    expect(
      document.querySelector(
        'tbody [title="Belum ada kejadian defect tercatat"]'
      )
    ).not.toBeNull()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })
  it('formats average raw quantities using Indonesian decimal precision', async () => {
    mocks.employees.mockReturnValue(
      result({
        ...metadata,
        items: [
          {
            ...employee,
            quantity: '12.345',
            transactionCount: 2,
            unit: { ...unit, code: 'KG', decimalPrecision: 3 },
          },
        ],
        total: 1,
      })
    )
    const screen = await view()
    await expect
      .element(screen.getByRole('cell', { name: '6,173 KG', exact: true }))
      .toBeVisible()
  })
  it('guards an invalid raw quantity when computing average deposits', async () => {
    mocks.employees.mockReturnValue(
      result({
        ...metadata,
        items: [{ ...employee, quantity: 'invalid' }],
        total: 1,
      })
    )
    await view()
    expect(document.querySelectorAll('tbody td')[5]?.textContent).toBe('\u2014')
  })

  it('pauses refresh while the browser is hidden and resumes it when visible', async () => {
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible')
    try {
      await view()
      expect(mocks.tabs.mock.calls[mocks.tabs.mock.calls.length - 1]?.[1]).toBe(
        true
      )
      visibility.mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      await expect
        .poll(
          () => mocks.tabs.mock.calls[mocks.tabs.mock.calls.length - 1]?.[1]
        )
        .toBe(false)
      expect(
        mocks.employees.mock.calls[mocks.employees.mock.calls.length - 1]?.[1]
      ).toBe(false)
      visibility.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await expect
        .poll(
          () => mocks.tabs.mock.calls[mocks.tabs.mock.calls.length - 1]?.[1]
        )
        .toBe(true)
    } finally {
      visibility.mockRestore()
    }
  })

  it('changes employee query day and resets paging when the server crosses midnight', async () => {
    const search = { page: 2, jobUid: 'linting' }
    mocks.employees.mockReturnValue(
      result({
        ...metadata,
        items: [employee],
        summary: { units: [] },
        total: 100,
        page: 2,
        pageSize: 50,
      })
    )
    const screen = await view(search)
    const initial = mocks.tabs().data
    mocks.tabs.mockReturnValue(
      result({
        ...initial,
        effectiveDate: '2026-11-10',
        serverToday: '2026-11-10',
      })
    )
    mocks.navigate.mockClear()
    await screen.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ProductionDailySummaryPage search={search} navigate={mocks.navigate} />
      </QueryClientProvider>
    )
    expect(
      mocks.employees.mock.calls[mocks.employees.mock.calls.length - 1]?.[0]
        .date
    ).toBe('2026-11-10')
    const reset = mocks.navigate.mock.calls.find(
      ([options]) => options.replace === true
    )
    expect(reset?.[0].search(search)).toMatchObject({
      page: undefined,
      jobUid: undefined,
    })
  })

  it('uses server day and hides wages/date control for QC despite a stale URL or nominal field', async () => {
    const screen = await view({ date: '2026-11-01' })
    await expect
      .element(screen.getByRole('heading', { name: 'Ringkasan Produksi' }))
      .toBeVisible()
    expect(
      mocks.tabs.mock.calls[mocks.tabs.mock.calls.length - 1]?.[0].date
    ).toBeUndefined()
    expect(
      mocks.employees.mock.calls[mocks.employees.mock.calls.length - 1]?.[0]
        .date
    ).toBe('2026-11-09')
    await expect
      .element(screen.getByText('Nilai Bruto', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('12.345', { exact: false }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Hasil Dibayar', { exact: true }))
      .not.toBeInTheDocument()
    expect(document.querySelector('button[data-empty]')).toBeNull()
  })
  it('keeps dynamic tabs and resets pagination when switching jobs', async () => {
    const screen = await view({ filter: 'Pekerja', page: 2 })
    await screen.getByRole('tab', { name: /Batil/ }).click()
    const update =
      mocks.navigate.mock.calls[mocks.navigate.mock.calls.length - 1]?.[0]
        .search
    expect(update({ page: 2, filter: 'Pekerja' })).toEqual({
      jobUid: 'batil',
      page: undefined,
      filter: 'Pekerja',
    })
    expect(
      mocks.tabs.mock.calls[mocks.tabs.mock.calls.length - 1]?.[0].query
    ).toBeUndefined()
    expect(
      mocks.employees.mock.calls[mocks.employees.mock.calls.length - 1]?.[0]
        .query
    ).toBe('Pekerja')
  })
  it('opens worker-specific deposit sheet, scopes site/unit and pauses polling', async () => {
    const screen = await view({ moduleUid: ['module'] })
    await screen
      .getByRole('button', { name: 'Pekerja Satu', exact: true })
      .click()
    await expect.element(screen.getByRole('dialog')).toBeVisible()
    expect(
      mocks.deposits.mock.calls[mocks.deposits.mock.calls.length - 1]?.[0]
    ).toBe('worker')
    expect(
      mocks.deposits.mock.calls[mocks.deposits.mock.calls.length - 1]?.[1]
    ).toMatchObject({
      site: ['KLATEN'],
      moduleUid: ['module'],
      jobUid: 'linting',
      unitUid: 'unit',
      pageSize: 50,
    })
    expect(mocks.tabs.mock.calls[mocks.tabs.mock.calls.length - 1]?.[1]).toBe(
      false
    )
    await expect.element(screen.getByText(/kejadian defect/)).toBeVisible()
    await expect.element(screen.getByText(/^Dibayar/)).not.toBeInTheDocument()
    await screen.getByRole('button', { name: 'Detail', exact: true }).click()
    await expect
      .element(screen.getByText('Transaksi dibuka: deposit'))
      .toBeVisible()
  })
  it('shows compact mobile cards without a visible desktop table', async () => {
    await page.viewport(390, 844)
    const screen = await view()
    await expect
      .element(screen.getByRole('button', { name: /Pekerja Satu EMP001/ }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('table', { includeHidden: true }))
      .not.toBeVisible()
    const card = screen.getByRole('button', { name: /^Pekerja Satu EMP001/ })
    await expect.element(card).toHaveTextContent('Rata-rata 600 PCS / setoran')
    await expect.element(card).toHaveTextContent('Defect 3')
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
  })
  it('requires role and server capability together before rendering wages', async () => {
    await page.viewport(1440, 900)
    mocks.state.role = 'HR_OFFICER'
    const originalTabs = mocks.tabs().data
    mocks.tabs.mockReturnValue(
      result({ ...originalTabs, canViewWages: true, canChangeDate: true })
    )
    mocks.employees.mockReturnValue(
      result({ ...metadata, canViewWages: true, items: [employee], total: 1 })
    )
    const screen = await view()
    await expect
      .element(screen.getByText('Nilai Bruto', { exact: true }))
      .toBeVisible()
    await expect.element(screen.getByText(/12.345/)).toBeVisible()
    await expect
      .element(screen.getByText('Hasil Dibayar', { exact: true }))
      .toBeVisible()
    expect(document.querySelector('button[data-empty]')).not.toBeNull()
  })
  it('renders retry state and no previous employee table when request fails', async () => {
    mocks.employees.mockReturnValue({ ...result(undefined), isError: true })
    const screen = await view()
    await expect.element(screen.getByRole('alert')).toBeVisible()
    await screen.getByRole('button', { name: 'Coba lagi', exact: true }).click()
    expect(mocks.employees().refetch).toHaveBeenCalled()
    await expect.element(screen.getByRole('table')).not.toBeInTheDocument()
  })
  it('keeps brand-only Batil deposits compact without empty QC measurements', async () => {
    const deposits = mocks.deposits().data
    mocks.deposits.mockReturnValue(
      result({
        ...deposits,
        items: deposits.items.map((item: Record<string, unknown>) => ({
          ...item,
          qc: {
            brand: { name: 'Brand Batil' },
            weight1Grams: null,
            weight2Grams: null,
            defects: [],
          },
          rejectOccurrences: 0,
        })),
      })
    )
    const screen = await view()
    await screen
      .getByRole('button', { name: 'Pekerja Satu', exact: true })
      .click()
    await expect
      .element(screen.getByText('Brand Batil', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByText(/kejadian defect/))
      .not.toBeInTheDocument()
    expect(
      document.querySelector('[role="dialog"]')?.textContent
    ).not.toContain('gr /')
  })
  it('closes worker panels synchronously when the account access changes', async () => {
    const screen = await view()
    await screen
      .getByRole('button', { name: 'Pekerja Satu', exact: true })
      .click()
    await expect.element(screen.getByRole('dialog')).toBeVisible()
    mocks.state.role = 'HR_OFFICER'
    await screen.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ProductionDailySummaryPage search={{}} navigate={mocks.navigate} />
      </QueryClientProvider>
    )
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.tabs.mock.calls[mocks.tabs.mock.calls.length - 1]?.[1]).toBe(
      true
    )
  })
})
