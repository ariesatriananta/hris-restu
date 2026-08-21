import { describe, expect, it } from 'vitest'
import {
  canUseProductionTerminalSite,
  normalizeProductionQuantity,
  validateProductionQuantity,
} from './production-terminal-policy'

describe('validateProductionQuantity', () => {
  it('menerima bilangan positif sesuai presisi satuan', () => {
    expect(validateProductionQuantity('12', 0)).toBeUndefined()
    expect(validateProductionQuantity('12.25', 2)).toBeUndefined()
  })

  it('menormalkan koma desimal Indonesia sebelum dikirim ke API', () => {
    expect(normalizeProductionQuantity(' 12,25 ')).toBe('12.25')
    expect(validateProductionQuantity('12,25', 2)).toBeUndefined()
  })

  it('menolak nol, bilangan negatif, dan input nonangka', () => {
    expect(validateProductionQuantity('0', 0)).toContain('lebih besar dari nol')
    expect(validateProductionQuantity('-1', 0)).toContain(
      'angka lebih dari nol'
    )
    expect(validateProductionQuantity('pcs', 0)).toContain(
      'angka lebih dari nol'
    )
  })

  it('menolak pecahan yang melampaui presisi satuan', () => {
    expect(validateProductionQuantity('1.5', 0)).toContain('0 angka')
    expect(validateProductionQuantity('1.234', 2)).toContain('2 angka')
  })

  it('mengizinkan Super Admin lintas site tanpa user_site_access', () => {
    expect(canUseProductionTerminalSite('SUPER_ADMIN', [], 'JEPARA')).toBe(true)
    expect(canUseProductionTerminalSite('PRODUCTION_ADMIN', [], 'JEPARA')).toBe(
      false
    )
    expect(
      canUseProductionTerminalSite('PRODUCTION_ADMIN', ['JEPARA'], 'JEPARA')
    ).toBe(true)
  })
})
