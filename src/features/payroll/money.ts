export function formatDecimalString(
  value: string | number,
  options: { currency?: boolean; maximumFractionDigits?: number } = {}
) {
  const raw = String(value).trim()
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw)
  if (!match) return options.currency ? 'Rp 0' : '0'
  const negative = match[1] === '-'
  const integer = BigInt(match[2] ?? '0').toLocaleString('id-ID')
  const limit = options.maximumFractionDigits ?? 2
  const fraction = (match[3] ?? '').slice(0, limit).replace(/0+$/, '')
  const number = `${negative ? '-' : ''}${integer}${fraction ? `,${fraction}` : ''}`
  return options.currency ? `Rp ${number}` : number
}
