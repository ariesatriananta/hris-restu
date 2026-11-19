import type { PoolConnection } from 'mysql2/promise'
import { describe, it, expect, vi } from 'vitest'
import {
  resolveCorrectionQc,
  correctionQcSignature,
  correctionQcOptions,
  publicCorrectionQc,
} from './production-correction-qc.js'
import { productionQcInput } from './production-qc.js'

const brandUid = '11111111-1111-4111-8111-111111111111'
const defectUid = '22222222-2222-4222-8222-222222222222'
const newUid = '33333333-3333-4333-8333-333333333333'
function database() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT qc.id,brand.uid'))
      return [
        [
          {
            id: 5,
            brandUid,
            brandCode: 'BR-OLD',
            brandName: 'Snapshot brand',
            weight1Grams: '71.00',
            weight2Grams: '72.00',
          },
        ],
      ]
    if (sql.includes('SELECT defect.uid,detail.'))
      return [
        [
          {
            uid: defectUid,
            code: 'DF-OLD',
            name: 'Snapshot defect',
            sortOrder: 8,
            quantity: 2,
          },
        ],
      ]
    if (sql.includes('SELECT brand.id FROM')) return [[{ id: 6 }]]
    if (sql.includes('SELECT defect.id,defect.uid'))
      return [[{ id: 7, uid: defectUid }]]
    if (sql.includes('production_brands') || sql.includes('production_defects'))
      return [[]]
    throw new Error('Unexpected query')
  })
  return { query, conn: { query } as unknown as PoolConnection }
}
const input = () =>
  productionQcInput.parse({
    brandUid,
    weight1Grams: '73',
    weight2Grams: '72',
    defects: [{ defectUid, quantity: 4 }],
  })
describe('correction QC snapshots', () => {
  it('retains inactive source snapshots while editing measurements', async () => {
    const db = database()
    const result = await resolveCorrectionQc(
      db.conn,
      12,
      2,
      'BORONGAN-LINTING',
      input(),
      true
    )
    expect(result.changed).toBe(true)
    expect(result.resolved).toMatchObject({
      brand: { id: 6, name: 'Snapshot brand' },
      weight1Grams: '73.00',
      defects: [{ id: 7, name: 'Snapshot defect', quantity: 4, sortOrder: 8 }],
    })
    expect(JSON.stringify(publicCorrectionQc(result.resolved))).not.toMatch(
      /"id":/
    )
    expect(
      db.query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))
    ).toBe(true)
  })
  it('includes retained inactive snapshots in options', async () => {
    const db = database()
    const result = await correctionQcOptions(db.conn, 12, 2)
    expect(result.brands).toMatchObject([
      { uid: brandUid, name: 'Snapshot brand' },
    ])
    expect(result.defects).toMatchObject([
      { uid: defectUid, name: 'Snapshot defect' },
    ])
  })
  it.each(['brand', 'defect'])('rejects a new inactive %s', async (field) => {
    const db = database()
    const qc = input()
    if (field === 'brand') qc.brandUid = newUid
    else qc.defects = [{ defectUid: newUid, quantity: 1 }]
    await expect(
      resolveCorrectionQc(db.conn, 12, 2, 'BORONGAN-LINTING', qc)
    ).rejects.toMatchObject({ status: 422 })
  })
  it('detects unchanged values and normalizes grams and zero defects for replay', async () => {
    const db = database()
    const qc = productionQcInput.parse({
      brandUid,
      weight1Grams: '71',
      weight2Grams: '72',
      defects: [{ defectUid, quantity: 2 }],
    })
    expect(
      (await resolveCorrectionQc(db.conn, 12, 2, 'BORONGAN-LINTING', qc))
        .changed
    ).toBe(false)
    expect(
      correctionQcSignature({
        ...qc,
        defects: [{ defectUid: newUid, quantity: 0 }, ...qc.defects],
      })
    ).toBe(correctionQcSignature(qc))
  })
  it('supports explicit clearing', async () => {
    const db = database()
    const result = await resolveCorrectionQc(
      db.conn,
      12,
      2,
      'BORONGAN-LINTING',
      productionQcInput.parse({})
    )
    expect(result.resolved).toBeNull()
    expect(result.changed).toBe(true)
  })
  it('rejects weights and defects outside Linting', async () => {
    const db = database()
    await expect(
      resolveCorrectionQc(db.conn, 12, 2, 'BORONGAN-PACKING', input())
    ).rejects.toMatchObject({ status: 422 })
  })
})
