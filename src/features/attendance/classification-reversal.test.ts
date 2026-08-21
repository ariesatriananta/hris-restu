import { describe, expect, it } from 'vitest'
import {
  attendanceClassificationReverseReasonError,
  canReverseAttendanceClassification,
} from './domain'

describe('pembatalan klasifikasi attendance', () => {
  it('hanya menawarkan aksi untuk klasifikasi APPROVED dengan izin approval', () => {
    expect(canReverseAttendanceClassification('APPROVED', true)).toBe(true)
    expect(canReverseAttendanceClassification('APPROVED', false)).toBe(false)
    expect(canReverseAttendanceClassification('PENDING', true)).toBe(false)
    expect(canReverseAttendanceClassification('REJECTED', true)).toBe(false)
    expect(canReverseAttendanceClassification('CANCELLED', true)).toBe(false)
  })

  it('mewajibkan alasan pembatalan minimal 10 karakter setelah dirapikan', () => {
    expect(attendanceClassificationReverseReasonError('  salah  ')).toBe(
      'Alasan pembatalan minimal 10 karakter.'
    )
    expect(
      attendanceClassificationReverseReasonError(
        'Karyawan ternyata hadir dan klasifikasi salah input.'
      )
    ).toBeNull()
    expect(attendanceClassificationReverseReasonError('a'.repeat(501))).toBe(
      'Alasan pembatalan maksimal 500 karakter.'
    )
  })
})
