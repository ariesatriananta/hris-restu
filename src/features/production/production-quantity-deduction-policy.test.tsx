import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { ProductionQuantityDeductionPolicyPanel } from './production-quantity-deduction-policy'

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('@/features/production/data/queries', () => ({
  useProductionCommand: () => ({ mutate, isPending: false }),
  useProductionQuantityDeductionOptions: () => ({
    data: [{ site: 'JEPARA', siteName: 'Jepara' }],
  }),
  useProductionQuantityDeductionPolicies: () => ({
    data: {
      items: [
        {
          uid: 'policy-linting',
          site: 'JEPARA',
          siteName: 'Jepara',
          job: {
            uid: 'job-linting',
            code: 'BORONGAN-LINTING',
            name: 'Linting',
          },
          percentage: '3.0000',
          effectiveFrom: '2026-10-08',
          effectiveTo: null,
          status: 'ACTIVE',
        },
      ],
    },
    isFetching: false,
    isLoading: false,
  }),
}))

beforeEach(() => mutate.mockClear())

describe('Potongan Hasil Linting per site dan pekerjaan', () => {
  it('menampilkan kebijakan tanpa bagian dan menyimpan tanpa memilih bagian', async () => {
    const screen = await render(
      <ProductionQuantityDeductionPolicyPanel canManage siteFilter={[]} />
    )
    await expect.element(screen.getByText('Site & Pekerjaan')).toBeVisible()
    await expect
      .element(screen.getByText('Jepara', { exact: true }))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Atur Potongan' }).click()
    await expect
      .element(screen.getByText('Bagian Produksi', { exact: true }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Simpan Kebijakan' }))
      .toBeEnabled()
    await screen.getByRole('button', { name: 'Simpan Kebijakan' }).click()
    expect(mutate).toHaveBeenCalledOnce()
    expect(mutate.mock.calls[0][0]).toMatchObject({
      path: '/production-structure/quantity-deduction-policies',
      body: { site: 'JEPARA', percentage: '3', effectiveTo: null },
    })
    expect(mutate.mock.calls[0][0].body).not.toHaveProperty(
      'productionSectionUid'
    )
  })

  it('tetap membatasi tombol pengelolaan sesuai permission', async () => {
    const screen = await render(
      <ProductionQuantityDeductionPolicyPanel
        canManage={false}
        siteFilter={[]}
      />
    )
    await expect.element(screen.getByText('Site & Pekerjaan')).toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Atur Potongan' }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Nonaktifkan' }))
      .not.toBeInTheDocument()
  })
})
