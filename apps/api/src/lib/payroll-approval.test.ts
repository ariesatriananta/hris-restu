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
    expect(result).toEqual({ valid: true, issues: [], warnings: [] })
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('WITH live_attendance AS')
    expect(sql).toContain('snapshot.id IS NULL')
    expect(sql).toContain('resultDetailMismatch')
    expect(sql).toContain("COALESCE(manual.notes,'')")
    expect(sql).toContain('payroll_period_policy_snapshots')
    expect(sql).toContain('policy_snapshot.id IS NULL')
    expect(sql).not.toContain('LATERAL')
    expect((sql.match(/\?/g) ?? []).length).toBe(
      (query.mock.calls[0]?.[1] as unknown[]).length
    )
  })

  it('menjadikan rekening snapshot kosong sebagai warning', async () => {
    readiness.mockResolvedValue({ status: 'ATTENTION', blockerCount: 0 })
    const query = vi.fn().mockResolvedValue([
      [{ resultEmployeeCount: 2, missingBankCount: 1 }],
    ])
    const result = await inspectPayrollRunIntegrity({ query }, run)
    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.warnings).toContainEqual({
      code: 'MISSING_BANK_ACCOUNT',
      message:
        'Snapshot rekening pembayaran belum lengkap. Daftar Pembayaran bank belum dapat dibuat untuk karyawan tersebut.',
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

  it('memblokir drift policy pada Payroll BORONGAN', async () => {
    const query = vi.fn().mockResolvedValue([
      [{ resultEmployeeCount: 2, policyDrift: 1 }],
    ])
    const result = await inspectPayrollRunIntegrity({ query }, run)
    expect(result.issues).toContainEqual({
      code: 'POLICY_SNAPSHOT_DRIFT',
      message:
        'Policy Payroll berubah atau tidak sesuai snapshot periode. Hitung ulang Payroll.',
      count: 1,
    })
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

  it('memakai integrity strategy TIME_BASED dan mendeteksi drift sumber', async () => {
    const query = vi.fn().mockResolvedValue([[
      {
        resultEmployeeCount: 2,
        rateDrift: 1,
        scheduleDrift: 2,
        policyDrift: 1,
        populationDrift: 1,
      },
    ]])
    const result = await inspectPayrollRunIntegrity({ query }, {
      ...run,
      payrollBasis: 'TIME_BASED',
      payFrequency: 'WEEKLY',
      employeeType: 'HARIAN',
      policySnapshot: {
        employeeType: 'HARIAN',
        wageBasis: 'TIME_BASED',
        payFrequency: 'WEEKLY',
      },
    })
    expect(result.issues.map((entry) => entry.code)).toEqual([
      'TIME_RATE_SNAPSHOT_DRIFT',
      'SCHEDULE_SNAPSHOT_DRIFT',
      'POLICY_SNAPSHOT_DRIFT',
      'POPULATION_SNAPSHOT_DRIFT',
    ])
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('payroll_time_details')
    expect(sql).toContain('employee_daily_rate_histories')
    expect(sql).toContain('payroll_period_policy_snapshots')
    expect(sql).not.toContain('0 scheduleDrift')
    expect((sql.match(/\?/g) ?? []).length).toBe(
      (query.mock.calls[0]?.[1] as unknown[]).length
    )
  })
})
