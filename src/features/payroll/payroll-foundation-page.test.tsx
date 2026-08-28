import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { sidebarData } from '@/components/layout/data/sidebar-data'
import { PayrollFoundationPage } from './payroll-foundation-page'

describe('Payroll foundation frontend', () => {
  it('melindungi menu induk dan seluruh submenu dengan payroll.view', () => {
    const payroll = sidebarData.navGroups
      .flatMap((group) => group.items)
      .find((item) => item.title === 'Payroll')
    const payrollItems = Array.isArray(payroll?.items) ? payroll.items : []

    expect(payroll?.anyOfPermissions).toEqual(['payroll.view'])
    expect(payrollItems).toHaveLength(6)
    expect(
      payrollItems.every(
        (item) =>
          item.anyOfPermissions?.length === 1 &&
          item.anyOfPermissions[0] === 'payroll.view'
      )
    ).toBe(true)
  })

  it('jujur bahwa simulasi belum menjalankan perhitungan', async () => {
    const screen = await render(<PayrollFoundationPage section='simulation' />)

    await expect
      .element(screen.getByText('Simulasi Payroll'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Fondasi sedang disiapkan'))
      .toBeInTheDocument()
    await expect
      .element(
        screen.getByText(
          /Menu ini belum menjalankan perhitungan atau mengubah data Payroll/
        )
      )
      .toBeInTheDocument()
    await expect
      .element(screen.getByText('Payroll 0 — Integrity'))
      .toBeInTheDocument()
  })
})
