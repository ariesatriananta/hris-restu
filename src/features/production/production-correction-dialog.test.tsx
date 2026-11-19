import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/styles/index.css'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type {
  ProductionCorrectionContext,
  ProductionTransaction,
} from './domain'
import { CorrectionDialog } from './production-transactions-page'

const state = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: state }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (value: unknown) => unknown) =>
    selector({
      session: {
        user: {
          uid: 'qc-test',
          role: 'QC',
          roles: ['QC'],
          siteAccess: ['KLATEN'],
        },
        permissions: ['production.view', 'production.correct'],
      },
    }),
}))

const clients: QueryClient[] = []
let context: ProductionCorrectionContext
function fixture(): ProductionTransaction {
  return {
    uid: 'transaction-a',
    transactionNumber: 'PR-TEST-1',
    businessDate: '2026-11-19',
    transactionAt: '2026-11-19T08:00:00+07:00',
    status: 'POSTED',
    quantity: '500',
    site: 'KLATEN',
    siteName: 'Klaten',
    employee: {
      uid: 'employee-a',
      employeeNumber: 'TEST-1',
      fullName: 'Pekerja Linting',
    },
    job: { uid: 'job-linting', code: 'BORONGAN-LINTING', name: 'Linting' },
    unit: { uid: 'unit-pcs', code: 'PCS', name: 'Batang', decimalPrecision: 0 },
    device: null,
    qc: {
      brand: { uid: 'brand-old', code: 'BR-0001', name: 'Brand Lama' },
      weight1Grams: '71.25',
      weight2Grams: '72.50',
      defects: [
        {
          uid: 'defect-old',
          code: 'DF-0001',
          name: 'Defect Lama',
          sortOrder: 1,
          quantity: 7,
        },
      ],
    },
  }
}
function preview(input: { quantity: string; qc?: unknown }) {
  return {
    source: context.transaction,
    proposed: {
      job: context.transaction.job,
      unit: context.transaction.unit,
      quantity: input.quantity,
    },
    delta: { quantity: String(Number(input.quantity) - 500) },
    payrollLock: { locked: false, reasons: [] },
    canApply: true,
    qcChanged: !!input.qc,
    proposedQc: input.qc
      ? {
          ...context.transaction.qc,
          weight1Grams: '73.00',
          brand: { uid: 'brand-new', code: 'BR-0002', name: 'Brand Baru' },
        }
      : context.transaction.qc,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  const transaction = fixture()
  context = {
    transaction,
    jobs: [{ ...transaction.job, unit: transaction.unit, isPrimary: true }],
    payrollLock: { locked: false, reasons: [] },
    canCorrect: true,
    canVoid: true,
    qcOptions: {
      brands: [
        { ...transaction.qc!.brand!, sortOrder: 1 },
        { uid: 'brand-new', code: 'BR-0002', name: 'Brand Baru', sortOrder: 2 },
      ],
      defects: [transaction.qc!.defects[0]],
    },
  }
  state.get.mockImplementation(async () => ({ data: context }))
  state.post.mockImplementation(async (url: string, input) => ({
    data: url.endsWith('/correction-preview')
      ? preview(input)
      : { message: 'Berhasil' },
  }))
})
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
})

async function open() {
  await page.viewport(1280, 900)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  const screen = await render(
    <QueryClientProvider client={client}>
      <CorrectionDialog transaction={context.transaction}>
        <button>Buka koreksi</button>
      </CorrectionDialog>
    </QueryClientProvider>
  )
  await screen.getByRole('button', { name: 'Buka koreksi' }).click()
  await expect
    .element(screen.getByRole('textbox', { name: 'Kuantitas hasil' }))
    .toBeVisible()
  return screen
}

