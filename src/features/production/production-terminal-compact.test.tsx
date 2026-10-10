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
  summaryEmployees,
  authState,
} = vi.hoisted(() => ({
  lookup: vi.fn(),
  post: vi.fn(),
  recent: vi.fn<() => { items: ProductionTerminalRecentTransaction[] }>(),
  refetchRecent: vi.fn(),
  recentState: { isPending: false, isError: false },
  detailQuery: vi.fn(),
  dailySummary: vi.fn(),
  summaryEmployees: vi.fn(),
  authState: {
    session: { user: { role: 'SUPER_ADMIN', siteAccess: ['JEPARA'] } },
  },
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector(authState),
}))
vi.mock('@/features/production/data/queries', async () => {
  const { useState } = await import('react')
  return {
    useProductionTerminalDetail: detailQuery,
    useProductionTerminalDailySummary: dailySummary,
    useProductionTerminalSummaryEmployees: summaryEmployees,
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
  authState.session.user.role = 'SUPER_ADMIN'
  authState.session.user.siteAccess = ['JEPARA']
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
  summaryEmployees.mockReset().mockReturnValue({
    data: {
      businessDate: '2026-10-09',
      siteName: 'Jepara',
      items: [
        {
          uid: 'employee-summary',
          employeeNumber: 'TEST-002',
          fullName: 'Pekerja Ringkasan',
          section: { uid: 'section-linting', name: 'Linting' },
          module: { uid: 'module-skt', name: 'SKT' },
          attendance: {
            status: 'PRESENT',
            clockInAt: '2026-10-09T07:00:00+07:00',
            clockOutAt: null,
          },
          deposits: {
            count: 2,
            quantityPcs: '1500',
            lastTransactionAt: '2026-10-09T10:00:00+07:00',
          },
        },
      ],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    },
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
  it.each([
    ['Total Absen Linting Hari Ini', 'PRESENT'],
    ['Pekerja Linting Sudah Input', 'SUBMITTED'],
    ['Pekerja Linting Belum Input', 'PENDING'],
  ])(
    'opens compact employee details for %s without wages or business actions',
    async (label, condition) => {
      const screen = await render(<ProductionTerminalPage />)
      await screen.getByRole('button', { name: label, exact: true }).click()
      const dialog = screen.getByRole('dialog')
      await expect
        .element(
          dialog
            .getByRole('list', { name: 'Daftar karyawan ringkasan' })
            .getByText('Pekerja Ringkasan')
        )
        .toBeVisible()
      await expect
        .element(dialog.getByText('TEST-002 · Linting / SKT'))
        .toBeVisible()
      expect(summaryEmployees).toHaveBeenLastCalledWith(
        'test-device',
        'synthetic-test-token',
        {
          sectionUid: 'section-linting',
          condition,
          page: 1,
          pageSize: 50,
          search: '',
        }
      )
      if (condition === 'SUBMITTED') {
        await expect
          .element(
            dialog
              .getByRole('list', { name: 'Daftar karyawan ringkasan' })
              .getByText('1.500 PCS')
          )
          .toBeVisible()
        await expect
          .element(
            dialog
              .getByRole('list', { name: 'Daftar karyawan ringkasan' })
              .getByText('2 setoran · 10.00')
          )
          .toBeVisible()
      } else {
        expect(dialog.element().textContent).not.toContain('1.500 PCS')
      }
      expect(dialog.element().textContent).not.toMatch(
        /Rp|upah|dibayar|Simpan|Aktifkan/
      )
      const element = dialog.element()
      expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth)
      expect(element.getBoundingClientRect().height).toBeLessThanOrEqual(
        window.innerHeight
      )
      expect(lookup).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
    }
  )
  it('searches summary employee list with server pagination and resets page', async () => {
    const response = summaryEmployees()
    summaryEmployees.mockImplementation((_uid, _token, params) => ({
      ...response,
      data: {
        ...response.data,
        pagination: {
          page: params.page,
          pageSize: 50,
          total: 51,
          totalPages: 2,
        },
      },
    }))
    const screen = await render(<ProductionTerminalPage />)
    await screen
      .getByRole('button', {
        name: 'Total Absen Linting Hari Ini',
        exact: true,
      })
      .click()
    await screen
      .getByRole('dialog')
      .getByRole('button', { name: 'Go to next page' })
      .click()
    expect(summaryEmployees).toHaveBeenLastCalledWith(
      'test-device',
      'synthetic-test-token',
      {
        sectionUid: 'section-linting',
        condition: 'PRESENT',
        page: 2,
        pageSize: 50,
        search: '',
      }
    )
    await screen
      .getByRole('dialog')
      .getByPlaceholder('Cari nama / nomor karyawan...')
      .fill('TEST-002')
    await vi.waitFor(() =>
      expect(summaryEmployees).toHaveBeenLastCalledWith(
        'test-device',
        'synthetic-test-token',
        {
          sectionUid: 'section-linting',
          condition: 'PRESENT',
          page: 1,
          pageSize: 50,
          search: 'TEST-002',
        }
      )
    )
  })
  it('shows the standard compact desktop datatable and handles an empty result', async () => {
    await page.viewport(1280, 740)
    const screen = await render(<ProductionTerminalPage />)
    await screen
      .getByRole('button', { name: 'Pekerja Linting Sudah Input', exact: true })
      .click()
    const dialog = screen.getByRole('dialog')
    await expect
      .element(dialog.getByText('Bagian / Modul', { exact: true }))
      .toBeVisible()
    await expect
      .element(dialog.getByText('Setoran hari ini', { exact: true }))
      .toBeVisible()
    const table = dialog.getByRole('table').element()
    expect(table.scrollWidth).toBeLessThanOrEqual(dialog.element().clientWidth)
    await screen.unmount()
    const response = summaryEmployees()
    summaryEmployees.mockReturnValue({
      ...response,
      data: {
        ...response.data,
        items: [],
        pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
      },
    })
    const empty = await render(<ProductionTerminalPage />)
    await empty
      .getByRole('button', {
        name: 'Total Absen Linting Hari Ini',
        exact: true,
      })
      .click()
    await expect
      .element(
        empty
          .getByRole('dialog')
          .getByRole('table')
          .getByText('Tidak ada karyawan sesuai pencarian.')
      )
      .toBeVisible()
  })
  it('keeps employee list loading and error local to dialog and supports retry', async () => {
    summaryEmployees.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    })
    const loading = await render(<ProductionTerminalPage />)
    await loading
      .getByRole('button', {
        name: 'Total Absen Linting Hari Ini',
        exact: true,
      })
      .click()
    await expect
      .element(
        loading.getByRole('dialog').getByText('Memuat daftar karyawan...')
      )
      .toBeVisible()
    await loading.unmount()
    const retry = vi.fn()
    summaryEmployees.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: retry,
    })
    const failed = await render(<ProductionTerminalPage />)
    await failed
      .getByRole('button', {
        name: 'Total Absen Linting Hari Ini',
        exact: true,
      })
      .click()
    await failed
      .getByRole('dialog')
      .getByRole('button', { name: 'Muat ulang daftar' })
      .click()
    expect(retry).toHaveBeenCalledOnce()
  })
  it('restores barcode focus after closing employee details without interrupting dialog input', async () => {
    const screen = await render(<ProductionTerminalPage />)
    await screen
      .getByRole('button', {
        name: 'Total Absen Linting Hari Ini',
        exact: true,
      })
      .click()
    const dialog = screen.getByRole('dialog')
    await dialog
      .getByPlaceholder('Cari nama / nomor karyawan...')
      .fill('Pekerja')
    expect(document.activeElement).toBe(
      dialog.getByPlaceholder('Cari nama / nomor karyawan...').element()
    )
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect.element(dialog).not.toBeInTheDocument()
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText('Barcode karyawan').element()
      )
    )
    expect(lookup).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
  it('blocks a different site account without discarding device activation', async () => {
    authState.session.user.role = 'PRODUCTION_ADMIN'
    authState.session.user.siteAccess = ['KLATEN']
    const blocked = await render(<ProductionTerminalPage />)
    await expect
      .element(blocked.getByText('Akses terminal belum tersedia.'))
      .toBeVisible()
    expect(
      localStorage.getItem('hris-rsia-production-device-v1')
    ).not.toBeNull()
    expect(lookup).not.toHaveBeenCalled()
    await blocked.unmount()
    authState.session.user.siteAccess = ['JEPARA']
    const allowed = await render(<ProductionTerminalPage />)
    await expect
      .element(allowed.getByLabelText('Barcode karyawan'))
      .toBeVisible()
  })
  it.each([
    [401, undefined, false],
    [403, undefined, false],
    [500, undefined, false],
    [401, 'DEVICE_SESSION_INVALID', true],
  ])(
    'retains scanner activation unless explicitly invalid: %s %s',
    async (status, code, disconnected) => {
      lookup.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status, data: { code, message: 'Penolakan uji' } },
      })
      const screen = await render(<ProductionTerminalPage />)
      await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
      await screen.getByRole('button', { name: 'Cek', exact: true }).click()
      if (disconnected) {
        await expect
          .element(screen.getByLabelText('Kode aktivasi'))
          .toBeVisible()
        expect(
          localStorage.getItem('hris-rsia-production-device-v1')
        ).toBeNull()
      } else {
        await expect
          .element(screen.getByLabelText('Barcode karyawan'))
          .toBeVisible()
        expect(
          localStorage.getItem('hris-rsia-production-device-v1')
        ).not.toBeNull()
      }
    }
  )

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

