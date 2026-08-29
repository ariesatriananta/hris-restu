import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { ApiError } from './errors.js'
import {
  assertWagePolicyMatrix,
  previewPayrollPeriods,
  type TimePayrollEmployeeType,
} from './payroll-time-policy.js'

type Executor = Pick<Pool | PoolConnection, 'query'>

export type ResolvedPayrollPolicy = {
  id: number
  uid: string
  siteId: number
  employeeType: TimePayrollEmployeeType
  wageBasis: 'PIECE_RATE' | 'TIME_BASED'
  payFrequency: 'WEEKLY' | 'MONTHLY'
  cutoffType: 'WEEK_END' | 'LAST_DAY' | 'DAY_OF_MONTH'
  cutoffDay: number | null
  weekStartsOn: number
  prorateBasis: string
  attendancePayRule: string
  deductionDivisor: string
  roundingMode: string
  roundingScale: number
  currency: 'IDR'
  effectiveFrom: string
  effectiveTo: string | null
}

export async function resolvePayrollPeriodPolicy(
  executor: Executor,
  input: {
    siteId: number
    employeeType: TimePayrollEmployeeType
    periodStart: string
    periodEnd: string
    lock?: boolean
  }
) {
  const [rows] = await executor.query<RowDataPacket[]>(
    `SELECT id,uid,site_id siteId,employee_type_code employeeType,
            wage_basis wageBasis,pay_frequency payFrequency,
            cutoff_type cutoffType,cutoff_day cutoffDay,
            week_starts_on weekStartsOn,prorate_basis prorateBasis,
            attendance_pay_rule attendancePayRule,
            deduction_divisor deductionDivisor,rounding_mode roundingMode,
            rounding_scale roundingScale,currency,
            DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom,
            DATE_FORMAT(effective_to,'%Y-%m-%d') effectiveTo
       FROM payroll_policy_versions
      WHERE site_id=? AND employee_type_code=? AND status='ACTIVE'
        AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
      ${input.lock ? 'FOR UPDATE' : ''}`,
    [input.siteId, input.employeeType, input.periodStart, input.periodEnd]
  )
  if (rows.length !== 1) {
    throw new ApiError(
      422,
      'Policy Payroll efektif tidak tunggal atau tidak mencakup seluruh periode.'
    )
  }
  const row = rows[0]
  const policy: ResolvedPayrollPolicy = {
    id: Number(row.id),
    uid: String(row.uid),
    siteId: Number(row.siteId),
    employeeType: String(row.employeeType) as TimePayrollEmployeeType,
    wageBasis: String(row.wageBasis) as ResolvedPayrollPolicy['wageBasis'],
    payFrequency: String(
      row.payFrequency
    ) as ResolvedPayrollPolicy['payFrequency'],
    cutoffType: String(row.cutoffType) as ResolvedPayrollPolicy['cutoffType'],
    cutoffDay: row.cutoffDay == null ? null : Number(row.cutoffDay),
    weekStartsOn: Number(row.weekStartsOn),
    prorateBasis: String(row.prorateBasis),
    attendancePayRule: String(row.attendancePayRule),
    deductionDivisor: String(row.deductionDivisor),
    roundingMode: String(row.roundingMode),
    roundingScale: Number(row.roundingScale),
    currency: String(row.currency) as 'IDR',
    effectiveFrom: String(row.effectiveFrom),
    effectiveTo: row.effectiveTo == null ? null : String(row.effectiveTo),
  }
  assertWagePolicyMatrix(policy)
  if (policy.wageBasis === 'PIECE_RATE') return policy
  const matches = previewPayrollPeriods({
    effectiveFrom: input.periodStart,
    payFrequency: policy.payFrequency,
    cutoffType: policy.cutoffType,
    cutoffDay: policy.cutoffDay,
    count: 1,
  })[0]
  if (
    !matches ||
    matches.start !== input.periodStart ||
    matches.end !== input.periodEnd
  ) {
    throw new ApiError(
      422,
      policy.payFrequency === 'WEEKLY'
        ? 'Periode mingguan wajib tepat Senin sampai Minggu selama tujuh hari.'
        : 'Rentang periode tidak sesuai cutoff policy Payroll yang efektif.'
    )
  }
  return policy
}

