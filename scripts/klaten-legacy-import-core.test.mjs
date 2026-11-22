import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractChain, encodedNumber, primaryNiks, isoDate, sqlValue } from './klaten-legacy-import-core.mjs'

test('12 month chains have no gaps and use exclusive anniversaries', () => {
  assert.deepEqual(contractChain('2025-02-05'), [
    { seq: 1, from: '2025-02-05', to: '2026-02-04', status: 'EXPIRED' },
    { seq: 2, from: '2026-02-05', to: '2027-02-04', status: 'ACTIVE' },
  ])
  assert.equal(contractChain('2026-01-05')[0].to, '2027-01-04')
  assert.equal(contractChain('2025-11-24').length, 1)
  assert.equal(contractChain('2025-11-23').length, 2)
  const leap = contractChain('2024-02-29')
  assert.equal(leap[0].to, '2025-02-27')
  assert.equal(leap[1].from, '2025-02-28')
})
test('only the active employee owns a shared NIK; archive-only conflicts stay raw', () => {
  const rows = [
    { row: 2, rawNik: '0000000000000001', status: 'INACTIVE' },
    { row: 3, rawNik: '0000000000000001', status: 'ACTIVE' },
    { row: 4, rawNik: '0000000000000002', status: 'RESIGNED' },
    { row: 5, rawNik: '0000000000000002', status: 'INACTIVE' },
  ]
  assert.deepEqual([...primaryNiks(rows)], [[3, '0000000000000001']])
  assert.throws(() => primaryNiks([...rows, { ...rows[1], row: 6 }]))
})
test('encoded dates, Excel formula dates and SQL strings are safe', () => {
  assert.deepEqual(encodedNumber('PSLO-2601-05003'), { prefix: 'SLO', date: '2026-01-05', sequence: 3 })
  assert.equal(encodedNumber('LEG-KLT-000001'), null)
  assert.equal(encodedNumber('PSLO-2602-30001'), null)
  assert.equal(isoDate({ result: new Date('2026-01-05T00:00:00Z') }), '2026-01-05')
  assert.equal(isoDate('2026-02-30'), null)
  assert.ok(!sqlValue("a'\\b").includes("a'"))
})
