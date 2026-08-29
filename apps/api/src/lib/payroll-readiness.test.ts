import { describe, expect, it, vi } from 'vitest'
import { evaluatePayrollReadiness } from './payroll-readiness.js'

function executor(rows: unknown[][]) {
  return { query: vi.fn().mockImplementation(async () => [rows.shift() ?? []]) }
}

const period = {
  id: 10,
  siteId: 2,
  periodStart: '2026-08-01',
  periodEnd: '2026-08-07',
}

describe('Payroll readiness', () => {
  it('READY bila periode selesai dan seluruh integritas terpenuhi', async () => {
    const db = executor([
      [
        {
          populationCount: 8,
          productionEmployeeCount: 8,
          componentOnlyEmployeeCount: 0,
          missingBankAccounts: 0,
          postedTransactionCount: 24,
          productionGrossAmount: '1250000.00',
          activeComponentCount: 3,
          missingEmploymentHistoryEmployees: 0,
        },
      ],
      [
        {
          dbToday: '2026-08-28',
          pendingCorrections: 0,
          pendingClassifications: 0,
          ambiguousEmployment: 0,
          conflictingProduction: 0,
          unsupportedFormula: 0,
          absentCount: 0,
          lateCount: 0,
          earlyLeaveCount: 0,
        },
      ],
      [{ expectedDays: 5, finalizedDays: 5, runningDays: 0, invalidDays: 0 }],
    ])
    const result = await evaluatePayrollReadiness(db as never, period)
    expect(result.status).toBe('READY')
    expect(result.blockers).toEqual([])
    expect(result.facts).toMatchObject({
      postedTransactionCount: 24,
      productionGrossAmount: 1_250_000,
      activeComponentCount: 3,
      recurringComponentCount: 3,
    })
    expect(String(db.query.mock.calls[0]?.[0])).toContain(
      "payroll_type.payroll_basis='PIECE_RATE'"
    )
  })

  it('BLOCKED untuk periode belum selesai dan workflow Attendance tertunda', async () => {
    const db = executor([
      [
        {
          populationCount: 8,
          productionEmployeeCount: 7,
          componentOnlyEmployeeCount: 1,
          missingBankAccounts: 2,
        },
      ],
      [
        {
          dbToday: '2026-08-05',
          pendingCorrections: 2,
          pendingClassifications: 1,
          ambiguousEmployment: 0,
          conflictingProduction: 0,
          unsupportedFormula: 0,
          absentCount: 1,
          lateCount: 1,
          earlyLeaveCount: 0,
        },
      ],
      [{ expectedDays: 5, finalizedDays: 3, runningDays: 1, invalidDays: 1 }],
    ])
    const result = await evaluatePayrollReadiness(db as never, period)
    expect(result.status).toBe('BLOCKED')
    expect(result.blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'PERIOD_NOT_ENDED',
        'ATTENDANCE_NOT_FINALIZED',
        'PENDING_ATTENDANCE_CORRECTION',
      ])
    )
    expect(result.warnings.map((item) => item.code)).toContain(
      'MISSING_BANK_ACCOUNT'
    )
  })

  it('BLOCKED bila populasi kosong atau transaksi Produksi bentrok snapshot', async () => {
    const db = executor([
      [
        {
          populationCount: 0,
          productionEmployeeCount: 0,
          componentOnlyEmployeeCount: 0,
          missingBankAccounts: 0,
        },
      ],
      [
        {
          dbToday: '2026-08-28',
          pendingCorrections: 0,
          pendingClassifications: 0,
          ambiguousEmployment: 0,
          conflictingProduction: 3,
          unsupportedFormula: 1,
          absentCount: 0,
          lateCount: 0,
          earlyLeaveCount: 0,
        },
      ],
      [{ expectedDays: 0, finalizedDays: 0, runningDays: 0, invalidDays: 0 }],
    ])
    const result = await evaluatePayrollReadiness(db as never, period)
    expect(result.blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'EMPTY_POPULATION',
        'PRODUCTION_SNAPSHOT_CONFLICT',
        'UNSUPPORTED_FORMULA_COMPONENT',
      ])
    )
  })

  it('TIME_BASED memblokir gap tarif dan tetap memperingatkan PRESENT hari nonkerja', async () => {
    const db = executor([
      [
        {
          employeeUid: '11111111-1111-4111-8111-111111111111',
          employeeNumber: 'JPR-001',
          fullName: 'Sari',
          employeeType: 'TRAINING',
          eligibleFrom: '2026-08-03',
          eligibleTo: '2026-08-09',
          payablePresentDays: 5,
          offdayPresentDays: 1,
          alphaDays: 1,
          permissionDays: 0,
          missingBaseDays: 2,
          ambiguousBaseDays: 0,
          invalidContractDays: 0,
          duplicateAttendanceDays: 0,
          rateSegmentCount: 1,
          baseAmount: null,
          currency: null,
          bankAccountComplete: 1,
          manualComponentCount: 1,
        },
      ],
      [
        {
          dbToday: '2026-08-28',
          pendingCorrections: 0,
          pendingClassifications: 0,
          ambiguousEmployment: 0,
          unsupportedFormula: 0,
          recurringComponents: 1,
          activeManualComponents: 1,
        },
      ],
      [{ expectedDays: 5, finalizedDays: 5, runningDays: 0 }],
    ])
    const result = await evaluatePayrollReadiness(db as never, {
      ...period,
      payrollBasis: 'TIME_BASED',
      payFrequency: 'WEEKLY',
      employeeType: 'TRAINING',
      policySnapshot: {
        versionUid: 'policy',
        employeeType: 'TRAINING',
        wageBasis: 'TIME_BASED',
        payFrequency: 'WEEKLY',
      },
    })
    expect(result.blockers.map((item) => item.code)).toContain(
      'BASE_RATE_MISSING'
    )
    expect(result.blockers.map((item) => item.code)).toContain(
      'RECURRING_COMPONENT_UNSUPPORTED'
    )
    expect(result.warnings.map((item) => item.code)).toContain(
      'OFFDAY_PRESENT_PAYABLE'
    )
    expect(result.facts).toMatchObject({
      timeBasedEmployeeCount: 1,
      payablePresentDays: 5,
      offdayPresentDays: 1,
      recurringComponentCount: 1,
    })
    expect(String(db.query.mock.calls[0]?.[0])).toContain('rate_matches')
  })

  it('TIME_BASED memblokir snapshot yang tidak cocok dan perubahan gaji di tengah periode', async () => {
    const db = executor([
      [
        {
          employeeUid: '22222222-2222-4222-8222-222222222222',
          employeeNumber: 'JPR-002',
          fullName: 'Budi',
          employeeType: 'BULANAN',
          eligibleFrom: '2026-08-01',
          eligibleTo: '2026-08-31',
          payablePresentDays: 20,
          offdayPresentDays: 0,
          alphaDays: 1,
          permissionDays: 0,
          missingBaseDays: 0,
          ambiguousBaseDays: 0,
          invalidContractDays: 0,
          duplicateAttendanceDays: 0,
          missingAttendanceDays: 0,
          unsupportedCurrencyDays: 0,
          rateSegmentCount: 2,
          baseAmount: '5000000',
          currency: 'IDR',
          bankAccountComplete: 1,
          manualComponentCount: 0,
        },
      ],
      [
        {
          dbToday: '2026-09-01',
          pendingCorrections: 0,
          pendingClassifications: 0,
          ambiguousEmployment: 0,
          unsupportedFormula: 0,
          activeManualComponents: 0,
        },
      ],
      [{ expectedDays: 22, finalizedDays: 22, runningDays: 0 }],
    ])
    const result = await evaluatePayrollReadiness(db as never, {
      ...period,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      payrollBasis: 'TIME_BASED',
      payFrequency: 'MONTHLY',
      employeeType: 'BULANAN',
      policySnapshot: {
        versionUid: 'policy',
        employeeType: 'HARIAN',
        wageBasis: 'TIME_BASED',
        payFrequency: 'WEEKLY',
      },
    })
    expect(result.blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'POLICY_SNAPSHOT_MISMATCH',
        'SALARY_SEGMENT_INVALID',
      ])
    )
    expect(result.facts.invalidSalarySegmentEmployees).toBe(1)
  })
})