export function payrollPolicySnapshot(policy: ResolvedPayrollPolicy) {
  return {
    versionUid: policy.uid,
    employeeType: policy.employeeType,
    wageBasis: policy.wageBasis,
    payFrequency: policy.payFrequency,
    cutoffType: policy.cutoffType,
    cutoffDay: policy.cutoffDay,
    weekStartsOn: policy.weekStartsOn,
    prorateBasis: policy.prorateBasis,
    attendancePayRule: policy.attendancePayRule,
    deductionDivisor: policy.deductionDivisor,
    roundingMode: policy.roundingMode,
    roundingScale: policy.roundingScale,
    currency: policy.currency,
    effectiveFrom: policy.effectiveFrom,
    effectiveTo: policy.effectiveTo,
  }
}

export async function insertPayrollPolicySnapshot(
  conn: PoolConnection,
  input: {
    payrollPeriodId: number
    policy: ResolvedPayrollPolicy
    userId: number
  }
) {
  await conn.execute(
    `INSERT INTO payroll_period_policy_snapshots(
       uid,payroll_period_id,payroll_policy_version_id,policy_snapshot,created_by
     ) VALUES(?,?,?,?,?)`,
    [
      randomUUID(),
      input.payrollPeriodId,
      input.policy.id,
      JSON.stringify(payrollPolicySnapshot(input.policy)),
      input.userId,
    ]
  )
}

export type TimePayrollPreviewRow = {
  employeeUid: string
  employeeNumber: string
  fullName: string
  employeeType: string
  eligibleFrom: string
  eligibleTo: string
  payablePresentDays: number
  offdayPresentDays: number
  alphaDays: number
  permissionDays: number
  eligibleCalendarDays: number
  scheduledWorkDays: number
  baseAmount: string | null
  estimatedGrossAmount: string
  estimatedDeductionAmount: string
  estimatedNetAmount: string
  currency: string | null
  baseCoverage: 'COVERED' | 'MISSING' | 'AMBIGUOUS'
  contractCoverage: 'VALID' | 'INVALID'
  missingBaseDays: number
  ambiguousBaseDays: number
  invalidContractDays: number
  duplicateAttendanceDays: number
  missingAttendanceDays: number
  unsupportedCurrencyDays: number
  rateSegmentCount: number
  bankAccountComplete: boolean
  manualComponentCount: number
}

