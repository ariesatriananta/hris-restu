import { ApiError } from './errors.js'

export const timePayrollEmployeeTypes = ['BORONGAN', 'HARIAN', 'TRAINING', 'BULANAN'] as const
export type TimePayrollEmployeeType = (typeof timePayrollEmployeeTypes)[number]
export type WageBasis = 'PIECE_RATE' | 'TIME_BASED'
export type PayFrequency = 'WEEKLY' | 'MONTHLY'
export type CutoffType = 'WEEK_END' | 'LAST_DAY' | 'DAY_OF_MONTH'

export const wageMatrix: Record<TimePayrollEmployeeType, {
  wageBasis: WageBasis
  payFrequency: PayFrequency
  attendancePayRule: 'INFORMATIONAL' | 'PRESENT_ONLY' | 'MONTHLY_DEDUCTION'
  prorateBasis: 'NONE' | 'CALENDAR_ELIGIBLE'
  deductionDivisor: 'NONE' | 'SCHEDULED_WORKDAYS'
}> = {
  BORONGAN: { wageBasis: 'PIECE_RATE', payFrequency: 'WEEKLY', attendancePayRule: 'INFORMATIONAL', prorateBasis: 'NONE', deductionDivisor: 'NONE' },
  HARIAN: { wageBasis: 'TIME_BASED', payFrequency: 'WEEKLY', attendancePayRule: 'PRESENT_ONLY', prorateBasis: 'NONE', deductionDivisor: 'NONE' },
  TRAINING: { wageBasis: 'TIME_BASED', payFrequency: 'WEEKLY', attendancePayRule: 'PRESENT_ONLY', prorateBasis: 'NONE', deductionDivisor: 'NONE' },
  BULANAN: { wageBasis: 'TIME_BASED', payFrequency: 'MONTHLY', attendancePayRule: 'MONTHLY_DEDUCTION', prorateBasis: 'CALENDAR_ELIGIBLE', deductionDivisor: 'SCHEDULED_WORKDAYS' },
}

export function assertWagePolicyMatrix(input: {
  employeeType: TimePayrollEmployeeType
  wageBasis: WageBasis
  payFrequency: PayFrequency
  cutoffType: CutoffType
  cutoffDay?: number | null
}) {
  const expected = wageMatrix[input.employeeType]
  if (expected.wageBasis !== input.wageBasis || expected.payFrequency !== input.payFrequency) {
    throw new ApiError(422, `Skema ${input.employeeType} wajib ${expected.wageBasis}/${expected.payFrequency}.`)
  }
  if (input.payFrequency === 'WEEKLY') {
    if (input.cutoffType !== 'WEEK_END' || input.cutoffDay != null) {
      throw new ApiError(422, 'Payroll mingguan wajib memakai periode Senin-Minggu.')
    }
  } else if (input.cutoffType === 'LAST_DAY') {
    if (input.cutoffDay != null) throw new ApiError(422, 'Cutoff akhir bulan tidak memakai tanggal cutoff.')
  } else if (input.cutoffType !== 'DAY_OF_MONTH' || !Number.isInteger(input.cutoffDay) || Number(input.cutoffDay) < 1 || Number(input.cutoffDay) > 31) {
    throw new ApiError(422, 'Tanggal cutoff bulanan harus antara 1 sampai 31.')
  }
  return expected
}

function iso(date: Date) { return date.toISOString().slice(0, 10) }
function utcDate(raw: string) {
  const date = new Date(`${raw}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime())) throw new ApiError(422, 'Tanggal efektif tidak valid.')
  return date
}
function addDays(date: Date, days: number) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next }
function lastDay(year: number, month: number) { return new Date(Date.UTC(year, month + 1, 0)) }
function cutoffDate(year: number, month: number, cutoffType: CutoffType, cutoffDay?: number | null) {
  if (cutoffType === 'LAST_DAY') return lastDay(year, month)
  const last = lastDay(year, month).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(Number(cutoffDay), last)))
}

export function previewPayrollPeriods(input: {
  effectiveFrom: string
  payFrequency: PayFrequency
  cutoffType: CutoffType
  cutoffDay?: number | null
  count?: number
}) {
  const count = Math.min(Math.max(input.count ?? 3, 1), 12)
  const effective = utcDate(input.effectiveFrom)
  const periods: Array<{ start: string; end: string }> = []
  if (input.payFrequency === 'WEEKLY') {
    const weekday = effective.getUTCDay() || 7
    let start = addDays(effective, 1 - weekday)
    if (start < effective) start = addDays(start, 7)
    for (let index = 0; index < count; index++) {
      periods.push({ start: iso(start), end: iso(addDays(start, 6)) })
      start = addDays(start, 7)
    }
    return periods
  }
  let year = effective.getUTCFullYear()
  let month = effective.getUTCMonth()
  let end = cutoffDate(year, month, input.cutoffType, input.cutoffDay)
  if (end < effective) { month += 1; if (month > 11) { month = 0; year += 1 }; end = cutoffDate(year, month, input.cutoffType, input.cutoffDay) }
  let start = addDays(cutoffDate(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, input.cutoffType, input.cutoffDay), 1)
  if (input.cutoffType === 'LAST_DAY') start = new Date(Date.UTC(year, month, 1))
  for (let index = 0; index < count; index++) {
    periods.push({ start: iso(start), end: iso(end) })
    start = addDays(end, 1)
    month += 1; if (month > 11) { month = 0; year += 1 }
    end = cutoffDate(year, month, input.cutoffType, input.cutoffDay)
  }
  return periods
}

export function assertNoEffectiveOverlap(
  existing: Array<{ effectiveFrom: string; effectiveTo: string | null }>,
  candidate: { effectiveFrom: string; effectiveTo?: string | null }
) {
  const end = candidate.effectiveTo ?? '9999-12-31'
  if (end < candidate.effectiveFrom) throw new ApiError(422, 'Tanggal akhir tidak boleh sebelum tanggal awal.')
  if (existing.some((row) => row.effectiveFrom <= end && (row.effectiveTo ?? '9999-12-31') >= candidate.effectiveFrom)) {
    throw new ApiError(409, 'Periode berlaku bertumpang-tindih dengan histori yang sudah ada.')
  }
}

export function assertSalaryEffectiveDate(input: {
  effectiveFrom: string
  isInitial: boolean
  eligibilityStart: string
  allowedPeriodStarts: string[]
}) {
  if (input.isInitial && input.effectiveFrom === input.eligibilityStart) return
  if (!input.allowedPeriodStarts.includes(input.effectiveFrom)) {
    throw new ApiError(422, 'Perubahan gaji pokok wajib dimulai pada awal periode Payroll. Gaji pertama boleh dimulai pada tanggal awal eligibility karyawan.')
  }
}

export function isPayrollPeriodStart(input: {
  date: string
  payFrequency: PayFrequency
  cutoffType: CutoffType
  cutoffDay?: number | null
}) {
  const date = utcDate(input.date)
  if (input.payFrequency === 'WEEKLY') return (date.getUTCDay() || 7) === 1
  if (input.cutoffType === 'LAST_DAY') return date.getUTCDate() === 1
  const previous = addDays(date, -1)
  return previous.getUTCDate() === Math.min(Number(input.cutoffDay), lastDay(previous.getUTCFullYear(), previous.getUTCMonth()).getUTCDate())
}
