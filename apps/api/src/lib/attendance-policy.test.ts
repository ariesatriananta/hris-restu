import { describe, expect, it } from 'vitest'
import {
  attendanceCapabilities,
  canUseAttendanceForProduction,
} from './attendance-policy.js'

describe('attendance policy', () => {
  it('maps granular permissions to capabilities', () => {
    expect(
      attendanceCapabilities({
        roles: ['SITE_SUPERVISOR'],
        permissions: [
          'attendance.view',
          'attendance.scan',
          'attendance.export',
        ],
      })
    ).toEqual({
      view: true,
      scan: true,
      correct: false,
      approve: false,
      manageShift: false,
      manageDevice: false,
      export: true,
    })
  })

  it('keeps Super Admin capable even before permission rows are refreshed', () => {
    expect(
      Object.values(
        attendanceCapabilities({ roles: ['SUPER_ADMIN'], permissions: [] })
      ).every(Boolean)
    ).toBe(true)
  })

  it('mensyaratkan status hadir dan minimal satu fakta scan terminal untuk produksi', () => {
    expect(
      canUseAttendanceForProduction({
        attendanceStatus: 'PRESENT',
        clockInSource: null,
        clockOutSource: 'TERMINAL',
      })
    ).toBe(true)
    expect(
      canUseAttendanceForProduction({
        attendanceStatus: 'PRESENT',
        clockInSource: 'CORRECTION',
        clockOutSource: 'CORRECTION',
      })
    ).toBe(false)
    expect(
      canUseAttendanceForProduction({
        attendanceStatus: 'LEAVE',
        clockInSource: 'TERMINAL',
        clockOutSource: null,
      })
    ).toBe(false)
  })
})
