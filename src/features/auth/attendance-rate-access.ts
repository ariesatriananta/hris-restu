import { redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import type { AuthSession } from './domain'

// Keep aligned with the Attendance Rate API, including mixed-role QC restrictions.
export function canAccessAttendanceRate(
  session: AuthSession | null | undefined
) {
  if (!session) return false
  const roles = [session.user.role, ...(session.user.roles ?? [])]
  if (roles.includes('SUPER_ADMIN')) return true
  return (
    !roles.includes('QC') &&
    roles.includes('HR_OFFICER') &&
    session.permissions.includes('attendance.view') &&
    session.permissions.includes('production.view')
  )
}

export function requireAttendanceRateAccess() {
  if (!canAccessAttendanceRate(useAuthStore.getState().session)) {
    throw redirect({ to: '/errors/$error', params: { error: 'forbidden' } })
  }
}
