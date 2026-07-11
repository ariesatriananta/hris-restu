import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Employee } from '../domain'
import { EmployeeIdCard } from './id-card'

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

describe('EmployeeIdCard', () => {
  it('merender barcode Code128 dan aksi output', async () => {
    const screen = await render(<EmployeeIdCard employee={employee} />)
    await expect
      .element(screen.getByLabelText('Barcode RSTTEST01'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Cetak ID card' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Unduh SVG' }))
      .toBeInTheDocument()
  })
})
