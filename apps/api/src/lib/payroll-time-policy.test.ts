import { describe, expect, it } from 'vitest'
import { assertSalaryEffectiveDate, assertWagePolicyMatrix, isPayrollPeriodStart, previewPayrollPeriods } from './payroll-time-policy.js'

describe('payroll time policy', () => {
  it('locks the employee wage matrix', () => {
    expect(() => assertWagePolicyMatrix({ employeeType: 'TRAINING', wageBasis: 'PIECE_RATE', payFrequency: 'WEEKLY', cutoffType: 'WEEK_END' })).toThrow(/TIME_BASED/)
    expect(assertWagePolicyMatrix({ employeeType: 'TRAINING', wageBasis: 'TIME_BASED', payFrequency: 'WEEKLY', cutoffType: 'WEEK_END' }).attendancePayRule).toBe('PRESENT_ONLY')
  })

  it('previews deterministic Monday-Sunday periods across months', () => {
    expect(previewPayrollPeriods({ effectiveFrom: '2026-08-31', payFrequency: 'WEEKLY', cutoffType: 'WEEK_END' })).toEqual([
      { start: '2026-08-31', end: '2026-09-06' },
      { start: '2026-09-07', end: '2026-09-13' },
      { start: '2026-09-14', end: '2026-09-20' },
    ])
  })

  it('previews last-day monthly periods including February', () => {
    expect(previewPayrollPeriods({ effectiveFrom: '2026-01-01', payFrequency: 'MONTHLY', cutoffType: 'LAST_DAY' })).toEqual([
      { start: '2026-01-01', end: '2026-01-31' },
      { start: '2026-02-01', end: '2026-02-28' },
      { start: '2026-03-01', end: '2026-03-31' },
    ])
  })

  it('only allows later salary changes at period starts', () => {
    expect(() => assertSalaryEffectiveDate({ effectiveFrom: '2026-08-15', isInitial: false, eligibilityStart: '2026-08-15', allowedPeriodStarts: ['2026-08-01', '2026-09-01'] })).toThrow(/awal periode/)
    expect(() => assertSalaryEffectiveDate({ effectiveFrom: '2026-08-15', isInitial: true, eligibilityStart: '2026-08-15', allowedPeriodStarts: [] })).not.toThrow()
  })

  it('recognizes monthly starts for last-day and fixed cutoff', () => {
    expect(isPayrollPeriodStart({ date: '2026-09-01', payFrequency: 'MONTHLY', cutoffType: 'LAST_DAY' })).toBe(true)
    expect(isPayrollPeriodStart({ date: '2026-08-26', payFrequency: 'MONTHLY', cutoffType: 'DAY_OF_MONTH', cutoffDay: 25 })).toBe(true)
    expect(isPayrollPeriodStart({ date: '2026-08-25', payFrequency: 'MONTHLY', cutoffType: 'DAY_OF_MONTH', cutoffDay: 25 })).toBe(false)
  })
})
