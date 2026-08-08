import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { EmployeeIdCardItem } from '../domain'
import {
  isProductionLabelEligible,
  ProductionLabelFace,
} from './production-label'
import { ProductionLabelPrintSheet } from './production-label-print-sheet'

const employee: EmployeeIdCardItem = {
  uid: '11111111-1111-4111-8111-111111111111',
  employeeNumber: 'PSLO-2606-17005',
  fullName: 'Anita Sari',
  employeeType: 'BORONGAN',
  employeeStatus: 'ACTIVE',
  site: 'JEPARA',
  position: 'Operator Produksi',
  productionModule: 'Produksi',
  productionSection: 'Linting',
  photo: null,
  machineReadable: {
    version: 1,
    barcodePayload: 'RAW-PSLO-2606-17005',
    qrPayload: 'RAW-PSLO-2606-17005',
  },
}

describe('ProductionLabel', () => {
  it('merender Code128 dari raw barcode beserta informasi label', async () => {
    const screen = await render(<ProductionLabelFace employee={employee} />)
    await expect
      .element(screen.getByText('PT RESTU SEJATI INTI ABADI'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(employee.employeeNumber, { exact: true }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(employee.fullName))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(employee.productionSection!))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(employee.machineReadable.barcodePayload))
      .toBeInTheDocument()
    expect(
      document.querySelector('.production-label-barcode rect')
    ).not.toBeNull()
  })

  it('mencetak tepat lima label identik untuk setiap karyawan', async () => {
    await render(
      <ProductionLabelPrintSheet
        items={[employee]}
        generatedAt='2026-08-08T00:00:00.000Z'
      />
    )
    expect(
      document.querySelectorAll('.production-label-print-row')
    ).toHaveLength(1)
    expect(document.querySelectorAll('.production-label-face')).toHaveLength(5)
  })

  it('membagi sembilan karyawan per halaman A4 lalu lanjut halaman berikutnya', async () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      ...employee,
      uid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      employeeNumber: `PSLO-${index + 1}`,
      machineReadable: {
        version: 1 as const,
        barcodePayload: `RAW-${index + 1}`,
        qrPayload: `RAW-${index + 1}`,
      },
    }))
    await render(
      <ProductionLabelPrintSheet
        items={items}
        generatedAt='2026-08-08T00:00:00.000Z'
      />
    )
    expect(
      document.querySelectorAll('.production-label-print-page')
    ).toHaveLength(2)
    expect(
      document.querySelectorAll('.production-label-print-row')
    ).toHaveLength(10)
    expect(document.querySelectorAll('.production-label-face')).toHaveLength(50)
    expect(
      document.querySelectorAll(
        '.production-label-print-page:first-child .production-label-print-row'
      )
    ).toHaveLength(9)
  })

  it('hanya mengizinkan karyawan aktif yang memiliki Bagian Produksi', () => {
    expect(isProductionLabelEligible(employee)).toBe(true)
    expect(
      isProductionLabelEligible({ ...employee, employeeStatus: 'INACTIVE' })
    ).toBe(false)
    expect(
      isProductionLabelEligible({ ...employee, productionSection: null })
    ).toBe(false)
    expect(
      isProductionLabelEligible({ ...employee, productionSection: '   ' })
    ).toBe(false)
  })
})