function useKlatenPairLookup() {
  const saved = JSON.parse(
    localStorage.getItem('hris-rsia-production-device-v1')!
  )
  saved.device.site = 'KLATEN'
  saved.device.siteName = 'Klaten'
  localStorage.setItem('hris-rsia-production-device-v1', JSON.stringify(saved))
  const linting = {
    ...result,
    employee: { ...result.employee, site: 'KLATEN' },
  }
  const batil = {
    ...linting,
    employee: {
      ...linting.employee,
      uid: 'batil-worker',
      fullName: 'Pekerja Batil Uji',
      employeeNumber: 'TEST-BATIL',
    },
    defaultJobUid: 'batil',
    jobs: [
      {
        ...result.jobs[0],
        uid: 'batil',
        code: 'BORONGAN-BATIL',
        name: 'Batil',
      },
    ],
  }
  lookup.mockImplementation(async ({ barcode }) =>
    barcode === 'TEST-001' ? linting : batil
  )
  return { linting, batil }
}

async function fillLintingDeposit(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
  await screen.getByRole('button', { name: 'Cek', exact: true }).click()
  await screen.getByLabelText('Jumlah (PCS)').fill('500')
  await screen.getByLabelText('Berat 1 (gram) *').fill('71,29')
  await screen.getByLabelText('Berat 2 (gram) *').fill('70,05')
}

