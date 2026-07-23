/**
 * Captures the exact list URL, including its table search params, before a
 * user opens a record. The target route can then send the user back to the
 * same filtered list.
 */
export function currentListReturnTo() {
  if (typeof window === 'undefined') return undefined
  return `${window.location.pathname}${window.location.search}`
}

/**
 * Return links must stay on this application origin. This prevents a URL
 * query parameter from becoming an open redirect while keeping the helper
 * reusable for every module's data table.
 */
export function safeInternalReturnTo(
  returnTo: string | undefined,
  fallback: string
) {
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//')) return fallback

  const origin =
    typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const target = new URL(returnTo, origin)
  if (target.origin !== origin) return fallback

  return `${target.pathname}${target.search}${target.hash}`
}

export function returnToLabel(returnTo: string, fallback: string) {
  const pathname = new URL(returnTo, 'http://localhost').pathname
  const labels: Record<string, string> = {
    '/karyawan/data-karyawan': 'Data Karyawan',
    '/karyawan/riwayat-mutasi': 'Riwayat Mutasi',
    '/karyawan/pkwt-dokumen': 'PKWT & Dokumen',
  }

  return labels[pathname] ?? fallback
}
