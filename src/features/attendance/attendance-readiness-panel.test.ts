import { describe, expect, it } from 'vitest'
import {
  getAttendanceAttentionDetails,
  getAttendanceAttentionLabel,
} from './attendance-readiness-utils'
import type { AttendanceReadinessSite } from './domain'

const readySite: AttendanceReadinessSite = {
  site: 'JEPARA',
  siteName: 'Site Jepara',
  shift: {
    eligibleEmployeeCount: 393,
    withoutAssignmentCount: 0,
    ambiguousAssignmentCount: 0,
    ready: true,
  },
  devices: {
    totalCount: 3,
    readyCount: 1,
    notReadyCount: 2,
    hasReadyDevice: true,
  },
  calendar: {
    nationalHolidayCount: 17,
    collectiveLeaveAvailableCount: 8,
    collectiveLeaveSelectedCount: 0,
    evidenceStatus: 'CONFIGURED',
  },
  finalization: {
    rerunRequiredCount: 0,
    rerunRequiredDates: [],
  },
  followUp: {
    pendingCorrectionCount: 0,
    pendingClassificationCount: 0,
    totalCount: 0,
  },
  attentionCount: 2,
}

describe('ringkasan perhatian kesiapan attendance', () => {
  it('menjelaskan bahwa angka perhatian berasal dari perangkat', () => {
    const details = getAttendanceAttentionDetails([readySite])

    expect(details).toEqual(['2 perangkat belum siap'])
    expect(getAttendanceAttentionLabel(2, details)).toBe(
      '2 perangkat belum siap'
    )
  })

  it('menggunakan label umum dan tetap menyediakan rincian saat penyebab bercampur', () => {
    const details = getAttendanceAttentionDetails([
      {
        ...readySite,
        shift: {
          ...readySite.shift,
          withoutAssignmentCount: 1,
          ready: false,
        },
        attentionCount: 3,
      },
    ])

    expect(details).toEqual([
      '1 karyawan belum memiliki shift',
      '2 perangkat belum siap',
    ])
    expect(getAttendanceAttentionLabel(3, details)).toBe(
      '3 hal perlu diperiksa'
    )
  })
})
