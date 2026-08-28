import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useAuthStore } from '@/stores/auth-store'
import { PayrollPeriodsPage } from './payroll-periods-page'

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(
    [
      'payroll-periods',
      'list',
      {
        page: 1,
        pageSize: 50,
        query: undefined,
        site: undefined,
        status: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      },
    ],
    {
      data: [],
      meta: {
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 0,
        summary: { total: 0, draft: 0, needsAttention: 0, closed: 0 },
      },
    }
  )
  client.setQueryData(['payroll-periods', 'meta'], {
    sites: [],
    statuses: ['DRAFT', 'CALCULATED', 'APPROVED', 'CLOSED', 'CANCELLED'],
    maxPeriodDays: 31,
    payrollBasis: 'PIECE_RATE',
  })
  return render(
    <QueryClientProvider client={client}>
      <PayrollPeriodsPage search={{}} navigate={vi.fn()} />
    </QueryClientProvider>
  )
}

describe('Payroll periods page', () => {
  beforeEach(() => {
    useAuthStore.setState({
      session: {
        user: {
          uid: '11111111-1111-4111-8111-111111111111',
          name: 'Payroll Viewer',
          email: null,
          role: 'DIRECTOR',
          roleLabel: 'Director',
          siteAccess: [],
        },
        permissions: ['payroll.view'],
        expiresAt: Date.now() + 60_000,
      },
    })
  })

  afterEach(() => useAuthStore.setState({ session: null }))

  it('menampilkan empty state jujur dan menyembunyikan mutasi tanpa izin hitung', async () => {
    const screen = await renderPage()

    await expect
      .element(screen.getByText('Periode Payroll'))
      .toBeInTheDocument()
    await expect
      .element(
        screen.getByText('Belum ada periode yang sesuai filter.').first()
      )
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Buat periode' }))
      .not.toBeInTheDocument()
  })

  it('menyediakan tombol buat periode untuk Super Admin', async () => {
    useAuthStore.setState((state) => ({
      session: state.session
        ? {
            ...state.session,
            user: { ...state.session.user, role: 'SUPER_ADMIN' },
          }
        : null,
    }))
    const screen = await renderPage()

    await expect
      .element(screen.getByRole('button', { name: 'Buat periode' }))
      .toBeInTheDocument()
  })
})
