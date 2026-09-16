export function roundToUnit(value: number, unit: number) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error('Nominal BPJS harus berupa angka nonnegatif.')
  if (!Number.isInteger(unit) || unit < 1)
    throw new Error('Satuan pembulatan BPJS tidak valid.')
  return Math.round(value / unit) * unit
}

export function calculateBpjsPortion(input: {
  wage: number
  rate: number
  enabled: boolean
  ceiling?: number | null
  roundingUnit?: number | null
}) {
  if (!input.enabled) return 0
  const basis = input.ceiling == null ? input.wage : Math.min(input.wage, input.ceiling)
  const amount = basis * input.rate / 100
  return input.roundingUnit ? roundToUnit(amount, input.roundingUnit) : Math.round(amount * 100) / 100
}
