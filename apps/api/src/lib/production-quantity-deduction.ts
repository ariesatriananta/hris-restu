export const LINTING_JOB_CODE = 'BORONGAN-LINTING'

const POWERS_OF_TEN = [1n, 10n, 100n, 1_000n, 10_000n] as const

function scaledInteger(value: string, precision: number) {
  const normalized = value.trim()
  if (!/^\d+(\.\d{1,4})?$/.test(normalized)) {
    throw new Error('Nilai desimal tidak valid.')
  }
  const [whole, fraction = ''] = normalized.split('.')
  return BigInt(`${whole}${fraction.padEnd(precision, '0').slice(0, precision)}`)
}

function decimal(value: bigint, precision: number) {
  if (precision === 0) return value.toString()
  const scale = POWERS_OF_TEN[precision]
  return `${value / scale}.${String(value % scale).padStart(precision, '0')}`
}

/** Half-up deduction over the cumulative daily raw quantity. */
export function cumulativeDeductionQuantity(
  rawQuantity: string,
  percentage: string,
  unitPrecision: number
) {
  if (!Number.isInteger(unitPrecision) || unitPrecision < 0 || unitPrecision > 4) {
    throw new Error('Presisi satuan tidak valid.')
  }
  const raw = scaledInteger(rawQuantity, 4)
  const percentageScaled = scaledInteger(percentage, 4)
  if (percentageScaled < 0n || percentageScaled > 1_000_000n) {
    throw new Error('Persentase harus berada antara 0 dan 100.')
  }
  // raw has 4 decimals and percentage has 4 decimals. Divide by 100 * 10^4,
  // then round once to the work-unit precision.
  const divisor = 1_000_000n * POWERS_OF_TEN[4 - unitPrecision]
  const numerator = raw * percentageScaled
  const rounded = (numerator + divisor / 2n) / divisor
  return decimal(rounded, unitPrecision)
}

export type DailyDeductionAllocation = {
  rawQuantity: string
  deductionQuantity: string
  payableQuantity: string
}

/**
 * Allocates a daily deduction deterministically in transaction order. It uses
 * cumulative deltas, so splitting one daily result into multiple deposits
 * never changes the final deducted quantity.
 */
export function allocateDailyQuantityDeduction(
  quantities: string[],
  percentage: string,
  unitPrecision: number
): DailyDeductionAllocation[] {
  let cumulativeRaw = 0n
  let cumulativeDeduction = 0n
  return quantities.map((quantity) => {
    const raw = scaledInteger(quantity, 4)
    cumulativeRaw += raw
    const cumulativeRawText = decimal(cumulativeRaw, 4)
    const totalDeductionText = cumulativeDeductionQuantity(
      cumulativeRawText,
      percentage,
      unitPrecision
    )
    const totalDeduction = scaledInteger(totalDeductionText, 4)
    const rowDeduction = totalDeduction - cumulativeDeduction
    cumulativeDeduction = totalDeduction
    const payable = raw - rowDeduction
    if (payable < 0n) throw new Error('Potongan melebihi kuantitas Produksi.')
    return {
      rawQuantity: decimal(raw, 4),
      deductionQuantity: decimal(rowDeduction, 4),
      payableQuantity: decimal(payable, 4),
    }
  })
}
