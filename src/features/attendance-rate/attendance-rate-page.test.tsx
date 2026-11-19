import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { AuthSession } from '@/features/auth/domain'
import { AttendanceRatePage } from './attendance-rate-page'
import type { AttendanceRateReport, AttendanceRateSearch } from './data/types'

const state = vi.hoisted(() => ({
  session: null as AuthSession | null,
  get: vi.fn(),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (
    selector: (value: { session: AuthSession | null }) => unknown
  ) => selector(state),
}))
vi.mock('@/lib/api-client', () => ({ apiClient: { get: state.get } }))
const sites = [
  { uid: 'site-k', code: 'KLATEN', name: 'Site Klaten' },
  { uid: 'site-j', code: 'JEPARA', name: 'Site Jepara' },
]
const clients: QueryClient[] = []
function report(): AttendanceRateReport {
  return {
    date: '2026-11-19',
    site: sites[0],
    referenceWeek: { from: '2026-11-09', to: '2026-11-15' },
    groups: (['TRAINING', 'BORONGAN'] as const).flatMap((employeeType) =>
      (['REGULER', 'PREMIUM'] as const).map((category) => ({
        employeeType,
        category,
        roster: 42,
        present: 33,
        ratePercent: '78.57',
        modules: [{ uid: 'module-a', code: 'A', name: 'Modul A, B dan C' }],
        jobs: ['Linting', 'Batil', 'Packing', 'Slop', 'Kemas 1', 'Kemas 2'].map(
          (name) => ({
            job: { uid: name, code: name, name },
            roster: 7,
            present: 5,
            ratePercent: '71.43',
          })
        ),
        unassigned: { roster: 0, present: 0 },
      }))
    ),
    unmapped: [],
    totals: (['TRAINING', 'BORONGAN', 'TOTAL'] as const).map(
      (employeeType) => ({
        employeeType,
        roster: 84,
        present: 66,
        ratePercent: '78.57',
      })
    ),
    averages: ['BORONGAN-LINTING', 'BORONGAN-PACKING'].flatMap((code) =>
      (['TRAINING', 'BORONGAN'] as const).flatMap((employeeType) =>
        (['REGULER', 'PREMIUM', 'TOTAL'] as const).map((category) => ({
          job: { code, name: code },
          employeeType,
          category,
          quantityPcs: '20000.0000',
          presentDays: 10,
          transactions: 10,
          averagePcs: '2000.0000',
          complete: true,
          status: 'AVAILABLE' as const,
        }))
      )
    ),
    estimates: ['Linting', 'Packing'].map((name) => ({
      job: { code: `BORONGAN-${name.toUpperCase()}`, name },
      pcsPerBox: name === 'Linting' ? 9600 : 800,
      categories: (['REGULER', 'PREMIUM', 'TOTAL'] as const).map(
        (category) => ({
          category,
          present: 10,
          boxes: '12.50',
          estimatedPcs: '120000.0000',
          complete: true,
        })
      ),
    })),
    warnings: [],
  }
}
function setup(
  initial: AttendanceRateSearch = { site: 'KLATEN', date: '2026-11-19' }
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  function Harness() {
    const [search, setSearch] = useState<Record<string, unknown>>(initial)
    return (
      <QueryClientProvider client={client}>
        <AttendanceRatePage
          search={search}
          navigate={({ search: next }) => {
            if (next !== true)
              setSearch((previous) =>
                typeof next === 'function' ? next(previous) : next
              )
          }}
        />
        <button
          onClick={() => setSearch({ site: 'JEPARA', date: '2026-11-19' })}
        >
          Test pindah site
        </button>
        <output data-testid='search'>{JSON.stringify(search)}</output>
      </QueryClientProvider>
    )
  }
  return render(<Harness />)
}
beforeEach(async () => {
  await page.viewport(1440, 900)
  state.session = {
    user: {
      uid: 'account-a',
      role: 'HR_OFFICER',
      roles: ['HR_OFFICER'],
      name: 'Test',
      email: null,
      roleLabel: 'HR',
      siteAccess: ['KLATEN', 'JEPARA'],
      mustChangePassword: false,
    },
    permissions: ['production.view', 'attendance.view'],
    expiresAt: Date.now() + 100000,
  }
  state.get.mockReset().mockImplementation(async (url: string) => ({
    data: url.endsWith('/options')
      ? { sites, serverToday: '2026-11-20' }
      : { data: report(), meta: { serverToday: '2026-11-20' } },
  }))
})
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
})

