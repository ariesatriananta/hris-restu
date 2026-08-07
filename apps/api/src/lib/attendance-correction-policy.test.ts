import { describe, expect, it } from 'vitest'
import {
  attendanceCorrectionRequestInput,
  attendanceCorrectionReviewInput,
  deriveAttendanceQuality,
  resolveCorrectionAttendanceStatus,
  validateClockOrder,
} from './attendance-correction-policy.js'

describe('attendance correction policy', () => {
  it('memisahkan status kualitas dari alasan abnormal', () => {
    expect(
      deriveAttendanceQuality({
        attendanceStatus: 'PRESENT',
        clockInAt: null,
        clockOutAt: '2026-08-06 15:00:00',
      })
    ).toEqual({
      qualityStatus: 'ABNORMAL',
      abnormalReasons: ['MISSING_CLOCK_IN'],
    })
    expect(
      deriveAttendanceQuality({
        attendanceStatus: 'LEAVE',
        clockInAt: null,
        clockOutAt: null,
      })
    ).toEqual({ qualityStatus: 'NORMAL', abnormalReasons: [] })
  })

  it('baru menandai jam pulang hilang setelah jadwal Shift selesai', () => {
    const attendance = {
      attendanceStatus: 'PRESENT',
      clockInAt: '2026-08-06 06:00:00',
      clockOutAt: null,
      scheduledEndAt: '2026-08-06 15:00:00',
    }
    expect(
      deriveAttendanceQuality({
        ...attendance,
        asOf: '2026-08-06 14:59:59',
      })
    ).toEqual({ qualityStatus: 'NORMAL', abnormalReasons: [] })
    expect(
      deriveAttendanceQuality({
        ...attendance,
        asOf: '2026-08-06 15:00:01',
      })
    ).toEqual({
      qualityStatus: 'ABNORMAL',
      abnormalReasons: ['MISSING_CLOCK_OUT'],
    })
  })

  it('memvalidasi field sesuai jenis koreksi dan menormalkan waktu lokal', () => {
    const parsed = attendanceCorrectionRequestInput.parse({
      attendanceUid: '11111111-1111-4111-8111-111111111111',
      correctionType: 'CLOCK_IN',
      newClockInAt: '2026-08-06T06:05',
      reason: 'Scanner masuk tidak membaca barcode.',
    })
    expect(parsed.newClockInAt).toBe('2026-08-06 06:05:00')
    expect(() =>
      attendanceCorrectionRequestInput.parse({
        attendanceUid: '11111111-1111-4111-8111-111111111111',
        correctionType: 'CLOCK_OUT',
        reason: 'Jam pulang belum masuk.',
      })
    ).toThrow('Jam pulang baru wajib')
  })

  it('mewajibkan alasan penolakan dan menjaga urutan jam', () => {
    expect(() =>
      attendanceCorrectionReviewInput.parse({ decision: 'REJECTED' })
    ).toThrow('Catatan penolakan wajib')
    expect(
      validateClockOrder('2026-08-06 06:00:00', '2026-08-06 15:00:00')
    ).toBe(true)
    expect(
      validateClockOrder('2026-08-06 15:00:00', '2026-08-06 06:00:00')
    ).toBe(false)
  })

  it('mengubah Alpha menjadi Hadir saat koreksi menghasilkan minimal satu jam aktual', () => {
    expect(
      resolveCorrectionAttendanceStatus({
        correctionType: 'CLOCK_IN',
        currentStatus: 'ABSENT',
        clockInAt: '2026-08-07 07:00:00',
        clockOutAt: null,
      })
    ).toBe('PRESENT')
    expect(
      deriveAttendanceQuality({
        attendanceStatus: 'PRESENT',
        clockInAt: '2026-08-07 07:00:00',
        clockOutAt: null,
        scheduledEndAt: '2026-08-07 15:00:00',
        asOf: '2026-08-07 17:00:00',
      })
    ).toEqual({
      qualityStatus: 'ABNORMAL',
      abnormalReasons: ['MISSING_CLOCK_OUT'],
    })
    expect(
      deriveAttendanceQuality({
        attendanceStatus: 'PRESENT',
        clockInAt: null,
        clockOutAt: '2026-08-07 17:00:00',
      })
    ).toEqual({
      qualityStatus: 'ABNORMAL',
      abnormalReasons: ['MISSING_CLOCK_IN'],
    })
  })

  it('mempertahankan pilihan HR untuk koreksi status', () => {
    expect(
      resolveCorrectionAttendanceStatus({
        correctionType: 'STATUS',
        currentStatus: 'ABSENT',
        newStatus: 'SICK',
        clockInAt: '2026-08-07 07:00:00',
        clockOutAt: null,
      })
    ).toBe('SICK')
  })
})
