import type { PayrollHistoryPeriod, PayrollRunSummary } from './domain'

export function payrollPeriodsWithOfficialPayslips(
  periods: PayrollHistoryPeriod[]
) {
  return periods.filter(
    (period) =>
      period.status === 'CLOSED' &&
      period.currentRun?.status === 'COMPLETED' &&
      period.currentRun.runType === 'FINAL' &&
      period.currentRun.isCurrent
  )
}

export function updatePayrollComparisonSelection(
  current: string[],
  uid: string
) {
  if (current.includes(uid)) return current.filter((item) => item !== uid)
  return current.length < 2 ? [...current, uid] : [current[1], uid]
}

export function canExportPayrollPayment(
  run: Pick<PayrollRunSummary, 'runType' | 'isCurrent'>,
  periodClosed: boolean,
  permitted: boolean
) {
  return permitted && periodClosed && run.runType === 'FINAL' && run.isCurrent
}

export function emptyPayrollHistoryFilters() {
  return {
    query: undefined,
    siteCode: undefined,
    status: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    page: undefined,
  }
}