describe('koreksi setoran operasional dan QC', () => {
  it('keeps worker changes collapsed and preserves existing QC on quantity-only save', async () => {
    const screen = await open()
    await expect
      .element(screen.getByText('Karyawan pengganti', { exact: true }))
      .not.toBeVisible()
    await screen.getByRole('textbox', { name: 'Kuantitas hasil' }).fill('600')
    await screen
      .getByRole('button', { name: 'Preview perubahan', exact: true })
      .click()
    await expect.element(screen.getByText('Siap diterapkan')).toBeVisible()
    expect(state.post.mock.calls[0][1]).not.toHaveProperty('qc')
    await screen
      .getByRole('textbox', { name: 'Alasan koreksi' })
      .fill('Salah jumlah setoran')
    await screen.getByRole('button', { name: 'Terapkan koreksi' }).click()
    await vi.waitFor(() => expect(state.post).toHaveBeenCalledTimes(2))
    expect(state.post.mock.calls[1][1]).toMatchObject({
      quantity: '600',
      reason: 'Salah jumlah setoran',
    })
    expect(state.post.mock.calls[1][1]).not.toHaveProperty('qc')
  })

  it('edits brand and weight while retaining historical defect quantities in preview and save', async () => {
    const screen = await open()
    await screen.getByRole('radio', { name: 'Brand Baru' }).click()
    await screen
      .getByRole('textbox', { name: 'Berat 1 (gram) *' })
      .fill('73,00')
    await screen
      .getByRole('button', { name: 'Preview perubahan', exact: true })
      .click()
    await expect.element(screen.getByText('Perubahan QC')).toBeVisible()
    const qc = {
      brandUid: 'brand-new',
      weight1Grams: '73.00',
      weight2Grams: '72.50',
      defects: [{ defectUid: 'defect-old', quantity: 7 }],
    }
    expect(state.post.mock.calls[0][1]).toMatchObject({ qc })
    await screen
      .getByRole('textbox', { name: 'Alasan koreksi' })
      .fill('Brand dan berat salah')
    await screen.getByRole('button', { name: 'Terapkan koreksi' }).click()
    await vi.waitFor(() => expect(state.post).toHaveBeenCalledTimes(2))
    expect(state.post.mock.calls[1][1]).toMatchObject({ qc })
  })

  it.each(['missing', 'partial'] as const)(
    'does not require new brand or weights for quantity corrections on %s legacy QC',
    async (kind) => {
      context.transaction.qc =
        kind === 'missing'
          ? null
          : { ...context.transaction.qc!, brand: null, weight1Grams: null }
      const screen = await open()
      await screen.getByRole('textbox', { name: 'Kuantitas hasil' }).fill('550')
      await expect
        .element(
          screen.getByRole('button', { name: 'Preview perubahan', exact: true })
        )
        .toBeEnabled()
      await screen
        .getByRole('button', { name: 'Preview perubahan', exact: true })
        .click()
      await expect.element(screen.getByText('Siap diterapkan')).toBeVisible()
      expect(state.post.mock.calls[0][1]).not.toHaveProperty('qc')
    }
  )

  it('invalidates an approved preview after defect edits and blocks invalid weight data', async () => {
    const screen = await open()
    await screen
      .getByRole('button', { name: 'Preview perubahan', exact: true })
      .click()
    await expect.element(screen.getByText('Siap diterapkan')).toBeVisible()
    await screen
      .getByRole('textbox', { name: 'Alasan koreksi' })
      .fill('Data QC perlu dibetulkan')
    await expect
      .element(screen.getByRole('button', { name: 'Terapkan koreksi' }))
      .toBeEnabled()
    await screen.getByRole('button', { name: 'Tambah Defect Lama' }).click()
    await expect
      .element(screen.getByRole('button', { name: 'Terapkan koreksi' }))
      .toBeDisabled()
    await expect
      .element(screen.getByText('Siap diterapkan'))
      .not.toBeInTheDocument()
    await screen.getByRole('textbox', { name: 'Berat 1 (gram) *' }).fill('0')
    await expect
      .element(
        screen.getByRole('button', { name: 'Preview perubahan', exact: true })
      )
      .toBeDisabled()
    expect(state.post).toHaveBeenCalledOnce()
  })

  it('disables a previously approved save if refreshing correction context fails', async () => {
    const screen = await open()
    await screen
      .getByRole('button', { name: 'Preview perubahan', exact: true })
      .click()
    await expect.element(screen.getByText('Siap diterapkan')).toBeVisible()
    await screen
      .getByRole('textbox', { name: 'Alasan koreksi' })
      .fill('Koreksi untuk audit')
    await expect
      .element(screen.getByRole('button', { name: 'Terapkan koreksi' }))
      .toBeEnabled()
    state.get.mockRejectedValue(new Error('Konteks tidak tersedia'))
    await clients[0].invalidateQueries()
    await expect
      .element(screen.getByText('Konteks koreksi gagal dimuat.'))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Terapkan koreksi' }))
      .toBeDisabled()
    expect(state.post).toHaveBeenCalledOnce()
  })

  it('requires another preview after editing quantity and rejects a late stale preview', async () => {
    let resolve!: (value: unknown) => void
    state.post.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const screen = await open()
    await screen
      .getByRole('button', { name: 'Preview perubahan', exact: true })
      .click()
    await vi.waitFor(() => expect(state.post).toHaveBeenCalledOnce())
    await screen.getByRole('textbox', { name: 'Kuantitas hasil' }).fill('650')
    resolve({ data: preview({ quantity: '500' }) })
    await expect
      .element(screen.getByRole('button', { name: 'Terapkan koreksi' }))
      .toBeDisabled()
    await expect
      .element(screen.getByText('Siap diterapkan'))
      .not.toBeInTheDocument()
    await screen
      .getByRole('button', { name: 'Preview perubahan', exact: true })
      .click()
    await expect.element(screen.getByText('Siap diterapkan')).toBeVisible()
    expect(state.post.mock.calls[1][1]).toMatchObject({ quantity: '650' })
  })

  it('directs paired Batil QC editing to Linting and sends only paired quantity changes', async () => {
    const linting = context.transaction.job
    context.transaction.job = {
      uid: 'job-batil',
      code: 'BORONGAN-BATIL',
      name: 'Batil',
    }
    context.jobs = [
      {
        ...context.transaction.job,
        unit: context.transaction.unit,
        isPrimary: true,
      },
    ]
    context.transaction.pair = {
      uid: 'pair-a',
      role: 'BATIL',
      partner: {
        uid: 'linting-source',
        transactionNumber: 'PR-TEST-2',
        employee: {
          uid: 'worker-b',
          employeeNumber: 'TEST-2',
          fullName: 'Pasangan Linting',
        },
        job: linting,
        status: 'POSTED',
      },
    }
    const screen = await open()
    await expect
      .element(
        screen.getByText(
          'Untuk mengubah brand, berat, atau defect pasangan, buka Koreksi pada transaksi Linting.'
        )
      )
      .toBeVisible()
    await expect.element(screen.getByRole('radio')).not.toBeInTheDocument()
    await screen.getByRole('textbox', { name: 'Kuantitas hasil' }).fill('600')
    await screen
      .getByRole('button', { name: 'Preview perubahan', exact: true })
      .click()
    await expect.element(screen.getByText('Siap diterapkan')).toBeVisible()
    expect(state.post.mock.calls[0][1].employeeUid).toBeUndefined()
    expect(state.post.mock.calls[0][1]).not.toHaveProperty('qc')
  })
})
