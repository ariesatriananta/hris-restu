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
}

type RunScope = {
  id: number
  periodId: number
  siteId: number
  periodStart: string
  periodEnd: string
}

function issue(code: string, message: string, count: unknown) {
  return { code, message, count: Number(count ?? 0) }
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
  })
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
      run.id,
    ]
  )
  const facts = rows[0] ?? {}
  const issues: PayrollIntegrityIssue[] = []
  if (readiness.status === 'BLOCKED')
    issues.push(
      issue(
        'READINESS_BLOCKED',
        'Readiness Payroll berubah menjadi BLOCKED.',
        readiness.blockerCount
      )
    )
  if (Number(facts.resultEmployeeCount ?? 0) === 0)
    issues.push(issue('EMPTY_RESULT', 'Hasil Payroll masih kosong.', 1))
  if (Number(facts.negativeNetCount ?? 0) > 0)
    issues.push(
      issue(
        'NEGATIVE_NET_PAY',
        'Terdapat karyawan dengan penerimaan bersih negatif.',
        facts.negativeNetCount
      )
    )
  if (Number(facts.missingBankCount ?? 0) > 0)
    issues.push(
      issue(
        'MISSING_BANK_ACCOUNT',
        'Snapshot rekening pembayaran belum lengkap.',
        facts.missingBankCount
      )
    )
  if (Number(facts.bankDriftCount ?? 0) > 0)
    issues.push(
      issue(
        'BANK_ACCOUNT_DRIFT',
        'Data rekening karyawan berubah setelah simulasi. Hitung ulang Payroll.',
        facts.bankDriftCount
      )
    )
  const productionDrift =
    Number(facts.productionCountDrift ?? 0) +
    Number(facts.productionValueDrift ?? 0)
  if (productionDrift > 0)
    issues.push(
      issue(
        'PRODUCTION_SNAPSHOT_DRIFT',
        'Sumber Produksi berubah setelah simulasi. Hitung ulang Payroll.',
        productionDrift
      )
    )
  const componentDrift =
    Number(facts.componentValueDrift ?? 0) +
    Number(facts.componentCountDrift ?? 0)
  if (componentDrift > 0)
    issues.push(
      issue(
        'COMPONENT_SNAPSHOT_DRIFT',
        'Komponen Payroll berubah setelah simulasi. Hitung ulang Payroll.',
        componentDrift
      )
    )
  if (Number(facts.attendanceDrift ?? 0) > 0)
    issues.push(
      issue(
        'ATTENDANCE_SNAPSHOT_DRIFT',
        'Ringkasan Attendance berubah setelah simulasi. Hitung ulang Payroll.',
        facts.attendanceDrift
      )
    )
  if (Number(facts.aggregateMismatch ?? 0) > 0)
    issues.push(
      issue(
        'AGGREGATE_MISMATCH',
        'Total run tidak konsisten dengan hasil per karyawan.',
        1
      )
    )
  if (Number(facts.resultDetailMismatch ?? 0) > 0)
    issues.push(
      issue(
        'RESULT_DETAIL_MISMATCH',
        'Hasil per karyawan tidak konsisten dengan detail snapshot.',
        facts.resultDetailMismatch
      )
    )
  if (Number(facts.populationDrift ?? 0) > 0)
    issues.push(
      issue(
        'POPULATION_SNAPSHOT_DRIFT',
        'Populasi Payroll berubah setelah simulasi. Hitung ulang Payroll.',
        facts.populationDrift
      )
    )
  return { valid: issues.length === 0, issues }
}
