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

export function addDecimalStrings(...values: string[]) {
  const total = values.reduce((sum, value) => {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
    if (!match) return sum
    const fraction = (match[3] ?? '').padEnd(2, '0')
    const cents = BigInt(match[2] ?? '0') * 100n + BigInt(fraction || '0')
    return sum + (match[1] === '-' ? -cents : cents)
  }, 0n)
  const negative = total < 0n
  const absolute = negative ? -total : total
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}
