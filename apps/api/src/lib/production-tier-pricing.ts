import { ApiError } from './errors.js'
import { calculateGrossAmount, normalizeStoredDecimal } from './production-transaction-policy.js'

export type ProductionRateTier = {
  id: number | null
  minQuantity: string
  rateAmount: string
}

export type ProductionTierSlice = {
  tierId: number | null
  minQuantitySnapshot: string
  quantity: string
  rateSnapshot: string
  amount: string
}

function scaled(value: string) {
  const normalized = normalizeStoredDecimal(value)
  const match = /^(\d+)\.(\d{4})$/.exec(normalized)
  if (!match) throw new ApiError(422, 'Kuantitas tarif Produksi tidak valid.')
  return BigInt(match[1] + match[2])
}

function decimal(value: bigint) {
  return `${value / 10000n}.${String(value % 10000n).padStart(4, '0')}`
}

/** Allocate only the marginal quantity above each daily threshold to its new rate. */
export function priceProductionTiers(
  startingQuantity: string,
  quantity: string,
  tiers: ProductionRateTier[]
) {
  if (!tiers.length) throw new ApiError(422, 'Tarif Produksi belum tersedia.')
  const start = scaled(startingQuantity)
  const end = start + scaled(quantity)
  if (end <= start) throw new ApiError(422, 'Kuantitas Produksi harus lebih besar dari nol.')
  const sorted = [...tiers].sort((a, b) =>
    scaled(a.minQuantity) < scaled(b.minQuantity) ? -1 : 1
  )
  if (scaled(sorted[0].minQuantity) !== 10000n) {
    throw new ApiError(422, 'Tarif dasar pekerjaan harus dimulai dari satu PCS.')
  }
  const slices: ProductionTierSlice[] = []
  let totalCents = 0n
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i]
    const lower = i === 0 ? 0n : scaled(tier.minQuantity) - 10000n
    const upper = sorted[i + 1]
      ? scaled(sorted[i + 1].minQuantity) - 10000n
      : end
    const overlap = (end < upper ? end : upper) - (start > lower ? start : lower)
    if (overlap <= 0n) continue
    const sliceQuantity = decimal(overlap)
    const amount = calculateGrossAmount(sliceQuantity, normalizeStoredDecimal(tier.rateAmount))
    slices.push({
      tierId: tier.id,
      minQuantitySnapshot: normalizeStoredDecimal(tier.minQuantity),
      quantity: sliceQuantity,
      rateSnapshot: normalizeStoredDecimal(tier.rateAmount),
      amount,
    })
    totalCents += BigInt(amount.replace('.', ''))
  }
  if (slices.reduce((sum, slice) => sum + scaled(slice.quantity), 0n) !== end - start) {
    throw new ApiError(422, 'Tingkat tarif Produksi tidak menutup seluruh kuantitas.')
  }
  return {
    slices,
    grossAmount: `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, '0')}`,
  }
}
