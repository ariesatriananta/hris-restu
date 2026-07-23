import type { EmployeeTypeCode } from './domain'

export const requiredContractTypeByEmployeeType: Record<
  EmployeeTypeCode,
  string
> = {
  BORONGAN: 'PKWT',
  TRAINING: 'TRAINING',
  BULANAN: 'PKWTT',
}

export function requiredContractType(employeeType?: EmployeeTypeCode) {
  return employeeType
    ? requiredContractTypeByEmployeeType[employeeType]
    : undefined
}
