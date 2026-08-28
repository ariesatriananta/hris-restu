import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useAuthStore } from '@/stores/auth-store'
import { PayrollSimulationPage } from './payroll-simulation-page'

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(
    [
      'payroll-periods',
      'list',
      { status: ['DRAFT', 'CALCULATED'], pageSize: 500 },
    ],
    {
      data: [],
      meta: { page: 1, pageSize: 500, total: 0, totalPages: 0 },
    }
  )
  return render(
    <QueryClientProvider client={client}>
      <PayrollSimulationPage search={{}} navigate={vi.fn()} />
    </QueryClientProvider>
  )
}

describe('Payroll simulation page', () => {
  beforeEach(() => {
    useAuthStore.setState({
      session: {
        user: {
          uid: '11111111-1111-4111-8111-111111111111',
          name: 'Director',
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

  it('menandai hasil sebagai simulasi dan meminta periode dipilih', async () => {
    const screen = await renderPage()
    await expect
      .element(screen.getByText('SIMULASI', { exact: true }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Pilih periode Payroll'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Hitung' }))
      .not.toBeInTheDocument()
  })
})
