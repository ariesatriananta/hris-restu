import { describe, expect, it } from 'vitest'
import { formatDecimalString } from './money'

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
