export function normalizeIdAmount(value: string) {
  const clean = value.replace(/[^\d,.]/g, '')
  if (!clean) return ''
  const comma = clean.lastIndexOf(',')
  const integer =
    (comma >= 0 ? clean.slice(0, comma) : clean).replace(/[.,]/g, '') || '0'
  const decimal =
    comma >= 0
      ? clean
          .slice(comma + 1)
          .replace(/\D/g, '')
          .slice(0, 2)
      : ''
  const normalizedInteger = integer.replace(/^0+(?=\d)/, '') || '0'
  return decimal
    ? `${normalizedInteger}.${decimal.padEnd(2, '0')}`
    : `${normalizedInteger}.00`
}

export function formatIdAmountInput(value: string) {
  const clean = value.replace(/[^\d,]/g, '')
  const [rawInteger = '', rawDecimal] = clean.split(',')
  const integer = rawInteger.replace(/^0+(?=\d)/, '')
  const grouped = integer ? BigInt(integer).toLocaleString('id-ID') : ''
  return rawDecimal === undefined
    ? grouped
    : `${grouped},${rawDecimal.slice(0, 2)}`
}
