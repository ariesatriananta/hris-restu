import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useAuthStore } from '@/stores/auth-store'
import { PayrollApprovalClosingPage } from './payroll-approval-closing-page'

const periodUid = '11111111-1111-4111-8111-111111111111'
const runUid = '22222222-2222-4222-8222-222222222222'
const approvalUid = '33333333-3333-4333-8333-333333333333'

function client() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  queryClient.setQueryData(['payroll-periods', 'meta'], {
    sites: [
      {
        uid: '44444444-4444-4444-8444-444444444444',
        code: 'JEPARA',
        name: 'Jepara',
      },
    ],
    statuses: ['DRAFT', 'CALCULATED', 'APPROVED', 'CLOSED', 'CANCELLED'],
    maxPeriodDays: 31,
    payrollBasis: 'PIECE_RATE',
  })
  queryClient.setQueryData(
    [
      'payroll-periods',
      'approval-queue',
      {
        status: 'PENDING',
        siteCode: undefined,
        query: undefined,
        page: 1,
        pageSize: 20,
      },
    ],
    {
      data: [
        {
          approvalUid,
          periodUid,
          periodCode: 'PAY-JPR-202608',
          periodName: 'Payroll Agustus 2026',
          siteCode: 'JEPARA',
          siteName: 'Jepara',
          runUid,
          runNumber: 2,
          employeeCount: 15,
          totalNetPay: '12500000.00',
          requestedAt: '2026-08-28T10:00:00.000Z',
          requestedByName: 'Finance Jepara',
          superAdminOverride: false,
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1 },
    }
  )
  return queryClient
}

function renderPage(
  queryClient: QueryClient,
  search: Record<string, unknown> = {}
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <PayrollApprovalClosingPage search={search} navigate={vi.fn()} />
    </QueryClientProvider>
  )
}

describe('Payroll approval closing page', () => {
  beforeEach(() => {
    useAuthStore.setState({
      session: {
        user: {
          uid: '55555555-5555-4555-8555-555555555555',
          name: 'Direktur',
          email: null,
          role: 'DIRECTOR',
          roleLabel: 'Direktur',
          roles: ['DIRECTOR'],
          siteAccess: [],
          mustChangePassword: false,
        },
        permissions: ['payroll.view', 'payroll.approve'],
        expiresAt: Date.now() + 60_000,
      },
    })
  })

  afterEach(() => useAuthStore.setState({ session: null }))

  it('menyajikan antrean pending sebagai kartu operasional', async () => {
    const screen = await renderPage(client())
    await expect
      .element(screen.getByText('Payroll Agustus 2026'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('Rp 12.500.000')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Periksa' }))
      .toBeInTheDocument()
  })

  it('menampilkan blocker, aksi sesuai capability, dan histori override', async () => {
    const queryClient = client()
    queryClient.setQueryData(['payroll-periods', 'detail', periodUid], {
      uid: periodUid,
      periodCode: 'PAY-JPR-202608',
      periodName: 'Payroll Agustus 2026',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      paymentDate: null,
      payrollBasis: 'PIECE_RATE',
      status: 'CALCULATED',
      notes: null,
      site: {
        uid: '44444444-4444-4444-8444-444444444444',
        code: 'JEPARA',
        name: 'Jepara',
      },
      createdAt: '2026-08-28T08:00:00.000Z',
      cancelledAt: null,
      cancellationReason: null,
      readiness: {
        status: 'ATTENTION',
        populationCount: 15,
        blockers: [],
        warnings: [],
      },
    })
    queryClient.setQueryData(['payroll-periods', periodUid, 'workflow'], {
      periodUid,
      periodStatus: 'CALCULATED',
      currentRun: {
        uid: runUid,
        runNumber: 2,
        runType: 'SIMULATION',
        status: 'COMPLETED',
        employeeCount: 15,
        totalPieceRateAmount: '12000000.00',
        totalEarnings: '600000.00',
        totalDeductions: '100000.00',
        totalNetPay: '12500000.00',
      },
      approval: {
        uid: approvalUid,
        status: 'PENDING',
        requestedAt: '2026-08-28T10:00:00.000Z',
        requestedByName: 'Finance Jepara',
        reviewedAt: null,
        reviewedByName: null,
        notes: null,
        superAdminOverride: false,
      },
      capabilities: {
        canSubmit: false,
        canWithdraw: false,
        canApprove: true,
        canReject: true,
        canClose: false,
      },
      integrity: {
        valid: false,
        issues: [
          {
            code: 'BANK_ACCOUNT_DRIFT',
            message: 'Rekening karyawan berubah setelah simulasi.',
            count: 1,
          },
        ],
      },
      history: [
        {
          uid: '66666666-6666-4666-8666-666666666666',
          action: 'SUBMIT',
          reason: null,
          superAdminOverride: true,
          performedAt: '2026-08-28T10:00:00.000Z',
          performedByName: 'Administrator HRIS',
        },
      ],
    })
    queryClient.setQueryData(['payroll-periods', 'run', runUid], {
      uid: runUid,
      totalPieceRateAmount: '12000000.00',
      totalEarnings: '600000.00',
      totalDeductions: '100000.00',
      totalNetPay: '12500000.00',
    })

    const screen = await renderPage(queryClient, { periodUid })
    await expect
      .element(screen.getByText('Perlu hitung ulang'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Setujui' }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('button', { name: 'Tolak' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Override Super Admin'))
      .toBeInTheDocument()
  })
})
