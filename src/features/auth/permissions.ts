import { redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import type { AuthSession, PermissionCode } from './domain'

export function hasPermission(
  session: AuthSession | null | undefined,
  permission: PermissionCode
) {
  return (
    session?.user.role === 'SUPER_ADMIN' ||
    session?.permissions.includes(permission) === true
  )
}

export function hasAnyPermission(
  session: AuthSession | null | undefined,
  permissions: readonly PermissionCode[]
) {
  return permissions.some((permission) => hasPermission(session, permission))
}

export function requirePermission(permission: PermissionCode) {
  if (!hasPermission(useAuthStore.getState().session, permission)) {
    throw redirect({
      to: '/errors/$error',
      params: { error: 'forbidden' },
    })
  }
}

export function requireAnyPermission(permissions: readonly PermissionCode[]) {
  if (!hasAnyPermission(useAuthStore.getState().session, permissions)) {
    throw redirect({
      to: '/errors/$error',
      params: { error: 'forbidden' },
    })
  }
}
