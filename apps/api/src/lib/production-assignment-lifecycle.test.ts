import { describe, expect, it, vi } from 'vitest'
import {
  continuePrimaryProductionAssignmentAfterRenewal,
  reconcileProductionAssignmentsAtEmploymentBoundary,
} from './production-assignment-lifecycle.js'

describe('production assignment lifecycle', () => {
  it('menutup assignment lama dan membatalkan assignment masa depan pada boundary employment', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
    const affected = await reconcileProductionAssignmentsAtEmploymentBoundary(
      { execute } as never,
      15,
      '2026-08-22',
      7
    )
    expect(affected).toBe(3)
    expect(String(execute.mock.calls[0][0])).toContain(
      "assignment.status='ACTIVE'"
    )
    expect(String(execute.mock.calls[1][0])).toContain("status='CANCELLED'")
  })

  it('melanjutkan pekerjaan utama yang dahulu ditutup otomatis saat kontrak berakhir', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ siteId: 3 }]])
      .mockResolvedValueOnce([[{ id: 8, uid: 'assignment-lama', jobId: 19 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
    const execute = vi.fn().mockResolvedValueOnce([{ insertId: 44 }])

    const continued = await continuePrimaryProductionAssignmentAfterRenewal(
      { query, execute } as never,
      {
        contractId: 31,
        employeeId: 15,
        contractStartDate: '2026-09-19',
        previousCoverageEnd: '2026-09-18',
        actorUserId: 7,
      }
    )

    expect(continued).toMatchObject({
      mode: 'CREATED',
      source: 'PREVIOUS_ASSIGNMENT',
      id: 44,
      employeeId: 15,
      siteId: 3,
      jobId: 19,
      sourceAssignmentUid: 'assignment-lama',
      effectiveFrom: '2026-09-19',
    })
    expect(String(execute.mock.calls[0][0])).toContain(
      'INSERT INTO employee_job_assignments'
    )
    expect(String(query.mock.calls[1][0])).toContain(
      'FROM employee_job_assignments assignment'
    )
    expect(execute.mock.calls[0][1]).toEqual([
      expect.any(String),
      15,
      19,
      3,
      '2026-09-19',
      null,
      7,
      7,
    ])
  })

  it('tidak membuat sambungan bila pekerjaan utama sudah aktif pada kontrak baru', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ siteId: 3 }]])
      .mockResolvedValueOnce([[{ coverageEnd: '2026-09-18' }]])
      .mockResolvedValueOnce([[{ id: 8, uid: 'assignment-lama', jobId: 19 }]])
      .mockResolvedValueOnce([[{ id: 9 }]])
    const execute = vi.fn()

    const continued = await continuePrimaryProductionAssignmentAfterRenewal(
      { query, execute } as never,
      {
        contractId: 31,
        employeeId: 15,
        contractStartDate: '2026-09-19',
        actorUserId: 7,
      }
    )

    expect(continued).toBeUndefined()
    expect(execute).not.toHaveBeenCalled()
  })

  it('menerima histori backfill tetapi tetap mengecualikan penutupan manual', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ siteId: 3 }]])
      .mockResolvedValueOnce([[{ coverageEnd: '2026-09-18' }]])
      .mockResolvedValueOnce([[]])
    const execute = vi.fn()

    const continued = await continuePrimaryProductionAssignmentAfterRenewal(
      { query, execute } as never,
      {
        contractId: 31,
        employeeId: 15,
        contractStartDate: '2026-09-19',
        actorUserId: 7,
      }
    )

    expect(continued).toBeUndefined()
    expect(String(query.mock.calls[2][0])).not.toContain(
      'assignment.updated_at>assignment.created_at'
    )
    expect(String(query.mock.calls[2][0])).toContain(
      'Menutup penugasan pekerjaan Produksi.'
    )
    expect(execute).not.toHaveBeenCalled()
  })

  it('menyelaraskan assignment lanjutan yang sama ke tanggal mulai kontrak baru', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ siteId: 3 }]])
      .mockResolvedValueOnce([[{ coverageEnd: '2026-09-14' }]])
      .mockResolvedValueOnce([[{ id: 8, uid: 'assignment-lama', jobId: 19 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            uid: 'assignment-lanjutan',
            siteId: 3,
            jobId: 19,
            effectiveFrom: '2026-09-26',
          },
        ],
      ])
    const execute = vi.fn().mockResolvedValueOnce([{ affectedRows: 1 }])

    const continued = await continuePrimaryProductionAssignmentAfterRenewal(
      { query, execute } as never,
      {
        contractId: 31,
        employeeId: 15,
        contractStartDate: '2026-09-15',
        actorUserId: 7,
      }
    )

    expect(continued).toMatchObject({
      mode: 'REALIGNED',
      source: 'PREVIOUS_ASSIGNMENT',
      id: 9,
      uid: 'assignment-lanjutan',
      sourceAssignmentUid: 'assignment-lama',
      effectiveFrom: '2026-09-15',
    })
    expect(String(execute.mock.calls[0][0])).toContain(
      'UPDATE employee_job_assignments'
    )
    expect(execute.mock.calls[0][1]).toEqual(['2026-09-15', 7, 9, '2026-09-15'])
  })

  it('menyelaraskan pekerjaan default bagian untuk BORONGAN tanpa sumber lama', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            siteId: 1,
            employeeType: 'BORONGAN',
            productionSectionCode: 'LINTING',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ jobId: 24 }]])
      .mockResolvedValueOnce([
        [
          {
            id: 90,
            siteId: 1,
            jobId: 24,
            status: 'ACTIVE',
            isPrimary: 1,
            effectiveFrom: '2026-09-26',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          {
            id: 90,
            uid: 'assignment-lanjutan',
            siteId: 1,
            jobId: 24,
            effectiveFrom: '2026-09-26',
          },
        ],
      ])
    const execute = vi.fn().mockResolvedValueOnce([{ affectedRows: 1 }])

    const continued = await continuePrimaryProductionAssignmentAfterRenewal(
      { query, execute } as never,
      {
        contractId: 31,
        employeeId: 520,
        contractStartDate: '2026-08-01',
        previousCoverageEnd: '2026-07-31',
        actorUserId: 7,
      }
    )

    expect(continued).toMatchObject({
      mode: 'REALIGNED',
      source: 'SECTION_DEFAULT',
      id: 90,
      uid: 'assignment-lanjutan',
      siteId: 1,
      jobId: 24,
      effectiveFrom: '2026-08-01',
      previousEffectiveFrom: '2026-09-26',
    })
    expect(continued?.sourceAssignmentUid).toBeUndefined()
    expect(execute.mock.calls[0][1]).toEqual([
      '2026-08-01',
      7,
      90,
      '2026-08-01',
    ])
  })

  it('memakai pekerjaan default site baru ketika assignment site lama sudah ditutup oleh transfer', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            siteId: 1,
            employeeType: 'BORONGAN',
            productionSectionCode: 'LINTING',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ jobId: 24 }]])
      .mockResolvedValueOnce([
        [
          {
            id: 90,
            siteId: 2,
            jobId: 17,
            status: 'ACTIVE',
            isPrimary: 1,
            effectiveFrom: '2026-08-01',
            effectiveTo: '2026-09-18',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
    const execute = vi.fn().mockResolvedValueOnce([{ insertId: 91 }])

    const continued = await continuePrimaryProductionAssignmentAfterRenewal(
      { query, execute } as never,
      {
        contractId: 31,
        employeeId: 520,
        contractStartDate: '2026-09-20',
        previousCoverageEnd: '2026-09-19',
        actorUserId: 7,
      }
    )

    expect(continued).toMatchObject({
      mode: 'CREATED',
      source: 'SECTION_DEFAULT',
      siteId: 1,
      jobId: 24,
      effectiveFrom: '2026-09-20',
    })
  })
})
