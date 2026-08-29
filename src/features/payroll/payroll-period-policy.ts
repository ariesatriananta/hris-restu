import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  getDaysInMonth,
  setDate,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'

type PeriodPolicy = {
  payFrequency: 'WEEKLY' | 'MONTHLY'
  cutoffType: 'WEEK_END' | 'LAST_DAY' | 'DAY_OF_MONTH'
  cutoffDay: number | null
}

export function periodForDate(anchor: Date, policy: PeriodPolicy) {
  if (policy.payFrequency === 'WEEKLY') {
    return {
      periodStart: format(
        startOfWeek(anchor, { weekStartsOn: 1 }),
        'yyyy-MM-dd'
      ),
      periodEnd: format(endOfWeek(anchor, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    }
  }

  if (policy.cutoffType === 'LAST_DAY') {
    return {
      periodStart: format(startOfMonth(anchor), 'yyyy-MM-dd'),
      periodEnd: format(endOfMonth(anchor), 'yyyy-MM-dd'),
    }
  }

  const cutoffDay = policy.cutoffDay ?? 31
  const cutoff = (month: Date) =>
    setDate(month, Math.min(cutoffDay, getDaysInMonth(month)))
  const currentCutoff = cutoff(anchor)
  const periodEnd =
    anchor <= currentCutoff ? currentCutoff : cutoff(addMonths(anchor, 1))
  const previousCutoff = cutoff(subMonths(periodEnd, 1))

  return {
    periodStart: format(addDays(previousCutoff, 1), 'yyyy-MM-dd'),
    periodEnd: format(periodEnd, 'yyyy-MM-dd'),
  }
}
