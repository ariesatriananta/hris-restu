import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useAuthStore } from '@/stores/auth-store'
import { PayrollSimulationPage } from './payroll-simulation-page'

function renderPage({
  search = {},
  seed,
}: {
  search?: Record<string, unknown>
  seed?: (client: QueryClient) => void
} = {}) {
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
  seed?.(client)
  return render(
    <QueryClientProvider client={client}>
      <PayrollSimulationPage search={search} navigate={vi.fn()} />
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

  it('menyajikan simulasi TIME_BASED sebagai hari dan upah dasar', async () => {
    const screen = await renderPage({
      search: { periodUid: 'period-1', runUid: 'run-1' },
      seed: (client) => {
        client.setQueryData(['payroll-periods', 'detail', 'period-1'], {
          uid: 'period-1',
          payrollBasis: 'TIME_BASED',
          employeeType: 'HARIAN',
          readiness: {
            status: 'READY',
            blockers: [],
            warnings: [],
          },
        })
        client.setQueryData(
          ['payroll-periods', 'period-1', 'runs'],
          [{ uid: 'run-1', runNumber: 1, isCurrent: true }]
        )
        client.setQueryData(['payroll-periods', 'run', 'run-1'], {
          uid: 'run-1',
          status: 'COMPLETED',
          employeeCount: 1,
          totalPieceRateAmount: '0.00',
          totalBasicSalaryAmount: '750000.00',
          totalAttendanceDays: 5,
          totalPayablePresentDays: 5,
          totalOffdayPresentDays: 1,
          totalEarnings: '0.00',
          totalDeductions: '0.00',
          totalNetPay: '750000.00',
        })
        client.setQueryData(
          [
            'payroll-periods',
            'run',
            'run-1',
            'employees',
            {
              page: 1,
              pageSize: 50,
              query: undefined,
              issue: undefined,
            },
          ],
          {
            data: [
              {
                uid: 'result-1',
                employeeNumber: 'PKDS-001',
                fullName: 'BUDI HARIAN',
                employeeType: 'HARIAN',
                basicSalaryAmount: '750000.00',
                attendanceDays: 5,
                payablePresentDays: 5,
                offdayPresentDays: 1,
                additionalEarnings: '0.00',
                totalDeductions: '0.00',
                netPay: '750000.00',
                issues: [],
              },
            ],
            meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
          }
        )
      },
    })

    await expect
      .element(screen.getByText('Payroll Berbasis Waktu'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Hari dibayar', { exact: true }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Upah dasar', { exact: true }))
      .toBeInTheDocument()
    await expect.element(screen.getByText('5 hari dibayar')).toBeInTheDocument()
    await expect
      .element(screen.getByText('1 hari nonkerja', { exact: true }).first())
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Bruto Produksi'))
      .not.toBeInTheDocument()
  })

  it('menampilkan ledger harian dan Produksi Training hanya sebagai monitoring', async () => {
    const screen = await renderPage({
      search: {
        periodUid: 'period-training',
        runUid: 'run-training',
        employeeUid: 'result-training',
      },
      seed: (client) => {
        client.setQueryData(['payroll-periods', 'detail', 'period-training'], {
          uid: 'period-training',
          payrollBasis: 'TIME_BASED',
          employeeType: 'TRAINING',
          readiness: {
            status: 'READY',
            blockers: [],
            warnings: [],
          },
        })
        client.setQueryData(
          ['payroll-periods', 'period-training', 'runs'],
          [{ uid: 'run-training', runNumber: 1, isCurrent: true }]
        )
        client.setQueryData(['payroll-periods', 'run', 'run-training'], {
          uid: 'run-training',
          status: 'COMPLETED',
          employeeCount: 1,
          totalPieceRateAmount: '0.00',
          totalBasicSalaryAmount: '150000.00',
          totalAttendanceDays: 1,
          totalPayablePresentDays: 1,
          totalOffdayPresentDays: 1,
          totalEarnings: '0.00',
          totalDeductions: '0.00',
          totalNetPay: '150000.00',
        })
        client.setQueryData(
          [
            'payroll-periods',
            'run',
            'run-training',
            'employees',
            {
              page: 1,
              pageSize: 50,
              query: undefined,
              issue: undefined,
            },
          ],
          { data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 } }
        )
        client.setQueryData(
          [
            'payroll-periods',
            'run',
            'run-training',
            'employee',
            'result-training',
          ],
          {
            uid: 'result-training',
            employee: {
              uid: 'employee-training',
              employeeNumber: 'TRN-001',
              fullName: 'SITI TRAINING',
              employeeType: 'TRAINING',
              departmentName: 'Produksi',
              positionName: 'Operator',
              workGroupName: null,
            },
            totals: {
              pieceRateAmount: '0.00',
              basicSalaryAmount: '150000.00',
              additionalEarnings: '0.00',
              grossEarnings: '150000.00',
              totalDeductions: '0.00',
              netPay: '150000.00',
            },
            bank: {
              bankName: 'Bank Contoh',
              accountNumber: null,
              accountLast4: '1234',
              accountName: null,
              complete: true,
            },
            attendance: {
              scheduledDays: 0,
              presentDays: 1,
              absentDays: 0,
              leaveDays: 0,
              sickDays: 0,
              permissionDays: 0,
              holidayDays: 0,
              lateMinutes: 0,
              earlyLeaveMinutes: 0,
              workedMinutes: 480,
            },
            timeDetails: [
              {
                businessDate: '2026-08-23',
                attendanceStatus: 'PRESENT',
                calendarDayType: 'NON_WORKDAY',
                isScheduled: false,
                isPayable: true,
                dailyRate: '150000.00',
                amount: '150000.00',
                workedMinutes: 480,
                warningCode: 'OFFDAY_PRESENT',
              },
            ],
            trainingProduction: [
              {
                transactionNumber: 'PRD-TRAINING-001',
                businessDate: '2026-08-23',
                jobName: 'Linting',
                unitName: 'PCS',
                quantity: '20',
              },
            ],
            production: [],
            components: [],
            formulaTrace: {
              pieceRate: null,
              timeBased:
                'ROUND(HALF_UP, SUM(tarif harian pada Attendance PRESENT), Rp1)',
              recurring: 'Tidak digunakan pada TIME_BASED M5B',
              manual: 'Komponen ACTIVE pada periode',
              net: 'grossEarnings - totalDeductions',
            },
          }
        )
      },
    })

    await expect
      .element(screen.getByRole('heading', { name: 'Rincian Upah Harian' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Hadir hari nonkerja'))
      .toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('heading', {
          name: 'Monitoring Produksi Training (1)',
        })
      )
      .toBeInTheDocument()
    await expect.element(screen.getByText('20 PCS')).toBeInTheDocument()
    await expect
      .element(screen.getByText('Rp 150.000', { exact: true }).first())
      .toBeInTheDocument()
  })

  it('menyajikan formula prorata dan potongan Bulanan secara terpisah', async () => {
    const monthly = {
      fullBasicSalary: '5000000.00',
      eligibleCalendarDays: 21,
      periodCalendarDays: 31,
      proratedBasicSalary: '3387097.00',
      scheduledWorkDays: 22,
      alphaDays: 2,
      permissionDays: 1,
      alphaDeduction: '454545.00',
      permissionDeduction: '227273.00',
    }
    const screen = await renderPage({
      search: {
        periodUid: 'period-monthly',
        runUid: 'run-monthly',
        employeeUid: 'result-monthly',
      },
      seed: (client) => {
        client.setQueryData(['payroll-periods', 'detail', 'period-monthly'], {
          uid: 'period-monthly',
          payrollBasis: 'TIME_BASED',
          payFrequency: 'MONTHLY',
          employeeType: 'BULANAN',
          readiness: { status: 'READY', blockers: [], warnings: [] },
        })
        client.setQueryData(
          ['payroll-periods', 'period-monthly', 'runs'],
          [{ uid: 'run-monthly', runNumber: 1, isCurrent: true }]
        )
        client.setQueryData(['payroll-periods', 'run', 'run-monthly'], {
          uid: 'run-monthly',
          status: 'COMPLETED',
          employeeCount: 1,
          totalPieceRateAmount: '0.00',
          totalBasicSalaryAmount: '3387097.00',
          totalProratedBasicSalary: '3387097.00',
          totalAlphaDeduction: '454545.00',
          totalPermissionDeduction: '227273.00',
          totalEarnings: '0.00',
          totalGrossEarnings: '3387097.00',
          totalDeductions: '681818.00',
          totalNetPay: '2705279.00',
        })
        client.setQueryData(
          [
            'payroll-periods',
            'run',
            'run-monthly',
            'employees',
            {
              page: 1,
              pageSize: 50,
              query: undefined,
              issue: undefined,
            },
          ],
          {
            data: [
              {
                uid: 'result-monthly',
                employeeNumber: 'BUL-001',
                fullName: 'ANI BULANAN',
                employeeType: 'BULANAN',
                basicSalaryAmount: '3387097.00',
                payablePresentDays: 0,
                offdayPresentDays: 0,
                monthly,
                additionalEarnings: '0.00',
                totalDeductions: '681818.00',
                netPay: '2705279.00',
                issues: [],
              },
            ],
            meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
          }
        )
        client.setQueryData(
          [
            'payroll-periods',
            'run',
            'run-monthly',
            'employee',
            'result-monthly',
          ],
          {
            uid: 'result-monthly',
            employee: {
              uid: 'employee-monthly',
              employeeNumber: 'BUL-001',
              fullName: 'ANI BULANAN',
              employeeType: 'BULANAN',
              departmentName: 'HR',
              positionName: 'Staf',
              workGroupName: null,
            },
            totals: {
              pieceRateAmount: '0.00',
              basicSalaryAmount: '3387097.00',
              additionalEarnings: '0.00',
              grossEarnings: '3387097.00',
              totalDeductions: '681818.00',
              netPay: '2705279.00',
            },
            bank: { complete: false },
            attendance: {
              scheduledDays: 22,
              presentDays: 18,
              absentDays: 2,
              leaveDays: 1,
              sickDays: 0,
              permissionDays: 1,
              holidayDays: 0,
              lateMinutes: 0,
              earlyLeaveMinutes: 0,
              workedMinutes: 0,
            },
            monthlyDetail: {
              ...monthly,
              currency: 'IDR',
              salaryHistoryUid: 'salary-history-1',
              salaryEffectiveFrom: '2026-08-01',
            },
            monthlyDailyDetails: [
              {
                businessDate: '2026-08-10',
                attendanceStatus: 'ABSENT',
                calendarDayType: 'WORKDAY',
                calendarReasonType: 'SHIFT_WEEKDAY',
                isScheduled: true,
                fullBasicSalary: '5000000.00',
                currency: 'IDR',
                workedMinutes: null,
                deductionType: 'ALPHA',
              },
            ],
            timeDetails: [],
            trainingProduction: [],
            production: [],
            components: [],
            formulaTrace: {
              pieceRate: null,
              timeBased: null,
              monthly: 'Gaji pokok x kalender eligible / kalender periode',
              recurring: 'Tidak digunakan pada TIME_BASED M5C',
              manual: 'Komponen ACTIVE pada periode',
              net: 'grossEarnings - totalDeductions',
            },
          }
        )
      },
    })

    await expect
      .element(screen.getByText('Gaji prorata', { exact: true }).first())
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Potongan Alpha', { exact: true }).first())
      .toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('heading', { name: 'Dasar Perhitungan Bulanan' })
      )
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('21 dari 31 hari'))
      .toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('heading', { name: 'Ledger Attendance Bulanan' })
      )
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Potongan Alpha', { exact: true }).last())
      .toBeInTheDocument()
    await expect
      .element(
        screen.getByText('Periksa prorata dan potongan per karyawan', {
          exact: false,
        })
      )
      .toBeInTheDocument()
  })
})
