import { describe, expect, it } from 'vitest'
import {
  deriveCrossesMidnight,
  jakartaBusinessDate,
  previousDate,
  shiftAssignmentBatchInput,
  shiftInput,
} from './attendance-shift-policy.js'

describe('attendance shift policy', () => {
  it('menurunkan shift lintas tengah malam dari jam kerja', () => {
    expect(deriveCrossesMidnight('22:00', '06:00')).toBe(true)
    expect(deriveCrossesMidnight('06:00', '15:00')).toBe(false)
  })

  it('memvalidasi master shift dan menolak jam yang sama', () => {
    expect(() =>
      shiftInput.parse({
        siteCode: 'JEPARA',
        code: 'PAGI',
        name: 'Pagi',
        startTime: '06:00',
        endTime: '06:00',
        lateToleranceMinutes: 15,
        earlyLeaveToleranceMinutes: 15,
        isActive: true,
      })
    ).toThrow()
  })

  it('mengurutkan hari kerja dan memblokir pilihan duplikat', () => {
    const base = {
      shiftUid: '11111111-1111-4111-8111-111111111111',
      employeeUids: ['22222222-2222-4222-8222-222222222222'],
      effectiveFrom: '2026-08-06',
    }
    expect(
      shiftAssignmentBatchInput.parse({ ...base, workDays: [5, 1, 3] })
        .workDays
    ).toEqual([1, 3, 5])
    expect(() =>
      shiftAssignmentBatchInput.parse({ ...base, workDays: [1, 1] })
    ).toThrow()
  })

  it('menghitung tanggal bisnis Jakarta dan hari sebelumnya', () => {
    expect(jakartaBusinessDate(new Date('2026-08-05T17:30:00Z'))).toBe(
      '2026-08-06'
    )
    expect(previousDate('2026-03-01')).toBe('2026-02-28')
  })
})
