import { describe, expect, it } from 'vitest'
import { validatePayrollPeriodDraft } from './period-validation'

describe('Payroll period draft validation', () => {
  it('menerima periode maksimal 31 hari dan pembayaran setelah periode', () => {
    expect(
      validatePayrollPeriodDraft({
        siteUid: 'site-uid',
        start: new Date(2026, 7, 1),
        end: new Date(2026, 7, 31),
        payment: new Date(2026, 8, 1),
        maxDays: 31,
      })
    ).toBeNull()
  })

  it('menolak rentang lebih dari 31 hari', () => {
    expect(
      validatePayrollPeriodDraft({
        siteUid: 'site-uid',
        start: new Date(2026, 7, 1),
        end: new Date(2026, 7, 31, 24),
        maxDays: 31,
      })
    ).toContain('maksimal 31 hari')
  })

  it('menolak pembayaran sebelum akhir periode', () => {
    expect(
      validatePayrollPeriodDraft({
        siteUid: 'site-uid',
        start: new Date(2026, 7, 1),
        end: new Date(2026, 7, 15),
        payment: new Date(2026, 7, 14),
        maxDays: 31,
      })
    ).toContain('pembayaran')
  })
})
