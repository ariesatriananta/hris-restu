import { describe, expect, it } from 'vitest'
import { resolveCalendarDay } from './attendance-calendar-policy.js'
import {
  canRunFinalization,
  finalizationStatus,
  finalizationRecordDecision,
  hasFinalizationBlockingIssues,
  isAttendanceFinalizationRequired,
  isShiftFinalizationDue,
  previousBusinessDate,
  shiftFinalizationDueAt,
} from './attendance-finalization-policy.js'

describe('attendance finalization policy', () => {
  it('menambahkan grace 60 menit setelah shift normal', () => {
    expect(
      shiftFinalizationDueAt({
        businessDate: '2026-08-06',
        endTime: '15:00:00',
        crossesMidnight: false,
      })
    ).toBe('2026-08-06 16:00:00')
  })

  it('menempatkan cutoff night shift pada hari berikutnya', () => {
    expect(
      shiftFinalizationDueAt({
        businessDate: '2026-08-06',
        endTime: '06:00:00',
        crossesMidnight: true,
      })
    ).toBe('2026-08-07 07:00:00')
    expect(
      isShiftFinalizationDue({
        businessDate: '2026-08-06',
        endTime: '06:00:00',
        crossesMidnight: true,
        asOfJakarta: '2026-08-07 06:59:59',
      })
    ).toBe(false)
  })

  it('melarang pre-go-live, masa depan, belum due, dan proses paralel', () => {
    expect(canRunFinalization({ businessDate: '2026-08-05', today: '2026-08-06', hasDueShift: true })).toBe(false)
    expect(canRunFinalization({ businessDate: '2026-08-07', today: '2026-08-06', hasDueShift: true })).toBe(false)
    expect(canRunFinalization({ businessDate: '2026-08-06', today: '2026-08-06', hasDueShift: false })).toBe(false)
    expect(canRunFinalization({ businessDate: '2026-08-06', today: '2026-08-06', hasDueShift: true, running: true })).toBe(false)
  })

  it('memetakan status penyimpanan ke status monitoring', () => {
    expect(finalizationStatus({ finalizationRequired: false })).toBe('NOT_REQUIRED')
    expect(finalizationStatus({ rawStatus: 'FAILED', finalizationRequired: false })).toBe('NOT_REQUIRED')
    expect(finalizationStatus({})).toBe('NOT_STARTED')
    expect(finalizationStatus({ rawStatus: 'SUCCEEDED', pendingDue: 2 })).toBe('PARTIAL')
    expect(finalizationStatus({ rawStatus: 'SUCCEEDED', pendingDue: 0, blockingIssues: 1 })).toBe('PARTIAL')
    expect(finalizationStatus({ rawStatus: 'SUCCEEDED', pendingDue: 0 })).toBe('FINALIZED')
    expect(finalizationStatus({ rawStatus: 'FAILED' })).toBe('FAILED')
    expect(previousBusinessDate('2026-08-06')).toBe('2026-08-05')
  })

  it('hanya menandai tidak perlu bila semua target efektif adalah weekly off', () => {
    expect(isAttendanceFinalizationRequired({ effectiveTargets: 2, resolvedNonWorkdayTargets: 2, unresolvedTargets: 0 })).toBe(false)
    expect(isAttendanceFinalizationRequired({ effectiveTargets: 2, resolvedNonWorkdayTargets: 1, unresolvedTargets: 0 })).toBe(true)
    expect(isAttendanceFinalizationRequired({ effectiveTargets: 2, resolvedNonWorkdayTargets: 2, unresolvedTargets: 1 })).toBe(true)
    expect(isAttendanceFinalizationRequired({ effectiveTargets: 0, resolvedNonWorkdayTargets: 0, unresolvedTargets: 0 })).toBe(false)
    expect(canRunFinalization({ businessDate: '2026-08-06', today: '2026-08-06', hasDueShift: true, finalizationRequired: false })).toBe(false)
  })

  it.each([
    'NATIONAL_HOLIDAY',
    'COLLECTIVE_LEAVE',
    'SITE_HOLIDAY',
    'WORKDAY_OVERRIDE',
  ] as const)('%s tetap memerlukan finalisasi saat jatuh pada weekly off', (calendarType) => {
    const calendar = resolveCalendarDay({
      scheduledByShift: false,
      rules: [{ calendarType, name: 'Aturan kalender' }],
    })
    expect(
      isAttendanceFinalizationRequired({
        effectiveTargets: 1,
        resolvedNonWorkdayTargets:
          calendar.dayType === 'NON_WORKDAY' &&
          calendar.reasonType === 'WEEKLY_OFF'
            ? 1
            : 0,
        unresolvedTargets: 0,
      })
    ).toBe(true)
  })

  it('hanya mempertahankan attendance nyata dan tidak membuat record weekly off', () => {
    expect(finalizationRecordDecision({ dayType: 'WORKDAY', hasExistingAttendance: true })).toBe('PRESERVE')
    expect(finalizationRecordDecision({ dayType: 'HOLIDAY', hasExistingAttendance: false })).toBe('CREATE_HOLIDAY')
    expect(finalizationRecordDecision({ dayType: 'WORKDAY', hasExistingAttendance: false })).toBe('CREATE_ABSENT')
    expect(finalizationRecordDecision({ dayType: 'NON_WORKDAY', hasExistingAttendance: false })).toBe('WEEKLY_OFF')
    expect(finalizationRecordDecision({ dayType: 'NON_WORKDAY', hasExistingAttendance: true })).toBe('PRESERVE')
  })

  it('menganggap assignment dan employment ambigu sebagai blocker rerun', () => {
    expect(hasFinalizationBlockingIssues({ pendingDue: 0, missingAssignment: 1 })).toBe(true)
    expect(hasFinalizationBlockingIssues({ pendingDue: 0, ambiguousEmployment: 0 })).toBe(false)
  })
})