describe('Klaten paired Linting and Batil deposits', () => {
  it('checks the Batil barcode on blur and skips rechecking a confirmed partner', async () => {
    useKlatenPairLookup()
    const screen = await render(<ProductionTerminalPage />)
    await fillLintingDeposit(screen)
    await screen.getByLabelText('Pekerja Batil (opsional)').fill('TEST-BATIL')
    await screen.getByLabelText('Jumlah (PCS)').click()
    await expect.element(screen.getByText('Di Batil Oleh:')).toBeInTheDocument()
    expect(
      lookup.mock.calls.filter(([input]) => input.barcode === 'TEST-BATIL')
    ).toHaveLength(1)
    await screen.getByLabelText('Pekerja Batil (opsional)').click()
    await screen.getByLabelText('Jumlah (PCS)').click()
    expect(
      lookup.mock.calls.filter(([input]) => input.barcode === 'TEST-BATIL')
    ).toHaveLength(1)
    await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
    expect(post.mock.calls[0][0].input.batilBarcode).toBe('TEST-BATIL')
  })
  it('blocks a Batil-first standalone deposit in Klaten with compact guidance', async () => {
    useKlatenPairLookup()
    const screen = await render(<ProductionTerminalPage />)
    await screen.getByLabelText('Barcode karyawan').fill('TEST-BATIL')
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    await screen.getByLabelText('Jumlah (PCS)').fill('500')
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Batil harus berpasangan dengan Linting.')
    await expect
      .element(screen.getByRole('button', { name: 'Simpan Setoran' }))
      .toBeDisabled()
    const quantityInput = screen
      .getByLabelText('Jumlah (PCS)')
      .element() as HTMLInputElement
    quantityInput.form!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    )
    await expect.poll(() => post.mock.calls.length).toBe(0)
  })
  it('clears partner when switching jobs and leaves a non-Linting Klaten job unchanged', async () => {
    const { linting, batil } = useKlatenPairLookup()
    const main = {
      ...linting,
      jobs: [
        ...linting.jobs,
        {
          ...linting.jobs[0],
          uid: 'packing',
          code: 'BORONGAN-PACKING',
          name: 'Packing',
        },
      ],
    }
    lookup.mockImplementation(async ({ barcode }) =>
      barcode === 'TEST-001' ? main : batil
    )
    const screen = await render(<ProductionTerminalPage />)
    await fillLintingDeposit(screen)
    await screen.getByLabelText('Pekerja Batil (opsional)').fill('TEST-BATIL')
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    await screen.getByLabelText('Pekerjaan', { exact: true }).click()
    await screen.getByRole('option', { name: 'Packing · PCS · Utama' }).click()
    await expect
      .element(screen.getByLabelText('Pekerja Batil (opsional)'))
      .not.toBeInTheDocument()
    await screen.getByLabelText('Jumlah (PCS)').fill('500')
    await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
    expect(post.mock.calls[0][0].input).not.toHaveProperty('batilBarcode')
    await screen.getByLabelText('Pekerjaan', { exact: true }).click()
    await screen.getByRole('option', { name: 'Linting · PCS · Utama' }).click()
    await expect
      .element(screen.getByLabelText('Pekerja Batil (opsional)'))
      .toHaveValue('')
  })
  it.each(['JEPARA', 'SEMARANG'])(
    'preserves the single-worker scanner for %s',
    async (site) => {
      const saved = JSON.parse(
        localStorage.getItem('hris-rsia-production-device-v1')!
      )
      saved.device.site = site
      localStorage.setItem(
        'hris-rsia-production-device-v1',
        JSON.stringify(saved)
      )
      const screen = await render(<ProductionTerminalPage />)
      await fillLintingDeposit(screen)
      await expect
        .element(screen.getByLabelText('Pekerja Batil (opsional)'))
        .not.toBeInTheDocument()
      await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
      expect(post.mock.calls[0][0].input).not.toHaveProperty('batilBarcode')
    }
  )
  it('allows Klaten Linting alone and retains paired context and key after failed post', async () => {
    useKlatenPairLookup()
    const screen = await render(<ProductionTerminalPage />)
    await fillLintingDeposit(screen)
    await expect
      .element(screen.getByRole('button', { name: 'Simpan Setoran' }))
      .toBeEnabled()
    await screen.getByLabelText('Pekerja Batil (opsional)').fill('TEST-BATIL')
    await expect
      .element(screen.getByRole('button', { name: 'Simpan Setoran' }))
      .toBeDisabled()
    const field = screen
      .getByLabelText('Pekerja Batil (opsional)')
      .element() as HTMLInputElement
    field.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      })
    )
    await expect
      .element(screen.getByText('Pekerja Batil Uji · TEST-BATIL · Batil siap'))
      .toBeVisible()
    expect(post).not.toHaveBeenCalled()
    await expect
      .element(screen.getByLabelText('Jumlah (PCS)'))
      .toHaveValue('500')
    await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
    const input = post.mock.calls[0][0].input
    expect(input).toMatchObject({
      barcode: 'TEST-001',
      batilBarcode: 'TEST-BATIL',
      jobUid: 'linting',
      quantity: '500',
      qc: { brandUid: 'brand-a', weight1Grams: '71.29', weight2Grams: '70.05' },
    })
    await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
    expect(post.mock.calls[1][0].input.idempotencyKey).toBe(
      input.idempotencyKey
    )
    await expect
      .element(screen.getByLabelText('Pekerja Batil (opsional)'))
      .toHaveValue('TEST-BATIL')
  })
  it.each(['same-worker', 'missing-assignment'])(
    'blocks %s without dropping the scanned partner barcode',
    async (condition) => {
      const { linting, batil } = useKlatenPairLookup()
      lookup.mockImplementation(async ({ barcode }) =>
        barcode === 'TEST-001'
          ? linting
          : condition === 'same-worker'
            ? linting
            : { ...batil, jobs: [] }
      )
      const screen = await render(<ProductionTerminalPage />)
      await fillLintingDeposit(screen)
      await screen.getByLabelText('Pekerja Batil (opsional)').fill('TEST-BATIL')
      await screen.getByRole('button', { name: 'Cek', exact: true }).click()
      await expect
        .element(screen.getByRole('alert'))
        .toHaveTextContent(
          condition === 'same-worker'
            ? 'Pekerja Batil harus berbeda'
            : 'Penugasan dan tarif Batil'
        )
      await expect
        .element(screen.getByRole('button', { name: 'Simpan Setoran' }))
        .toBeDisabled()
      await expect
        .element(screen.getByLabelText('Pekerja Batil (opsional)'))
        .toHaveValue('TEST-BATIL')
      expect(post).not.toHaveBeenCalled()
      await screen.getByLabelText('Pekerja Batil (opsional)').fill('')
      await expect
        .element(screen.getByRole('button', { name: 'Simpan Setoran' }))
        .toBeEnabled()
    }
  )
  it('ignores stale lookup results after barcode edits and blocks while the latest check is pending', async () => {
    const { linting, batil } = useKlatenPairLookup()
    let resolveFirst!: (value: typeof batil) => void
    let resolveSecond!: (value: typeof batil) => void
    lookup.mockImplementation(({ barcode }) =>
      barcode === 'TEST-001'
        ? Promise.resolve(linting)
        : new Promise((resolve) => {
            if (barcode === 'BATIL-OLD') resolveFirst = resolve
            else resolveSecond = resolve
          })
    )
    const screen = await render(<ProductionTerminalPage />)
    await fillLintingDeposit(screen)
    await screen.getByLabelText('Pekerja Batil (opsional)').fill('BATIL-OLD')
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    await expect
      .element(screen.getByRole('button', { name: 'Simpan Setoran' }))
      .toBeDisabled()
    await screen.getByLabelText('Pekerja Batil (opsional)').fill('BATIL-NEW')
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    resolveSecond(batil)
    await expect
      .element(screen.getByText('Pekerja Batil Uji · TEST-BATIL · Batil siap'))
      .toBeVisible()
    resolveFirst({
      ...batil,
      employee: { ...batil.employee, fullName: 'Stale partner' },
    })
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(3))
    await expect
      .element(screen.getByText('Stale partner'))
      .not.toBeInTheDocument()
    await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
    expect(post.mock.calls[0][0].input.batilBarcode).toBe('BATIL-NEW')
    await screen
      .getByLabelText('Pekerja Batil (opsional)')
      .fill('BATIL-UNCONFIRMED')
    await expect
      .element(screen.getByRole('button', { name: 'Simpan Setoran' }))
      .toBeDisabled()
  })
  it('clears partner after replacing the Linting worker and after a successful paired deposit', async () => {
    useKlatenPairLookup()
    const screen = await render(<ProductionTerminalPage />)
    await fillLintingDeposit(screen)
    await screen.getByLabelText('Pekerja Batil (opsional)').fill('TEST-BATIL')
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    await screen.getByRole('button', { name: 'Ganti', exact: true }).click()
    await fillLintingDeposit(screen)
    await expect
      .element(screen.getByLabelText('Pekerja Batil (opsional)'))
      .toHaveValue('')
    await screen.getByLabelText('Pekerja Batil (opsional)').fill('TEST-BATIL')
    await screen.getByRole('button', { name: 'Cek', exact: true }).click()
    post.mockResolvedValue({ duplicate: false, message: 'Pasangan tersimpan.' })
    await screen.getByRole('button', { name: 'Simpan Setoran' }).click()
    await expect
      .element(screen.getByLabelText('Barcode karyawan'))
      .toHaveValue('')
    await expect
      .element(screen.getByLabelText('Pekerja Batil (opsional)'))
      .not.toBeInTheDocument()
  })
})
