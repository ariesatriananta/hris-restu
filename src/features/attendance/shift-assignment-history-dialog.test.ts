import { describe, expect, it } from 'vitest'
import type { Shift } from './domain'
import { availableHistoricalAssignmentShifts } from './shift-assignment-options'

const baseShift: Shift = {
  uid: 'shift-klaten',
  code: 'BORONGAN-KLATEN',
  name: 'Shift Borongan',
  site: 'KLATEN',
  siteName: 'Klaten',
  startTime: '06:00:00',
  endTime: '15:00:00',
  crossesMidnight: false,
  lateToleranceMinutes: 0,
  earlyLeaveToleranceMinutes: 0,
  isActive: true,
  hasAttendance: true,
  assignmentCount: 1,
}

describe('pilihan shift pada koreksi penugasan', () => {
  it('menyediakan shift aktif lintas site dan menyembunyikan shift nonaktif', () => {
    const jeparaShift: Shift = {
      ...baseShift,
      uid: 'shift-jepara',
      code: 'BORONGAN-JEPARA',
      site: 'JEPARA',
      siteName: 'Jepara',
    }
    const inactiveShift: Shift = {
      ...baseShift,
      uid: 'shift-nonaktif',
      code: 'SHIFT-NONAKTIF',
      isActive: false,
    }

    expect(
      availableHistoricalAssignmentShifts([
        baseShift,
        jeparaShift,
        inactiveShift,
      ]).map((shift) => shift.uid)
    ).toEqual(['shift-klaten', 'shift-jepara'])
  })
})
