import { describe, expect, it } from 'vitest'
import { resolveSiteScope, siteScopeLabel } from './use-site-scope-filter'

describe('site scope filter', () => {
  it('mengunci filter ke satu-satunya site akses', () => {
    expect(resolveSiteScope(['KLATEN'], ['JEPARA'])).toEqual({
      lockedSite: 'JEPARA',
      effectiveSites: ['JEPARA'],
      effectiveSite: 'JEPARA',
    })
  })

  it('mempertahankan filter pilihan untuk user multi-site', () => {
    expect(resolveSiteScope(['KLATEN'], ['JEPARA', 'KLATEN'])).toEqual({
      lockedSite: undefined,
      effectiveSites: ['KLATEN'],
      effectiveSite: 'KLATEN',
    })
  })

  it('menggunakan label opsi dan fallback kode yang ramah dibaca', () => {
    expect(
      siteScopeLabel('JEPARA', [{ value: 'JEPARA', label: 'Pabrik Jepara' }])
    ).toBe('Pabrik Jepara')
    expect(siteScopeLabel('SEMARANG')).toBe('Semarang')
  })
})
