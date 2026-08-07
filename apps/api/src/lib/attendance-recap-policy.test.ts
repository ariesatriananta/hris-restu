import { describe, expect, it } from 'vitest'
import {
  attendanceRecapMaxDays,
  enumerateRecapDates,
  isOfficialRecapPeriod,
  recapDayName,
  validateRecapPeriod,
} from './attendance-recap-policy.js'

describe('attendance recap policy', () => {
  it('membatasi periode secara inklusif sampai 31 hari', () => {
    expect(attendanceRecapMaxDays).toBe(31)
    expect(validateRecapPeriod('2026-08-01', '2026-08-31')).toBe(true)
    expect(validateRecapPeriod('2026-08-01', '2026-09-01')).toBe(false)
    expect(validateRecapPeriod('2026-08-02', '2026-08-01')).toBe(false)
  })

  it('menghasilkan tanggal dan nama hari tanpa pergeseran timezone', () => {
    expect(enumerateRecapDates('2026-08-06', '2026-08-08')).toEqual([
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ])
    expect(recapDayName('2026-08-08')).toBe('Sabtu')
  })

  it('menandai periode sebelum go-live sebagai view-only', () => {
    expect(isOfficialRecapPeriod('2026-08-05', '2026-08-06')).toBe(false)
    expect(isOfficialRecapPeriod('2026-08-06', '2026-08-06')).toBe(true)
    expect(isOfficialRecapPeriod('2026-09-01', '2026-09-02')).toBe(false)
  })
})
