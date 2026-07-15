import { describe, expect, it } from 'vitest'
import { formatEmployeeNumber } from './employee-number.js'

describe('formatEmployeeNumber', () => {
  it('membentuk Employee ID dari prefix, tanggal bergabung, dan urutan', () => {
    expect(formatEmployeeNumber('SMG', '2026-04-01', 2)).toBe(
      'PSMG-2604-01002'
    )
    expect(formatEmployeeNumber('KDS', '2026-04-01', 1)).toBe(
      'PKDS-2604-01001'
    )
    expect(formatEmployeeNumber('SLO', '2026-09-15', 3)).toBe(
      'PSLO-2609-15003'
    )
  })

  it('menolak tanggal dan urutan yang tidak valid', () => {
    expect(() => formatEmployeeNumber('SMG', '2026-02-30', 1)).toThrow()
    expect(() => formatEmployeeNumber('SMG', '2026-04-01', 1000)).toThrow()
  })
})
