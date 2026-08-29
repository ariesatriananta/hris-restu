import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { ApiError } from './errors.js'

export const payrollPeriodStatuses = [
  'DRAFT',
  'CALCULATED',
  'APPROVED',
  'CLOSED',
  'CANCELLED',
] as const

export type PayrollPeriodStatus = (typeof payrollPeriodStatuses)[number]
export type PayrollPeriodAction =
  | 'CALCULATE'
  | 'RECALCULATE'
  | 'REQUEST_APPROVAL'
  | 'APPROVE'
  | 'REJECT'
  | 'CLOSE'
  | 'CANCEL'

export function payrollPeriodTransition(input: {
  status: PayrollPeriodStatus
  action: PayrollPeriodAction
  hasPendingApproval?: boolean
}): PayrollPeriodStatus {
  const pending = input.hasPendingApproval === true

  if (input.action === 'CALCULATE' && input.status === 'DRAFT') {
    return 'CALCULATED'
  }
  if (
    input.action === 'RECALCULATE' &&
    input.status === 'CALCULATED' &&
    !pending
  ) {
    return 'CALCULATED'
  }
  if (
    input.action === 'REQUEST_APPROVAL' &&
    input.status === 'CALCULATED' &&
    !pending
  ) {
    return 'CALCULATED'
  }
  if (input.action === 'APPROVE' && input.status === 'CALCULATED' && pending) {
    return 'APPROVED'
  }
  if (input.action === 'REJECT' && input.status === 'CALCULATED' && pending) {
    return 'CALCULATED'
  }
  if (input.action === 'CLOSE' && input.status === 'APPROVED') {
    return 'CLOSED'
  }
  if (input.action === 'CANCEL' && input.status === 'DRAFT') {
    return 'CANCELLED'
  }

  throw new ApiError(
    409,
    input.action === 'RECALCULATE' && pending
      ? 'Payroll tidak dapat dihitung ulang selama persetujuan masih menunggu.'
      : `Aksi ${input.action} tidak valid untuk Payroll berstatus ${input.status}.`
  )
}

export function payrollPeriodsOverlap(
  first: { start: string; end: string },
  second: { start: string; end: string }
) {
  return first.start <= second.end && second.start <= first.end
}

export function assertPayrollPeriodRange(input: {
  periodStart: string
  periodEnd: string
  maximumDays?: number
}) {
  const start = Date.parse(`${input.periodStart}T00:00:00Z`)
  const end = Date.parse(`${input.periodEnd}T00:00:00Z`)
  const maximumDays = input.maximumDays ?? 31
  const totalDays = Math.floor((end - start) / 86_400_000) + 1

  if (!Number.isFinite(totalDays) || totalDays < 1) {
    throw new ApiError(
      422,
      'Tanggal akhir periode tidak boleh sebelum tanggal awal.'
    )
  }
  if (totalDays > maximumDays) {
    throw new ApiError(
      422,
      `Rentang periode Payroll maksimal ${maximumDays} hari.`
    )
  }
}

export async function assertNoOverlappingPayrollPeriod(
  conn: PoolConnection,
  input: {
    siteId: number
    payrollBasis: 'PIECE_RATE' | 'TIME_BASED'
    payFrequency?: 'WEEKLY' | 'MONTHLY'
    employeeType?: 'BORONGAN' | 'HARIAN' | 'TRAINING' | 'BULANAN'
    periodStart: string
    periodEnd: string
    excludePeriodId?: number
  }
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id,period_code periodCode
       FROM payroll_periods
      WHERE site_id=? AND payroll_basis=?
        AND (? IS NULL OR pay_frequency=?)
        AND (? IS NULL OR employee_type_code=?)
        AND status<>'CANCELLED'
        AND period_start<=? AND period_end>=?
        AND (? IS NULL OR id<>?)
      LIMIT 1 FOR UPDATE`,
    [
      input.siteId,
      input.payrollBasis,
      input.payFrequency ?? null,
      input.payFrequency ?? null,
      input.employeeType ?? null,
      input.employeeType ?? null,
      input.periodEnd,
      input.periodStart,
      input.excludePeriodId ?? null,
      input.excludePeriodId ?? null,
    ]
  )
  if (rows[0]) {
    throw new ApiError(
      409,
      `Periode Payroll bertumpang-tindih dengan ${String(rows[0].periodCode)}.`
    )
  }
}
