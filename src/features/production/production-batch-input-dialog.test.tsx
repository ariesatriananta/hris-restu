import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import type { ProductionBatchInputPreview } from './data/production-batch-input-queries'
import { ProductionBatchInputDialog } from './production-batch-input-dialog'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/api-client', () => ({ apiClient: { post: mocks.post } }))
vi.mock('sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}))
// Calendar mechanics are covered by DatePicker; expose dates directly to exercise batch invalidation.
vi.mock('@/components/date-picker', () => ({
  DatePicker: ({
    id,
    selected,
    disabled,
    onSelect,
  }: {
    id: string
    selected?: Date
    disabled?: boolean
    onSelect: (date: Date) => void
  }) => (
    <input
      id={id}
      type='date'
      disabled={disabled}
      value={
        selected
          ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`
          : ''
      }
      onChange={(event) => onSelect(new Date(`${event.target.value}T12:00:00`))}
    />
  ),
}))

function preview(
  overrides: Partial<ProductionBatchInputPreview> = {}
): ProductionBatchInputPreview {
  return {
    dateFrom: '2026-11-19',
    dateTo: '2026-11-19',
    site: 'ALL',
    previewToken: 'checked-plan',
    expiresAt: '2026-11-19T23:59:00+07:00',
    canCreate: true,
    summary: { employees: 4, planned: 4, blocked: 1, pairs: 1 },
    items: [
      {
        businessDate: '2026-11-19',
        site: 'KLATEN',
        eligible: 4,
        planned: 4,
        blocked: 1,
        pairs: 1,
        blockers: [{ reason: 'Attendance belum siap', count: 1 }],
      },
    ],
    ...overrides,
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const clients: QueryClient[] = []
async function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  clients.push(client)
  const close = vi.fn()
  const screen = await render(
    <QueryClientProvider client={client}>
      <ProductionBatchInputDialog
        open
        onOpenChange={close}
        initialDateFrom='2026-11-19'
        initialDateTo='2026-11-19'
      />
    </QueryClientProvider>
  )
  return { screen, client, close }
}
type Screen = Awaited<ReturnType<typeof setup>>['screen']
const processButton = (screen: Screen) =>
  screen.getByRole('button', { name: /^Proses .*setoran$/ })
async function confirm(screen: Screen) {
  await screen
    .getByLabelText('Alasan input batch')
    .fill('Data demonstrasi produksi')
  await screen.getByLabelText('Ketik PROSES', { exact: true }).fill('PROSES')
}
beforeEach(() => {
  mocks.post.mockReset().mockResolvedValue({ data: { data: preview() } })
  mocks.success.mockReset()
  mocks.error.mockReset()
})
afterEach(() => clients.splice(0).forEach((client) => client.clear()))

describe('Production batch input safety', () => {
  it('requires a finished eligible preview, reason and explicit confirmation before any write', async () => {
    const pending = deferred<unknown>()
    mocks.post.mockReturnValueOnce(pending.promise)
    const { screen } = await setup()
    await confirm(screen)
    await expect.element(processButton(screen)).toBeDisabled()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    pending.resolve({ data: { data: preview() } })
    await expect
      .element(screen.getByLabelText('Ketik PROSES', { exact: true }))
      .toHaveValue('')
    await confirm(screen)
    await expect.element(processButton(screen)).toBeEnabled()
    await screen.getByLabelText('Alasan input batch').fill('singkat')
    await expect.element(processButton(screen)).toBeDisabled()
    await screen
      .getByLabelText('Alasan input batch')
      .fill('Data demonstrasi produksi')
    await screen.getByLabelText('Ketik PROSES', { exact: true }).fill('SALAH')
    await expect.element(processButton(screen)).toBeDisabled()
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('shows blocker reasons and refuses a batch with no eligible deposits', async () => {
    mocks.post.mockResolvedValue({
      data: { data: preview({ canCreate: false }) },
    })
    const { screen } = await setup()
    await confirm(screen)
    await expect
      .element(screen.getByText('Attendance belum siap (1)', { exact: true }))
      .toBeVisible()
    await expect.element(processButton(screen)).toBeDisabled()
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('discards confirmation and refuses stale previews after changing the date', async () => {
    const { screen } = await setup()
    await confirm(screen)
    await expect.element(processButton(screen)).toBeEnabled()
    await screen.getByLabelText('Dari tanggal').fill('2026-11-18')
    await expect
      .element(screen.getByLabelText('Ketik PROSES', { exact: true }))
      .toHaveValue('')
    await confirm(screen)
    await expect.element(processButton(screen)).toBeDisabled()
    // Even an old, late server response must not unlock a different selection.
    await screen.getByRole('button', { name: 'Periksa', exact: true }).click()
    await expect.poll(() => mocks.post.mock.calls.length).toBe(2)
    await expect.element(processButton(screen)).toBeDisabled()
  })

  it('preserves the request key after ambiguous failure and refreshes production caches only on success', async () => {
    mocks.post.mockImplementation((url: string) =>
      url.endsWith('/preview')
        ? Promise.resolve({ data: { data: preview() } })
        : Promise.reject(new Error('Connection interrupted'))
    )
    const { screen, client, close } = await setup()
    const keys = [
      ['production-foundation', 'transactions'],
      ['production-foundation', 'transactions', 'daily-summary'],
      ['production-foundation', 'recap'],
    ]
    keys.forEach((key) => client.setQueryData(key, { marker: 'before' }))
    await confirm(screen)
    await processButton(screen).click()
    await expect.poll(() => mocks.error.mock.calls.length).toBe(1)
    expect(close).not.toHaveBeenCalled()
    expect(client.getQueryState(keys[0])?.isInvalidated).toBe(false)
    const firstRequest = mocks.post.mock.calls[1][1]
    expect(firstRequest).toMatchObject({
      previewToken: 'checked-plan',
      confirmation: 'PROSES',
      reason: 'Data demonstrasi produksi',
    })
    expect(firstRequest.idempotencyKey).toEqual(expect.any(String))
    mocks.post.mockResolvedValueOnce({
      data: { data: { total: 4, created: 4, replayed: 0, pairs: 1 } },
    })
    await processButton(screen).click()
    await expect.poll(() => close.mock.calls.length).toBe(1)
    expect(mocks.post.mock.calls[2][1].idempotencyKey).toBe(
      firstRequest.idempotencyKey
    )
    keys.forEach((key) =>
      expect(client.getQueryState(key)?.isInvalidated).toBe(true)
    )
    expect(mocks.success).toHaveBeenCalledTimes(1)
  })

  it('requires a fresh preview after a 409 rather than repeatedly submitting stale eligibility', async () => {
    mocks.post.mockImplementation((url: string) =>
      url.endsWith('/preview')
        ? Promise.resolve({ data: { data: preview() } })
        : Promise.reject({
            isAxiosError: true,
            response: {
              status: 409,
              data: { message: 'Kesiapan berubah. Periksa kembali.' },
            },
          })
    )
    const { screen, close } = await setup()
    await confirm(screen)
    await processButton(screen).click()
    await expect.poll(() => mocks.error.mock.calls.length).toBe(1)
    expect(mocks.error).toHaveBeenCalledWith(
      'Kesiapan berubah. Periksa kembali.'
    )
    await expect
      .element(screen.getByLabelText('Ketik PROSES', { exact: true }))
      .toHaveValue('')
    await confirm(screen)
    await expect.element(processButton(screen)).toBeDisabled()
    expect(close).not.toHaveBeenCalled()
  })

  it('locks dismissal, filter changes and duplicate submits while a batch is running', async () => {
    const running = deferred<unknown>()
    mocks.post.mockImplementation((url: string) =>
      url.endsWith('/preview')
        ? Promise.resolve({ data: { data: preview() } })
        : running.promise
    )
    const { screen, close } = await setup()
    await confirm(screen)
    await processButton(screen).click()
    await expect.element(processButton(screen)).toBeDisabled()
    await expect.element(screen.getByLabelText('Dari tanggal')).toBeDisabled()
    await expect
      .element(screen.getByRole('button', { name: 'Batal', exact: true }))
      .toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(close).not.toHaveBeenCalled()
    expect(mocks.post).toHaveBeenCalledTimes(2)
    running.resolve({
      data: { data: { total: 4, created: 4, replayed: 0, pairs: 1 } },
    })
    await expect.poll(() => close.mock.calls.length).toBe(1)
  })
})
