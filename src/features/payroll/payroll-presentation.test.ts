import { describe, expect, it } from 'vitest'
import {
  payrollBaseAmount,
  payrollBaseLabel,
  payrollGrossAmount,
  payrollSchemeName,
} from './payroll-presentation'

const run = {
  totalPieceRateAmount: '900.00',
  totalBasicSalaryAmount: '1200.00',
  totalProratedBasicSalary: '1100.00',
  totalEarnings: '100.00',
}

describe('presentasi skema Payroll M5D', () => {
  it('membedakan dasar upah setiap skema tanpa menghitung ulang nominal', () => {
    expect(payrollBaseLabel({ payrollBasis: 'PIECE_RATE' })).toBe(
      'Hasil produksi'
    )
    expect(
      payrollBaseLabel({ payrollBasis: 'TIME_BASED', payFrequency: 'WEEKLY' })
    ).toBe('Upah harian')
    expect(
      payrollBaseLabel({ payrollBasis: 'TIME_BASED', payFrequency: 'MONTHLY' })
    ).toBe('Gaji pokok prorata')
    expect(
      payrollBaseAmount(run, {
        payrollBasis: 'TIME_BASED',
        payFrequency: 'MONTHLY',
      })
    ).toBe('1100.00')
  })

  it('menjaga label jenis dan bruto berbasis decimal string', () => {
    expect(
      payrollSchemeName({
        payrollBasis: 'TIME_BASED',
        payFrequency: 'WEEKLY',
        employeeType: 'TRAINING',
      })
    ).toBe('Training mingguan')
    expect(
      payrollGrossAmount(run, {
        payrollBasis: 'TIME_BASED',
        payFrequency: 'MONTHLY',
      })
    ).toBe('1200.00')
  })
})
