import { describe, expect, it } from 'vitest'
import type { PayrollWorkflow } from './domain'
import {
  isRecalculationIssue,
  payrollApprovalStatusLabel,
  payrollWorkflowStageIndex,
} from './payroll-workflow'

function workflow(overrides: Partial<PayrollWorkflow> = {}): PayrollWorkflow {
  return {
    periodUid: '11111111-1111-4111-8111-111111111111',
    periodStatus: 'CALCULATED',
    currentRun: {
      uid: '22222222-2222-4222-8222-222222222222',
      runNumber: 1,
      runType: 'SIMULATION',
      status: 'COMPLETED',
      employeeCount: 10,
      totalPieceRateAmount: '900000.00',
      totalEarnings: '200000.00',
      totalDeductions: '100000.00',
      totalNetPay: '1000000.00',
    },
    approval: null,
    capabilities: {
      canSubmit: true,
      canWithdraw: false,
      canApprove: false,
      canReject: false,
      canClose: false,
    },
    integrity: { valid: true, issues: [] },
    history: [],
    ...overrides,
  }
}

describe('payroll approval workflow helpers', () => {
  it('menghitung progres tanpa menganggap reject atau tarik sebagai selesai', () => {
    expect(payrollWorkflowStageIndex(workflow())).toBe(0)
    expect(
      payrollWorkflowStageIndex(
        workflow({
          approval: {
            uid: '33333333-3333-4333-8333-333333333333',
            status: 'CANCELLED',
            requestedAt: '2026-08-28T10:00:00.000Z',
            requestedByName: 'Finance',
            reviewedAt: null,
            reviewedByName: null,
            notes: null,
            superAdminOverride: false,
          },
        })
      )
    ).toBe(0)
    expect(payrollApprovalStatusLabel('CANCELLED')).toBe('Ditarik')
  })

  it('mengenali isu yang meminta hitung ulang', () => {
    expect(isRecalculationIssue('COMPONENT_SNAPSHOT_DRIFT')).toBe(true)
    expect(isRecalculationIssue('MISSING_BANK_ACCOUNT')).toBe(false)
  })
})
