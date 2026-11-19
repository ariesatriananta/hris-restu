import { format } from 'date-fns'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { productionCategoryToday } from '@/features/production/production-category'
import { ProductionStructurePage } from './production-structure-page'

const { api, state } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  state: { category: null as 'REGULER' | 'PREMIUM' | null },
}))
vi.mock('@/lib/api-client', () => ({ apiClient: api }))
vi.mock('@/components/date-picker', () => ({
  DatePicker: ({
    id,
    selected,
    onSelect,
    disabled,
  }: {
    id: string
    selected?: Date
    onSelect: (date: Date | undefined) => void
    disabled?: boolean
  }) => (
    <input
      id={id}
      type='date'
      disabled={disabled}
      value={selected ? format(selected, 'yyyy-MM-dd') : ''}
      onChange={(event) =>
        onSelect(
          event.target.value
            ? new Date(`${event.target.value}T00:00:00`)
            : undefined
        )
      }
    />
  ),
}))

async function renderPage() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProductionStructurePage search={{}} navigate={vi.fn()} />
    </QueryClientProvider>
  )
}

describe('Kategori master modul produksi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.category = null
    api.get.mockImplementation(async (path: string) => ({
      data: {
        items:
          path === '/production-structure/modules'
            ? [
                {
                  uid: 'module-a',
                  code: 'MD-A',
                  name: 'Modul A',
                  site: 'KLATEN',
                  isActive: 1,
                  productionCategory: state.category,
                  categoryEffectiveFrom: state.category ? '2020-01-01' : null,
                },
              ]
            : [],
        total: path === '/production-structure/modules' ? 1 : 0,
        page: 1,
        pageSize: 50,
      },
    }))
    api.post.mockResolvedValue({ data: {} })
    api.patch.mockResolvedValue({ data: {} })
  })

  it('mapping awal modul legacy dapat dipilih tanpa mengubah site dan field lain', async () => {
    const screen = await renderPage()
    await expect
      .element(screen.getByText('Belum dipetakan', { exact: true }))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Ubah Modul Modul A' }).click()
    await expect
      .element(screen.getByRole('combobox', { name: /Site/ }))
      .toBeDisabled()
    await screen.getByLabelText('Kategori Produksi').click()
    await screen.getByRole('option', { name: 'Reguler', exact: true }).click()
    await expect.element(screen.getByLabelText('Berlaku mulai')).toBeVisible()
    await screen.getByRole('button', { name: 'Simpan', exact: true }).click()
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/production-structure/modules/module-a',
        {
          site: 'KLATEN',
          code: 'MD-A',
          name: 'Modul A',
          description: undefined,
          isActive: true,
          productionCategory: 'REGULER',
          categoryEffectiveFrom: productionCategoryToday(),
        }
      )
    )
  })

  it('edit nama tidak mengirim perubahan kategori atau tanggal riwayat', async () => {
    state.category = 'REGULER'
    const screen = await renderPage()
    await screen.getByRole('button', { name: 'Ubah Modul Modul A' }).click()
    await screen.getByLabelText('Nama Modul').fill('Modul Baru')
    await screen.getByRole('button', { name: 'Simpan', exact: true }).click()
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/production-structure/modules/module-a',
        {
          site: 'KLATEN',
          code: 'MD-A',
          name: 'Modul Baru',
          description: undefined,
          isActive: true,
        }
      )
    )
  })

  it('perubahan kategori modul mempertahankan tanggal berlaku lama', async () => {
    state.category = 'REGULER'
    const screen = await renderPage()
    await screen.getByRole('button', { name: 'Ubah Modul Modul A' }).click()
    await screen.getByLabelText('Kategori Produksi').click()
    await screen.getByRole('option', { name: 'Premium', exact: true }).click()
    await expect
      .element(screen.getByLabelText('Berlaku mulai'))
      .toHaveValue('2020-01-01')
    await screen.getByRole('button', { name: 'Simpan', exact: true }).click()
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/production-structure/modules/module-a',
        {
          site: 'KLATEN',
          code: 'MD-A',
          name: 'Modul A',
          description: undefined,
          isActive: true,
          productionCategory: 'PREMIUM',
          categoryEffectiveFrom: '2020-01-01',
        }
      )
    )
  })
  it('modul baru default Reguler dan menyimpan tanggal yang dipilih', async () => {
    const screen = await renderPage()
    await screen.getByRole('button', { name: 'Tambah', exact: true }).click()
    await screen.getByLabelText('Kode', { exact: true }).fill('MD-B')
    await screen.getByLabelText('Nama Modul').fill('Modul B')
    await expect
      .element(screen.getByLabelText('Kategori Produksi'))
      .toHaveTextContent('Reguler')
    await screen.getByLabelText('Berlaku mulai').fill('2020-01-01')
    await screen.getByRole('button', { name: 'Simpan', exact: true }).click()
    await vi.waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/production-structure/modules', {
        site: 'JEPARA',
        code: 'MD-B',
        name: 'Modul B',
        description: undefined,
        isActive: true,
        productionCategory: 'REGULER',
        categoryEffectiveFrom: '2020-01-01',
      })
    )
  })
  it('perubahan tanggal saja tetap dikirim pada modul terpetakan', async () => {
    state.category = 'REGULER'
    const screen = await renderPage()
    await screen.getByRole('button', { name: 'Ubah Modul Modul A' }).click()
    await screen.getByLabelText('Berlaku mulai').fill('2019-12-31')
    await screen.getByRole('button', { name: 'Simpan', exact: true }).click()
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/production-structure/modules/module-a',
        {
          site: 'KLATEN',
          code: 'MD-A',
          name: 'Modul A',
          description: undefined,
          isActive: true,
          productionCategory: 'REGULER',
          categoryEffectiveFrom: '2019-12-31',
        }
      )
    )
  })
})