export async function previewTimeBasedPopulation(
  executor: Executor,
  input: {
    periodId?: number | null
    siteId: number
    employeeType: 'HARIAN' | 'TRAINING' | 'BULANAN'
    periodStart: string
    periodEnd: string
  }
) {
  const isMonthly = input.employeeType === 'BULANAN'
  const rateTable = isMonthly
    ? 'employee_salary_histories'
    : 'employee_daily_rate_histories'
  const rateAmount = isMonthly ? 'basic_salary' : 'daily_rate'
  const rateScope = isMonthly
    ? ''
    : 'AND rate.site_id=eligible.site_id AND rate.employee_type_code=eligible.employee_type'
  const [rows] = await executor.query<RowDataPacket[]>(
    `WITH RECURSIVE dates AS (
       SELECT CAST(? AS DATE) business_date
       UNION ALL SELECT DATE_ADD(business_date,INTERVAL 1 DAY) FROM dates WHERE business_date<?
     ), eligible AS (
       SELECT d.business_date,e.id employee_id,e.uid employee_uid,e.employee_number,e.full_name,
              (e.bank_name IS NOT NULL AND TRIM(e.bank_name)<>''
               AND e.bank_account_number IS NOT NULL AND TRIM(e.bank_account_number)<>''
               AND e.bank_account_name IS NOT NULL AND TRIM(e.bank_account_name)<>'') bank_account_complete,
              eh.site_id,et.code employee_type
         FROM dates d
         JOIN employee_employment_histories eh
           ON eh.site_id=? AND eh.effective_from<=d.business_date
          AND (eh.effective_to IS NULL OR eh.effective_to>=d.business_date)
         JOIN employees e ON e.id=eh.employee_id
         JOIN employee_types et ON et.id=eh.employee_type_id AND et.code=?
         JOIN employee_statuses es ON es.id=eh.employee_status_id AND es.allows_attendance=1
        WHERE (SELECT COUNT(*) FROM employee_employment_histories active_history
                WHERE active_history.employee_id=eh.employee_id
                  AND active_history.effective_from<=d.business_date
                  AND (active_history.effective_to IS NULL OR active_history.effective_to>=d.business_date))=1
     ), daily AS (
       SELECT eligible.*,
              (SELECT COUNT(*) FROM ${rateTable} rate
                WHERE rate.employee_id=eligible.employee_id AND rate.status='ACTIVE' ${rateScope}
                  AND rate.effective_from<=eligible.business_date
                  AND (rate.effective_to IS NULL OR rate.effective_to>=eligible.business_date)) rate_matches,
              (SELECT MAX(rate.${rateAmount}) FROM ${rateTable} rate
                WHERE rate.employee_id=eligible.employee_id AND rate.status='ACTIVE' ${rateScope}
                  AND rate.effective_from<=eligible.business_date
                  AND (rate.effective_to IS NULL OR rate.effective_to>=eligible.business_date)) rate_amount,
              (SELECT MAX(rate.currency) FROM ${rateTable} rate
                WHERE rate.employee_id=eligible.employee_id AND rate.status='ACTIVE' ${rateScope}
                  AND rate.effective_from<=eligible.business_date
                  AND (rate.effective_to IS NULL OR rate.effective_to>=eligible.business_date)) currency,
              (SELECT COUNT(*) FROM employee_contracts contract
                JOIN contract_types contract_type ON contract_type.id=contract.contract_type_id
                WHERE contract.employee_id=eligible.employee_id
                  AND contract.status NOT IN ('DRAFT','CANCELLED')
                  AND contract.start_date<=eligible.business_date
                  AND (contract.end_date IS NULL OR contract.end_date>=eligible.business_date)
                  AND ((eligible.employee_type='TRAINING' AND contract_type.code='TRAINING')
                    OR (eligible.employee_type IN ('HARIAN','BULANAN') AND contract_type.code IN ('PKWT','PKWTT')))) contract_matches,
              (SELECT COUNT(*) FROM attendance_records attendance
                WHERE attendance.employee_id=eligible.employee_id AND attendance.site_id=eligible.site_id
                  AND attendance.business_date=eligible.business_date) attendance_matches,
              (SELECT MAX(attendance.attendance_status) FROM attendance_records attendance
                WHERE attendance.employee_id=eligible.employee_id AND attendance.site_id=eligible.site_id
                  AND attendance.business_date=eligible.business_date) attendance_status,
              (SELECT MAX(attendance.calendar_day_type) FROM attendance_records attendance
                WHERE attendance.employee_id=eligible.employee_id AND attendance.site_id=eligible.site_id
                  AND attendance.business_date=eligible.business_date) calendar_day_type,
              (SELECT COUNT(*) FROM employee_shift_assignments assignment
                JOIN shifts shift_row ON shift_row.id=assignment.shift_id AND shift_row.site_id=eligible.site_id
                WHERE assignment.employee_id=eligible.employee_id
                  AND assignment.effective_from<=eligible.business_date
                  AND (assignment.effective_to IS NULL OR assignment.effective_to>=eligible.business_date)
                  AND JSON_CONTAINS(
                    assignment.work_days_json,
                    CAST((((DAYOFWEEK(eligible.business_date)+5)%7)+1) AS CHAR),
                    '$'
                  )) shift_matches
         FROM eligible
     )
     SELECT employee_uid employeeUid,employee_number employeeNumber,full_name fullName,
            employee_type employeeType,MAX(bank_account_complete) bankAccountComplete,
            DATE_FORMAT(MIN(business_date),'%Y-%m-%d') eligibleFrom,
            DATE_FORMAT(MAX(business_date),'%Y-%m-%d') eligibleTo,
            SUM(attendance_matches=1 AND attendance_status='PRESENT') payablePresentDays,
            SUM(attendance_matches=1 AND attendance_status='PRESENT' AND calendar_day_type<>'WORKDAY') offdayPresentDays,
            SUM(attendance_matches=1 AND attendance_status='ABSENT') alphaDays,
            SUM(attendance_matches=1 AND attendance_status='PERMISSION') permissionDays,
            COUNT(*) eligibleCalendarDays,
            SUM(attendance_matches=1 AND calendar_day_type='WORKDAY') scheduledWorkDays,
            SUM(rate_matches=0) missingBaseDays,SUM(rate_matches>1) ambiguousBaseDays,
            SUM(contract_matches<>1) invalidContractDays,SUM(attendance_matches>1) duplicateAttendanceDays,
            SUM(attendance_matches=0 AND shift_matches=1) missingAttendanceDays,
            SUM(rate_matches=1 AND currency<>'IDR') unsupportedCurrencyDays,
            COUNT(DISTINCT CASE WHEN rate_matches=1 THEN CONCAT(rate_amount,'|',currency) END) rateSegmentCount,
            CASE WHEN SUM(rate_matches<>1)=0 AND COUNT(DISTINCT CONCAT(rate_amount,'|',currency))=1
                 THEN MAX(rate_amount) ELSE NULL END baseAmount,
            CASE WHEN SUM(rate_matches<>1)=0 AND COUNT(DISTINCT currency)=1 THEN MAX(currency) ELSE NULL END currency,
            CAST(ROUND(SUM(CASE
              WHEN employee_type IN ('HARIAN','TRAINING') AND attendance_matches=1
                AND attendance_status='PRESENT' AND rate_matches=1 AND currency='IDR'
                THEN rate_amount ELSE 0 END),0) AS CHAR) estimatedWeeklyGross,
            (SELECT COUNT(*) FROM payroll_period_manual_components manual
              WHERE manual.payroll_period_id=? AND manual.employee_id=daily.employee_id AND manual.status='ACTIVE') manualComponentCount
       FROM daily
      GROUP BY employee_id,employee_uid,employee_number,full_name,employee_type
      ORDER BY full_name,employee_number`,
    [
      input.periodStart,
      input.periodEnd,
      input.siteId,
      input.employeeType,
      input.periodId ?? 0,
    ]
  )
  const periodDays =
    Math.floor(
      (Date.parse(`${input.periodEnd}T00:00:00Z`) -
        Date.parse(`${input.periodStart}T00:00:00Z`)) /
        86_400_000
    ) + 1
  return rows.map((row): TimePayrollPreviewRow => {
    const baseAmount = Number(row.baseAmount ?? 0)
    const eligibleDays = Number(row.eligibleCalendarDays ?? 0)
    const scheduledDays = Number(row.scheduledWorkDays ?? 0)
    const deductionDays =
      Number(row.alphaDays ?? 0) + Number(row.permissionDays ?? 0)
    const monthlyBase =
      isMonthly && periodDays > 0
        ? Math.round((baseAmount * eligibleDays) / periodDays)
        : 0
    const monthlyDeduction =
      isMonthly && scheduledDays > 0
        ? Math.round((baseAmount / scheduledDays) * deductionDays)
        : 0
    const estimatedGrossAmount = isMonthly
      ? monthlyBase
      : Number(row.estimatedWeeklyGross ?? 0)
    return {
      employeeUid: String(row.employeeUid),
      employeeNumber: String(row.employeeNumber),
      fullName: String(row.fullName),
      employeeType: String(row.employeeType),
      eligibleFrom: String(row.eligibleFrom),
      eligibleTo: String(row.eligibleTo),
      payablePresentDays: Number(row.payablePresentDays ?? 0),
      offdayPresentDays: Number(row.offdayPresentDays ?? 0),
      alphaDays: Number(row.alphaDays ?? 0),
      permissionDays: Number(row.permissionDays ?? 0),
      eligibleCalendarDays: eligibleDays,
      scheduledWorkDays: scheduledDays,
      baseAmount: row.baseAmount == null ? null : String(row.baseAmount),
      estimatedGrossAmount: String(estimatedGrossAmount),
      estimatedDeductionAmount: String(monthlyDeduction),
      estimatedNetAmount: String(estimatedGrossAmount - monthlyDeduction),
      currency: row.currency == null ? null : String(row.currency),
      baseCoverage:
        Number(row.ambiguousBaseDays) > 0
          ? 'AMBIGUOUS'
          : Number(row.missingBaseDays) > 0
            ? 'MISSING'
            : 'COVERED',
      contractCoverage:
        Number(row.invalidContractDays) === 0 ? 'VALID' : 'INVALID',
      missingBaseDays: Number(row.missingBaseDays ?? 0),
      ambiguousBaseDays: Number(row.ambiguousBaseDays ?? 0),
      invalidContractDays: Number(row.invalidContractDays ?? 0),
      duplicateAttendanceDays: Number(row.duplicateAttendanceDays ?? 0),
      missingAttendanceDays: Number(row.missingAttendanceDays ?? 0),
      unsupportedCurrencyDays: Number(row.unsupportedCurrencyDays ?? 0),
      rateSegmentCount: Number(row.rateSegmentCount ?? 0),
      bankAccountComplete: Number(row.bankAccountComplete) === 1,
      manualComponentCount: Number(row.manualComponentCount ?? 0),
    }
  })
}
