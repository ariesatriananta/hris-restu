import { describe, expect, it, vi } from 'vitest'
import type { AuthSession } from './domain'
import { isQcSession, requireNonQcRole } from './qc-access'

const { state } = vi.hoisted(() => ({
  state: { session: null as AuthSession | null },
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => state },
}))

function session(role: AuthSession['user']['role']): AuthSession {
  return {
    user: {
      uid: 'user',
      name: 'User',
      email: null,
      role,
      roleLabel: role,
      roles: [role],
      siteAccess: ['KLATEN'],
      mustChangePassword: false,
    },
    permissions: ['production.view', 'production.correct'],
    expiresAt: 1,
  }
}

describe('QC navigation restrictions', () => {
  it('blocks broad production routes even with production.view and production.correct', () => {
    state.session = session('QC')
    expect(() => requireNonQcRole()).toThrow()
  })
  it('preserves production routes for the existing production administrator', () => {
    state.session = session('PRODUCTION_ADMIN')
    expect(() => requireNonQcRole()).not.toThrow()
  })
  it('recognizes QC in the full roles list and handles a missing session', () => {
    const mixed = session('SITE_SUPERVISOR')
    mixed.user.roles.push('QC')
    expect(isQcSession(mixed)).toBe(true)
    expect(isQcSession(null)).toBe(false)
  })
})
