/** Convert a WIB calendar-day boundary into the UTC DATETIME storage value. */
export function wibDayUtcBoundary(date: string, nextDay = false) {
  const start = new Date(`${date}T00:00:00+07:00`).getTime()
  return new Date(start + (nextDay ? 86_400_000 : 0))
    .toISOString().slice(0, 19).replace('T', ' ')
}

/** Human-readable export timestamp, independent of the host/Excel timezone. */
export function wibExportTimestamp(value: string | null | undefined) {
  if (!value) return ''
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return ''
  return `${new Date(timestamp + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')} WIB`
}
