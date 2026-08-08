import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Employee, EmployeeIdCardItem } from '../domain'
import { EmployeeIdCard, EmployeeIdCardFace } from './id-card'
import { IdCardPrintSheet } from './id-card-print-sheet'

const employee: Employee = {
  uid: 'emp-card-test',
  employeeNumber: 'RST-TEST-01',
  barcode: 'RSTTEST01',
  fullName: 'Karyawan Fiktif',
  employeeType: 'BORONGAN',
  employeeStatus: 'ACTIVE',
  site: 'JEPARA',
  position: 'Operator Produksi',
  joinDate: '2026-01-01',
  gender: 'MALE',
}

const idCardEmployee: EmployeeIdCardItem = {
  uid: '11111111-1111-4111-8111-111111111111',
  employeeNumber: 'RST-TEST-02',
  fullName: 'Karyawan Dengan Foto',
  employeeType: 'BULANAN',
  employeeStatus: 'ACTIVE',
  site: 'SEMARANG',
  position: 'Administrasi',
  productionModule: null,
  productionSection: null,
  photo: {
    uid: '22222222-2222-4222-8222-222222222222',
    url: 'https://example.com/photo.webp',
  },
  machineReadable: {
    version: 1,
    barcodePayload: 'RAW-BARCODE-02',
    qrPayload: 'RAW-QR-02',
  },
}

describe('EmployeeIdCard', () => {
  it('merender QR dari raw barcode dan mempertahankan aksi output', async () => {
    const screen = await render(<EmployeeIdCard employee={employee} />)
    await expect
      .element(screen.getByLabelText('QR RST-TEST-01'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('RSTTEST01')).toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Cetak ID card' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Unduh SVG' }))
      .toBeInTheDocument()
  })

  it('memakai photo.url dan QR payload exact dari kontrak ID Card', async () => {
    const screen = await render(
      <EmployeeIdCardFace employee={idCardEmployee} />
    )
    await expect
      .element(screen.getByAltText('Foto Karyawan Dengan Foto'))
      .toHaveAttribute('src', idCardEmployee.photo?.url)
    await expect
      .element(screen.getByLabelText('QR RST-TEST-02'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('RAW-QR-02')).toBeInTheDocument()
  })

  it('merender varian Training tanpa avatar atau foto', async () => {
    const training = {
      ...idCardEmployee,
      uid: '33333333-3333-4333-8333-333333333333',
      employeeType: 'TRAINING' as const,
      fullName: 'Peserta Training',
    }
    const screen = await render(<EmployeeIdCardFace employee={training} />)
    await expect
      .element(screen.getByText('Kartu Identitas'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByAltText('Foto Peserta Training'))
      .not.toBeInTheDocument()
  })

  it('membagi data cetak menjadi lima kartu dalam satu baris A4', async () => {
    const items = Array.from({ length: 7 }, (_, index) => ({
      ...idCardEmployee,
      uid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      employeeNumber: `RST-${index + 1}`,
      machineReadable: {
        version: 1 as const,
        barcodePayload: `BARCODE-${index + 1}`,
        qrPayload: `QR-${index + 1}`,
      },
    }))
    await render(
      <IdCardPrintSheet items={items} generatedAt='2026-08-08T00:00:00.000Z' />
    )
    expect(document.querySelectorAll('.id-card-print-page')).toHaveLength(2)
    expect(document.querySelectorAll('.id-card-print-row')).toHaveLength(2)
    expect(document.querySelectorAll('.employee-id-card')).toHaveLength(7)
    expect(
      document.querySelectorAll(
        '.id-card-print-page:first-child .id-card-print-row .employee-id-card'
      )
    ).toHaveLength(5)
  })
})
