export const selectableContractTypes = ['TRAINING', 'PKWT', 'PKWTT'] as const

export type SelectableContractType = (typeof selectableContractTypes)[number]

export function isContractTypeAllowed(contractType: string) {
  return selectableContractTypes.includes(contractType as SelectableContractType)
}

export function contractTypeRuleMessage() {
  return 'Jenis kontrak hanya dapat dipilih dari Training, PKWT, atau PKWTT.'
}

export const payrollEmployeeTypes = ['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'] as const
export type PayrollEmployeeType = (typeof payrollEmployeeTypes)[number]

export function isContractEmployeeTypeCombinationAllowed(
  contractType: string,
  employeeType: string
) {
  if (employeeType === 'TRAINING') return contractType === 'TRAINING'
  if (['BORONGAN', 'HARIAN', 'BULANAN'].includes(employeeType)) {
    return contractType === 'PKWT' || contractType === 'PKWTT'
  }
  return false
}

export function contractEmployeeTypeRuleMessage() {
  return 'Kombinasi kontrak dan jenis karyawan tidak sesuai. Training wajib memakai kontrak Training; Borongan, Harian, dan Bulanan wajib memakai PKWT atau PKWTT.'
}
