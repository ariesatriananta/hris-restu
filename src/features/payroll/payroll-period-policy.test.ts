import { describe, expect, it } from 'vitest'
import { periodForDate } from './payroll-period-policy'

describe('periodForDate', () => {
  it('membentuk minggu Senin-Minggu walau melewati bulan', () => {
    expect(
      periodForDate(new Date(2026, 7, 31), {
        payFrequency: 'WEEKLY',
        cutoffType: 'WEEK_END',
        cutoffDay: null,
      })
    ).toEqual({ periodStart: '2026-08-31', periodEnd: '2026-09-06' })
  })

  it('membentuk bulan kalender sampai hari terakhir', () => {
    expect(
      periodForDate(new Date(2028, 1, 12), {
        payFrequency: 'MONTHLY',
        cutoffType: 'LAST_DAY',
        cutoffDay: null,
      })
    ).toEqual({ periodStart: '2028-02-01', periodEnd: '2028-02-29' })
  })

  it('membentuk periode cutoff bulanan yang memotong dua bulan', () => {
    expect(
      periodForDate(new Date(2026, 7, 28), {
        payFrequency: 'MONTHLY',
        cutoffType: 'DAY_OF_MONTH',
        cutoffDay: 25,
      })
    ).toEqual({ periodStart: '2026-08-26', periodEnd: '2026-09-25' })
  })
})
