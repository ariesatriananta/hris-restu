import { describe, expect, it } from 'vitest'
import { calculateBpjsPortion, roundToUnit } from './payroll-bpjs-policy.js'

describe('payroll BPJS policy', () => {
  it('membulatkan potongan karyawan ke Rp1.000 terdekat', () => {
    expect(roundToUnit(74_034.18, 1_000)).toBe(74_000)
    expect(roundToUnit(27_565.01, 1_000)).toBe(28_000)
  })

  it('memakai UMK sebagai dasar dan menghormati switch independen', () => {
    expect(calculateBpjsPortion({ wage: 2_756_501, rate: 1, enabled: true, roundingUnit: 1_000 })).toBe(28_000)
    expect(calculateBpjsPortion({ wage: 2_756_501, rate: 2, enabled: false, roundingUnit: null })).toBe(0)
  })

  it('menerapkan batas upah sebelum menghitung kontribusi', () => {
    expect(calculateBpjsPortion({ wage: 12_500_000, ceiling: 10_000_000, rate: 1, enabled: true, roundingUnit: 1_000 })).toBe(100_000)
  })
})
