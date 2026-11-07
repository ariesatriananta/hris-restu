import { describe, expect, it, vi } from 'vitest'
import { reconcileShiftAssignmentsAtSiteBoundary } from './employee-shift-site-boundary.js'

describe('shift site boundary', () => {
  const input = {
    employeeId: 11,
    targetSiteId: 2,
    effectiveFrom: '2026-11-07',
    actorUserId: 8,
  }

  it('closes only earlier overlapping assignments outside the target site at H-1', async () => {
    const query = vi.fn().mockResolvedValue([[]])
    const execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }])
    await reconcileShiftAssignmentsAtSiteBoundary({ query, execute } as never, input)
    const [sql, values] = execute.mock.calls[0]
    expect(sql).toContain('DATE_SUB(?,INTERVAL 1 DAY)')
    expect(sql).toContain('assignment.employee_id=? AND shift_row.site_id<>?')
    expect(sql).toContain('assignment.effective_from<?')
    expect(sql).toContain('(assignment.effective_to IS NULL OR assignment.effective_to>=?)')
    expect(values).toEqual(['2026-11-07', 8, 11, 2, '2026-11-07', '2026-11-07'])
  })

  it('locks and rejects wrong-site assignments beginning on or after the boundary without deleting them', async () => {
    const query = vi.fn().mockResolvedValue([[{ id: 19 }]])
    const execute = vi.fn()
    await expect(reconcileShiftAssignmentsAtSiteBoundary({ query, execute } as never, input))
      .rejects.toMatchObject({ status: 409 })
    expect(query.mock.calls[0][0]).toContain('assignment.effective_from>=?')
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(query.mock.calls[0][1]).toEqual([11, 2, '2026-11-07'])
    expect(execute).not.toHaveBeenCalled()
  })

  it('allows cron actor NULL and propagates write failures for transaction rollback', async () => {
    const query = vi.fn().mockResolvedValue([[]])
    const execute = vi.fn().mockRejectedValue(new Error('shift write failed'))
    await expect(reconcileShiftAssignmentsAtSiteBoundary({ query, execute } as never, {
      ...input, actorUserId: null,
    })).rejects.toThrow('shift write failed')
    expect(execute.mock.calls[0][1][1]).toBeNull()
  })
})
