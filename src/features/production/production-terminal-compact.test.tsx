import '@/styles/index.css'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { ProductionTerminalPage } from './production-terminal-page'

const { lookup, post } = vi.hoisted(() => ({ lookup: vi.fn(), post: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      session: { user: { role: 'SUPER_ADMIN', siteAccess: ['JEPARA'] } },
    }),
}))
vi.mock('@/features/production/data/queries', () => ({
  useActivateProductionDevice: () => ({ isPending: false }),
  useProductionTerminalLookup: () => ({
    mutateAsync: lookup,
    isPending: false,
    isError: false,
    reset: vi.fn(),
  }),
  usePostProductionTransaction: () => ({
    mutateAsync: post,
    isPending: false,
    isError: false,
    reset: vi.fn(),
  }),
}))
const result = {
  businessDate: '2026-10-08',
  employee: {
    uid: 'worker',
    fullName: 'Pekerja Uji',
    employeeNumber: 'TEST-001',
    productionSection: { name: 'Linting' },
  },
  attendance: { clockInAt: '2026-10-08T07:00:00+07:00' },
  defaultJobUid: 'linting',
  jobs: [
    {
      uid: 'linting',
      code: 'BORONGAN-LINTING',
      name: 'Linting',
      isPrimary: true,
      unit: { code: 'PCS', name: 'Pieces', decimalPrecision: 0 },
      rate: { amount: '45', tiered: false },
    },
  ],
  qcOptions: {
    brands: [{ uid: 'brand-a', code: 'BR-A', name: 'Brand Uji', sortOrder: 0 }],
    defects: Array.from({ length: 14 }, (_, index) => ({
      uid: `defect-${index}`,
      code: `DF-${index}`,
      name: `Defect ${index + 1}`,
      sortOrder: index,
    })),
  },
}

beforeEach(async () => {
  await page.viewport(320, 740)
  localStorage.setItem(
    'hris-rsia-production-device-v1',
    JSON.stringify({
      deviceToken: 'synthetic-test-token',
      device: {
        uid: 'test-device',
        code: 'TEST',
        name: 'Terminal Uji',
        site: 'JEPARA',
        siteName: 'Jepara',
        deviceType: 'USB_SCANNER',
      },
    })
  )
  lookup.mockResolvedValue(result)
  post.mockRejectedValue(new Error('Synthetic test rejection'))
})
afterEach(async () => {
  localStorage.removeItem('hris-rsia-production-device-v1')
  vi.clearAllMocks()
  await page.viewport(1280, 720)
})

describe('compact production deposit form', () => {
  it('shows snapshot brand beside raw quantity in recent deposits without wage information', async () => {
    post.mockResolvedValue({
      duplicate: false,
      message: 'Setoran berhasil dicatat.',
      transaction: {
        uid: 'transaction-test',
        transactionNumber: 'TEST-TX-001',
        transactionAt: '2026-10-08T08:00:00+07:00',
        employee: result.employee,
        job: result.jobs[0],
        unit: result.jobs[0].unit,
        quantity: '500',
        payableQuantity: '485',
        deductionQuantity: '15',
        deductionPercentage: '3',
        grossAmount: '21825',
        qc: { brand: { uid: 'brand-a', code: 'BR-A', name: 'Brand Snapshot' } },
      },
    })
    const screen = await render(<ProductionTerminalPage />)
    await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    await screen.getByLabelText('Jumlah (PCS)').fill('500')
    await screen.getByLabelText('Berat 1 (gram) *').fill('80')
    await screen.getByLabelText('Berat 2 (gram) *').fill('81')
    await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
    const brand = screen.getByText('Brand Snapshot', { exact: true })
    const quantity = screen.getByText('500 PCS', { exact: true })
    await expect.element(brand).toBeVisible()
    await expect.element(quantity).toBeVisible()
    expect(brand.element().getBoundingClientRect().top).toBe(
      quantity.element().getBoundingClientRect().top
    )
    await expect.element(screen.getByText(/Dibayar/)).not.toBeInTheDocument()
    await expect.element(screen.getByText(/Rp/)).not.toBeInTheDocument()
  })
  it('selects last terminal brand from the server lookup instead of the first option', async () => {
    lookup.mockResolvedValue({
      ...result,
      lastBrandUid: 'brand-b',
      qcOptions: {
        ...result.qcOptions,
        brands: [
          ...result.qcOptions.brands,
          {
            uid: 'brand-b',
            code: 'BR-B',
            name: 'Brand Terakhir',
            sortOrder: 1,
          },
        ],
      },
    })
    const screen = await render(<ProductionTerminalPage />)
    await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    await expect
      .element(screen.getByRole('radio', { name: 'Brand Terakhir' }))
      .toBeChecked()
    await expect
      .element(screen.getByRole('radio', { name: 'Brand Uji' }))
      .not.toBeChecked()
  })
  it('keeps the form free of rate and precision hints and submits empty focused defect as zero', async () => {
    const screen = await render(<ProductionTerminalPage />)
    await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    await expect.element(screen.getByText('Pekerja Uji')).toBeVisible()
    const header = screen
      .getByRole('button', { name: 'Ganti', exact: true })
      .element().parentElement!
    expect(getComputedStyle(header).backgroundImage).toContain('gradient')
    await expect
      .element(screen.getByText('QC tidak mengubah upah.'))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('radio', { name: 'Brand Uji' }))
      .toBeChecked()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
    await expect
      .element(screen.getByText('Tarif dasar aktif'))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Estimasi bruto'))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Maksimal 0 angka di belakang koma.'))
      .not.toBeInTheDocument()
    await screen.getByLabelText('Jumlah (PCS)').fill('500')
    await screen.getByRole('radio', { name: 'Brand Uji' }).click()
    await screen.getByLabelText('Berat 1 (gram) *').fill('71,29')
    await screen.getByLabelText('Berat 2 (gram) *').fill('70,05')
    await screen.getByLabelText('Defect 1', { exact: true }).click()
    await expect
      .element(screen.getByLabelText('Defect 1', { exact: true }))
      .toHaveValue('')
    await expect
      .element(screen.getByRole('button', { name: 'Simpan Setoran' }))
      .toBeEnabled()
    await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          quantity: '500',
          jobUid: 'linting',
          qc: expect.objectContaining({
            brandUid: 'brand-a',
            weight1Grams: '71.29',
            weight2Grams: '70.05',
            defects: expect.arrayContaining([
              { defectUid: 'defect-0', quantity: 0 },
            ]),
          }),
        }),
      })
    )
    const firstKey = post.mock.calls[0][0].input.idempotencyKey
    await screen.getByLabelText('Defect 1', { exact: true }).click()
    await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
    expect(post.mock.calls[1][0].input.idempotencyKey).toBe(firstKey)
  })
})
