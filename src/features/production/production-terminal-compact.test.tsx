import '@/styles/index.css'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import type { ProductionTerminalRecentTransaction } from './domain'
import { ProductionTerminalPage } from './production-terminal-page'

const {
  lookup,
  post,
  recent,
  refetchRecent,
  recentState,
  detailQuery,
  dailySummary,
} = vi.hoisted(() => ({
  lookup: vi.fn(),
  post: vi.fn(),
  recent: vi.fn<() => { items: ProductionTerminalRecentTransaction[] }>(),
  refetchRecent: vi.fn(),
  recentState: { isPending: false, isError: false },
  detailQuery: vi.fn(),
  dailySummary: vi.fn(),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      session: { user: { role: 'SUPER_ADMIN', siteAccess: ['JEPARA'] } },
    }),
}))
vi.mock('@/features/production/data/queries', async () => {
  const { useState } = await import('react')
  return {
    useProductionTerminalDetail: detailQuery,
    useProductionTerminalDailySummary: dailySummary,
    useProductionTerminalRecent: (deviceUid: string, deviceToken: string) => {
      const [data, setData] = useState(() => recent())
      return {
        data,
        ...recentState,
        refetch: async () => {
          refetchRecent(deviceUid, deviceToken)
          setData(recent())
        },
      }
    },
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
  }
})
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
  recent.mockReset().mockReturnValue({ items: [] })
  recentState.isPending = false
  recentState.isError = false
  localStorage.removeItem('hris-rsia-production-recent-expanded-v1')
  dailySummary.mockReset().mockReturnValue({
    data: {
      businessDate: '2026-10-09',
      siteName: 'Jepara',
      sections: [
        {
          uid: 'section-linting',
          name: 'Linting',
          presentEmployees: 315,
          submittedEmployees: 12,
          pendingEmployees: 303,
        },
        {
          uid: 'section-packing',
          name: 'Packing',
          presentEmployees: 50,
          submittedEmployees: 20,
          pendingEmployees: 30,
        },
      ],
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
  detailQuery.mockReset().mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
})
afterEach(async () => {
  localStorage.removeItem('hris-rsia-production-device-v1')
  localStorage.removeItem('hris-rsia-production-recent-expanded-v1')
  vi.clearAllMocks()
  await page.viewport(1280, 720)
})

describe('compact production deposit form', () => {
  it('shows each daily section in three compact columns on mobile only while free', async () => {
    const screen = await render(<ProductionTerminalPage />)
    const summary = screen.getByRole('region', {
      name: 'Ringkasan setoran hari ini',
    })
    await expect.element(summary).toBeVisible()
    const linting = summary.getByLabelText('Ringkasan Linting').element()
    expect(
      getComputedStyle(linting).gridTemplateColumns.split(' ')
    ).toHaveLength(3)
    expect(linting.scrollWidth).toBeLessThanOrEqual(linting.clientWidth)
    await expect
      .element(summary.getByText('315', { exact: true }))
      .toBeVisible()
    await expect
      .element(summary.getByText('303', { exact: true }))
      .toBeVisible()
    await expect
      .element(summary.getByLabelText('Ringkasan Packing'))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
    expect(dailySummary).toHaveBeenLastCalledWith(
      'test-device',
      'synthetic-test-token'
    )
    await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
    await expect.element(summary).not.toBeInTheDocument()
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    await expect.element(summary).not.toBeInTheDocument()
    await screen.getByRole('button', { name: 'Ganti', exact: true }).click()
    await expect.element(summary).toBeVisible()
  })
  it('remembers a closed recent-deposits accordion across remount and does not submit', async () => {
    const first = await render(<ProductionTerminalPage />)
    const toggle = first.getByRole('button', { name: /5 setoran terakhir/ })
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect
      .element(first.getByText('Belum ada setoran dari perangkat ini.'))
      .toBeVisible()
    await toggle.click()
    await expect.element(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect
      .element(first.getByText('Belum ada setoran dari perangkat ini.'))
      .not.toBeInTheDocument()
    expect(
      localStorage.getItem('hris-rsia-production-recent-expanded-v1')
    ).toBe('false')
    expect(lookup).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    await first.unmount()
    const second = await render(<ProductionTerminalPage />)
    const remembered = second.getByRole('button', {
      name: /5 setoran terakhir/,
    })
    await expect.element(remembered).toHaveAttribute('aria-expanded', 'false')
    await remembered.click()
    await expect
      .element(second.getByText('Belum ada setoran dari perangkat ini.'))
      .toBeVisible()
    expect(
      localStorage.getItem('hris-rsia-production-recent-expanded-v1')
    ).toBe('true')
  })
  it('falls back to an open accordion when its browser preference is corrupt', async () => {
    localStorage.setItem('hris-rsia-production-recent-expanded-v1', '{invalid')
    const screen = await render(<ProductionTerminalPage />)
    await expect
      .element(screen.getByRole('button', { name: /5 setoran terakhir/ }))
      .toHaveAttribute('aria-expanded', 'true')
  })
  it('keeps the accordion usable when browser preference storage is restricted', async () => {
    const getItem = Storage.prototype.getItem
    const read = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(function (this: Storage, key) {
        if (key === 'hris-rsia-production-recent-expanded-v1') {
          throw new Error('Synthetic browser storage restriction')
        }
        return getItem.call(this, key)
      })
    const write = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('Synthetic browser storage restriction')
      })
    try {
      const screen = await render(<ProductionTerminalPage />)
      const toggle = screen.getByRole('button', { name: /5 setoran terakhir/ })
      await expect.element(toggle).toHaveAttribute('aria-expanded', 'true')
      await toggle.click()
      await expect.element(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(lookup).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
      write.mockRestore()
    }
  })
  it('keeps scan available if the daily summary fails and offers local retry', async () => {
    const refetch = vi.fn()
    dailySummary.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    })
    const screen = await render(<ProductionTerminalPage />)
    await expect
      .element(screen.getByText('Ringkasan hari ini belum dapat dimuat.'))
      .toBeVisible()
    await expect
      .element(screen.getByLabelText('Barcode karyawan'))
      .toBeEnabled()
    await screen.getByRole('button', { name: 'Muat ulang ringkasan' }).click()
    expect(refetch).toHaveBeenCalledOnce()
    expect(lookup).not.toHaveBeenCalled()
  })
  it('shows an isolated loading state for the daily summary', async () => {
    dailySummary.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    })
    const screen = await render(<ProductionTerminalPage />)
    await expect
      .element(screen.getByText('Memuat ringkasan hari ini...'))
      .toBeVisible()
    await expect
      .element(screen.getByLabelText('Barcode karyawan'))
      .toBeEnabled()
  })
  it('opens a read-only mobile drawer from a saved card without wage information or business actions', async () => {
    const record = {
      uid: 'saved-deposit',
      transactionNumber: 'TEST-DRAWER-001',
      transactionAt: '2026-10-08T08:00:00+07:00',
      quantity: '500',
      employee: {
        uid: 'worker',
        employeeNumber: 'TEST-001',
        fullName: 'Pekerja Drawer',
      },
      job: { uid: 'linting', code: 'BORONGAN-LINTING', name: 'Linting' },
      unit: { uid: 'pcs', code: 'PCS', name: 'Pcs', decimalPrecision: 0 },
      brand: { uid: 'brand', name: 'Brand saat setor' },
      qcSummary: {
        weight1Grams: '80.00',
        weight2Grams: '81.32',
        totalDefects: 10,
      },
    }
    recent.mockReturnValue({ items: [record] })
    detailQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        ...record,
        businessDate: '2026-10-08',
        status: 'POSTED',
        entrySource: 'TERMINAL',
        siteName: 'Jepara',
        device: { uid: 'test-device', code: 'TEST', name: 'Terminal Uji' },
        qc: {
          brand: { uid: 'brand', code: 'BR-1', name: 'Brand saat setor' },
          weight1Grams: '80.00',
          weight2Grams: '81.32',
          defects: [
            {
              uid: 'defect',
              code: 'DF-1',
              name: 'Cowong',
              sortOrder: 0,
              quantity: 10,
            },
          ],
        },
      },
    })
    const screen = await render(<ProductionTerminalPage />)
    const card = screen.getByRole('button', {
      name: 'Lihat detail setoran TEST-DRAWER-001',
    })
    await expect.element(card.getByText('Defect 10')).toBeVisible()
    await expect.element(card.getByText('Berat 80,00 / 81,32 g')).toBeVisible()
    const summary = card.getByLabelText('Ringkasan QC Linting').element()
    expect(summary.scrollWidth).toBeLessThanOrEqual(summary.clientWidth)
    await screen
      .getByRole('button', { name: 'Lihat detail setoran TEST-DRAWER-001' })
      .click()
    const drawer = screen.getByRole('dialog', { name: 'Detail Setoran' })
    await expect.element(drawer).toBeVisible()
    await expect.element(drawer.getByText('Brand saat setor')).toBeVisible()
    await expect.element(drawer.getByText('80,00 g')).toBeVisible()
    await expect.element(drawer.getByText('Cowong')).toBeVisible()
    expect(drawer.element().textContent).not.toMatch(/upah|tarif|dibayar|Rp/i)
    expect(drawer.element().querySelectorAll('button')).toHaveLength(1)
    expect(drawer.element().scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    expect(detailQuery).toHaveBeenLastCalledWith(
      'test-device',
      'synthetic-test-token',
      'saved-deposit'
    )
    await drawer.getByRole('button', { name: 'Close' }).click()
    await expect.element(drawer).not.toBeInTheDocument()
  })
  it('requires and sends brand alone for a non-Linting deposit', async () => {
    lookup.mockResolvedValue({
      ...result,
      defaultJobUid: 'packing',
      jobs: [
        {
          ...result.jobs[0],
          uid: 'packing',
          code: 'BORONGAN-PACKING',
          name: 'Packing',
        },
      ],
    })
    const screen = await render(<ProductionTerminalPage />)
    await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    await expect
      .element(screen.getByRole('radio', { name: 'Brand Uji' }))
      .toBeChecked()
    await expect
      .element(screen.getByLabelText('Berat 1 (gram) *'))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByTestId('qc-defects-grid'))
      .not.toBeInTheDocument()
    await screen.getByLabelText('Jumlah (PCS)').fill('500')
    await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          jobUid: 'packing',
          quantity: '500',
          qc: { brandUid: 'brand-a', defects: [] },
        }),
      })
    )
  })
  it('shows snapshot brand beside raw quantity in recent deposits without wage information', async () => {
    recent.mockReturnValueOnce({ items: [] }).mockReturnValue({
      items: [
        {
          uid: 'transaction-test',
          transactionNumber: 'TEST-TX-001',
          transactionAt: '2026-10-08T08:00:00+07:00',
          employee: result.employee,
          job: { uid: 'linting', code: 'BORONGAN-LINTING', name: 'Linting' },
          unit: { uid: 'unit', code: 'PCS', name: 'Pcs', decimalPrecision: 0 },
          quantity: '500',
          brand: { uid: 'brand-a', name: 'Brand Snapshot' },
        },
      ],
    })
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
    expect(refetchRecent).toHaveBeenCalledWith(
      'test-device',
      'synthetic-test-token'
    )
    await expect.element(quantity).toBeVisible()
    await expect.element(screen.getByText('Defect —')).toBeVisible()
    await expect.element(screen.getByText('Berat — / — g')).toBeVisible()
    expect(brand.element().getBoundingClientRect().top).toBe(
      quantity.element().getBoundingClientRect().top
    )
    await expect.element(screen.getByText(/Dibayar/)).not.toBeInTheDocument()
    await expect.element(screen.getByText(/Rp/)).not.toBeInTheDocument()
  })
  it('loads saved device deposits again after remount without scanning a worker', async () => {
    recent.mockReturnValue({
      items: [
        {
          uid: 'saved-deposit',
          transactionNumber: 'TEST-SAVED-001',
          transactionAt: '2026-10-08T08:00:00+07:00',
          quantity: '200',
          employee: {
            uid: 'worker',
            employeeNumber: 'TEST-001',
            fullName: 'Pekerja Tersimpan',
          },
          job: { uid: 'packing', code: 'BORONGAN-PACKING', name: 'Packing' },
          unit: { uid: 'pcs', code: 'PCS', name: 'Pcs', decimalPrecision: 0 },
          brand: { uid: 'brand-a', name: 'Brand Tersimpan' },
        },
      ],
    })
    const first = await render(<ProductionTerminalPage />)
    await expect.element(first.getByText('Brand Tersimpan')).toBeVisible()
    await first.unmount()
    const refreshed = await render(<ProductionTerminalPage />)
    await expect.element(refreshed.getByText('Brand Tersimpan')).toBeVisible()
    await expect.element(refreshed.getByText('200 PCS')).toBeVisible()
    await expect
      .element(refreshed.getByLabelText('Ringkasan QC Linting'))
      .not.toBeInTheDocument()
    expect(lookup).not.toHaveBeenCalled()
  })
  it('shows a loading state instead of a misleading empty history', async () => {
    recentState.isPending = true
    const screen = await render(<ProductionTerminalPage />)
    await expect
      .element(screen.getByText('Memuat setoran terakhir...'))
      .toBeVisible()
    await expect
      .element(screen.getByText('Belum ada setoran dari perangkat ini.'))
      .not.toBeInTheDocument()
  })
  it('offers retry when device history fails without blocking the scan form', async () => {
    recentState.isError = true
    const screen = await render(<ProductionTerminalPage />)
    await expect.element(screen.getByRole('alert')).toBeVisible()
    await expect
      .element(screen.getByLabelText('Barcode karyawan'))
      .toBeEnabled()
    await screen.getByRole('button', { name: 'Coba lagi' }).click()
    expect(refetchRecent).toHaveBeenCalledWith(
      'test-device',
      'synthetic-test-token'
    )
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
