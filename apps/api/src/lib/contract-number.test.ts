import { describe, expect, it } from 'vitest'
import {
  acquireContractNumberLock,
  canPreserveContractNumberSequence,
  contractNumberSiteFromSnapshot,
  contractNumberSiteSegment,
  formatContractNumber,
  nextContractNumberSequence,
  parseContractNumber,
  releaseContractNumberLock,
} from './contract-number.js'

describe('contract number', () => {
  it.each([
    ['SEMARANG', 'RSIASMG-HR'],
    ['KLATEN', 'RSIASLO-HR'],
    ['JEPARA', 'RSIAKDS-HR'],
  ])('maps site %s to %s', (site, segment) => {
    expect(contractNumberSiteSegment(site)).toBe(segment)
  })

  it('keeps the historical contract site from its snapshot', () => {
    expect(contractNumberSiteFromSnapshot('Site Jepara', 'SEMARANG')).toBe('JEPARA')
    expect(contractNumberSiteFromSnapshot('RSIASLO-HR', 'SEMARANG')).toBe('KLATEN')
    expect(contractNumberSiteFromSnapshot(null, 'SEMARANG')).toBe('SEMARANG')
  })

  it.each([
    ['2026-01-01', 'I'],
    ['2026-04-30', 'IV'],
    ['2026-08-21', 'VIII'],
    ['2026-12-31', 'XII'],
  ])('uses the Roman month from %s', (startDate, romanMonth) => {
    expect(formatContractNumber('PKWT', 'SEMARANG', 7, startDate)).toBe(
      `PKWT/RSIASMG-HR/007/${romanMonth}/2026`
    )
  })

  it('pads to at least three digits without truncating larger sequences', () => {
    expect(formatContractNumber('PKWT', 'KLATEN', 8, '2026-08-01')).toBe(
      'PKWT/RSIASLO-HR/008/VIII/2026'
    )
    expect(formatContractNumber('PKWT', 'KLATEN', 1234, '2026-08-01')).toBe(
      'PKWT/RSIASLO-HR/1234/VIII/2026'
    )
  })

  it('preserves an allocated sequence only inside the same site-month bucket', () => {
    const number = 'PKWT/RSIAKDS-HR/021/VIII/2026'
    expect(canPreserveContractNumberSequence(number, 'JEPARA', '2026-08-31')).toBe(21)
    expect(canPreserveContractNumberSequence(number, 'JEPARA', '2026-09-01')).toBeUndefined()
    expect(canPreserveContractNumberSequence(number, 'SEMARANG', '2026-08-31')).toBeUndefined()
  })

  it('finds the next sequence only within the requested site-month', async () => {
    const conn = {
      query: async () => [[
        { contractNumber: 'PKWT/RSIASMG-HR/007/VIII/2026' },
        { contractNumber: 'PKWT/RSIASMG-HR/011/VIII/2026' },
        { contractNumber: 'PKWT/RSIASLO-HR/099/VIII/2026' },
        { contractNumber: 'PKWT/RSIASMG-HR/099/IX/2026' },
        { contractNumber: 'PKWT-LEGACY-01' },
      ]],
    }
    await expect(nextContractNumberSequence(conn as never, 'SEMARANG', '2026-08-05')).resolves.toBe(12)
  })

  it('parses the generated contract number', () => {
    expect(parseContractNumber('PKWT/RSIASMG-HR/007/VIII/2026')).toEqual({
      contractType: 'PKWT',
      siteSegment: 'RSIASMG-HR',
      sequence: 7,
      romanMonth: 'VIII',
      year: 2026,
    })
  })

  it('uses a shared database lock around number allocation', async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = []
    const conn = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values })
        return [[sql.includes('GET_LOCK') ? { acquired: 1 } : { released: 1 }]]
      },
    }
    await acquireContractNumberLock(conn as never)
    await releaseContractNumberLock(conn as never)
    expect(calls).toEqual([
      { sql: 'SELECT GET_LOCK(?, 10) acquired', values: ['hris:employee-contract-number'] },
      { sql: 'SELECT RELEASE_LOCK(?) released', values: ['hris:employee-contract-number'] },
    ])
  })
})
