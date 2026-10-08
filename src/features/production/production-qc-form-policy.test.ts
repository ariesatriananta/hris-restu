import { describe, expect, it } from 'vitest'
import {
  emptyProductionQc,
  defaultProductionQc,
  formatQcWeight,
  maskQcWeight,
  productionQcDraftSignature,
  isLintingJob,
  productionQcPayload,
  validateProductionQc,
  validateQcWeight,
} from './production-qc-form-policy'

const options = {
  brands: [{ uid: 'brand', code: 'BR-1', name: 'Brand A', sortOrder: 0 }],
  defects: [{ uid: 'defect', code: 'DF-1', name: 'Defect A', sortOrder: 0 }],
}
describe('QC form policy', () => {
  it('requires only an active site brand for other jobs and omits stale Linting metadata', () => {
    const draft = {
      ...emptyProductionQc(),
      brandUid: 'brand',
      weight1: '71,29',
      defects: { defect: '10' },
    }
    expect(validateProductionQc(draft, options, false)).toBeUndefined()
    expect(productionQcPayload(draft, options, false)).toEqual({
      brandUid: 'brand',
      defects: [],
    })
    expect(
      validateProductionQc({ ...draft, brandUid: '' }, options, false)
    ).toBeTruthy()
  })
  it.each([
    ['8132', '81,32'],
    ['71,29', '71,29'],
    ['7005', '70,05'],
    ['', ''],
    ['5', '5'],
    ['80', '80'],
    ['813', '81,3'],
    ['70.05', '70,05'],
  ])('masks %s as %s', (input, output) => {
    expect(maskQcWeight(input)).toBe(output)
  })
  it('does not treat formatting or focused zero as changed QC on a retry', () => {
    const draft = {
      ...emptyProductionQc(),
      brandUid: 'brand',
      weight1: '71',
      weight2: '70,05',
      defects: { defect: '0' },
    }
    expect(
      productionQcDraftSignature({
        ...draft,
        weight1: '71,00',
        defects: { defect: '' },
      })
    ).toBe(productionQcDraftSignature(draft))
    expect(
      productionQcDraftSignature({ ...draft, defects: { defect: '1' } })
    ).not.toBe(productionQcDraftSignature(draft))
  })
  it('defaults to last active brand on this terminal, otherwise the first available option', () => {
    const multiple = {
      ...options,
      brands: [
        ...options.brands,
        { uid: 'brand-last', code: 'BR-2', name: 'Brand B', sortOrder: 1 },
      ],
    }
    expect(defaultProductionQc(multiple, 'brand-last').brandUid).toBe(
      'brand-last'
    )
    expect(defaultProductionQc(multiple).brandUid).toBe('brand')
    expect(
      defaultProductionQc(multiple, 'inactive-or-other-site').brandUid
    ).toBe('brand')
    expect(defaultProductionQc({ brands: [], defects: [] }).brandUid).toBe('')
  })
  it.each([
    ['', '00,00'],
    ['71', '71,00'],
    ['71.2', '71,20'],
    ['70,05', '70,05'],
    ['0,15', '00,15'],
    ['71,', '71,00'],
    ['1.234', '1.234'],
  ])(
    'formats weight %s as %s without rounding excess precision',
    (input, output) => {
      expect(formatQcWeight(input)).toBe(output)
    }
  )
  it('requires explicit brand and two valid weights only for Linting', () => {
    expect(isLintingJob('BORONGAN-LINTING')).toBe(true)
    expect(isLintingJob('BORONGAN-SLOP')).toBe(false)
    expect(validateProductionQc(emptyProductionQc(), options)).toBeTruthy()
    expect(
      validateProductionQc(
        {
          ...emptyProductionQc(),
          brandUid: 'brand',
          weight1: '71,29',
          weight2: '70.05',
        },
        options
      )
    ).toBeUndefined()
  })
  it('accepts comma or dot and rejects zero, negative, excess decimals and database overflow', () => {
    for (const weight of ['71,29', '70.05', '1', '0,01'])
      expect(validateQcWeight(weight)).toBe(true)
    for (const weight of ['', '0', '-1', '1.123', '1,2.3', '100000000', '100'])
      expect(validateQcWeight(weight)).toBe(false)
  })
  it('keeps defects informational, defaults to zero and normalizes payload', () => {
    const draft = {
      ...emptyProductionQc(),
      brandUid: 'brand',
      weight1: '71,29',
      weight2: '70,05',
      defects: { defect: '900' },
    }
    expect(validateProductionQc(draft, options)).toBeUndefined()
    expect(productionQcPayload(draft, options)).toEqual({
      brandUid: 'brand',
      weight1Grams: '71.29',
      weight2Grams: '70.05',
      defects: [{ defectUid: 'defect', quantity: 900 }],
    })
    expect(
      productionQcPayload({ ...draft, defects: {} }, options).defects[0]
        .quantity
    ).toBe(0)
  })
  it('rejects stale brand and negative or fractional defect values', () => {
    const draft = {
      ...emptyProductionQc(),
      brandUid: 'brand',
      weight1: '1',
      weight2: '2',
    }
    expect(validateProductionQc(draft, { ...options, brands: [] })).toContain(
      'belum tersedia'
    )
    expect(
      validateProductionQc({ ...draft, brandUid: 'another-site' }, options)
    ).toBeTruthy()
    for (const quantity of ['-1', '1.2', '4294967296', 'abc'])
      expect(
        validateProductionQc(
          { ...draft, defects: { defect: quantity } },
          options
        )
      ).toBeTruthy()
  })
  it('treats a temporarily empty defect field as zero without weakening weight validation', () => {
    const draft = {
      ...emptyProductionQc(),
      brandUid: 'brand',
      weight1: '71,29',
      weight2: '70,05',
      defects: { defect: '' },
    }
    expect(validateProductionQc(draft, options)).toBeUndefined()
    expect(productionQcPayload(draft, options).defects[0].quantity).toBe(0)
    expect(validateProductionQc({ ...draft, weight1: '' }, options)).toContain(
      'kedua berat'
    )
  })
})
