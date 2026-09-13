import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'

export function resolveSiteScope<TSite extends string>(
  selectedSites?: TSite[],
  siteAccess: readonly string[] = []
) {
  const lockedSite =
    siteAccess.length === 1 ? (siteAccess[0] as TSite) : undefined
  return {
    lockedSite,
    effectiveSites: lockedSite ? [lockedSite] : selectedSites,
    effectiveSite: lockedSite ?? selectedSites?.[0],
  }
}

export function useSiteScopeFilter<TSite extends string>(
  selectedSites?: TSite[]
) {
  const siteAccess = useAuthStore((state) => state.session?.user.siteAccess)

  return useMemo(
    () => resolveSiteScope(selectedSites, siteAccess),
    [selectedSites, siteAccess]
  )
}

export function siteScopeLabel(
  site: string,
  options?: Array<{ value: string; label: string }>
) {
  return (
    options?.find((option) => option.value === site)?.label ??
    `${site.charAt(0)}${site.slice(1).toLowerCase()}`
  )
}
