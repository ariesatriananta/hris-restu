import type { ReactNode } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { canViewProductionWages } from '@/features/auth/production-access'

export function ProductionWages({ children }: { children: ReactNode }) {
  const session = useAuthStore((state) => state.session)
  return canViewProductionWages(session) ? children : null
}
