import { describe, expect, it } from 'vitest'
import {
  assertAttendanceOperationalDate,
  isAttendanceOperationalDate,
} from './attendance-operational-policy.js'

describe('attendance operational policy', () => {
  const goLiveDate = '2026-08-31'

  it('menganggap tanggal go-live sebagai batas inklusif', () => {
    expect(isAttendanceOperationalDate('2026-08-30', goLiveDate)).toBe(false)
    expect(isAttendanceOperationalDate('2026-08-31', goLiveDate)).toBe(true)
    expect(isAttendanceOperationalDate('2026-09-01', goLiveDate)).toBe(true)
  })

  it('menolak aksi operasional sebelum tanggal go-live', () => {
    expect(() =>
      assertAttendanceOperationalDate('2026-08-30', goLiveDate)
    ).toThrow('Attendance operasional hanya berlaku mulai 2026-08-31.')
  })
})
