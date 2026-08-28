import { describe, expect, it } from 'vitest'
import { ApiError } from './errors.js'
import {
  assertPayrollPeriodRange,
  payrollPeriodsOverlap,
  payrollPeriodTransition,
} from './payroll-policy.js'

describe('payrollPeriodTransition', () => {
  it('mengunci alur utama DRAFT ke CLOSED', () => {
    expect(payrollPeriodTransition({ status: 'DRAFT', action: 'CALCULATE' })).toBe(
      'CALCULATED'
    )
    expect(
      payrollPeriodTransition({
        status: 'CALCULATED',
        action: 'REQUEST_APPROVAL',
      })
    ).toBe('CALCULATED')
    expect(
      payrollPeriodTransition({
        status: 'CALCULATED',
        action: 'APPROVE',
        hasPendingApproval: true,
      })
    ).toBe('APPROVED')
    expect(payrollPeriodTransition({ status: 'APPROVED', action: 'CLOSE' })).toBe(
      'CLOSED'
    )
  })

  it('hanya mengizinkan pembatalan saat DRAFT', () => {
    expect(payrollPeriodTransition({ status: 'DRAFT', action: 'CANCEL' })).toBe(
      'CANCELLED'
    )
    expect(() =>
      payrollPeriodTransition({ status: 'CALCULATED', action: 'CANCEL' })
    ).toThrow(ApiError)
  })

  it('mengizinkan hitung ulang CALCULATED selama belum ada approval pending', () => {
    expect(
      payrollPeriodTransition({ status: 'CALCULATED', action: 'RECALCULATE' })
    ).toBe('CALCULATED')
    expect(() =>
      payrollPeriodTransition({
        status: 'CALCULATED',
        action: 'RECALCULATE',
        hasPendingApproval: true,
      })
    ).toThrow('persetujuan masih menunggu')
  })

  it('menjaga APPROVED dan CLOSED tetap immutable', () => {
    expect(() =>
      payrollPeriodTransition({ status: 'APPROVED', action: 'RECALCULATE' })
    ).toThrow(ApiError)
    expect(() =>
      payrollPeriodTransition({ status: 'CLOSED', action: 'CALCULATE' })
    ).toThrow(ApiError)
  })
})

describe('assertPayrollPeriodRange', () => {
  it('menerima rentang inklusif maksimal 31 hari', () => {
    expect(() =>
      assertPayrollPeriodRange({
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      })
    ).not.toThrow()
  })

  it('menolak rentang di atas 31 hari dan tanggal terbalik', () => {
    expect(() =>
      assertPayrollPeriodRange({
        periodStart: '2026-08-01',
        periodEnd: '2026-09-01',
      })
    ).toThrow('maksimal 31 hari')
    expect(() =>
      assertPayrollPeriodRange({
        periodStart: '2026-08-02',
        periodEnd: '2026-08-01',
      })
    ).toThrow('tidak boleh sebelum')
  })
})

describe('payrollPeriodsOverlap', () => {
  it('menganggap batas tanggal yang sama sebagai overlap', () => {
    expect(
      payrollPeriodsOverlap(
        { start: '2026-08-01', end: '2026-08-15' },
        { start: '2026-08-15', end: '2026-08-31' }
      )
    ).toBe(true)
  })

  it('menerima periode yang benar-benar terpisah', () => {
    expect(
      payrollPeriodsOverlap(
        { start: '2026-08-01', end: '2026-08-15' },
        { start: '2026-08-16', end: '2026-08-31' }
      )
    ).toBe(false)
  })
})
