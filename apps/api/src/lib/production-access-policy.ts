import type { AuthContext } from '../middleware/authenticate.js'
import { ApiError } from './errors.js'

export const canViewProductionWages = (auth: AuthContext) =>
  auth.roles.some((role) => role === 'HR_OFFICER' || role === 'SUPER_ADMIN')

export function canReviseProductionDate(auth: AuthContext, date: string) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return (
    canViewProductionWages(auth) ||
    (/^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today)
  )
}

export function assertProductionRevisionDate(auth: AuthContext, date: string) {
  if (!canReviseProductionDate(auth, date)) {
    throw new ApiError(
      403,
      'Koreksi dan void transaksi sebelum hari ini hanya boleh dilakukan HR atau Superadmin.'
    )
  }
}

// Quantities, adjustment percentages and QC measurements remain operational data.
// Strip financial containers as well as individual monetary values, including
// immutable revision snapshots. Never modify the internal pricing/audit object.
const financialKey =
  /amount|gross|earnings|salary|wage|price|tarif|upah|currency|^rate|^tiers$/
const jsonSnapshotKey =
  /^(?:before|after|beforedata|afterdata|snapshot|datasnapshot|requestsnapshot)$/

export function redactProductionFinancials<T>(value: T, auth: AuthContext): T {
  if (canViewProductionWages(auth)) return value
  const visit = (item: unknown, key = ''): unknown => {
    if (Array.isArray(item)) return item.map((entry) => visit(entry))
    if (item && typeof item === 'object' && !(item instanceof Date)) {
      return Object.fromEntries(
        Object.entries(item).flatMap(([name, child]) => {
          const normalized = name.replace(/[_-]/g, '').toLowerCase()
          return financialKey.test(normalized)
            ? []
            : [[name, visit(child, normalized)]]
        })
      )
    }
    if (typeof item === 'string' && jsonSnapshotKey.test(key)) {
      try {
        const parsed: unknown = JSON.parse(item)
        if (parsed && typeof parsed === 'object')
          return JSON.stringify(visit(parsed))
      } catch {
        /* Historical free text is preserved. */
      }
    }
    return item
  }
  return visit(value) as T
}
