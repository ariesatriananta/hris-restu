import { describe, expect, it, vi } from 'vitest'
import { continueShiftAssignmentAfterRenewal } from './shift-assignment-lifecycle.js'

describe('shift assignment renewal lifecycle', () => {
  it('melanjutkan shift terakhir tepat dari tanggal mulai kontrak baru', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ siteId: 1, employeeType: 'BORONGAN' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            id: 8,
            uid: 'shift-lama',
            shiftId: 4,
            workDays: [1, 2, 3, 4, 5],
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
    const execute = vi.fn().mockResolvedValueOnce([{ insertId: 44 }])

    const continued = await continueShiftAssignmentAfterRenewal(
      { query, execute } as never,
      {
        employeeId: 15,
        contractStartDate: '2026-08-06',
        previousCoverageEnd: '2026-08-05',
        actorUserId: 7,
      }
    )

    expect(continued).toMatchObject({
      mode: 'CREATED',
      source: 'PREVIOUS_ASSIGNMENT',
      id: 44,
      employeeId: 15,
      siteId: 1,
      shiftId: 4,
      sourceAssignmentUid: 'shift-lama',
      effectiveFrom: '2026-08-06',
    })
    expect(execute.mock.calls[0]?.[1]).toEqual([
      expect.any(String),
      15,
      4,
      '2026-08-06',
      null,
      '[1,2,3,4,5]',
      7,
      7,
    ])
  })

  it('menyelaraskan shift masa depan yang identik tanpa membuat duplikat', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ siteId: 1, employeeType: 'BORONGAN' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            id: 8,
            uid: 'shift-lama',
            shiftId: 4,
            workDays: '[1,2,3,4,5]',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            uid: 'shift-lanjutan',
            shiftId: 4,
            workDays: [1, 2, 3, 4, 5],
            effectiveFrom: '2026-08-10',
          },
        ],
      ])
    const execute = vi.fn().mockResolvedValueOnce([{ affectedRows: 1 }])

    const continued = await continueShiftAssignmentAfterRenewal(
      { query, execute } as never,
      {
        employeeId: 15,
        contractStartDate: '2026-08-06',
        previousCoverageEnd: '2026-08-05',
        actorUserId: 7,
      }
    )

    expect(continued).toMatchObject({
      mode: 'REALIGNED',
      source: 'PREVIOUS_ASSIGNMENT',
      id: 9,
      effectiveFrom: '2026-08-06',
      previousEffectiveFrom: '2026-08-10',
    })
    expect(execute.mock.calls[0]?.[1]).toEqual([
      '2026-08-06',
      7,
      9,
      '2026-08-06',
    ])
  })

  it('membuat shift standar site untuk BORONGAN tanpa histori shift', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ siteId: 1, employeeType: 'BORONGAN' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ shiftId: 4 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
    const execute = vi.fn().mockResolvedValueOnce([{ insertId: 45 }])

    const continued = await continueShiftAssignmentAfterRenewal(
      { query, execute } as never,
      {
        employeeId: 520,
        contractStartDate: '2026-08-01',
        previousCoverageEnd: '2026-07-31',
        actorUserId: 7,
      }
    )

    expect(continued).toMatchObject({
      mode: 'CREATED',
      source: 'SITE_DEFAULT',
      employeeId: 520,
      siteId: 1,
      shiftId: 4,
      effectiveFrom: '2026-08-01',
    })
    expect(continued?.sourceAssignmentUid).toBeUndefined()
    expect(execute.mock.calls[0]?.[1]).toEqual([
      expect.any(String),
      520,
      4,
      '2026-08-01',
      null,
      '[1,2,3,4,5]',
      7,
      7,
    ])
  })

  it('memakai shift default site baru ketika histori site lama sudah ditutup oleh transfer', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ siteId: 1, employeeType: 'BORONGAN' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [{ id: 99, siteId: 2, effectiveTo: '2026-09-18' }],
      ])
      .mockResolvedValueOnce([[{ shiftId: 4 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
    const execute = vi.fn().mockResolvedValueOnce([{ insertId: 46 }])

    const continued = await continueShiftAssignmentAfterRenewal(
      { query, execute } as never,
      {
        employeeId: 520,
        contractStartDate: '2026-09-20',
        previousCoverageEnd: '2026-09-19',
        actorUserId: 7,
      }
    )

    expect(continued).toMatchObject({
      mode: 'CREATED',
      source: 'SITE_DEFAULT',
      siteId: 1,
      shiftId: 4,
      effectiveFrom: '2026-09-20',
    })
  })

  it('tidak memakai shift default bila karyawan sudah memiliki histori ambigu', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ siteId: 1, employeeType: 'BORONGAN' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 99 }]])
    const execute = vi.fn()

    const continued = await continueShiftAssignmentAfterRenewal(
      { query, execute } as never,
      {
        employeeId: 520,
        contractStartDate: '2026-08-01',
        previousCoverageEnd: '2026-07-31',
        actorUserId: 7,
      }
    )

    expect(continued).toBeUndefined()
    expect(execute).not.toHaveBeenCalled()
  })
})
