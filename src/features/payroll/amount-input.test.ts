import { describe, expect, it } from 'vitest'
import { formatIdAmountInput, normalizeIdAmount } from './amount-input'

describe('input nominal Payroll Indonesia', () => {
  it('menampilkan pemisah ribuan tanpa nol desimal yang membingungkan', () => {
    expect(formatIdAmountInput('1400000')).toBe('1.400.000')
  })

  it('tetap mendukung pecahan dua digit bila dibutuhkan', () => {
    expect(formatIdAmountInput('1400000,5')).toBe('1.400.000,5')
    expect(normalizeIdAmount('1.400.000,5')).toBe('1400000.50')
  })

  it('mengirim nominal bulat sebagai decimal exact dua digit', () => {
    expect(normalizeIdAmount('150.000')).toBe('150000.00')
  })

  it('menjaga nominal besar tanpa kehilangan presisi', () => {
    expect(formatIdAmountInput('9007199254740993')).toBe(
      '9.007.199.254.740.993'
    )
    expect(normalizeIdAmount('9.007.199.254.740.993')).toBe(
      '9007199254740993.00'
    )
  })
})
