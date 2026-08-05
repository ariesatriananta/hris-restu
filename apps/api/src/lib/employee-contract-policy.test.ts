import { describe, expect, it } from 'vitest'
import {
  contractTypeRuleMessage,
  isContractTypeAllowed,
} from './employee-contract-policy.js'

describe('employee contract policy', () => {
  it.each(['TRAINING', 'PKWT', 'PKWTT'])(
    'allows supported contract type %s',
    (contractType) => {
      expect(isContractTypeAllowed(contractType)).toBe(true)
    }
  )

  it.each(['PROJECT', 'RETAIN', 'OTHER'])(
    'rejects unsupported contract type %s',
    (contractType) => {
      expect(isContractTypeAllowed(contractType)).toBe(false)
    }
  )

  it('returns an actionable message for unsupported contract types', () => {
    expect(contractTypeRuleMessage()).toContain('PKWTT')
  })
})
