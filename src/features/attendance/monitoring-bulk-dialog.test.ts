import { describe, expect, it } from 'vitest'
import { buildBulkCorrectionItems } from './monitoring-bulk-utils'

describe('buildBulkCorrectionItems', () => {
  it('menerapkan satu nilai koreksi ke seluruh attendance terpilih', () => {
    const items = buildBulkCorrectionItems(
      [{ uid: 'attendance-1' }, { uid: 'attendance-2' }],
      {
        type: 'BOTH',
        clockIn: '2026-09-01T07:00:00',
        clockOut: '2026-09-01T15:00:00',
      },
      'Koreksi massal untuk demo'
    )

    expect(items).toEqual([
      {
        attendanceUid: 'attendance-1',
        correctionType: 'BOTH',
        newClockInAt: '2026-09-01T07:00:00',
        newClockOutAt: '2026-09-01T15:00:00',
        reason: 'Koreksi massal untuk demo',
      },
      {
        attendanceUid: 'attendance-2',
        correctionType: 'BOTH',
        newClockInAt: '2026-09-01T07:00:00',
        newClockOutAt: '2026-09-01T15:00:00',
        reason: 'Koreksi massal untuk demo',
      },
    ])
  })
})
