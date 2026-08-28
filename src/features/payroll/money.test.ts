import { describe, expect, it } from 'vitest'
import { addDecimalStrings, formatDecimalString } from './money'

describe('format nominal exact Payroll', () => {
  it('memformat string uang besar tanpa konversi Number', () => {
    expect(formatDecimalString('9007199254740993.50', { currency: true })).toBe(
      'Rp 9.007.199.254.740.993,5'
    )
  })

  it('tidak menampilkan nol pecahan yang tidak diperlukan', () => {
    expect(formatDecimalString('1400.0000', { currency: true })).toBe(
      'Rp 1.400'
    )
  })
})

describe('addDecimalStrings', () => {
  it('menjumlahkan nominal tanpa Number floating point', () => {
    expect(addDecimalStrings('12000000.00', '600000.50')).toBe('12600000.50')
    expect(addDecimalStrings('0.10', '0.20')).toBe('0.30')
  })
})
