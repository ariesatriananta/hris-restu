import { describe, expect, it, vi } from 'vitest'
import { reconcileProductionAssignmentsAtEmploymentBoundary } from './production-assignment-lifecycle.js'

describe('production assignment lifecycle', () => {
  it('menutup assignment lama dan membatalkan assignment masa depan pada boundary employment', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
    const affected = await reconcileProductionAssignmentsAtEmploymentBoundary(
      { execute } as never,
      15,
      '2026-08-22',
      7
    )
    expect(affected).toBe(3)
    expect(String(execute.mock.calls[0][0])).toContain("assignment.status='ACTIVE'")
    expect(String(execute.mock.calls[1][0])).toContain("status='CANCELLED'")
  })
})
