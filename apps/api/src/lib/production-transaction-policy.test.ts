import { describe, expect, it } from 'vitest'
import {
  calculateGrossAmount,
  normalizeQuantity,
  normalizeStoredDecimal,
} from './production-transaction-policy.js'

describe('production transaction policy', () => {
  it('mengunci presisi satuan dan menormalisasi quantity ke empat desimal', () => {
    expect(normalizeQuantity('12.5', 2)).toBe('12.5000')
    expect(() => normalizeQuantity('12.5', 0)).toThrow(
      'Kuantitas hanya boleh memiliki 0 angka desimal'
    )
    expect(() => normalizeQuantity('0', 4)).toThrow(
      'Kuantitas harus lebih besar dari nol.'
    )
  })

  it('menghitung gross dengan pembulatan desimal tanpa floating point', () => {
    expect(calculateGrossAmount('3.0000', '1175.0000')).toBe('3525.00')
    expect(calculateGrossAmount('1.2345', '2.3456')).toBe('2.90')
    expect(normalizeStoredDecimal('001.2')).toBe('1.2000')
  })
})
