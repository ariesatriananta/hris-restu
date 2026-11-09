import { describe, expect, it } from 'vitest'
import type { AuthSession, UserRole } from './domain'
import {
  canViewProductionWages,
  canReviseProductionDate,
  productionBusinessToday,
} from './production-access'

function session(role: UserRole, roles: UserRole[] = [role]) {
  return {
    user: { role, roles },
    permissions: ['production.correct'],
  } as AuthSession
}

describe('Production role and date policy', () => {
  it.each([
    'QC',
    'DIRECTOR',
    'PRODUCTION_ADMIN',
    'SITE_SUPERVISOR',
    'PAYROLL_FINANCE',
  ] as const)('hides wages and historical revisions from %s', (role) => {
    expect(canViewProductionWages(session(role))).toBe(false)
    expect(
      canReviseProductionDate(session(role), '2026-11-08', '2026-11-09')
    ).toBe(false)
    expect(
      canReviseProductionDate(session(role), '2026-11-09', '2026-11-09')
    ).toBe(true)
  })
  it.each(['SUPER_ADMIN', 'HR_OFFICER'] as const)(
    'allows historical role exception for %s',
    (role) => {
      expect(canViewProductionWages(session(role))).toBe(true)
      expect(
        canReviseProductionDate(session(role), '2026-11-08', '2026-11-09')
      ).toBe(true)
    }
  )
  it('uses complete role membership and denies absent sessions', () => {
    expect(
      canViewProductionWages(session('DIRECTOR', ['DIRECTOR', 'HR_OFFICER']))
    ).toBe(true)
    expect(canViewProductionWages(null)).toBe(false)
    expect(canReviseProductionDate(null, '2026-11-09', '2026-11-09')).toBe(
      false
    )
  })
  it('rolls over at midnight WIB, independent of the browser timezone', () => {
    expect(productionBusinessToday(new Date('2026-11-08T16:59:59Z'))).toBe(
      '2026-11-08'
    )
    expect(productionBusinessToday(new Date('2026-11-08T17:00:00Z'))).toBe(
      '2026-11-09'
    )
  })
})
