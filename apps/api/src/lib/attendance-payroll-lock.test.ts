import type { PoolConnection } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { assertAttendancePayrollUnlocked } from './attendance-payroll-lock.js'

function connection(input: {
  lockedPeriod?: { status: string; processingRun: number }
  snapshot?: boolean
}) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM payroll_periods pp')) {
        return [input.lockedPeriod ? [input.lockedPeriod] : []]
      }
      if (sql.includes('FROM payroll_attendance_summaries')) {
        return [input.snapshot ? [{ id: 1 }] : []]
      }
      return [[]]
    }),
  } as unknown as PoolConnection
}

describe('assertAttendancePayrollUnlocked', () => {
  const context = {
    siteId: 1,
    employeeId: 10,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-15',
  }

  it('tidak memblokir periode DRAFT tanpa snapshot', async () => {
    await expect(
      assertAttendancePayrollUnlocked(connection({}), context)
    ).resolves.toBeUndefined()
  })

  it('memblokir run PROCESSING meskipun periode belum dihitung', async () => {
    await expect(
      assertAttendancePayrollUnlocked(
        connection({ lockedPeriod: { status: 'DRAFT', processingRun: 1 } }),
        context
      )
    ).rejects.toThrow('sedang berjalan')
  })

  it('memblokir periode terkunci dan snapshot Attendance', async () => {
    await expect(
      assertAttendancePayrollUnlocked(
        connection({
          lockedPeriod: { status: 'CALCULATED', processingRun: 0 },
        }),
        context
      )
    ).rejects.toThrow('sudah dihitung')

    await expect(
      assertAttendancePayrollUnlocked(connection({ snapshot: true }), context)
    ).rejects.toThrow('snapshot Payroll')
  })
})
