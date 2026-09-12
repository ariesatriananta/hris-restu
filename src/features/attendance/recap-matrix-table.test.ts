import { describe, expect, it } from 'vitest'
import { abnormalReasonLabel, timeLabel } from './recap-matrix-presentation'

describe('attendance recap matrix presentation', () => {
  it('keeps clock values compact without changing their timezone', () => {
    expect(timeLabel('2026-08-31T07:05:00.000Z')).toBe('07:05')
    expect(timeLabel('2026-08-31 15:10:00')).toBe('15:10')
    expect(timeLabel(null)).toBe('—')
  })

  it('uses readable labels for known and future abnormal reasons', () => {
    expect(abnormalReasonLabel('MISSING_CLOCK_IN')).toBe(
      'Jam masuk belum tersedia'
    )
    expect(abnormalReasonLabel('UNEXPECTED_SCAN')).toBe('unexpected scan')
  })
})
