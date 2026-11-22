import { describe, expect, it } from 'vitest'
import { formatWibDateTime } from './business-time'

describe('WIB timestamp display', () => {
  it('converts UTC across midnight without changing an already-offset instant twice', () => {
    const utc = formatWibDateTime('2026-11-24T20:15:30.000Z', 'medium')
    expect(utc).toBe(formatWibDateTime('2026-11-25T03:15:30+07:00', 'medium'))
    expect(utc).toContain('25 Nov 2026')
    expect(utc).toMatch(/03[.:]15[.:]30/)
  })
  it('handles an unavailable timestamp without crashing the table', () => {
    expect(formatWibDateTime('invalid')).toBe('—')
  })
})
