import { describe, expect, it } from 'vitest'
import { attendanceBulkApprovalInput } from './attendance-bulk-review.js'

const uid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`

describe('attendanceBulkApprovalInput', () => {
  it('menerima maksimal 50 UID unik untuk satu site', () => {
    const result = attendanceBulkApprovalInput.parse({
      site: 'JEPARA',
      uids: Array.from({ length: 50 }, (_, index) => uid(index + 1)),
      decision: 'APPROVED',
    })
    expect(result.uids).toHaveLength(50)
  })

  it('menolak UID duplikat, lebih dari 50, dan keputusan selain APPROVED', () => {
    expect(() =>
      attendanceBulkApprovalInput.parse({
        site: 'JEPARA',
        uids: [uid(1), uid(1)],
        decision: 'APPROVED',
      })
    ).toThrow()
    expect(() =>
      attendanceBulkApprovalInput.parse({
        site: 'JEPARA',
        uids: Array.from({ length: 51 }, (_, index) => uid(index + 1)),
        decision: 'APPROVED',
      })
    ).toThrow()
    expect(() =>
      attendanceBulkApprovalInput.parse({
        site: 'JEPARA',
        uids: [uid(1)],
        decision: 'REJECTED',
      })
    ).toThrow()
  })
})
