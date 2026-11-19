import { format } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { productionCategoryToday } from './production-category'
import { ProductionQcMasterPanel } from './production-qc-master'
import type { QcMasterItem } from './production-qc-master-queries'

const { mutate, state } = vi.hoisted(() => ({
  mutate: vi.fn(),
  state: { items: [] as QcMasterItem[] },
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      session: {
        user: {
          roles: ['SUPER_ADMIN'],
          siteAccess: ['JEPARA', 'KLATEN', 'SEMARANG'],
        },
      },
    }),
}))
vi.mock('@/features/production/production-qc-master-queries', () => ({
  useQcMasterList: () => ({
    data: { items: state.items, total: state.items.length },
    isPending: false,
    isError: false,
  }),
  useSaveQcMaster: () => ({ mutate, isPending: false }),
}))
// Exercise the submitted effective date independently of calendar navigation.
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

describe('Master QC Produksi', () => {
  beforeEach(() => {
    mutate.mockClear()
    state.items = []
  })
  it('menampilkan defect global dan form tanpa site atau alasan', async () => {
    const screen = await render(
      <ProductionQcMasterPanel
        kind='defects'
        search={{}}
        navigate={vi.fn()}
        canManage
      />
    )
    await expect.element(screen.getByText('Defect Global')).toBeVisible()
    await screen.getByRole('button', { name: 'Tambah Defect' }).click()
    await expect.element(screen.getByLabelText('Nama Defect')).toBeVisible()
    await expect.element(screen.getByLabelText('Urutan tampil')).toBeVisible()
    await expect
      .element(screen.getByLabelText('Site', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByLabelText('Alasan', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByLabelText('Kategori Produksi'))
      .not.toBeInTheDocument()
    await screen.getByLabelText('Nama Defect').fill('Rokok Mletek')
    await screen.getByRole('button', { name: 'Simpan Defect' }).click()
    expect(mutate).toHaveBeenLastCalledWith(
      {
        uid: undefined,
        input: { name: 'Rokok Mletek', sortOrder: 0, isActive: true },
      },
      expect.anything()
    )
  })
  it('brand baru default Reguler dengan tanggal berlaku hari ini', async () => {
    const screen = await render(
      <ProductionQcMasterPanel
        kind='brands'
        search={{ qcSite: 'KLATEN' }}
        navigate={vi.fn()}
        canManage
      />
    )
    await screen.getByRole('button', { name: 'Tambah Brand' }).click()
    await expect
      .element(screen.getByLabelText('Site', { exact: true }))
      .toBeVisible()
    await expect
      .element(screen.getByLabelText('Berlaku mulai'))
      .toHaveValue(productionCategoryToday())
    await expect
      .element(screen.getByRole('button', { name: 'Simpan Brand' }))
      .toBeDisabled()
    await screen.getByLabelText('Nama Brand').fill('Brand A')
    await screen.getByRole('button', { name: 'Simpan Brand' }).click()
    expect(mutate).toHaveBeenLastCalledWith(
      {
        uid: undefined,
        input: {
          name: 'Brand A',
          sortOrder: 0,
          isActive: true,
          site: 'KLATEN',
          productionCategory: 'REGULER',
          categoryEffectiveFrom: productionCategoryToday(),
        },
      },
      expect.anything()
    )
  })
  it('mengirim kategori dan tanggal pemetaan awal untuk brand baru', async () => {
    const screen = await render(
      <ProductionQcMasterPanel
        kind='brands'
        search={{ qcSite: 'KLATEN' }}
        navigate={vi.fn()}
        canManage
      />
    )
    await screen.getByRole('button', { name: 'Tambah Brand' }).click()
    await screen.getByLabelText('Nama Brand').fill('Brand Premium')
    await screen.getByLabelText('Kategori Produksi').click()
    await screen.getByRole('option', { name: 'Premium', exact: true }).click()
    await expect.element(screen.getByLabelText('Berlaku mulai')).toBeVisible()
    await screen.getByRole('button', { name: 'Simpan Brand' }).click()
    expect(mutate).toHaveBeenLastCalledWith(
      {
        uid: undefined,
        input: {
          name: 'Brand Premium',
          sortOrder: 0,
          isActive: true,
          site: 'KLATEN',
          productionCategory: 'PREMIUM',
          categoryEffectiveFrom: productionCategoryToday(),
        },
      },
      expect.anything()
    )
  })
  it('menampilkan legacy belum dipetakan dan mempertahankan kategori saat ubah nama', async () => {
    state.items = [
      {
        uid: 'brand-unmapped',
        code: 'BR-0001',
        name: 'Brand Lama',
        site: 'KLATEN',
        sortOrder: 0,
        isActive: true,
        productionCategory: null,
      },
    ]
    const screen = await render(
      <ProductionQcMasterPanel
        kind='brands'
        search={{}}
        navigate={vi.fn()}
        canManage
      />
    )
    await expect
      .element(screen.getByText('Belum dipetakan', { exact: true }))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Ubah brand Brand Lama' }).click()
    await screen.getByLabelText('Nama Brand').fill('Brand Baru')
    await screen.getByRole('button', { name: 'Simpan Brand' }).click()
    expect(mutate).toHaveBeenLastCalledWith(
      {
        uid: 'brand-unmapped',
        input: { name: 'Brand Baru', sortOrder: 0, isActive: true },
      },
      expect.anything()
    )
  })
  it('perubahan kategori brand mempertahankan tanggal berlaku yang tersimpan dan mengizinkan backdate', async () => {
    state.items = [
      {
        uid: 'brand-mapped',
        code: 'BR-0002',
        name: 'Brand Reguler',
        site: 'KLATEN',
        sortOrder: 0,
        isActive: true,
        productionCategory: 'REGULER',
        categoryEffectiveFrom: '2020-01-01',
      },
    ]
    const screen = await render(
      <ProductionQcMasterPanel
        kind='brands'
        search={{}}
        navigate={vi.fn()}
        canManage
      />
    )
    await screen
      .getByRole('button', { name: 'Ubah brand Brand Reguler' })
      .click()
    await screen.getByLabelText('Kategori Produksi').click()
    await expect
      .element(screen.getByRole('option', { name: 'Belum dipetakan' }))
      .not.toBeInTheDocument()
    await screen.getByRole('option', { name: 'Premium', exact: true }).click()
    await expect
      .element(screen.getByLabelText('Berlaku mulai'))
      .toHaveValue('2020-01-01')
    await screen.getByLabelText('Berlaku mulai').fill('2019-12-31')
    await screen.getByRole('button', { name: 'Simpan Brand' }).click()
    expect(mutate).toHaveBeenLastCalledWith(
      {
        uid: 'brand-mapped',
        input: {
          name: 'Brand Reguler',
          sortOrder: 0,
          isActive: true,
          productionCategory: 'PREMIUM',
          categoryEffectiveFrom: '2019-12-31',
        },
      },
      expect.anything()
    )
  })
  it('kategori yang ditetapkan hari ini tetap dapat dikoreksi pada hari yang sama', async () => {
    state.items = [
      {
        uid: 'brand-today',
        code: 'BR-0003',
        name: 'Brand Hari Ini',
        site: 'KLATEN',
        sortOrder: 0,
        isActive: true,
        productionCategory: 'PREMIUM',
        categoryEffectiveFrom: productionCategoryToday(),
      },
    ]
    const screen = await render(
      <ProductionQcMasterPanel
        kind='brands'
        search={{}}
        navigate={vi.fn()}
        canManage
      />
    )
    await screen
      .getByRole('button', { name: 'Ubah brand Brand Hari Ini' })
      .click()
    await expect
      .element(screen.getByLabelText('Kategori Produksi'))
      .toBeEnabled()
    await screen.getByLabelText('Kategori Produksi').click()
    await screen.getByRole('option', { name: 'Reguler', exact: true }).click()
    await screen.getByLabelText('Nama Brand').fill('Brand Ganti Nama')
    await screen.getByRole('button', { name: 'Simpan Brand' }).click()
    expect(mutate).toHaveBeenLastCalledWith(
      {
        uid: 'brand-today',
        input: {
          name: 'Brand Ganti Nama',
          sortOrder: 0,
          isActive: true,
          productionCategory: 'REGULER',
          categoryEffectiveFrom: productionCategoryToday(),
        },
      },
      expect.anything()
    )
  })
  it('perubahan tanggal saja tetap dikirim tanpa mengganti kategori', async () => {
    state.items = [
      {
        uid: 'brand-date',
        code: 'BR-0004',
        name: 'Brand Tanggal',
        site: 'KLATEN',
        sortOrder: 0,
        isActive: true,
        productionCategory: 'REGULER',
        categoryEffectiveFrom: '2020-01-01',
      },
    ]
    const screen = await render(
      <ProductionQcMasterPanel
        kind='brands'
        search={{}}
        navigate={vi.fn()}
        canManage
      />
    )
    await screen
      .getByRole('button', { name: 'Ubah brand Brand Tanggal' })
      .click()
    await screen.getByLabelText('Berlaku mulai').fill('2020-01-02')
    await screen.getByRole('button', { name: 'Simpan Brand' }).click()
    expect(mutate).toHaveBeenLastCalledWith(
      {
        uid: 'brand-date',
        input: {
          name: 'Brand Tanggal',
          sortOrder: 0,
          isActive: true,
          productionCategory: 'REGULER',
          categoryEffectiveFrom: '2020-01-02',
        },
      },
      expect.anything()
    )
  })
  it('akses lihat tidak menampilkan tambah', async () => {
    const screen = await render(
      <ProductionQcMasterPanel
        kind='brands'
        search={{}}
        navigate={vi.fn()}
        canManage={false}
      />
    )
    await expect
      .element(screen.getByRole('button', { name: 'Tambah Brand' }))
      .not.toBeInTheDocument()
  })
})
