export type BatchContractInput = {
  contractType: 'TRAINING' | 'PKWT' | 'PKWTT'
  startDate: string
  endDate: string
  notes: string
}

export function mergeSharedContractInput(
  current: BatchContractInput,
  shared: BatchContractInput
): BatchContractInput {
  return { ...current, ...shared }
}
