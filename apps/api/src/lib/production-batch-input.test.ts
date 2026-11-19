import { describe, expect, it } from 'vitest'
import {
  batchRandom,
  productionBatchSelection,
  productionBatchRun,
  signProductionBatch,
  readProductionBatch,
  type BatchToken,
} from './production-batch-input.js'

const secret = 'test-secret-for-signed-batch-preview'.repeat(2)
const selection = {
  dateFrom: '2026-11-01',
  dateTo: '2026-11-07',
  site: 'KLATEN' as const,
}
const token: BatchToken = {
  ...selection,
  actor: 'actor-a',
  seed: 'seed',
  hash: 'hash',
  count: 2,
  pairs: 1,
  expires: Date.now() + 60000,
}
describe('Production demo batch policy', () => {
  it('accepts at most seven inclusive dates, rejects reversal, invalid dates and unknown sites', () => {
    expect(productionBatchSelection.safeParse(selection).success).toBe(true)
    for (const invalid of [
      { ...selection, dateTo: '2026-11-08' },
      { ...selection, dateTo: '2026-10-31' },
      { ...selection, dateFrom: '2026-02-30' },
      { ...selection, site: 'OTHER' },
    ])
      expect(productionBatchSelection.safeParse(invalid).success).toBe(false)
  })
  it('requires confirmation, reason and UUID idempotency key on execution', () => {
    const payload = {
      ...selection,
      previewToken: 'token',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      reason: 'Pembuatan data demo',
      confirmation: 'PROSES',
    }
    expect(productionBatchRun.safeParse(payload).success).toBe(true)
    for (const invalid of [
      { ...payload, confirmation: 'YA' },
      { ...payload, reason: 'short' },
      { ...payload, idempotencyKey: 'bad' },
      { ...payload, dateTo: '2026-11-08' },
      { ...payload, reason: 'a'.repeat(401) },
    ])
      expect(productionBatchRun.safeParse(invalid).success).toBe(false)
  })
  it('generates stable bounded random data for the same seed', () => {
    const values = Array.from({ length: 100 }, (_, i) =>
      batchRandom('same', String(i), 601)
    )
    expect(values).toEqual(
      Array.from({ length: 100 }, (_, i) => batchRandom('same', String(i), 601))
    )
    expect(values.every((value) => value >= 0 && value < 601)).toBe(true)
    expect(values).not.toEqual(
      Array.from({ length: 100 }, (_, i) =>
        batchRandom('different', String(i), 601)
      )
    )
  })
  it('binds signed previews to actor and rejects payload tampering', () => {
    const signed = signProductionBatch(token, secret)
    expect(readProductionBatch(signed, secret, 'actor-a')).toEqual(token)
    expect(() => readProductionBatch(signed, secret, 'actor-b')).toThrow()
    expect(() => readProductionBatch(`${signed}x`, secret, 'actor-a')).toThrow()
    expect(() =>
      readProductionBatch(signed, 'other-secret', 'actor-a')
    ).toThrow()
  })
  it('allows a signed expired token only for explicit committed-request recovery', () => {
    const signed = signProductionBatch(
      { ...token, expires: Date.now() - 1000 },
      secret
    )
    expect(() => readProductionBatch(signed, secret, 'actor-a')).toThrow()
    expect(readProductionBatch(signed, secret, 'actor-a', true).count).toBe(2)
  })
})
