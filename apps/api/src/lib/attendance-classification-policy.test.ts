import { describe, expect, it } from 'vitest'
import {
  attendanceClassificationRequestInput,
  attendanceClassificationReviewInput,
  enumerateDates,
  isScheduledWorkday,
  isoWeekday,
  matchesAttendanceAttachmentSignature,
} from './attendance-classification-policy.js'

describe('attendance classification policy', () => {
  it('accepts a single date or bounded range', () => {
    expect(
      attendanceClassificationRequestInput.parse({
        employeeUid: '11111111-1111-4111-8111-111111111111',
        startDate: '2026-08-06',
        endDate: '2026-08-08',
        classificationType: 'SICK',
        reason: 'Surat dokter',
      }).fileUid
    ).toBeUndefined()
    expect(enumerateDates('2026-08-06', '2026-08-08')).toEqual([
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ])
  })

  it('rejects reversed ranges and invalid classification types', () => {
    const base = {
      employeeUid: '11111111-1111-4111-8111-111111111111',
      startDate: '2026-08-08',
      endDate: '2026-08-06',
      classificationType: 'HOLIDAY',
      reason: 'Libur kalender',
    }
    expect(attendanceClassificationRequestInput.safeParse(base).success).toBe(false)
  })

  it('uses ISO weekdays and skips configured non-workdays', () => {
    expect(isoWeekday('2026-08-09')).toBe(7)
    expect(isScheduledWorkday('2026-08-08', '[1,2,3,4,5,6]')).toBe(true)
    expect(isScheduledWorkday('2026-08-09', '[1,2,3,4,5,6]')).toBe(false)
  })

  it('requires a note when rejecting', () => {
    expect(
      attendanceClassificationReviewInput.safeParse({ decision: 'REJECTED' })
        .success
    ).toBe(false)
    expect(
      attendanceClassificationReviewInput.safeParse({
        decision: 'APPROVED',
      }).success
    ).toBe(true)
  })

  it('validates supported attachment signatures', () => {
    expect(
      matchesAttendanceAttachmentSignature(
        new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]),
        'application/pdf'
      )
    ).toBe(true)
    expect(
      matchesAttendanceAttachmentSignature(
        new TextEncoder().encode('not a pdf'),
        'application/pdf'
      )
    ).toBe(false)
  })
})
