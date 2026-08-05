export const selectableContractTypes = ['TRAINING', 'PKWT', 'PKWTT'] as const

export type SelectableContractType = (typeof selectableContractTypes)[number]

export function isContractTypeAllowed(contractType: string) {
  return selectableContractTypes.includes(contractType as SelectableContractType)
}

export function contractTypeRuleMessage() {
  return 'Jenis kontrak hanya dapat dipilih dari Training, PKWT, atau PKWTT.'
}
