import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { ProductionQcDetail } from './production-qc-detail'

describe('QC detail snapshot', () => {
  it('shows only the brand snapshot for non-Linting work', async () => {
    const screen = await render(
      <ProductionQcDetail
        linting={false}
        qc={{
          brand: { uid: 'brand', code: 'BR-1', name: 'Brand saat setor' },
          weight1Grams: null,
          weight2Grams: null,
          defects: [],
        }}
      />
    )
    await expect.element(screen.getByText('Brand saat setor')).toBeVisible()
    await expect
      .element(screen.getByText('QC Hasil Linting'))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('Berat 1 (sampel)'))
      .not.toBeInTheDocument()
  })
  it('shows original labels, two-decimal grams and overlapping defects independently from pay', async () => {
    const screen = await render(
      <ProductionQcDetail
        qc={{
          brand: { uid: 'brand', code: 'BR-1', name: 'Brand saat setor' },
          weight1Grams: '71.29',
          weight2Grams: '70.05',
          defects: [
            {
              uid: 'defect',
              code: 'DF-1',
              name: 'Cowong saat setor',
              sortOrder: 1,
              quantity: 600,
            },
          ],
        }}
      />
    )
    await expect.element(screen.getByText('Brand saat setor')).toBeVisible()
    await expect.element(screen.getByText('71,29 g')).toBeVisible()
    await expect.element(screen.getByText('70,05 g')).toBeVisible()
    await expect.element(screen.getByText('Cowong saat setor')).toBeVisible()
    await expect
      .element(screen.getByText('Total defect (bukan jumlah batang reject)'))
      .toBeVisible()
    await expect
      .element(
        screen.getByText(
          'Informasi kualitas saat setoran dicatat. Tidak mengurangi hasil setor atau upah.'
        )
      )
      .toBeVisible()
  })
  it('supports partial legacy metadata without forcing completion', async () => {
    const screen = await render(
      <ProductionQcDetail
        qc={{
          brand: null,
          weight1Grams: null,
          weight2Grams: '70.00',
          defects: [],
        }}
      />
    )
    await expect.element(screen.getByText('70,00 g')).toBeVisible()
    await expect.element(screen.getByText('QC Hasil Linting')).toBeVisible()
  })
})
