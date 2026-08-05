export const selectableContractTypes = ['TRAINING', 'PKWT', 'PKWTT'] as const

export type SelectableContractType = (typeof selectableContractTypes)[number]

export function isSelectableContractType(
  contractType?: string
): contractType is SelectableContractType {
  return selectableContractTypes.includes(
    contractType as SelectableContractType
  )
}

export function contractTypeRequiresEndDate(contractType?: string) {
  return contractType === 'TRAINING' || contractType === 'PKWT'
}
