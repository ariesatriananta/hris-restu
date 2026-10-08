import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { ProductionQcMasterPanel } from './production-qc-master'

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))
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
    data: { items: [], total: 0 },
    isPending: false,
    isError: false,
  }),
  useSaveQcMaster: () => ({ mutate, isPending: false }),
}))

describe('Master QC Produksi', () => {
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
  it('brand meminta nama dan site, tanpa tanggal berlaku', async () => {
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
      .element(screen.getByLabelText('Tanggal mulai'))
      .not.toBeInTheDocument()
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
