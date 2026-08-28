import { describe, expect, it } from 'vitest'
import {
  contractTypeRuleMessage,
  contractEmployeeTypeRuleMessage,
  isContractEmployeeTypeCombinationAllowed,
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

  it.each([
    ['TRAINING', 'TRAINING'],
    ['PKWT', 'BORONGAN'],
    ['PKWT', 'HARIAN'],
    ['PKWTT', 'BULANAN'],
  ])('allows %s contract for %s employee', (contractType, employeeType) => {
    expect(isContractEmployeeTypeCombinationAllowed(contractType, employeeType)).toBe(true)
  })

  it.each([
    ['PKWT', 'TRAINING'],
    ['TRAINING', 'BORONGAN'],
    ['TRAINING', 'HARIAN'],
    ['PKWTT', 'TRAINING'],
  ])('rejects %s contract for %s employee', (contractType, employeeType) => {
    expect(isContractEmployeeTypeCombinationAllowed(contractType, employeeType)).toBe(false)
    expect(contractEmployeeTypeRuleMessage()).toContain('Training')
  })
})
