import { describe, expect, it } from 'vitest'
import {
  recommendShiftAssignment,
  shiftAssignmentPlanApplyInput,
} from './shift-assignment-plan.js'

const targetDefault = {
  id: 2,
  uid: '22222222-2222-4222-8222-222222222222',
  siteId: 20,
  code: 'BORONGAN_DEFAULT',
  name: 'Shift Borongan Jepara',
}

describe('shift assignment plan', () => {
  it('merekomendasikan kode shift yang sama dan tanggal mutasi', () => {
    const result = recommendShiftAssignment({
      candidate: {
        employeeType: 'BORONGAN',
        historyEffectiveFrom: '2026-09-19',
        historyChangeType: 'TRANSFER',
        isRenewal: false,
        siteId: 20,
      },
      shifts: [targetDefault],
      history: [
        {
          shiftId: 1,
          shiftCode: 'BORONGAN_DEFAULT',
          siteId: 10,
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-09-18',
          workDays: [1, 2, 3, 4, 5, 6],
        },
      ],
      today: '2026-09-29',
      goLiveDate: '2026-08-01',
    })

    expect(result.source).toBe('TRANSFER')
    expect(result.recommendedEffectiveFrom).toBe('2026-09-19')
    expect(result.recommendedShift?.uid).toBe(targetDefault.uid)
    expect(result.recommendedWorkDays).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('memakai shift default site dan tanggal kontrak untuk onboarding baru', () => {
    const result = recommendShiftAssignment({
      candidate: {
        employeeType: 'BORONGAN',
        historyEffectiveFrom: '2026-09-01',
        historyChangeType: 'INITIAL',
        activeContractStart: '2026-09-01',
        isRenewal: false,
        siteId: 20,
      },
      shifts: [targetDefault],
      history: [],
      today: '2026-09-29',
      goLiveDate: '2026-08-01',
    })

    expect(result.source).toBe('NEW_HIRE')
    expect(result.recommendedEffectiveFrom).toBe('2026-09-01')
    expect(result.recommendedShift?.uid).toBe(targetDefault.uid)
  })

  it('mengikuti awal kontrak perpanjangan', () => {
    const result = recommendShiftAssignment({
      candidate: {
        employeeType: 'BORONGAN',
        historyEffectiveFrom: '2026-01-01',
        historyChangeType: 'STATUS_CHANGE',
        activeContractStart: '2026-09-20',
        isRenewal: true,
        siteId: 20,
      },
      shifts: [targetDefault],
      history: [
        {
          shiftId: 1,
          shiftCode: 'BORONGAN_DEFAULT',
          siteId: 20,
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-09-19',
          workDays: [1, 2, 3, 4, 5],
        },
      ],
      today: '2026-09-29',
      goLiveDate: '2026-08-01',
    })

    expect(result.source).toBe('RENEWAL')
    expect(result.recommendedEffectiveFrom).toBe('2026-09-20')
    expect(result.recommendedShift?.uid).toBe(targetDefault.uid)
  })

  it('menolak karyawan duplikat pada apply', () => {
    const item = {
      employeeUid: '11111111-1111-4111-8111-111111111111',
      shiftUid: targetDefault.uid,
      effectiveFrom: '2026-09-20',
      workDays: [1, 2, 3, 4, 5],
    }
    expect(() =>
      shiftAssignmentPlanApplyInput.parse({ items: [item, item] })
    ).toThrow(/lebih dari sekali/)
  })
})
