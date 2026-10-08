import { describe, expect, it } from 'vitest'
import { productionBrandInput, productionBrandUpdateInput, productionQcInput } from './production-qc.js'

describe('QC contracts', () => {
  it('accepts optional QC and normalizes Indonesian grams', () => {
    expect(productionQcInput.parse({})).toEqual({ defects: [] })
    expect(productionQcInput.parse({ weight1Grams: '71,29', weight2Grams: '70.05' })).toMatchObject({ weight1Grams: '71.29', weight2Grams: '70.05' })
  })
  it.each(['0','-1','71.291','NaN','100000000'])('rejects invalid grams %s', value => {
    expect(productionQcInput.safeParse({ weight1Grams: value }).success).toBe(false)
  })
  it('permits independent defect counts but rejects duplicates/fractions', () => {
    const defectUid = '11111111-1111-4111-8111-111111111111'
    expect(productionQcInput.safeParse({ defects: [{ defectUid, quantity: 999 }] }).success).toBe(true)
    expect(productionQcInput.safeParse({ defects: [{ defectUid, quantity: 1 },{ defectUid,quantity: 2 }] }).success).toBe(false)
    expect(productionQcInput.safeParse({ defects: [{ defectUid, quantity: 0.1 }] }).success).toBe(false)
  })
  it('server owns stable code and brand site is immutable on update', () => {
    expect(productionBrandInput.parse({ site: 'JEPARA', name: ' Brand ' })).toMatchObject({ name: 'Brand', isActive: true, sortOrder: 0 })
    expect(productionBrandInput.safeParse({ site: 'JEPARA',name: 'Brand',code:'X' }).success).toBe(false)
    expect(productionBrandUpdateInput.safeParse({ name: 'Brand',site:'KLATEN' }).success).toBe(false)
  })
})
