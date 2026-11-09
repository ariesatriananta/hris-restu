import { redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import type { AuthSession } from './domain'

export function isQcSession(session: AuthSession | null | undefined) {
  return (
    session?.user.role === 'QC' || session?.user.roles?.includes('QC') === true
  )
}

export function requireNonQcRole() {
  if (isQcSession(useAuthStore.getState().session)) {
    throw redirect({ to: '/errors/$error', params: { error: 'forbidden' } })
  }
}
