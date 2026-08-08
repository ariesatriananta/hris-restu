import { describe, expect, it } from 'vitest'
import {
  backdatedAssignmentFinalizationRange,
  deriveCrossesMidnight,
  firstShiftAssignmentEligibility,
  historicalShiftAssignmentApplyInput,
  jakartaBusinessDate,
  planHistoricalShiftTimeline,
  previousDate,
  shiftAssignmentBatchInput,
  shiftInput,
  type ShiftAssignmentTimelineItem,
} from './attendance-shift-policy.js'

const assignment = (
  overrides: Partial<ShiftAssignmentTimelineItem> = {}
): ShiftAssignmentTimelineItem => ({
  id: 1,
  uid: '11111111-1111-4111-8111-111111111111',
  shiftId: 10,
  shiftUid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  shiftName: 'Shift Lama',
  effectiveFrom: '2026-08-01',
  effectiveTo: null,
  workDays: [1, 2, 3, 4, 5],
  ...overrides,
})

const replacement = {
  shiftId: 20,
  shiftUid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  shiftName: 'Shift Koreksi',
  effectiveFrom: '2026-08-03',
  effectiveTo: '2026-08-05',
  workDays: [1, 2, 3, 4, 5],
}

describe('historical shift assignment policy', () => {
  it('tetap memvalidasi master Shift dan tanggal bisnis Jakarta', () => {
    expect(deriveCrossesMidnight('22:00', '06:00')).toBe(true)
    expect(deriveCrossesMidnight('06:00', '15:00')).toBe(false)
    expect(jakartaBusinessDate(new Date('2026-08-05T17:30:00Z'))).toBe(
      '2026-08-06'
    )
    expect(previousDate('2026-03-01')).toBe('2026-02-28')
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

  it('tetap mengurutkan hari kerja batch dan menolak duplikat', () => {
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

  it('menghitung batas backdate assignment pertama tanpa membuka histori lama', () => {
    expect(
      firstShiftAssignmentEligibility({
        hasAssignmentHistory: false,
        firstEligibleDate: '2026-08-04',
        goLiveDate: '2026-08-01',
        today: '2026-08-08',
      })
    ).toEqual({
      hasAssignmentHistory: false,
      minimumEffectiveFrom: '2026-08-04',
      canBackdateFirstAssignment: true,
    })
    expect(
      firstShiftAssignmentEligibility({
        hasAssignmentHistory: true,
        firstEligibleDate: '2026-08-01',
        goLiveDate: '2026-08-01',
        today: '2026-08-08',
      })
    ).toEqual({
      hasAssignmentHistory: true,
      minimumEffectiveFrom: '2026-08-08',
      canBackdateFirstAssignment: false,
    })
    expect(
      firstShiftAssignmentEligibility({
        hasAssignmentHistory: false,
        firstEligibleDate: null,
        goLiveDate: '2026-08-01',
        today: '2026-08-08',
      })
    ).toEqual({
      hasAssignmentHistory: false,
      minimumEffectiveFrom: '2026-08-08',
      canBackdateFirstAssignment: false,
    })
  })

  it('membatasi invalidasi finalisasi pada bagian assignment yang sudah berjalan', () => {
    expect(
      backdatedAssignmentFinalizationRange({
        effectiveFrom: '2026-08-03',
        effectiveTo: null,
        today: '2026-08-08',
      })
    ).toEqual({ effectiveFrom: '2026-08-03', effectiveTo: '2026-08-08' })
    expect(
      backdatedAssignmentFinalizationRange({
        effectiveFrom: '2026-08-03',
        effectiveTo: '2026-08-05',
        today: '2026-08-08',
      })
    ).toEqual({ effectiveFrom: '2026-08-03', effectiveTo: '2026-08-05' })
    expect(
      backdatedAssignmentFinalizationRange({
        effectiveFrom: '2026-08-08',
        today: '2026-08-08',
      })
    ).toBeNull()
  })

  it('memecah satu assignment yang melintasi kedua sisi rentang koreksi', () => {
    const result = planHistoricalShiftTimeline({
      existing: [assignment()],
      replacement,
    })

    expect(result.affectedIds).toEqual([1])
    expect(result.segments).toEqual([
      expect.objectContaining({
        shiftId: 10,
        effectiveFrom: '2026-08-01',
        effectiveTo: '2026-08-02',
        change: 'SPLIT',
      }),
      expect.objectContaining({
        shiftId: 20,
        effectiveFrom: '2026-08-03',
        effectiveTo: '2026-08-05',
        change: 'REPLACEMENT',
      }),
      expect.objectContaining({
        shiftId: 10,
        effectiveFrom: '2026-08-06',
        effectiveTo: null,
        change: 'SPLIT',
      }),
    ])
  })

  it('menghapus bagian lama yang tertutup penuh dan mempertahankan timeline lain', () => {
    const result = planHistoricalShiftTimeline({
      existing: [
        assignment({ effectiveFrom: '2026-08-01', effectiveTo: '2026-08-02' }),
        assignment({
          id: 2,
          uid: '22222222-2222-4222-8222-222222222222',
          effectiveFrom: '2026-08-03',
          effectiveTo: '2026-08-05',
        }),
        assignment({
          id: 3,
          uid: '33333333-3333-4333-8333-333333333333',
          effectiveFrom: '2026-08-06',
        }),
      ],
      replacement,
    })

    expect(result.affectedIds).toEqual([2])
    expect(result.segments.map((item) => item.change)).toEqual([
      'UNCHANGED',
      'REPLACEMENT',
      'UNCHANGED',
    ])
  })

  it('mewajibkan alasan apply yang cukup dan menormalkan urutan hari kerja', () => {
    const parsed = historicalShiftAssignmentApplyInput.parse({
      employeeUid: '11111111-1111-4111-8111-111111111111',
      shiftUid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      effectiveFrom: '2026-08-03',
      effectiveTo: '2026-08-05',
      workDays: [5, 1, 3],
      reason: 'Memperbaiki histori shift yang salah input.',
    })

    expect(parsed.workDays).toEqual([1, 3, 5])
    expect(() =>
      historicalShiftAssignmentApplyInput.parse({
        ...parsed,
        reason: 'singkat',
      })
    ).toThrow()
  })
})
