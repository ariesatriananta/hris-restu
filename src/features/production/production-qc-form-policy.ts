import type { ProductionQcInput, ProductionQcOptions } from './domain'

export type ProductionQcDraft = {
  brandUid: string
  weight1: string
  weight2: string
  defects: Record<string, string>
}
export const emptyProductionQc = (): ProductionQcDraft => ({
  brandUid: '',
  weight1: '00,00',
  weight2: '00,00',
  defects: {},
})
export function defaultProductionQc(
  options?: ProductionQcOptions,
  lastBrandUid?: string
) {
  return {
    ...emptyProductionQc(),
    brandUid:
      options?.brands.find((brand) => brand.uid === lastBrandUid)?.uid ??
      options?.brands[0]?.uid ??
      '',
  }
}
export function formatQcWeight(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return '00,00'
  // Format only valid precision; never silently round a mistyped sample.
  if (!/^\d{1,8}(?:\.\d{0,2})?$/.test(normalized)) return value
  return Number(normalized).toFixed(2).replace('.', ',').padStart(5, '0')
}
export function maskQcWeight(value: string) {
  const normalized = value.replace('.', ',').replace(/[^\d,]/g, '')
  const separator = normalized.indexOf(',')
  if (separator >= 0) {
    const whole = normalized.slice(0, separator).slice(0, 2)
    const fraction = normalized
      .slice(separator + 1)
      .replace(/,/g, '')
      .slice(0, 2)
    return `${whole},${fraction}`
  }
  const digits = normalized.slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)},${digits.slice(2)}` : digits
}
export function productionQcDraftSignature(draft: ProductionQcDraft) {
  const decimal = (value: string) => {
    const raw = value.trim().replace(',', '.')
    return raw && Number.isFinite(Number(raw)) ? Number(raw) : raw
  }
  return JSON.stringify({
    brandUid: draft.brandUid,
    weight1: decimal(draft.weight1),
    weight2: decimal(draft.weight2),
    defects: Object.entries(draft.defects)
      .map(([uid, value]) => [uid, decimal(value) === '' ? 0 : decimal(value)])
      .filter(([, value]) => value !== 0)
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  })
}
export const isLintingJob = (code?: string) => code === 'BORONGAN-LINTING'
export function validateQcWeight(value: string) {
  const normalized = value.trim().replace(',', '.')
  return (
    /^\d+(?:\.\d{1,2})?$/.test(normalized) &&
    Number(normalized) > 0 &&
    Number(normalized) <= 99.99
  )
}
export function validateProductionQc(
  draft: ProductionQcDraft,
  options?: ProductionQcOptions
): string | undefined {
  if (!options?.brands.length)
    return 'Brand aktif untuk site ini belum tersedia. Hubungi pengelola master Brand Produksi.'
  if (!options.brands.some((item) => item.uid === draft.brandUid))
    return 'Pilih brand terlebih dahulu.'
  if (!validateQcWeight(draft.weight1) || !validateQcWeight(draft.weight2))
    return 'Isi kedua berat dengan angka positif maksimal dua desimal.'
  if (
    options.defects.some((item) => {
      // Empty while focused is still zero; only actual invalid counts block save.
      const value = draft.defects[item.uid]?.trim() || '0'
      return !/^\d+$/.test(value) || Number(value) > 4294967295
    })
  )
    return 'Jumlah defect harus bilangan bulat tidak negatif.'
}
export function productionQcPayload(
  draft: ProductionQcDraft,
  options: ProductionQcOptions
): ProductionQcInput {
  return {
    brandUid: draft.brandUid,
    weight1Grams: draft.weight1.trim().replace(',', '.'),
    weight2Grams: draft.weight2.trim().replace(',', '.'),
    defects: options.defects.map((item) => ({
      defectUid: item.uid,
      quantity: Number(draft.defects[item.uid] ?? '0'),
    })),
  }
}
