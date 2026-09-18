import { describe, expect, it } from 'vitest'
import { priceProductionTiers } from './production-tier-pricing.js'

const packingJepara = [
  { id: 1, minQuantity: '1.0000', rateAmount: '121.0000' },
  { id: 2, minQuantity: '501.0000', rateAmount: '158.0000' },
]

describe('progressive daily production pricing', () => {
  it('prices only pieces above the threshold at the upper rate', () => {
    const result = priceProductionTiers('0.0000', '600.0000', packingJepara)
    expect(result.grossAmount).toBe('76300.00')
    expect(result.slices.map((slice) => slice.quantity)).toEqual(['500.0000', '100.0000'])
  })

  it('splits the second deposit where it crosses the threshold', () => {
    const result = priceProductionTiers('400.0000', '200.0000', packingJepara)
    expect(result.grossAmount).toBe('27900.00')
    expect(result.slices.map((slice) => slice.quantity)).toEqual(['100.0000', '100.0000'])
  })

  it('uses the upper rate for all pieces after the threshold', () => {
    const result = priceProductionTiers('500.0000', '25.0000', packingJepara)
    expect(result.grossAmount).toBe('3950.00')
  })
})
