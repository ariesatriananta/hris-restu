import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { AuthSession } from '@/features/auth/domain'
import {
  useCorrectProductionTransaction,
  useProductionDailyEmployees,
  useProductionDailyTabs,
  useProductionDailyTransactions,
  useProductionTransaction,
  useProductionTransactionModuleOptions,
  useVoidProductionTransaction,
} from './queries'

const state = vi.hoisted(() => ({
  session: null as AuthSession | null,
  get: vi.fn(),
  post: vi.fn(),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (
    selector: (value: { session: AuthSession | null }) => unknown
  ) => selector(state),
}))
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: state.get, post: state.post },
}))

const clients: QueryClient[] = []
function session(uid = 'account-a'): AuthSession {
  return {
    user: {
      uid,
      name: 'Test user',
      email: null,
      role: 'HR_OFFICER',
      roles: ['HR_OFFICER'],
      roleLabel: 'HR',
      siteAccess: ['KLATEN'],
      productionModuleAccess: ['module-a'],
      mustChangePassword: false,
    },
    permissions: ['production.view'],
    expiresAt: Date.now() + 60_000,
  }
}
function Harness() {
  const input = { jobUid: 'job', date: '2026-11-09' }
  const tabs = useProductionDailyTabs(input, false)
  const employees = useProductionDailyEmployees(input, false)
  const deposits = useProductionDailyTransactions('employee', input)
  const modules = useProductionTransactionModuleOptions(['KLATEN'])
  const transaction = useProductionTransaction('transaction')
  const correct = useCorrectProductionTransaction('transaction')
  const cancel = useVoidProductionTransaction('transaction')
  return (
    <div>
      <output data-testid='monitor'>
        {JSON.stringify([
          tabs.data ?? 'pending',
          employees.data ?? 'pending',
          deposits.data ?? 'pending',
          modules.data ?? 'pending',
          transaction.data ?? 'pending',
        ])}
      </output>
      <button
        onClick={() =>
          correct.mutate({
            jobUid: 'job',
            quantity: '500',
            reason: 'Audit test',
            idempotencyKey: 'test',
          })
        }
      >
        Uji koreksi
      </button>
      <button
        onClick={() =>
          cancel.mutate({ reason: 'Audit test', idempotencyKey: 'test' })
        }
      >
        Uji void
      </button>
    </div>
  )
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  clients.push(client)
  const view = () => (
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  )
  return { client, view }
}
beforeEach(() => {
  state.session = session()
  state.post.mockReset().mockResolvedValue({ data: {} })
  state.get.mockReset().mockResolvedValue({
    data: {
      effectiveDate: '2026-11-09',
      serverToday: '2026-11-09',
      canViewWages: true,
      canChangeDate: true,
      tabs: [{ jobUid: 'job', jobName: 'scope-a' }],
      items: [{ uid: 'scope-a', grossAmount: '12345.67' }],
      transaction: { uid: 'scope-a', grossAmount: '12345.67' },
    },
  })
})
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
})

describe('Production monitoring cache isolation', () => {
  it.each(['koreksi', 'void'])(
    'refreshes tabs, workers, deposits and transaction after successful %s',
    async (action) => {
      const { view } = setup()
      const screen = await render(view())
      await expect.poll(() => state.get.mock.calls.length).toBe(5)
      state.get.mockResolvedValue({
        data: { marker: 'updated', transaction: { marker: 'updated' } },
      })
      await screen
        .getByRole('button', { name: `Uji ${action}`, exact: true })
        .click()
      await expect.poll(() => state.get.mock.calls.length).toBe(9)
      const monitor = JSON.parse(
        screen.getByTestId('monitor').element().textContent ?? '[]'
      ) as Array<{ marker?: string }>
      for (const index of [0, 1, 2, 4])
        expect(monitor[index]?.marker).toBe('updated')
      expect(state.post.mock.calls[0][0]).toBe(
        `/production/transactions/transaction/${action === 'koreksi' ? 'correct' : 'void'}`
      )
    }
  )

  it('does not request monitoring or detail data without a session', async () => {
    state.session = null
    const { view } = setup()
    const screen = await render(view())
    await expect
      .element(screen.getByTestId('monitor'))
      .not.toHaveTextContent('scope-a')
    expect(state.get).not.toHaveBeenCalled()
  })

  it.each(['account', 'access'] as const)(
    'removes cached financial and module facts immediately when %s changes',
    async (change) => {
      const { view } = setup()
      const screen = await render(view())
      await expect
        .element(screen.getByTestId('monitor'))
        .toHaveTextContent('12345.67')
      await expect.poll(() => state.get.mock.calls.length).toBe(5)
      // Hold replacement responses so stale data cannot be masked by a quick fetch.
      state.get.mockImplementation(() => new Promise(() => {}))
      state.session =
        change === 'account'
          ? session('account-b')
          : {
              ...session(),
              user: {
                ...session().user,
                role: 'QC',
                roles: ['QC'],
                productionModuleAccess: ['module-b'],
              },
            }
      await screen.rerender(view())
      await expect.poll(() => state.get.mock.calls.length).toBe(10)
      await expect
        .element(screen.getByTestId('monitor'))
        .not.toHaveTextContent('scope-a')
      await expect
        .element(screen.getByTestId('monitor'))
        .not.toHaveTextContent('12345.67')
    }
  )
})
