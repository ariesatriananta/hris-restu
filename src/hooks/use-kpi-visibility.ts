import { useCallback, useState } from 'react'

export function useKpiVisibility(pageKey: string) {
  const storageKey = `hris-rsia-${pageKey}-kpi-visible-v1`
  const [showKpi, setVisible] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return localStorage.getItem(storageKey) !== 'false'
    } catch {
      return true
    }
  })
  const setShowKpi = useCallback(
    (visible: boolean) => {
      setVisible(visible)
      try {
        localStorage.setItem(storageKey, JSON.stringify(visible))
      } catch {
        // A browser storage restriction must not interrupt the page.
      }
    },
    [storageKey]
  )
  return { showKpi, setShowKpi }
}
