import { describe, expect, it } from 'vitest'
import {
  nextPayrollProcessStage,
  payrollProcessHref,
} from './payroll-process-navigation'

describe('Payroll process navigation', () => {
  it('membawa periode terpilih ke tahap perhitungan dan persetujuan', () => {
    expect(payrollProcessHref('CALCULATION', 'period-1')).toBe(
      '/payroll/simulasi?periodUid=period-1'
    )
    expect(payrollProcessHref('APPROVAL', 'period-1')).toBe(
      '/payroll/approval-closing?periodUid=period-1'
    )
  })

  it('tetap aman saat periode belum dipilih', () => {
    expect(payrollProcessHref('PERIOD')).toBe('/payroll/periode')
    expect(payrollProcessHref('CALCULATION')).toBe('/payroll/simulasi')
  })

  it('mengarahkan status periode ke tahap yang relevan', () => {
    expect(nextPayrollProcessStage('DRAFT')).toBe('CALCULATION')
    expect(nextPayrollProcessStage('CALCULATED')).toBe('CALCULATION')
    expect(nextPayrollProcessStage('APPROVED')).toBe('APPROVAL')
    expect(nextPayrollProcessStage('CLOSED')).toBe('APPROVAL')
  })
})
