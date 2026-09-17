import type { PayrollPeriodStatus } from './domain'

export type PayrollProcessStage = 'PERIOD' | 'CALCULATION' | 'APPROVAL'

const stagePaths: Record<PayrollProcessStage, string> = {
  PERIOD: '/payroll/periode',
  CALCULATION: '/payroll/simulasi',
  APPROVAL: '/payroll/approval-closing',
}

export function payrollProcessHref(
  stage: PayrollProcessStage,
  periodUid?: string
) {
  const path = stagePaths[stage]
  if (stage === 'PERIOD' || !periodUid) return path
  return `${path}?periodUid=${encodeURIComponent(periodUid)}`
}

export function nextPayrollProcessStage(
  status: PayrollPeriodStatus
): Exclude<PayrollProcessStage, 'PERIOD'> {
  return status === 'APPROVED' || status === 'CLOSED'
    ? 'APPROVAL'
    : 'CALCULATION'
}
