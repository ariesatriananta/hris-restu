import { createHash } from 'node:crypto'

export const baseline = '2026-11-23'
export function stableUid(seed) {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = '8'
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}
export function isoDate(value) {
  if (value && typeof value === 'object' && 'result' in value) return isoDate(value.result)
  if (value instanceof Date) return Number.isNaN(+value) ? null : value.toISOString().slice(0, 10)
  if (typeof value === 'number' && value > 0 && value < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10)
  }
  if (typeof value !== 'string') return null
  const m = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!m) return null
  const s = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === s ? s : null
}
function addDay(s, days) {
  return new Date(Date.parse(`${s}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}
function addYear(s) {
  const [year, month, day] = s.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate()
  return new Date(Date.UTC(year + 1, month - 1, Math.min(day, lastDay))).toISOString().slice(0, 10)
}
export function contractChain(start, asOf = baseline) {
  if (!isoDate(start) || start > asOf) throw new Error('Invalid contract start/baseline')
  const result = []
  let from = start
  for (let seq = 1; seq <= 100; seq++) {
    const next = addYear(from)
    const to = addDay(next, -1)
    result.push({ seq, from, to, status: to < asOf ? 'EXPIRED' : 'ACTIVE' })
    if (to >= asOf) return result
    from = next
  }
  throw new Error('Contract history exceeds 100 years')
}
export function encodedNumber(number) {
  const m = number.match(/^P([A-Z]{3})-(\d{2})(\d{2})-(\d{2})(\d{3})$/)
  if (!m) return null
  const date = isoDate(`20${m[2]}-${m[3]}-${m[4]}`)
  const sequence = Number(m[5])
  return date && sequence > 0 ? { prefix: m[1], date, sequence } : null
}
export function primaryNiks(rows) {
  const groups = new Map()
  for (const r of rows) {
    if (!/^\d{16}$/.test(r.rawNik ?? '')) continue
    const group = groups.get(r.rawNik) ?? []
    group.push(r)
    groups.set(r.rawNik, group)
  }
  const result = new Map()
  for (const [nik, group] of groups) {
    const active = group.filter(r => r.status === 'ACTIVE')
    if (active.length > 1) throw new Error('Multiple active employees share NIK; review source rows')
    const winner = active[0] ?? (group.length === 1 ? group[0] : null)
    if (winner) result.set(winner.row, nik)
  }
  return result
}
// Hex literals avoid SQL-mode dependent quote/backslash escaping of personal data.
export function sqlValue(value) {
  if (value === null || value === undefined || value === '') return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Unsafe SQL number')
    return String(value)
  }
  return `CONVERT(X'${Buffer.from(String(value), 'utf8').toString('hex')}' USING utf8mb4)`
}
