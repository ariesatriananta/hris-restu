import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useAuthStore } from '@/stores/auth-store'
import type { PayrollPeriodSummary } from './domain'
import { PayrollPeriodsPage } from './payroll-periods-page'

function renderPage(items: PayrollPeriodSummary[] = []) {
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
      data: items,
      meta: {
        page: 1,
        pageSize: 50,
        total: items.length,
        totalPages: items.length ? 1 : 0,
        summary: {
          total: items.length,
          draft: items.filter((item) => item.status === 'DRAFT').length,
          needsAttention: 0,
          closed: 0,
        },
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
          roles: ['DIRECTOR'],
          siteAccess: [],
          mustChangePassword: false,
        },
        permissions: ['payroll.view'],
        expiresAt: Date.now() + 60_000,
      },
    })
  })

  afterEach(() => useAuthStore.setState({ session: null }))

  it('menampilkan empty state jujur dan menyembunyikan mutasi tanpa izin hitung', async () => {
    const screen = await renderPage()

    await expect.element(screen.getByText('Proses Payroll')).toBeInTheDocument()
    await expect
      .element(screen.getByText('Periode & kesiapan'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('Perhitungan')).toBeInTheDocument()
    await expect
      .element(screen.getByText('Persetujuan & penutupan'))
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

  it('menyediakan aksi langsung menuju perhitungan untuk periode siap', async () => {
    const period: PayrollPeriodSummary = {
      uid: '22222222-2222-4222-8222-222222222222',
      periodCode: 'PAY-JEPARA-BORONGAN-01',
      periodName: 'Payroll Borongan Jepara',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-07',
      paymentDate: '2026-09-08',
      payrollBasis: 'PIECE_RATE',
      employeeType: 'BORONGAN',
      payFrequency: 'WEEKLY',
      status: 'DRAFT',
      notes: null,
      site: {
        uid: '33333333-3333-4333-8333-333333333333',
        code: 'JEPARA',
        name: 'Site Jepara',
      },
      createdAt: '2026-09-01T08:00:00+07:00',
      cancelledAt: null,
      cancellationReason: null,
      readiness: {
        status: 'READY',
        populationCount: 10,
        blockerCount: 0,
        warningCount: 0,
      },
    }
    const screen = await renderPage([period])
    const action = screen.getByRole('link', { name: 'Lanjut ke perhitungan' })

    await expect.element(action).toBeInTheDocument()
    await expect
      .element(action)
      .toHaveAttribute('href', `/payroll/simulasi?periodUid=${period.uid}`)
  })
})
