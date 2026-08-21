export function validateProductionQuantity(value: string, precision: number) {
  const normalized = normalizeProductionQuantity(value)
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized))
    return 'Jumlah wajib berupa angka lebih dari nol.'
  if (Number(normalized) <= 0) return 'Jumlah wajib lebih besar dari nol.'
  const decimals = normalized.split('.')[1]?.length ?? 0
  if (decimals > precision)
    return `Jumlah maksimal memiliki ${precision} angka di belakang koma.`
  return undefined
}

export function normalizeProductionQuantity(value: string) {
  return value.trim().replace(',', '.')
}

export function canUseProductionTerminalSite(
  role: string | undefined,
  siteAccess: string[] | undefined,
  site: string
) {
  return role === 'SUPER_ADMIN' || Boolean(siteAccess?.includes(site))
}