describe('Attendance Rate operational dashboard', () => {
  it('renders daily groups, weighted server averages and own job estimates compactly', async () => {
    const screen = await setup()
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .toHaveTextContent('Site Klaten')
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .toHaveTextContent('9 November 2026 – 15 November 2026')
    expect(
      screen
        .getByTestId('attendance-rate-report')
        .element()
        .querySelectorAll('dl')
    ).toHaveLength(4)
    expect(state.get.mock.calls[1][1].params).toEqual({
      site: 'KLATEN',
      date: '2026-11-19',
    })
    expect(state.get.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal)
    await screen.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect.poll(() => state.get.mock.calls.length).toBe(3)
  })
  it('defaults to server today, keeps a single site and persists both filters in URL', async () => {
    const screen = await setup({})
    await expect
      .element(screen.getByTestId('search'))
      .toHaveTextContent('2026-11-20')
    await expect
      .element(screen.getByTestId('search'))
      .toHaveTextContent('KLATEN')
    expect(state.get.mock.calls[1][1].params).toEqual({
      site: 'KLATEN',
      date: '2026-11-20',
    })
  })
  it.each([
    { site: 'UNAUTHORIZED', date: '2026-11-19' },
    { site: 'KLATEN', date: '2026-11-21' },
    { site: 'KLATEN', date: '2026-02-30' },
  ])(
    'rejects invalid URL scope/date without loading report: %j',
    async (input) => {
      const screen = await setup(input)
      await expect
        .element(screen.getByRole('alert'))
        .toHaveTextContent('Pilih site')
      expect(state.get).toHaveBeenCalledTimes(1)
    }
  )
  it('allows recovering an invalid URL site even with only one authorized option', async () => {
    state.get.mockImplementation(async (url: string) => ({
      data: url.endsWith('/options')
        ? { sites: [sites[0]], serverToday: '2026-11-20' }
        : { data: report(), meta: { serverToday: '2026-11-20' } },
    }))
    const screen = await setup({ site: 'UNAUTHORIZED', date: '2026-11-19' })
    await expect.element(screen.getByRole('alert')).toBeVisible()
    await screen.getByRole('combobox', { name: 'Site', exact: true }).click()
    await page.getByRole('option', { name: 'Site Klaten', exact: true }).click()
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .toBeVisible()
    expect(state.get.mock.calls[1][1].params.site).toBe('KLATEN')
  })
  it('shows no active site without requesting a report', async () => {
    state.get.mockResolvedValue({
      data: { sites: [], serverToday: '2026-11-20' },
    })
    const screen = await setup({})
    await expect
      .element(screen.getByText('Belum ada site aktif yang dapat diakses.'))
      .toBeVisible()
    expect(state.get).toHaveBeenCalledTimes(1)
  })
  it('recovers options after a failed request using Refresh', async () => {
    state.get.mockRejectedValueOnce(new Error('Offline'))
    const screen = await setup()
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Laporan gagal dimuat')
    await screen.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .toBeVisible()
    expect(state.get).toHaveBeenCalledTimes(3)
  })
  it('removes previous site numbers immediately while new site loads and if request fails', async () => {
    const screen = await setup()
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .toBeVisible()
    let reject: (error: Error) => void = () => {}
    state.get.mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise
        })
    )
    await screen.getByRole('button', { name: 'Test pindah site' }).click()
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .not.toBeInTheDocument()
    reject(new Error('Offline'))
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Laporan gagal dimuat')
    expect(state.get).toHaveBeenCalledTimes(3)
  })
  it('keeps unavailable AVG separate from legitimate zero capacity and surfaces mapping warnings', async () => {
    const data = report()
    data.averages[0] = {
      ...data.averages[0],
      averagePcs: null,
      status: 'INCOMPLETE',
      complete: false,
    }
    data.estimates[0].categories[0].boxes = '0.00'
    data.estimates[1].categories[0].boxes = null
    data.unmapped = [{ employeeType: 'TRAINING', roster: 2, present: 1 }]
    data.warnings = [
      {
        scope: 'REFERENCE_WEEK',
        code: 'MISSING_MODULE_CATEGORY',
        count: 2,
        message: 'Kategori modul belum dipetakan.',
      },
    ]
    state.get.mockImplementation(async (url: string) => ({
      data: url.endsWith('/options')
        ? { sites, serverToday: '2026-11-20' }
        : { data, meta: { serverToday: '2026-11-20' } },
    }))
    const screen = await setup()
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .toHaveTextContent('2 roster belum dipetakan')
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .toHaveTextContent('Perlu pemetaan / periksa data')
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .toHaveTextContent('0 Box')
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .toHaveTextContent('Data belum lengkap')
  })
  it.each(['QC', 'PRODUCTION_ADMIN', 'DIRECTOR'] as const)(
    'denies %s before any request',
    async (role) => {
      state.session!.user.role = role
      state.session!.user.roles = [role]
      const screen = await setup()
      await expect
        .element(screen.getByRole('alert'))
        .toHaveTextContent('hanya tersedia')
      expect(state.get).not.toHaveBeenCalled()
    }
  )
  it('opens focused screenshot mode with context and closes by Escape; mobile fits viewport', async () => {
    const screen = await setup()
    await expect
      .element(screen.getByTestId('attendance-rate-report'))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Mode Screenshot' }).click()
    await expect
      .element(screen.getByRole('dialog'))
      .toHaveTextContent('Site Klaten')
    await expect
      .poll(
        () => screen.getByRole('dialog').element().getBoundingClientRect().x
      )
      .toBe(0)
    const bounds = screen.getByRole('dialog').element().getBoundingClientRect()
    expect(bounds.y).toBe(0)
    expect(bounds.width).toBe(1440)
    await page.screenshot({
      path: '../../../artifacts/attendance-rate/desktop.png',
    })
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    await page.viewport(375, 812)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
    await page.screenshot({
      path: '../../../artifacts/attendance-rate/mobile.png',
    })
  })
})
