import { redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import type { AuthSession } from './domain'

export function canViewProductionWages(
  session: AuthSession | null | undefined
) {
  const roles = [session?.user.role, ...(session?.user.roles ?? [])]
  return roles.includes('SUPER_ADMIN') || roles.includes('HR_OFFICER')
}

// The operational summary remains the entry point for QC and production admins.
export function canAccessProductionTransactionPage(
  session: AuthSession | null | undefined
) {
  if (!session) return false
  if (canViewProductionWages(session)) return true
  const roles = [session.user.role, ...(session.user.roles ?? [])]
  return !roles.some((role) => role === 'QC' || role === 'PRODUCTION_ADMIN')
}

export function requireProductionTransactionPageRole() {
  if (!canAccessProductionTransactionPage(useAuthStore.getState().session)) {
    throw redirect({ to: '/errors/$error', params: { error: 'forbidden' } })
  }
}

export function productionBusinessToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function canReviseProductionDate(
  session: AuthSession | null | undefined,
  businessDate: string,
  today = productionBusinessToday()
) {
  return (
    Boolean(session) &&
    (canViewProductionWages(session) || businessDate === today)
  )
}

export function requireProductionWagesRole() {
  if (!canViewProductionWages(useAuthStore.getState().session)) {
    throw redirect({ to: '/errors/$error', params: { error: 'forbidden' } })
  }
}
