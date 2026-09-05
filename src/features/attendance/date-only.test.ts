import { describe, expect, it } from 'vitest'
import { clampAttendanceBusinessDate } from './date-only'

describe('clampAttendanceBusinessDate', () => {
  const goLiveDate = '2026-08-31'

  it('mengganti tanggal URL lama dengan tanggal go-live', () => {
    expect(clampAttendanceBusinessDate('2026-08-01', goLiveDate)).toBe(
      goLiveDate
    )
  })

  it('mempertahankan tanggal pada atau setelah go-live', () => {
    expect(clampAttendanceBusinessDate(goLiveDate, goLiveDate)).toBe(goLiveDate)
    expect(clampAttendanceBusinessDate('2026-09-01', goLiveDate)).toBe(
      '2026-09-01'
    )
  })
})
