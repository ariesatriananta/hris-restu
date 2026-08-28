import type {
  PayrollApprovalStatus,
  PayrollPeriodStatus,
  PayrollWorkflow,
  PayrollWorkflowAction,
} from './domain'

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
