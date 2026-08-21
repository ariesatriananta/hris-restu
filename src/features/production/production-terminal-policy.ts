export function validateProductionQuantity(value: string, precision: number) {
  const normalized = normalizeProductionDecimalInput(value)
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized))
    return 'Jumlah wajib berupa angka lebih dari nol.'
  if (Number(normalized) <= 0) return 'Jumlah wajib lebih besar dari nol.'
  const decimals = normalized.split('.')[1]?.length ?? 0
  if (decimals > precision)
    return `Jumlah maksimal memiliki ${precision} angka di belakang koma.`
  return undefined
}

export function normalizeProductionQuantity(value: string) {
  return normalizeProductionDecimalInput(value)
}

export function normalizeProductionDecimalInput(value: string) {
  return value.trim().replace(',', '.')
}

export function formatProductionQuantityInput(
  value: string,
  decimalPrecision: number
) {
  return formatProductionDecimalInput(value, decimalPrecision)
}

export function formatProductionDecimalInput(
  value: string,
  decimalPrecision = 4
) {
  const normalized = normalizeProductionDecimalInput(value)
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized)
  if (!match) return normalized

  const precision = Math.max(0, Math.trunc(decimalPrecision))
  const fraction = match[2] ?? ''
  const discardedFraction = fraction.slice(precision)

  // Jangan membulatkan atau membuang nilai pecahan yang bermakna. Biarkan
  // validator menandainya bila data melebihi presisi satuan.
  if (/[1-9]/.test(discardedFraction)) return normalized

  const visibleFraction = fraction.slice(0, precision).replace(/0+$/, '')
  return visibleFraction ? `${match[1]}.${visibleFraction}` : match[1]
}

export function canUseProductionTerminalSite(
  role: string | undefined,
  siteAccess: string[] | undefined,
  site: string
) {
  return role === 'SUPER_ADMIN' || Boolean(siteAccess?.includes(site))
}
