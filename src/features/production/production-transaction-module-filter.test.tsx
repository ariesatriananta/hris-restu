import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
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
beforeEach(() => {
  vi.clearAllMocks()
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
