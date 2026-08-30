import type { SiteAccess } from '@/features/auth/domain'

const siteNames: Record<SiteAccess, string> = {
  JEPARA: 'Jepara',
  SEMARANG: 'Semarang',
  KLATEN: 'Klaten',
}

export function getUserInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'U'
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
}

export function getSiteName(site: SiteAccess) {
  return siteNames[site]
}
