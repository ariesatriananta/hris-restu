import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
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
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
  })
  it('requires role and server capability together before rendering wages', async () => {
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
