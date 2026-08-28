import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inspectPayrollRunIntegrity } from './payroll-approval.js'

const readiness = vi.hoisted(() => vi.fn())
vi.mock('./payroll-readiness.js', () => ({ evaluatePayrollReadiness: readiness }))

const run = {
  id: 7,
  periodId: 3,
  siteId: 2,
  periodStart: '2026-08-01',
  periodEnd: '2026-08-07',
}

describe('Payroll approval integrity', () => {
  beforeEach(() => {
    readiness.mockResolvedValue({ status: 'READY', blockerCount: 0 })
  })

  it('memvalidasi snapshot lengkap tanpa derived table berkorelasi', async () => {
    const query = vi.fn().mockResolvedValue([
      [{ resultEmployeeCount: 2, runEmployeeCount: 2 }],
    ])
    const result = await inspectPayrollRunIntegrity({ query }, run)
    expect(result).toEqual({ valid: true, issues: [] })
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('WITH live_attendance AS')
    expect(sql).toContain('snapshot.id IS NULL')
    expect(sql).toContain('resultDetailMismatch')
    expect(sql).toContain("COALESCE(manual.notes,'')")
    expect(sql).not.toContain('LATERAL')
    expect((sql.match(/\?/g) ?? []).length).toBe(
      (query.mock.calls[0]?.[1] as unknown[]).length
    )
  })

  it('memblokir rekening snapshot kosong walau readiness hanya perhatian', async () => {
    readiness.mockResolvedValue({ status: 'ATTENTION', blockerCount: 0 })
    const query = vi.fn().mockResolvedValue([
      [{ resultEmployeeCount: 2, missingBankCount: 1 }],
    ])
    const result = await inspectPayrollRunIntegrity({ query }, run)
    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual({
      code: 'MISSING_BANK_ACCOUNT',
      message: 'Snapshot rekening pembayaran belum lengkap.',
      count: 1,
    })
  })

  it('memblokir perubahan rekening master dan mismatch detail', async () => {
    const query = vi.fn().mockResolvedValue([
      [{ resultEmployeeCount: 2, bankDriftCount: 1, resultDetailMismatch: 2 }],
    ])
    const result = await inspectPayrollRunIntegrity({ query }, run)
    expect(result.issues.map((entry) => entry.code)).toEqual([
      'BANK_ACCOUNT_DRIFT',
      'RESULT_DETAIL_MISMATCH',
    ])
  })

  it('memblokir readiness BLOCKED dan neto negatif', async () => {
    readiness.mockResolvedValue({ status: 'BLOCKED', blockerCount: 3 })
    const query = vi.fn().mockResolvedValue([
      [{ resultEmployeeCount: 1, negativeNetCount: 1 }],
    ])
    const result = await inspectPayrollRunIntegrity({ query }, run)
    expect(result.issues.map((entry) => entry.code)).toEqual([
      'READINESS_BLOCKED',
      'NEGATIVE_NET_PAY',
    ])
  })
})
