import type { AuthContext } from '../middleware/authenticate.js'

export const attendancePermissions = [
  'attendance.view',
  'attendance.scan',
  'attendance.correct',
  'attendance.approve',
  'attendance.manage_shift',
  'attendance.manage_device',
  'attendance.export',
] as const

export type AttendancePermission = (typeof attendancePermissions)[number]

export function hasAttendancePermission(
  auth: Pick<AuthContext, 'roles' | 'permissions'>,
  permission: AttendancePermission
) {
  return (
    auth.roles.includes('SUPER_ADMIN') || auth.permissions.includes(permission)
  )
}

export function attendanceCapabilities(
  auth: Pick<AuthContext, 'roles' | 'permissions'>
) {
  return {
    view: hasAttendancePermission(auth, 'attendance.view'),
    scan: hasAttendancePermission(auth, 'attendance.scan'),
    correct: hasAttendancePermission(auth, 'attendance.correct'),
    approve: hasAttendancePermission(auth, 'attendance.approve'),
    manageShift: hasAttendancePermission(auth, 'attendance.manage_shift'),
    manageDevice: hasAttendancePermission(auth, 'attendance.manage_device'),
    export: hasAttendancePermission(auth, 'attendance.export'),
  }
}

export function canUseAttendanceForProduction(input: {
  attendanceStatus: string
  clockInSource: unknown
  clockOutSource: unknown
}) {
  return (
    input.attendanceStatus === 'PRESENT' &&
    (input.clockInSource === 'TERMINAL' || input.clockOutSource === 'TERMINAL')
  )
}
