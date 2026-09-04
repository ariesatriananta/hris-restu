import { describe, expect, it } from 'vitest'
import {
  attendanceBulkFinalizationRunInput,
  attendanceBulkFinalizationScopeInput,
  enumerateDates,
  inclusiveDateCount,
  isCleanFinalization,
} from './attendance-bulk-finalization-policy.js'

describe('attendance bulk finalization policy', () => {
  it('membatasi rentang manual maksimal 31 hari kalender', () => {
    expect(
      attendanceBulkFinalizationScopeInput.safeParse({
        siteCode: 'JEPARA',
        mode: 'RANGE',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
      }).success
    ).toBe(true)
    expect(
      attendanceBulkFinalizationScopeInput.safeParse({
        siteCode: 'JEPARA',
        mode: 'RANGE',
        dateFrom: '2026-08-01',
        dateTo: '2026-09-01',
      }).success
    ).toBe(false)
    expect(inclusiveDateCount('2026-08-01', '2026-08-31')).toBe(31)
  })

  it('melarang tanggal manual pada mode semua tanggal tertunda', () => {
    expect(
      attendanceBulkFinalizationScopeInput.safeParse({
        siteCode: 'KLATEN',
        mode: 'ALL_PENDING',
        dateFrom: '2026-08-01',
      }).success
    ).toBe(false)
  })

  it('membatasi dan memastikan tanggal konfirmasi unik', () => {
    expect(
      attendanceBulkFinalizationRunInput.safeParse({
        siteCode: 'SEMARANG',
        mode: 'RANGE',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-02',
        confirmedDates: ['2026-08-01', '2026-08-01'],
      }).success
    ).toBe(false)
  })

  it('mengurutkan tanggal dan hanya menganggap finalisasi bersih selesai', () => {
    expect(enumerateDates('2026-08-30', '2026-09-01')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
    ])
    expect(isCleanFinalization({ rawStatus: 'SUCCEEDED' })).toBe(true)
    expect(
      isCleanFinalization({ rawStatus: 'SUCCEEDED', missingAssignment: 1 })
    ).toBe(false)
  })
})

