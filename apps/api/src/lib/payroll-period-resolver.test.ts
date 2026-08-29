import { describe, expect, it, vi } from 'vitest'
import { resolvePayrollPeriodPolicy } from './payroll-period-resolver.js'

const policy = {
  id: 1,
  uid: '11111111-1111-4111-8111-111111111111',
  siteId: 1,
  employeeType: 'TRAINING',
  wageBasis: 'TIME_BASED',
  payFrequency: 'WEEKLY',
  cutoffType: 'WEEK_END',
  cutoffDay: null,
  weekStartsOn: 1,
  prorateBasis: 'NONE',
  attendancePayRule: 'PRESENT_ONLY',
  deductionDivisor: 'NONE',
  roundingMode: 'HALF_UP',
  roundingScale: 0,
  currency: 'IDR',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
}
describe('payroll period resolver', () => {
  it('resolves one policy and requires exact Monday-Sunday', async () => {
    const executor = { query: vi.fn(async () => [[policy]]) }
    await expect(
      resolvePayrollPeriodPolicy(executor as never, {
        siteId: 1,
        employeeType: 'TRAINING',
        periodStart: '2026-08-31',
        periodEnd: '2026-09-06',
      })
    ).resolves.toMatchObject({ employeeType: 'TRAINING' })
    await expect(
      resolvePayrollPeriodPolicy(executor as never, {
        siteId: 1,
        employeeType: 'TRAINING',
        periodStart: '2026-08-31',
        periodEnd: '2026-09-05',
      })
    ).rejects.toThrow(/Senin/)
  })
  it('blocks missing or ambiguous policy coverage', async () => {
    await expect(
      resolvePayrollPeriodPolicy({ query: vi.fn(async () => [[]]) } as never, {
        siteId: 1,
        employeeType: 'HARIAN',
        periodStart: '2026-08-31',
        periodEnd: '2026-09-06',
      })
    ).rejects.toThrow(/tidak tunggal/)
    await expect(
      resolvePayrollPeriodPolicy(
        { query: vi.fn(async () => [[policy, policy]]) } as never,
        {
          siteId: 1,
          employeeType: 'TRAINING',
          periodStart: '2026-08-31',
          periodEnd: '2026-09-06',
        }
      )
    ).rejects.toThrow(/tidak tunggal/)
  })
})
