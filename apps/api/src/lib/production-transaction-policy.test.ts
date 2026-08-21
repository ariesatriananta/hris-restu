import { describe, expect, it } from 'vitest'
import {
  calculateGrossAmount,
  normalizeQuantity,
  normalizeStoredDecimal,
  productionCorrectionInput,
  subtractDecimal,
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

  it('memvalidasi payload koreksi dan menghitung delta tanpa floating point', () => {
    expect(
      productionCorrectionInput.parse({
        jobUid: '22222222-2222-4222-8222-222222222222',
        quantity: '4',
        reason: 'Salah pekerjaan saat input.',
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
      }).quantity
    ).toBe('4')
    expect(subtractDecimal('4.0000', '3.0000', 4)).toBe('1.0000')
    expect(subtractDecimal('3000.00', '3525.00', 2)).toBe('-525.00')
  })

  it('menghitung gross dengan pembulatan desimal tanpa floating point', () => {
    expect(calculateGrossAmount('3.0000', '1175.0000')).toBe('3525.00')
    expect(calculateGrossAmount('1.2345', '2.3456')).toBe('2.90')
    expect(normalizeStoredDecimal('001.2')).toBe('1.2000')
  })
})
