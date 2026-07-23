import { describe, expect, it } from 'vitest'
import {
  contractTypeRuleMessage,
  isContractTypeAllowed,
  requiredContractType,
} from './employee-contract-policy.js'

describe('employee contract policy', () => {
  it.each([
    ['BORONGAN', 'PKWT'],
    ['TRAINING', 'TRAINING'],
    ['BULANAN', 'PKWTT'],
  ])('allows only %s with %s', (employeeType, contractType) => {
    expect(requiredContractType(employeeType)).toBe(contractType)
    expect(isContractTypeAllowed(employeeType, contractType)).toBe(true)
  })

  it.each(['PROJECT', 'RETAIN', 'OTHER'])('rejects legacy contract type %s for a new Borongan contract', (contractType) => {
    expect(isContractTypeAllowed('BORONGAN', contractType)).toBe(false)
  })

  it('returns an actionable message for unsupported combinations', () => {
    expect(contractTypeRuleMessage('TRAINING')).toContain('TRAINING')
  })
})
