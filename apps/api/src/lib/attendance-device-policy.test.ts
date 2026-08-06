import { describe, expect, it } from 'vitest'
import {
  activationInput,
  canClockInExistingAttendance,
  generateActivationCode,
  generateDeviceToken,
  hashDeviceSecret,
  isoWeekday,
  selectClosestShiftEnd,
  selectSingleOpenAttendance,
  shiftBusinessDate,
  terminalScanInput,
} from './attendance-device-policy.js'

describe('attendance device policy', () => {
  it('membuat kode aktivasi Crockford yang mudah diketik dan dinormalisasi', () => {
    const code = generateActivationCode()
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){2}$/)
    expect(activationInput.parse({ activationCode: code }).activationCode).toHaveLength(12)
  })

  it('membuat token perangkat 32-byte dan hanya menyimpan hash SHA-256', () => {
    const token = generateDeviceToken()
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(hashDeviceSecret(token)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('memvalidasi scan eksplisit dan idempotency UUID', () => {
    expect(
      terminalScanInput.parse({
        eventType: 'CLOCK_IN',
        barcode: 'P-KDS-2608-001',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      }).eventType
    ).toBe('CLOCK_IN')
    expect(() =>
      terminalScanInput.parse({
        eventType: 'AUTO',
        barcode: 'P-KDS-2608-001',
        idempotencyKey: 'bukan-uuid',
      })
    ).toThrow()
  })

  it('mengikat scan setelah tengah malam ke tanggal mulai shift', () => {
    expect(
      shiftBusinessDate({
        currentDate: '2026-08-07',
        previousDate: '2026-08-06',
        currentTime: '02:00:00',
        endTime: '06:00:00',
        crossesMidnight: true,
      })
    ).toBe('2026-08-06')
    expect(isoWeekday('2026-08-09')).toBe(7)
  })

  it('clock out memakai satu Attendance terbuka sebagai konteks tanggal dan Shift', () => {
    const open = selectSingleOpenAttendance([
      { businessDate: '2026-08-06', shiftId: 7 },
    ])
    expect(open).toEqual({ businessDate: '2026-08-06', shiftId: 7 })
    expect(() => selectSingleOpenAttendance([])).toThrow('clock in belum tercatat')
    expect(() =>
      selectSingleOpenAttendance([{ id: 1 }, { id: 2 }])
    ).toThrow('lebih dari satu')
  })

  it('memilih business date dari jadwal pulang yang paling dekat', () => {
    const selected = selectClosestShiftEnd({
      currentDate: '2026-08-07',
      previousDate: '2026-08-06',
      currentTime: '05:45:00',
      assignments: [
        {
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          workDays: [1, 2, 3, 4, 5, 6, 7],
          endTime: '06:00:00',
          crossesMidnight: true,
          shiftId: 7,
        },
      ],
    })
    expect(selected?.businessDate).toBe('2026-08-06')
    expect(selected?.assignment.shiftId).toBe(7)
  })

  it('menolak dua assignment berbeda dengan jadwal pulang sama dekat', () => {
    const base = {
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      workDays: [1, 2, 3, 4, 5, 6, 7],
      endTime: '15:00:00',
      crossesMidnight: false,
    }
    expect(() =>
      selectClosestShiftEnd({
        currentDate: '2026-08-07',
        previousDate: '2026-08-06',
        currentTime: '15:00:00',
        assignments: [
          { ...base, shiftId: 7 },
          { ...base, shiftId: 8 },
        ],
      })
    ).toThrow('ambigu')
  })

  it('tetap memilih assignment aktif saat scan jatuh pada hari nonkerja', () => {
    const input = {
      currentDate: '2026-08-09',
      previousDate: '2026-08-08',
      currentTime: '15:00:00',
      assignments: [
        {
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          workDays: [1, 2, 3, 4, 5],
          endTime: '15:00:00',
          crossesMidnight: false,
          shiftId: 7,
        },
      ],
    }
    expect(selectClosestShiftEnd(input)).toBeUndefined()
    expect(
      selectClosestShiftEnd({ ...input, includeNonWorkdays: true })?.businessDate
    ).toBe('2026-08-09')
  })

  it('menerima fakta scan di record absent/libur tanpa menimpa klasifikasi', () => {
    expect(canClockInExistingAttendance('PRESENT')).toBe(true)
    expect(canClockInExistingAttendance('ABSENT')).toBe(true)
    expect(canClockInExistingAttendance('HOLIDAY')).toBe(true)
    for (const status of ['LEAVE', 'SICK', 'PERMISSION']) {
      expect(canClockInExistingAttendance(status)).toBe(false)
    }
  })
})
