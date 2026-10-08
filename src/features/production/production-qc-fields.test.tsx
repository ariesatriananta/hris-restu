import { useState } from 'react'
import '@/styles/index.css'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import { ProductionQcFields } from './production-qc-fields'
import { emptyProductionQc } from './production-qc-form-policy'

const options = {
  brands: [{ uid: 'brand', code: 'BR-1', name: 'Brand A', sortOrder: 0 }],
  defects: [
    { uid: 'defect', code: 'DF-1', name: 'Rokok Mletek', sortOrder: 0 },
    {
      uid: 'defect-2',
      code: 'DF-2',
      name: 'Potongan Tembakau (overlap)',
      sortOrder: 1,
    },
  ],
}
function Form({ quantity = '' }: { quantity?: string }) {
  const [value, onChange] = useState(emptyProductionQc)
  return (
    <ProductionQcFields
      value={value}
      onChange={onChange}
      options={options}
      quantity={quantity}
    />
  )
}
describe('QC Linting fields', () => {
  it('shows only brand for other jobs, without sample, defect or Linting summary fields', async () => {
    const screen = await render(
      <ProductionQcFields
        value={emptyProductionQc()}
        onChange={() => undefined}
        options={options}
        linting={false}
      />
    )
    await expect
      .element(screen.getByRole('radio', { name: 'Brand A' }))
      .toBeVisible()
    await expect
      .element(screen.getByLabelText('Berat 1 (gram) *'))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByTestId('qc-defects-grid'))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByLabelText('Ringkasan hasil setoran'))
      .not.toBeInTheDocument()
  })
  it('increments and decrements defects without going below zero', async () => {
    const screen = await render(<Form />)
    const defect = screen.getByLabelText('Rokok Mletek', { exact: true })
    await expect
      .element(screen.getByRole('button', { name: 'Kurangi Rokok Mletek' }))
      .toBeDisabled()
    await screen.getByRole('button', { name: 'Tambah Rokok Mletek' }).click()
    await expect.element(defect).toHaveValue('1')
    await screen.getByRole('button', { name: 'Kurangi Rokok Mletek' }).click()
    await expect.element(defect).toHaveValue('0')
    await expect
      .element(screen.getByRole('button', { name: 'Kurangi Rokok Mletek' }))
      .toBeDisabled()
  })
  it('starts weights neutral and masks typed digits as 00,00', async () => {
    const screen = await render(<Form />)
    const weight = screen.getByLabelText('Berat 1 (gram) *')
    await expect.element(weight).toHaveValue('00,00')
    await expect.element(weight).not.toHaveAttribute('aria-invalid', 'true')
    await weight.click()
    await expect.element(weight).toHaveValue('')
    await userEvent.keyboard('8132')
    await expect.element(weight).toHaveValue('81,32')
    await screen.getByLabelText('Berat 2 (gram) *').click()
    await expect.element(weight).toHaveValue('81,32')
  })
  it('shows informational net, reject and gendel from raw deposit quantity', async () => {
    const screen = await render(<Form quantity='500' />)
    await screen.getByLabelText('Rokok Mletek', { exact: true }).fill('10')
    const summary = screen.getByLabelText('Ringkasan hasil setoran').element()
    expect(summary.textContent).toContain('Net Batang490')
    expect(summary.textContent).toContain('Total Reject10')
    expect(summary.textContent).toContain('Gendel25,00')
    await screen.getByLabelText('Rokok Mletek', { exact: true }).fill('600')
    expect(summary.textContent).toContain('Net Batang-100')
  })
  it('types grams from the left and completes decimals only on blur', async () => {
    const screen = await render(<Form />)
    const weight = screen.getByLabelText('Berat 1 (gram) *')
    const next = screen.getByLabelText('Berat 2 (gram) *')
    await weight.click()
    await userEvent.keyboard('8')
    await expect.element(weight).toHaveValue('8')
    await userEvent.keyboard('0')
    await expect.element(weight).toHaveValue('80')
    await next.click()
    await expect.element(weight).toHaveValue('80,00')
    await weight.fill('5')
    await next.click()
    await expect.element(weight).toHaveValue('05,00')
    await weight.fill('71,2')
    await next.click()
    await expect.element(weight).toHaveValue('71,20')
    await weight.fill('')
    await next.click()
    await expect.element(weight).toHaveValue('00,00')
  })
  it('does not silently choose a brand and accepts comma weights and defect counts', async () => {
    const screen = await render(<Form />)
    const brand = screen.getByRole('radio', { name: 'Brand A' })
    await expect.element(brand).not.toBeChecked()
    await screen.getByText('Brand A', { exact: true }).click()
    await expect.element(brand).toBeChecked()
    await screen.getByLabelText('Berat 1 (gram) *').fill('71,29')
    await screen.getByLabelText('Berat 2 (gram) *').fill('70.05')
    await screen.getByLabelText('Rokok Mletek', { exact: true }).fill('900')
    await expect.element(screen.getByText('900', { exact: true })).toBeVisible()
    await expect
      .element(screen.getByText('QC tidak mengubah upah.'))
      .not.toBeInTheDocument()
  })
  it('explains missing site brands without allowing arbitrary fallback', async () => {
    const screen = await render(
      <ProductionQcFields
        value={emptyProductionQc()}
        onChange={() => undefined}
        options={{ brands: [], defects: options.defects }}
      />
    )
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Brand aktif untuk site ini belum tersedia')
    await expect.element(screen.getByRole('radiogroup')).not.toBeInTheDocument()
  })
  it('has a loading state and recoverable options error', async () => {
    const screen = await render(
      <ProductionQcFields
        value={emptyProductionQc()}
        onChange={() => undefined}
        error
        onRetry={() => undefined}
      />
    )
    await expect
      .element(screen.getByRole('button', { name: 'Coba lagi' }))
      .toBeVisible()
  })
  it('clears a zero on focus so typing 5 produces 5, and preserves a nonzero value', async () => {
    const screen = await render(<Form />)
    const defect = screen.getByLabelText('Rokok Mletek', { exact: true })
    await expect.element(defect).toHaveValue('0')
    await defect.click()
    await expect.element(defect).toHaveValue('')
    await userEvent.keyboard('5')
    await expect.element(defect).toHaveValue('5')
    await screen.getByLabelText('Berat 1 (gram) *').click()
    await defect.click()
    await expect.element(defect).toHaveValue('5')
  })
  it('restores zero when an untouched blank defect loses focus', async () => {
    const screen = await render(<Form />)
    const defect = screen.getByLabelText('Rokok Mletek', { exact: true })
    await defect.click()
    await expect.element(defect).toHaveValue('')
    await screen.getByLabelText('Berat 1 (gram) *').click()
    await expect.element(defect).toHaveValue('0')
  })
  it('disables brand and numeric inputs while saving', async () => {
    const screen = await render(
      <ProductionQcFields
        value={emptyProductionQc()}
        onChange={() => undefined}
        options={options}
        disabled
      />
    )
    await expect
      .element(screen.getByRole('radio', { name: 'Brand A' }))
      .toBeDisabled()
    await expect
      .element(screen.getByLabelText('Rokok Mletek', { exact: true }))
      .toBeDisabled()
    await expect
      .element(screen.getByLabelText('Berat 1 (gram) *'))
      .toBeDisabled()
  })
  it('keeps defects in two columns without overflowing at 320px', async () => {
    await page.viewport(320, 640)
    try {
      const screen = await render(<Form />)
      const grid = screen.getByTestId('qc-defects-grid').element()
      const brands = screen.getByRole('radiogroup').element()
      expect(
        getComputedStyle(brands).gridTemplateColumns.split(' ')
      ).toHaveLength(3)
      expect(
        getComputedStyle(grid).gridTemplateColumns.split(' ')
      ).toHaveLength(2)
      expect(grid.scrollWidth).toBeLessThanOrEqual(grid.clientWidth)
      const stepper = screen
        .getByLabelText('Rokok Mletek', { exact: true })
        .element().parentElement!
      expect(getComputedStyle(stepper).gap).toBe('0px')
      expect(grid.children[0].className).toContain('bg-primary/5')
      expect(grid.children[0].getBoundingClientRect().top).toBe(
        grid.children[1].getBoundingClientRect().top
      )
    } finally {
      await page.viewport(1280, 720)
    }
  })
})
