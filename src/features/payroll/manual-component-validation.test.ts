import { describe, expect, it } from 'vitest'
import {
  isPositivePayrollAmount,
  isValidPayrollAuditReason,
} from './manual-component-validation'

describe('validasi koreksi komponen manual Payroll', () => {
  it('menerima nominal positif exact tanpa mengubahnya menjadi Number', () => {
    expect(isPositivePayrollAmount('9007199254740993.25')).toBe(true)
    expect(isPositivePayrollAmount('0.00')).toBe(false)
    expect(isPositivePayrollAmount('-1.00')).toBe(false)
  })

  it('mewajibkan alasan audit minimal lima karakter setelah trim', () => {
    expect(isValidPayrollAuditReason(' Salah input ')).toBe(true)
    expect(isValidPayrollAuditReason(' 1234 ')).toBe(false)
  })
})
