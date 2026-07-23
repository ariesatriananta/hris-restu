export const requiredContractTypeByEmployeeType = {
  BORONGAN: 'PKWT',
  TRAINING: 'TRAINING',
  BULANAN: 'PKWTT',
} as const

export type SupportedEmployeeType = keyof typeof requiredContractTypeByEmployeeType

export function requiredContractType(employeeType: string) {
  return requiredContractTypeByEmployeeType[
    employeeType as SupportedEmployeeType
  ]
}

export function isContractTypeAllowed(employeeType: string, contractType: string) {
  return requiredContractType(employeeType) === contractType
}

export function contractTypeRuleMessage(employeeType: string) {
  const required = requiredContractType(employeeType)
  return required
    ? `Jenis karyawan ${employeeType} wajib memakai tipe kontrak ${required}.`
    : `Jenis karyawan ${employeeType} belum dapat dibuatkan kontrak baru.`
}
