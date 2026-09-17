import type {
  PayrollApprovalStatus,
  PayrollPeriodStatus,
  PayrollWorkflow,
  PayrollWorkflowAction,
} from './domain'

export type PayrollWorkflowNextStep =
  | 'CALCULATE'
  | 'RECALCULATE'
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'WITHDRAW'
  | 'WAIT_APPROVAL'
  | 'WAIT_CORRECTION'
  | 'CLOSE'
  | 'WAIT_CLOSE'
  | 'REVIEW_PERIOD'
  | 'PAYSLIP'
  | 'NONE'

export const payrollWorkflowStages = [
  { key: 'SIMULATION', label: 'Simulasi' },
  { key: 'SUBMITTED', label: 'Diajukan' },
  { key: 'APPROVED', label: 'Disetujui' },
  { key: 'CLOSED', label: 'Ditutup' },
] as const

export function payrollWorkflowStageIndex(workflow: PayrollWorkflow) {
  if (workflow.periodStatus === 'CLOSED') return 3
  if (workflow.approval?.status === 'APPROVED') return 2
  if (workflow.approval?.status === 'PENDING') return 1
  return workflow.currentRun ? 0 : -1
}

export function payrollWorkflowNextStep(
  workflow: PayrollWorkflow
): PayrollWorkflowNextStep {
  if (workflow.periodStatus === 'CLOSED') return 'PAYSLIP'

  if (
    workflow.periodStatus === 'APPROVED' ||
    workflow.approval?.status === 'APPROVED'
  ) {
    if (!workflow.integrity.valid) return 'REVIEW_PERIOD'
    return workflow.capabilities.canClose ? 'CLOSE' : 'WAIT_CLOSE'
  }

  if (!workflow.currentRun || workflow.periodStatus === 'DRAFT') {
    return 'CALCULATE'
  }

  if (workflow.approval?.status === 'PENDING') {
    if (!workflow.integrity.valid) {
      if (workflow.capabilities.canReject) return 'REJECT'
      if (workflow.capabilities.canWithdraw) return 'WITHDRAW'
      return 'WAIT_CORRECTION'
    }
    return workflow.capabilities.canApprove ? 'APPROVE' : 'WAIT_APPROVAL'
  }

  if (!workflow.integrity.valid) return 'RECALCULATE'

  if (workflow.capabilities.canSubmit) return 'SUBMIT'
  return 'NONE'
}

export function payrollPeriodStatusLabel(status: PayrollPeriodStatus) {
  const labels: Record<PayrollPeriodStatus, string> = {
    DRAFT: 'Draft',
    CALCULATED: 'Siap diajukan',
    APPROVED: 'Disetujui',
    CLOSED: 'Ditutup',
    CANCELLED: 'Dibatalkan',
  }
  return labels[status]
}

export function payrollApprovalStatusLabel(status: PayrollApprovalStatus) {
  const labels: Record<PayrollApprovalStatus, string> = {
    PENDING: 'Menunggu persetujuan',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
    CANCELLED: 'Ditarik',
  }
  return labels[status]
}

export function payrollWorkflowActionLabel(action: PayrollWorkflowAction) {
  const labels: Record<PayrollWorkflowAction, string> = {
    SUBMIT: 'Diajukan',
    APPROVE: 'Disetujui',
    REJECT: 'Ditolak',
    WITHDRAW: 'Ditarik',
    CLOSE: 'Ditutup',
  }
  return labels[action]
}

export function isRecalculationIssue(code: string) {
  return [
    'BANK_ACCOUNT_DRIFT',
    'PRODUCTION_SNAPSHOT_DRIFT',
    'COMPONENT_SNAPSHOT_DRIFT',
    'ATTENDANCE_SNAPSHOT_DRIFT',
    'POPULATION_SNAPSHOT_DRIFT',
    'AGGREGATE_MISMATCH',
    'RESULT_CALCULATION_MISMATCH',
    'RESULT_DETAIL_MISMATCH',
    'SNAPSHOT_MISMATCH',
  ].some((fragment) => code.includes(fragment))
}
