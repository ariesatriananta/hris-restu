import type { RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { evaluatePayrollReadiness } from './payroll-readiness.js'

type Executor = Pick<Pool | PoolConnection, 'query'>

export type PayrollIntegrityIssue = {
  code: string
  message: string
  count: number
}

export type PayrollRunIntegrity = {
  valid: boolean
  issues: PayrollIntegrityIssue[]
  warnings: PayrollIntegrityIssue[]
}

type RunScope = {
  id: number
  periodId: number
  siteId: number
  periodStart: string
  periodEnd: string
  payrollBasis?: 'PIECE_RATE' | 'TIME_BASED'
  payFrequency?: 'WEEKLY' | 'MONTHLY'
  employeeType?: 'BORONGAN' | 'HARIAN' | 'TRAINING' | 'BULANAN'
  policySnapshot?: unknown
}

function issue(code: string, message: string, count: unknown) {
  return { code, message, count: Number(count ?? 0) }
}

function integrityFromFacts(
  readiness: Awaited<ReturnType<typeof evaluatePayrollReadiness>>,
  facts: RowDataPacket
): PayrollRunIntegrity {
  const issues: PayrollIntegrityIssue[] = []
  const warnings: PayrollIntegrityIssue[] = []
  if (readiness.status === 'BLOCKED')
    issues.push(issue('READINESS_BLOCKED','Readiness Payroll berubah menjadi BLOCKED.',readiness.blockerCount))
  if (Number(facts.resultEmployeeCount ?? 0) === 0)
    issues.push(issue('EMPTY_RESULT', 'Hasil Payroll masih kosong.', 1))
  if (Number(facts.negativeNetCount ?? 0) > 0)
    issues.push(issue('NEGATIVE_NET_PAY','Terdapat karyawan dengan penerimaan bersih negatif.',facts.negativeNetCount))
  if (Number(facts.missingBankCount ?? 0) > 0)
    warnings.push(issue('MISSING_BANK_ACCOUNT','Snapshot rekening pembayaran belum lengkap. Daftar Pembayaran bank belum dapat dibuat untuk karyawan tersebut.',facts.missingBankCount))
  if (Number(facts.bankDriftCount ?? 0) > 0)
    issues.push(issue('BANK_ACCOUNT_DRIFT','Data rekening karyawan berubah setelah simulasi. Hitung ulang Payroll.',facts.bankDriftCount))
  const productionDrift = Number(facts.productionCountDrift ?? 0) + Number(facts.productionValueDrift ?? 0)
  if (productionDrift > 0)
    issues.push(issue('PRODUCTION_SNAPSHOT_DRIFT','Sumber Produksi berubah setelah simulasi. Hitung ulang Payroll.',productionDrift))
  const componentDrift = Number(facts.componentValueDrift ?? 0) + Number(facts.componentCountDrift ?? 0)
  if (componentDrift > 0)
    issues.push(issue('COMPONENT_SNAPSHOT_DRIFT','Komponen Payroll berubah setelah simulasi. Hitung ulang Payroll.',componentDrift))
  if (Number(facts.attendanceDrift ?? 0) > 0)
    issues.push(issue('ATTENDANCE_SNAPSHOT_DRIFT','Sumber atau ringkasan Attendance berubah setelah simulasi. Hitung ulang Payroll.',facts.attendanceDrift))
  if (Number(facts.rateDrift ?? 0) > 0)
    issues.push(issue('TIME_RATE_SNAPSHOT_DRIFT','Tarif harian berubah setelah simulasi. Hitung ulang Payroll.',facts.rateDrift))
  if (Number(facts.salaryDrift ?? 0) > 0)
    issues.push(issue('SALARY_SNAPSHOT_DRIFT','Gaji pokok berubah setelah simulasi. Hitung ulang Payroll.',facts.salaryDrift))
  if (Number(facts.scheduleDrift ?? 0) > 0)
    issues.push(issue('SCHEDULE_SNAPSHOT_DRIFT','Shift atau kalender kerja berubah setelah simulasi. Hitung ulang Payroll.',facts.scheduleDrift))
  if (Number(facts.policyDrift ?? 0) > 0)
    issues.push(issue('POLICY_SNAPSHOT_DRIFT','Policy Payroll berubah atau tidak sesuai snapshot periode. Hitung ulang Payroll.',facts.policyDrift))
  if (Number(facts.aggregateMismatch ?? 0) > 0)
    issues.push(issue('AGGREGATE_MISMATCH','Total run tidak konsisten dengan hasil per karyawan.',1))
  if (Number(facts.resultDetailMismatch ?? 0) > 0)
    issues.push(issue('RESULT_DETAIL_MISMATCH','Hasil per karyawan tidak konsisten dengan detail snapshot.',facts.resultDetailMismatch))
  if (Number(facts.populationDrift ?? 0) > 0)
    issues.push(issue('POPULATION_SNAPSHOT_DRIFT','Populasi Payroll berubah setelah simulasi. Hitung ulang Payroll.',facts.populationDrift))
  return { valid: issues.length === 0, issues, warnings }
}

async function inspectTimeBasedRunIntegrity(
  executor: Executor,
  run: RunScope,
  readiness: Awaited<ReturnType<typeof evaluatePayrollReadiness>>
): Promise<PayrollRunIntegrity> {
  const employeeType = run.employeeType
  if (!employeeType || !['HARIAN','TRAINING','BULANAN'].includes(employeeType)) {
    return {
      valid: false,
      issues: [issue('INVALID_PAYROLL_SCHEME','Identitas skema Payroll berbasis waktu tidak valid.',1)],
      warnings: [],
    }
  }
  const isMonthly = employeeType === 'BULANAN'
  const detailTable = isMonthly ? 'payroll_monthly_daily_details' : 'payroll_time_details'
  const rateFacts = isMonthly
    ? `COALESCE((SELECT COUNT(*) FROM ${detailTable} detail
         JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
         LEFT JOIN employee_salary_histories salary ON salary.id=detail.employee_salary_history_id
        WHERE result.payroll_run_id=pr.id AND (
          salary.id IS NULL OR salary.status<>'ACTIVE' OR
          salary.effective_from>detail.business_date OR
          COALESCE(salary.effective_to,'9999-12-31')<detail.business_date OR
          NOT (salary.basic_salary<=>detail.full_basic_salary_snapshot) OR
          NOT (salary.currency<=>detail.currency_snapshot)
        )),0) salaryDrift, 0 rateDrift,`
    : `COALESCE((SELECT COUNT(*) FROM ${detailTable} detail
         JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
         LEFT JOIN employee_daily_rate_histories rate ON rate.id=detail.employee_daily_rate_history_id
        WHERE result.payroll_run_id=pr.id AND (
          rate.id IS NULL OR rate.status<>'ACTIVE' OR rate.employee_type_code<>? OR
          rate.effective_from>detail.business_date OR
          COALESCE(rate.effective_to,'9999-12-31')<detail.business_date OR
          NOT (rate.daily_rate<=>detail.daily_rate_snapshot) OR
          NOT (rate.currency<=>'IDR')
        )),0) rateDrift, 0 salaryDrift,`
  const resultMismatch = isMonthly
    ? `NOT (result.basic_salary_amount<=>monthly.prorated_basic_salary) OR
       NOT (result.gross_earnings<=>(monthly.prorated_basic_salary+COALESCE(component.earnings,0))) OR
       NOT (result.total_deductions<=>COALESCE(component.deductions,0)) OR
       NOT (result.net_pay<=>(monthly.prorated_basic_salary+COALESCE(component.earnings,0)-COALESCE(component.deductions,0)))`
    : `NOT (result.basic_salary_amount<=>COALESCE(time_detail.baseAmount,0)) OR
       NOT (result.gross_earnings<=>(COALESCE(time_detail.baseAmount,0)+COALESCE(component.earnings,0))) OR
       NOT (result.total_deductions<=>COALESCE(component.deductions,0)) OR
       NOT (result.net_pay<=>(COALESCE(time_detail.baseAmount,0)+COALESCE(component.earnings,0)-COALESCE(component.deductions,0)))`
  const detailJoin = isMonthly
    ? `LEFT JOIN payroll_monthly_summaries monthly ON monthly.payroll_employee_result_id=result.id
       LEFT JOIN (SELECT payroll_employee_result_id,
          SUM(CASE WHEN component_category='EARNING' THEN amount ELSE 0 END) earnings,
          SUM(CASE WHEN component_category='DEDUCTION' THEN amount ELSE 0 END) deductions
         FROM payroll_employee_component_details GROUP BY payroll_employee_result_id) component
         ON component.payroll_employee_result_id=result.id`
    : `LEFT JOIN (SELECT payroll_employee_result_id,ROUND(SUM(amount_snapshot),0) baseAmount
         FROM payroll_time_details GROUP BY payroll_employee_result_id) time_detail
         ON time_detail.payroll_employee_result_id=result.id
       LEFT JOIN (SELECT payroll_employee_result_id,
          SUM(CASE WHEN component_category='EARNING' THEN amount ELSE 0 END) earnings,
          SUM(CASE WHEN component_category='DEDUCTION' THEN amount ELSE 0 END) deductions
         FROM payroll_employee_component_details GROUP BY payroll_employee_result_id) component
         ON component.payroll_employee_result_id=result.id`
  const attendanceExtra = isMonthly
    ? `OR NOT (COALESCE(attendance.calendar_reason_type,'NOT_RECORDED')<=>detail.calendar_reason_type_snapshot)`
    : ''
  const dailyScheduleMismatch = isMonthly
    ? `NOT (detail.is_scheduled<=>COALESCE(attendance.calendar_day_type='WORKDAY' AND (
          attendance.calendar_reason_type='WORKDAY_OVERRIDE' OR EXISTS(
            SELECT 1 FROM employee_shift_assignments assignment
            JOIN shifts shift_row ON shift_row.id=assignment.shift_id AND shift_row.site_id=result.site_id
            WHERE assignment.employee_id=result.employee_id
              AND assignment.effective_from<=detail.business_date
              AND (assignment.effective_to IS NULL OR assignment.effective_to>=detail.business_date)
              AND JSON_CONTAINS(assignment.work_days_json,
                CAST((((DAYOFWEEK(detail.business_date)+5)%7)+1) AS CHAR),'$')))),0))
        OR NOT (detail.deduction_type<=>CASE
          WHEN detail.is_scheduled=1 AND attendance.attendance_status='ABSENT' THEN 'ALPHA'
          WHEN detail.is_scheduled=1 AND attendance.attendance_status='PERMISSION' THEN 'PERMISSION'
          ELSE 'NONE' END)`
    : `NOT (detail.is_scheduled<=>EXISTS(
          SELECT 1 FROM employee_shift_assignments assignment
          JOIN shifts shift_row ON shift_row.id=assignment.shift_id AND shift_row.site_id=result.site_id
          WHERE assignment.employee_id=result.employee_id
            AND assignment.effective_from<=detail.business_date
            AND (assignment.effective_to IS NULL OR assignment.effective_to>=detail.business_date)
            AND JSON_CONTAINS(assignment.work_days_json,
              CAST((((DAYOFWEEK(detail.business_date)+5)%7)+1) AS CHAR),'$'))))
        OR NOT (detail.is_payable<=>COALESCE(attendance.attendance_status='PRESENT',0))
        OR NOT (detail.amount_snapshot<=>CASE WHEN attendance.attendance_status='PRESENT'
          THEN detail.daily_rate_snapshot ELSE 0 END)`
  const fullPeriodScheduleMismatch = isMonthly
    ? `+(SELECT COUNT(*) FROM payroll_monthly_summaries summary
        JOIN payroll_employee_results schedule_result
          ON schedule_result.id=summary.payroll_employee_result_id
        WHERE schedule_result.payroll_run_id=pr.id
          AND summary.scheduled_work_days<>(
            SELECT COALESCE(SUM(CASE
              WHEN EXISTS(SELECT 1 FROM attendance_calendar_site_rules override_rule
                WHERE override_rule.site_id=schedule_result.site_id
                  AND override_rule.business_date=dates.business_date
                  AND override_rule.rule_type='WORKDAY_OVERRIDE' AND override_rule.cancelled_at IS NULL) THEN 1
              WHEN EXISTS(SELECT 1 FROM attendance_calendar_events holiday_event
                WHERE holiday_event.event_date=dates.business_date
                  AND holiday_event.event_type='NATIONAL_HOLIDAY' AND holiday_event.cancelled_at IS NULL)
                OR EXISTS(SELECT 1 FROM attendance_calendar_site_rules holiday_rule
                  LEFT JOIN attendance_calendar_events linked_event ON linked_event.id=holiday_rule.calendar_event_id
                  WHERE holiday_rule.site_id=schedule_result.site_id
                    AND holiday_rule.business_date=dates.business_date
                    AND holiday_rule.rule_type IN ('COLLECTIVE_LEAVE','SITE_HOLIDAY')
                    AND holiday_rule.cancelled_at IS NULL
                    AND (linked_event.id IS NULL OR linked_event.cancelled_at IS NULL)) THEN 0
              ELSE COALESCE(JSON_CONTAINS((SELECT assignment.work_days_json
                FROM employee_shift_assignments assignment
                JOIN shifts shift_row ON shift_row.id=assignment.shift_id AND shift_row.site_id=schedule_result.site_id
                WHERE assignment.employee_id=schedule_result.employee_id
                  AND assignment.effective_from<=? AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
                ORDER BY CASE
                  WHEN assignment.effective_from<=dates.business_date
                    AND (assignment.effective_to IS NULL OR assignment.effective_to>=dates.business_date) THEN 0
                  WHEN dates.business_date<assignment.effective_from THEN DATEDIFF(assignment.effective_from,dates.business_date)
                  ELSE DATEDIFF(dates.business_date,assignment.effective_to) END,
                  assignment.effective_from DESC,assignment.id DESC LIMIT 1),
                CAST((((DAYOFWEEK(dates.business_date)+5)%7)+1) AS CHAR),'$'),0) END),0)
            FROM dates))`
    : ''
  const [rows] = await executor.query<RowDataPacket[]>(
    `WITH RECURSIVE dates AS (
       SELECT CAST(? AS DATE) business_date
       UNION ALL SELECT DATE_ADD(business_date,INTERVAL 1 DAY) FROM dates WHERE business_date<?
     ) SELECT pr.employee_count runEmployeeCount,
       (SELECT COUNT(*) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) resultEmployeeCount,
       (SELECT COUNT(*) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id AND result.net_pay<0) negativeNetCount,
       (SELECT COUNT(*) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id AND (
          result.bank_name_snapshot IS NULL OR TRIM(result.bank_name_snapshot)='' OR
          result.bank_account_number_snapshot IS NULL OR TRIM(result.bank_account_number_snapshot)='' OR
          result.bank_account_name_snapshot IS NULL OR TRIM(result.bank_account_name_snapshot)='')) missingBankCount,
       (SELECT COUNT(*) FROM payroll_employee_results result JOIN employees employee ON employee.id=result.employee_id
        WHERE result.payroll_run_id=pr.id AND NOT (
          COALESCE(employee.bank_name,'')<=>COALESCE(result.bank_name_snapshot,'') AND
          COALESCE(employee.bank_account_number,'')<=>COALESCE(result.bank_account_number_snapshot,'') AND
          COALESCE(employee.bank_account_name,'')<=>COALESCE(result.bank_account_name_snapshot,''))) bankDriftCount,
       ${rateFacts}
       (SELECT COUNT(*) FROM ${detailTable} detail
         JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
         LEFT JOIN attendance_records attendance ON attendance.employee_id=result.employee_id
          AND attendance.site_id=result.site_id AND attendance.business_date=detail.business_date
        WHERE result.payroll_run_id=pr.id AND (
          NOT (attendance.id<=>detail.attendance_record_id) OR
          NOT (COALESCE(attendance.attendance_status,'NOT_RECORDED')<=>detail.attendance_status_snapshot) OR
          NOT (COALESCE(attendance.calendar_day_type,'NOT_RECORDED')<=>detail.calendar_day_type_snapshot) OR
          NOT (attendance.worked_minutes<=>detail.worked_minutes_snapshot)
          ${attendanceExtra})) attendanceDrift,
       (SELECT COUNT(*) FROM payroll_employee_component_details detail
         JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
         JOIN payroll_component_types component_type ON component_type.id=detail.payroll_component_type_id
         LEFT JOIN payroll_period_manual_components manual ON detail.source_type='MANUAL' AND manual.id=detail.source_id
        WHERE result.payroll_run_id=pr.id AND (
          NOT (component_type.code<=>detail.component_code_snapshot) OR
          NOT (component_type.name<=>detail.component_name_snapshot) OR
          NOT (component_type.component_category<=>detail.component_category) OR
          (detail.source_type='MANUAL' AND (manual.id IS NULL OR manual.payroll_period_id<>? OR manual.status<>'ACTIVE' OR
            NOT (manual.amount<=>detail.amount) OR NOT (COALESCE(manual.notes,'')<=>COALESCE(detail.notes,'')))) OR
          detail.source_type NOT IN ('MANUAL','SYSTEM'))) componentValueDrift,
       (SELECT COUNT(*) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id AND
          (SELECT COUNT(*) FROM payroll_period_manual_components manual WHERE manual.employee_id=result.employee_id
            AND manual.payroll_period_id=? AND manual.status='ACTIVE')<>
          (SELECT COUNT(*) FROM payroll_employee_component_details detail WHERE detail.payroll_employee_result_id=result.id
            AND detail.source_type='MANUAL')) componentCountDrift,
       ((SELECT COUNT(*) FROM (
          SELECT DISTINCT history.employee_id FROM employee_employment_histories history
          JOIN employee_types employee_type ON employee_type.id=history.employee_type_id AND employee_type.code=?
          JOIN employee_statuses employee_status ON employee_status.id=history.employee_status_id AND employee_status.allows_attendance=1
          WHERE history.site_id=? AND history.effective_from<=? AND (history.effective_to IS NULL OR history.effective_to>=?)) expected
          LEFT JOIN payroll_employee_results result ON result.payroll_run_id=pr.id AND result.employee_id=expected.employee_id
          WHERE result.id IS NULL)
        +(SELECT COUNT(*) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id AND NOT EXISTS(
          SELECT 1 FROM employee_employment_histories history
          JOIN employee_types employee_type ON employee_type.id=history.employee_type_id AND employee_type.code=?
          JOIN employee_statuses employee_status ON employee_status.id=history.employee_status_id AND employee_status.allows_attendance=1
          WHERE history.employee_id=result.employee_id AND history.site_id=?
            AND history.effective_from<=? AND (history.effective_to IS NULL OR history.effective_to>=?)))) populationDrift,
       ((SELECT COUNT(*) FROM ${detailTable} detail
          JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
          LEFT JOIN attendance_records attendance ON attendance.employee_id=result.employee_id
            AND attendance.site_id=result.site_id AND attendance.business_date=detail.business_date
          WHERE result.payroll_run_id=pr.id AND (${dailyScheduleMismatch}))
        +(SELECT COUNT(*) FROM (
          SELECT result.id resultId,dates.business_date FROM payroll_employee_results result CROSS JOIN dates
          JOIN employee_employment_histories history ON history.employee_id=result.employee_id AND history.site_id=result.site_id
            AND history.effective_from<=dates.business_date AND (history.effective_to IS NULL OR history.effective_to>=dates.business_date)
          JOIN employee_types employee_type ON employee_type.id=history.employee_type_id AND employee_type.code=?
          JOIN employee_statuses employee_status ON employee_status.id=history.employee_status_id AND employee_status.allows_attendance=1
          WHERE result.payroll_run_id=pr.id) expected_day
          LEFT JOIN ${detailTable} detail ON detail.payroll_employee_result_id=expected_day.resultId AND detail.business_date=expected_day.business_date
          WHERE detail.id IS NULL)
        +(SELECT COUNT(*) FROM ${detailTable} detail JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
          WHERE result.payroll_run_id=pr.id AND NOT EXISTS(
            SELECT 1 FROM employee_employment_histories history
            JOIN employee_types employee_type ON employee_type.id=history.employee_type_id AND employee_type.code=?
            JOIN employee_statuses employee_status ON employee_status.id=history.employee_status_id AND employee_status.allows_attendance=1
            WHERE history.employee_id=result.employee_id AND history.site_id=result.site_id
              AND history.effective_from<=detail.business_date AND (history.effective_to IS NULL OR history.effective_to>=detail.business_date)))
        ${fullPeriodScheduleMismatch}) scheduleDrift,
       (SELECT COUNT(*) FROM payroll_period_policy_snapshots snapshot
         LEFT JOIN payroll_policy_versions policy ON policy.id=snapshot.payroll_policy_version_id
        WHERE snapshot.payroll_period_id=? AND (
          policy.id IS NULL OR policy.status<>'ACTIVE' OR policy.site_id<>? OR
          NOT (policy.employee_type_code<=>JSON_UNQUOTE(JSON_EXTRACT(snapshot.policy_snapshot,'$.employeeType'))) OR
          NOT (policy.wage_basis<=>JSON_UNQUOTE(JSON_EXTRACT(snapshot.policy_snapshot,'$.wageBasis'))) OR
          NOT (policy.pay_frequency<=>JSON_UNQUOTE(JSON_EXTRACT(snapshot.policy_snapshot,'$.payFrequency'))) OR
          NOT (policy.cutoff_type<=>JSON_UNQUOTE(JSON_EXTRACT(snapshot.policy_snapshot,'$.cutoffType'))) OR
          NOT (policy.prorate_basis<=>JSON_UNQUOTE(JSON_EXTRACT(snapshot.policy_snapshot,'$.prorateBasis'))) OR
          NOT (policy.attendance_pay_rule<=>JSON_UNQUOTE(JSON_EXTRACT(snapshot.policy_snapshot,'$.attendancePayRule'))) OR
          NOT (policy.deduction_divisor<=>JSON_UNQUOTE(JSON_EXTRACT(snapshot.policy_snapshot,'$.deductionDivisor'))) OR
          NOT (policy.rounding_mode<=>JSON_UNQUOTE(JSON_EXTRACT(snapshot.policy_snapshot,'$.roundingMode'))) OR
          NOT (policy.rounding_scale<=>CAST(JSON_UNQUOTE(JSON_EXTRACT(snapshot.policy_snapshot,'$.roundingScale')) AS UNSIGNED)) OR
          NOT (policy.currency<=>JSON_UNQUOTE(JSON_EXTRACT(snapshot.policy_snapshot,'$.currency'))))) policyDrift,
       (SELECT COUNT(*) FROM payroll_employee_results result ${detailJoin}
        WHERE result.payroll_run_id=pr.id AND (${resultMismatch})) resultDetailMismatch,
       NOT (pr.employee_count<=>(SELECT COUNT(*) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) AND
         pr.total_piece_rate_amount<=>(SELECT COALESCE(SUM(result.piece_rate_amount),0) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) AND
         pr.total_basic_salary_amount<=>(SELECT COALESCE(SUM(result.basic_salary_amount),0) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) AND
         pr.total_earnings<=>(SELECT COALESCE(SUM(result.additional_earnings),0) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) AND
         pr.total_deductions<=>(SELECT COALESCE(SUM(result.total_deductions),0) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) AND
         pr.total_net_pay<=>(SELECT COALESCE(SUM(result.net_pay),0) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id)) aggregateMismatch
     FROM payroll_runs pr WHERE pr.id=?`,
    [
      run.periodStart,
      run.periodEnd,
      ...(!isMonthly ? [employeeType] : []),
      run.periodId,
      run.periodId,
      employeeType,
      run.siteId,
      run.periodEnd,
      run.periodStart,
      employeeType,
      run.siteId,
      run.periodEnd,
      run.periodStart,
      employeeType,
      employeeType,
      ...(isMonthly ? [run.periodEnd,run.periodStart] : []),
      run.periodId,
      run.siteId,
      run.id,
    ]
  )
  return integrityFromFacts(readiness, rows[0] ?? {})
}

/**
 * Memvalidasi ulang snapshot sebelum submit/approve/close. Seluruh pembanding
 * uang tetap dilakukan sebagai DECIMAL di database; tidak ada konversi Number
 * yang dapat mengubah nilai Payroll.
 */
export async function inspectPayrollRunIntegrity(
  executor: Executor,
  run: RunScope
): Promise<PayrollRunIntegrity> {
  const readiness = await evaluatePayrollReadiness(executor, {
    id: run.periodId,
    siteId: run.siteId,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    payrollBasis: run.payrollBasis,
    payFrequency: run.payFrequency,
    employeeType: run.employeeType,
    policySnapshot: run.policySnapshot,
  })
  if (run.payrollBasis === 'TIME_BASED') {
    return inspectTimeBasedRunIntegrity(executor, run, readiness)
  }
  const [rows] = await executor.query<RowDataPacket[]>(
    `WITH live_attendance AS (
       SELECT result.id resultId,
              COALESCE(SUM(attendance.calendar_day_type='WORKDAY'),0) scheduledDays,
              COALESCE(SUM(attendance.attendance_status='PRESENT' AND attendance.calendar_day_type='WORKDAY'),0) presentDays,
              COALESCE(SUM(attendance.attendance_status='ABSENT'),0) absentDays,
              COALESCE(SUM(attendance.attendance_status='LEAVE'),0) leaveDays,
              COALESCE(SUM(attendance.attendance_status='SICK'),0) sickDays,
              COALESCE(SUM(attendance.attendance_status='PERMISSION'),0) permissionDays,
              COALESCE(SUM(attendance.calendar_day_type='NON_WORKDAY'),0) holidayDays,
              COALESCE(SUM(attendance.late_minutes),0) lateMinutes,
              COALESCE(SUM(attendance.early_leave_minutes),0) earlyLeaveMinutes,
              COALESCE(SUM(attendance.worked_minutes),0) workedMinutes
         FROM payroll_employee_results result
         LEFT JOIN attendance_records attendance ON attendance.employee_id=result.employee_id
          AND attendance.site_id=? AND attendance.business_date BETWEEN ? AND ?
        WHERE result.payroll_run_id=? GROUP BY result.id
     ) SELECT
       pr.employee_count runEmployeeCount,
       (SELECT COUNT(*) FROM payroll_employee_results result
         WHERE result.payroll_run_id=pr.id) resultEmployeeCount,
       (SELECT COUNT(*) FROM payroll_employee_results result
         WHERE result.payroll_run_id=pr.id AND result.net_pay<0) negativeNetCount,
       (SELECT COUNT(*) FROM payroll_employee_results result
         WHERE result.payroll_run_id=pr.id AND (
           result.bank_name_snapshot IS NULL OR TRIM(result.bank_name_snapshot)='' OR
           result.bank_account_number_snapshot IS NULL OR TRIM(result.bank_account_number_snapshot)='' OR
           result.bank_account_name_snapshot IS NULL OR TRIM(result.bank_account_name_snapshot)=''
         )) missingBankCount,
       (SELECT COUNT(*) FROM payroll_employee_results result
         JOIN employees employee ON employee.id=result.employee_id
        WHERE result.payroll_run_id=pr.id AND NOT (
          COALESCE(employee.bank_name,'')<=>COALESCE(result.bank_name_snapshot,'') AND
          COALESCE(employee.bank_account_number,'')<=>COALESCE(result.bank_account_number_snapshot,'') AND
          COALESCE(employee.bank_account_name,'')<=>COALESCE(result.bank_account_name_snapshot,'')
        )) bankDriftCount,
       (SELECT COUNT(*) FROM payroll_employee_results result
         WHERE result.payroll_run_id=pr.id AND (
           SELECT COUNT(*) FROM payroll_production_details detail
            WHERE detail.payroll_employee_result_id=result.id
         )<>(
           SELECT COUNT(*) FROM production_transactions source
            WHERE source.employee_id=result.employee_id AND source.site_id=?
              AND source.status='POSTED' AND source.business_date BETWEEN ? AND ?
         )) productionCountDrift,
       (SELECT COUNT(*) FROM payroll_production_details detail
         JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
         LEFT JOIN production_transactions source ON source.id=detail.production_transaction_id
        WHERE result.payroll_run_id=pr.id AND (
          source.id IS NULL OR source.status<>'POSTED' OR source.site_id<>? OR
          source.business_date NOT BETWEEN ? AND ? OR
          NOT (source.gross_amount<=>detail.amount_snapshot) OR
          NOT (source.quantity<=>detail.quantity_snapshot) OR
          NOT (source.rate_snapshot<=>detail.rate_snapshot)
        )) productionValueDrift,
       (SELECT COUNT(*) FROM payroll_employee_component_details detail
         JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
         JOIN payroll_component_types component_type
           ON component_type.id=detail.payroll_component_type_id
         LEFT JOIN employee_payroll_components recurring
           ON detail.source_type='RECURRING' AND recurring.id=detail.source_id
         LEFT JOIN payroll_period_manual_components manual
           ON detail.source_type='MANUAL' AND manual.id=detail.source_id
        WHERE result.payroll_run_id=pr.id AND (
          NOT (component_type.code<=>detail.component_code_snapshot) OR
          NOT (component_type.name<=>detail.component_name_snapshot) OR
          NOT (component_type.component_category<=>detail.component_category) OR
          (detail.source_type='RECURRING' AND (
            recurring.id IS NULL OR recurring.is_active<>1 OR
            recurring.effective_from>? OR COALESCE(recurring.effective_to,'9999-12-31')<? OR
            NOT (recurring.amount<=>detail.amount) OR
            NOT (COALESCE(recurring.notes,'')<=>COALESCE(detail.notes,''))
          )) OR
          (detail.source_type='MANUAL' AND (
            manual.id IS NULL OR manual.payroll_period_id<>? OR manual.status<>'ACTIVE' OR
            NOT (manual.amount<=>detail.amount) OR
            NOT (COALESCE(manual.notes,'')<=>COALESCE(detail.notes,''))
          ))
        )) componentValueDrift,
       (SELECT COUNT(*) FROM payroll_employee_results result
         WHERE result.payroll_run_id=pr.id AND (
           (SELECT COUNT(*) FROM employee_payroll_components recurring
             WHERE recurring.employee_id=result.employee_id AND recurring.is_active=1
               AND recurring.effective_from<=?
               AND (recurring.effective_to IS NULL OR recurring.effective_to>=?))
           <>
           (SELECT COUNT(*) FROM payroll_employee_component_details detail
             WHERE detail.payroll_employee_result_id=result.id AND detail.source_type='RECURRING')
           OR
           (SELECT COUNT(*) FROM payroll_period_manual_components manual
             WHERE manual.employee_id=result.employee_id AND manual.payroll_period_id=?
               AND manual.status='ACTIVE')
           <>
           (SELECT COUNT(*) FROM payroll_employee_component_details detail
             WHERE detail.payroll_employee_result_id=result.id AND detail.source_type='MANUAL')
        )) componentCountDrift,
       (SELECT COUNT(*) FROM (
          SELECT source_population.employee_id
            FROM (
              SELECT source.employee_id FROM production_transactions source
               WHERE source.site_id=? AND source.status='POSTED'
                 AND source.business_date BETWEEN ? AND ?
              UNION
              SELECT recurring.employee_id FROM employee_payroll_components recurring
               WHERE recurring.is_active=1 AND recurring.effective_from<=?
                 AND (recurring.effective_to IS NULL OR recurring.effective_to>=?)
                 AND EXISTS (
                   SELECT 1 FROM employee_employment_histories history
                    JOIN employee_types employee_type
                      ON employee_type.id=history.employee_type_id
                     AND employee_type.payroll_basis='PIECE_RATE'
                   WHERE history.employee_id=recurring.employee_id AND history.site_id=?
                     AND history.effective_from<=?
                     AND (history.effective_to IS NULL OR history.effective_to>=?)
                 )
              UNION
              SELECT manual.employee_id FROM payroll_period_manual_components manual
               WHERE manual.payroll_period_id=? AND manual.status='ACTIVE'
            ) source_population
            LEFT JOIN payroll_employee_results result
              ON result.payroll_run_id=? AND result.employee_id=source_population.employee_id
           WHERE result.id IS NULL
        ) missing_population) populationDrift,
       (SELECT COUNT(*) FROM payroll_employee_results result
         LEFT JOIN payroll_attendance_summaries snapshot
           ON snapshot.payroll_employee_result_id=result.id
         LEFT JOIN live_attendance live ON live.resultId=result.id
        WHERE result.payroll_run_id=pr.id AND (
          snapshot.id IS NULL OR live.resultId IS NULL OR
          live.scheduledDays<>snapshot.scheduled_days OR live.presentDays<>snapshot.present_days OR
          live.absentDays<>snapshot.absent_days OR live.leaveDays<>snapshot.leave_days OR
          live.sickDays<>snapshot.sick_days OR live.permissionDays<>snapshot.permission_days OR
          live.holidayDays<>snapshot.holiday_days OR live.lateMinutes<>snapshot.late_minutes OR
          live.earlyLeaveMinutes<>snapshot.early_leave_minutes OR live.workedMinutes<>snapshot.worked_minutes
        )) attendanceDrift,
       (SELECT COUNT(*) FROM payroll_periods integrity_period
         LEFT JOIN payroll_period_policy_snapshots policy_snapshot
           ON policy_snapshot.payroll_period_id=integrity_period.id
         LEFT JOIN payroll_policy_versions policy
           ON policy.id=policy_snapshot.payroll_policy_version_id
        WHERE integrity_period.id=? AND (
          policy_snapshot.id IS NULL OR policy.id IS NULL OR policy.status<>'ACTIVE' OR
          policy.site_id<>? OR
          NOT (policy.employee_type_code<=>JSON_UNQUOTE(JSON_EXTRACT(policy_snapshot.policy_snapshot,'$.employeeType'))) OR
          NOT (policy.wage_basis<=>JSON_UNQUOTE(JSON_EXTRACT(policy_snapshot.policy_snapshot,'$.wageBasis'))) OR
          NOT (policy.pay_frequency<=>JSON_UNQUOTE(JSON_EXTRACT(policy_snapshot.policy_snapshot,'$.payFrequency'))) OR
          NOT (policy.cutoff_type<=>JSON_UNQUOTE(JSON_EXTRACT(policy_snapshot.policy_snapshot,'$.cutoffType'))) OR
          NOT (policy.prorate_basis<=>JSON_UNQUOTE(JSON_EXTRACT(policy_snapshot.policy_snapshot,'$.prorateBasis'))) OR
          NOT (policy.attendance_pay_rule<=>JSON_UNQUOTE(JSON_EXTRACT(policy_snapshot.policy_snapshot,'$.attendancePayRule'))) OR
          NOT (policy.deduction_divisor<=>JSON_UNQUOTE(JSON_EXTRACT(policy_snapshot.policy_snapshot,'$.deductionDivisor'))) OR
          NOT (policy.rounding_mode<=>JSON_UNQUOTE(JSON_EXTRACT(policy_snapshot.policy_snapshot,'$.roundingMode'))) OR
          NOT (policy.rounding_scale<=>CAST(JSON_UNQUOTE(JSON_EXTRACT(policy_snapshot.policy_snapshot,'$.roundingScale')) AS UNSIGNED)) OR
          NOT (policy.currency<=>JSON_UNQUOTE(JSON_EXTRACT(policy_snapshot.policy_snapshot,'$.currency')))
        )) policyDrift,
       (SELECT COUNT(*) FROM payroll_employee_results result
         LEFT JOIN (
           SELECT detail.payroll_employee_result_id resultId,COUNT(*) transactionCount,
                  COALESCE(SUM(detail.amount_snapshot),0) pieceAmount
             FROM payroll_production_details detail GROUP BY detail.payroll_employee_result_id
         ) production ON production.resultId=result.id
         LEFT JOIN (
           SELECT detail.payroll_employee_result_id resultId,
                  COALESCE(SUM(CASE WHEN detail.component_category='EARNING' THEN detail.amount ELSE 0 END),0) earnings,
                  COALESCE(SUM(CASE WHEN detail.component_category='DEDUCTION' THEN detail.amount ELSE 0 END),0) deductions
             FROM payroll_employee_component_details detail GROUP BY detail.payroll_employee_result_id
         ) component ON component.resultId=result.id
        WHERE result.payroll_run_id=pr.id AND (
          result.production_transaction_count<>COALESCE(production.transactionCount,0) OR
          NOT (result.piece_rate_amount<=>COALESCE(production.pieceAmount,0)) OR
          NOT (result.additional_earnings<=>COALESCE(component.earnings,0)) OR
          NOT (result.total_deductions<=>COALESCE(component.deductions,0)) OR
          NOT (result.gross_earnings<=>(COALESCE(production.pieceAmount,0)+COALESCE(component.earnings,0))) OR
          NOT (result.net_pay<=>(COALESCE(production.pieceAmount,0)+COALESCE(component.earnings,0)-COALESCE(component.deductions,0)))
        )) resultDetailMismatch,
       NOT (
         pr.employee_count<=>(SELECT COUNT(*) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) AND
         pr.total_piece_rate_amount<=>(SELECT COALESCE(SUM(result.piece_rate_amount),0) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) AND
         pr.total_earnings<=>(SELECT COALESCE(SUM(result.additional_earnings),0) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) AND
         pr.total_deductions<=>(SELECT COALESCE(SUM(result.total_deductions),0) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) AND
         pr.total_net_pay<=>(SELECT COALESCE(SUM(result.net_pay),0) FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id)
       ) aggregateMismatch
     FROM payroll_runs pr WHERE pr.id=?`,
    [
      run.siteId,
      run.periodStart,
      run.periodEnd,
      run.id,
      run.siteId,
      run.periodStart,
      run.periodEnd,
      run.siteId,
      run.periodStart,
      run.periodEnd,
      run.periodEnd,
      run.periodStart,
      run.periodId,
      run.periodEnd,
      run.periodStart,
      run.periodId,
      run.siteId,
      run.periodStart,
      run.periodEnd,
      run.periodEnd,
      run.periodStart,
      run.siteId,
      run.periodEnd,
      run.periodStart,
      run.periodId,
      run.id,
      run.periodId,
      run.siteId,
      run.id,
    ]
  )
  return integrityFromFacts(readiness, rows[0] ?? {})
}
