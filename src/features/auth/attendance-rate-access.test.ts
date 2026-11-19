import { describe, expect, it } from 'vitest'
import { canAccessAttendanceRate } from './attendance-rate-access'
import type { AuthSession, UserRole } from './domain'

const session = (
  roles: UserRole[],
  permissions = ['attendance.view', 'production.view']
) =>
  ({
    user: { role: roles[0], roles },
    permissions,
  }) as AuthSession

describe('Attendance Rate access matches API', () => {
  it.each([
    'QC',
    'DIRECTOR',
    'PRODUCTION_ADMIN',
    'PAYROLL_FINANCE',
    'SITE_SUPERVISOR',
  ] as const)('denies %s even with both permissions', (role) => {
    expect(canAccessAttendanceRate(session([role]))).toBe(false)
  })
  it('requires HR membership and both data permissions', () => {
    expect(canAccessAttendanceRate(session(['HR_OFFICER']))).toBe(true)
    expect(canAccessAttendanceRate(session(['DIRECTOR', 'HR_OFFICER']))).toBe(
      true
    )
    expect(
      canAccessAttendanceRate(session(['HR_OFFICER'], ['attendance.view']))
    ).toBe(false)
    expect(
      canAccessAttendanceRate(session(['HR_OFFICER'], ['production.view']))
    ).toBe(false)
    expect(canAccessAttendanceRate(session(['HR_OFFICER', 'QC']))).toBe(false)
    expect(canAccessAttendanceRate(null)).toBe(false)
  })
  it('honors superadmin membership including QC mixed roles', () => {
    expect(canAccessAttendanceRate(session(['SUPER_ADMIN'], []))).toBe(true)
    expect(canAccessAttendanceRate(session(['QC', 'SUPER_ADMIN'], []))).toBe(
      true
    )
  })
})
