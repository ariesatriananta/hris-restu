import { describe, expect, it, vi } from 'vitest'
import { renewalSourceContract } from './contract-lifecycle.js'

describe('renewal source contract', () => {
  it('memakai UID sumber yang tersimpan pada audit renewal', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      [{ id: 8, uid: 'source-audit', coverageEnd: '2026-07-28' }],
    ])

    const source = await renewalSourceContract(
      { query } as never,
      20,
      'renewal-contract',
      15,
      '2026-07-29'
    )

    expect(source).toMatchObject({ uid: 'source-audit' })
    expect(query).toHaveBeenCalledOnce()
  })

  it('memulihkan sumber renewal individual lama hanya bila periodenya bersambung', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [{ id: 8, uid: 'source-fallback', coverageEnd: '2026-07-28' }],
      ])

    const source = await renewalSourceContract(
      { query } as never,
      20,
      'renewal-contract',
      15,
      '2026-07-29'
    )

    expect(source).toMatchObject({ uid: 'source-fallback' })
    expect(String(query.mock.calls[1]?.[0])).toContain(
      "source.status='EXPIRED'"
    )
    expect(String(query.mock.calls[1]?.[0])).toContain(
      'DATE_ADD(source.end_date,INTERVAL 1 DAY)=?'
    )
    expect(query.mock.calls[1]?.[1]).toEqual([15, 20, '2026-07-29'])
  })
})
