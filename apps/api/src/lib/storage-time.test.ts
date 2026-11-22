import { describe, expect, it } from 'vitest'
import { wibDayUtcBoundary } from './storage-time.js'

describe('UTC storage and WIB day filters', () => {
  it('includes UTC evening from the previous day in the selected WIB date', () => {
    const from = wibDayUtcBoundary('2026-11-25')
    const to = wibDayUtcBoundary('2026-11-25', true)
    expect(from).toBe('2026-11-24 17:00:00')
    expect(to).toBe('2026-11-25 17:00:00')
    for (const [value, expected] of [
      ['2026-11-24 16:59:59', false],
      ['2026-11-24 17:00:00', true],
      ['2026-11-24 20:00:00', true],
      ['2026-11-25 16:59:59', true],
      ['2026-11-25 17:00:00', false],
    ] as const) expect(value >= from && value < to).toBe(expected)
  })

  it('handles month/year boundaries and UTC timestamps display on the next WIB day', () => {
    expect(wibDayUtcBoundary('2027-01-01')).toBe('2026-12-31 17:00:00')
    expect(wibDayUtcBoundary('2026-02-28', true)).toBe('2026-02-28 17:00:00')
    const rendered = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short', hour12: false,
    }).format(new Date('2026-11-24T20:00:00.000000Z'))
    expect(rendered).toContain('2026-11-25')
    expect(rendered).toContain('03:00')
  })
})

