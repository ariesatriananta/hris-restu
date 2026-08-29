import { describe, expect, it, vi } from 'vitest'
import {
  previewTimeBasedPopulation,
  resolvePayrollPeriodPolicy,
} from './payroll-period-resolver.js'

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
describe('Payroll period resolver M5C', () => {
  it('memakai jadwal seluruh periode dan kalender efektif untuk preview BULANAN', async () => {
    const query = vi.fn().mockResolvedValue([[
      {
        employeeUid: '11111111-1111-4111-8111-111111111111',
        employeeNumber: 'JPR-001',
        fullName: 'Sari',
        employeeType: 'BULANAN',
        eligibleFrom: '2026-08-15',
        eligibleTo: '2026-08-31',
        payablePresentDays: 12,
        offdayPresentDays: 0,
        alphaDays: 2,
        permissionDays: 1,
        eligibleCalendarDays: 17,
        scheduledWorkDays: 22,
        baseAmount: '5000000.00',
        estimatedWeeklyGross: '0',
        currency: 'IDR',
        missingBaseDays: 0,
        ambiguousBaseDays: 0,
        invalidContractDays: 0,
        duplicateAttendanceDays: 0,
        missingAttendanceDays: 0,
        invalidShiftDays: 0,
        unsupportedCurrencyDays: 0,
        rateSegmentCount: 1,
        bankAccountComplete: 1,
        manualComponentCount: 0,
      },
    ]])

    const rows = await previewTimeBasedPopulation({ query } as never, {
      periodId: 10,
      siteId: 2,
      employeeType: 'BULANAN',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    })

    expect(rows[0]).toMatchObject({
      eligibleCalendarDays: 17,
      scheduledWorkDays: 22,
      estimatedGrossAmount: '2741935',
      estimatedDeductionAmount: '681818',
      estimatedNetAmount: '2060117',
    })
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('FROM population CROSS JOIN dates')
    expect(sql).toContain("override_rule.rule_type='WORKDAY_OVERRIDE'")
    expect(sql).toContain("holiday_event.event_type='NATIONAL_HOLIDAY'")
    expect(sql).toContain(
      "holiday_rule.rule_type IN ('COLLECTIVE_LEAVE','SITE_HOLIDAY')"
    )
  })

  it('membulatkan potongan Alpha dan Izin sebagai komponen terpisah', async () => {
    const query = vi.fn().mockResolvedValue([[
      {
        employeeUid: '11111111-1111-4111-8111-111111111111',
        employeeNumber: 'JPR-001',
        fullName: 'Sari',
        employeeType: 'BULANAN',
        eligibleFrom: '2026-08-01',
        eligibleTo: '2026-08-31',
        payablePresentDays: 1,
        offdayPresentDays: 0,
        alphaDays: 1,
        permissionDays: 1,
        eligibleCalendarDays: 31,
        scheduledWorkDays: 3,
        baseAmount: '100.00',
        estimatedWeeklyGross: '0',
        currency: 'IDR',
        missingBaseDays: 0,
        ambiguousBaseDays: 0,
        invalidContractDays: 0,
        duplicateAttendanceDays: 0,
        missingAttendanceDays: 0,
        invalidShiftDays: 0,
        unsupportedCurrencyDays: 0,
        rateSegmentCount: 1,
        bankAccountComplete: 1,
        manualComponentCount: 0,
      },
    ]])

    const [row] = await previewTimeBasedPopulation({ query } as never, {
      periodId: 10,
      siteId: 2,
      employeeType: 'BULANAN',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    })

    expect(row.estimatedGrossAmount).toBe('100')
    expect(row.estimatedDeductionAmount).toBe('66')
    expect(row.estimatedNetAmount).toBe('34')
  })
})
