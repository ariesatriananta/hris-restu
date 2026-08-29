import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import { pool } from '../db.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { writeAudit } from './audit.js'
import { ApiError } from './errors.js'
import { evaluatePayrollReadiness } from './payroll-readiness.js'

export type PayrollRunStatus =
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export type PayrollRunRow = RowDataPacket & {
  id: number
  uid: string
  periodId: number
  periodUid: string
  siteId: number
  siteCode: string
  periodStart: string
  periodEnd: string
  payrollBasis: 'PIECE_RATE' | 'TIME_BASED'
  payFrequency: 'WEEKLY' | 'MONTHLY'
  employeeType: 'BORONGAN' | 'HARIAN' | 'TRAINING' | 'BULANAN'
  runNumber: number
  runType: 'SIMULATION' | 'FINAL'
  status: PayrollRunStatus
  startedAt: string
  finishedAt: string | null
  employeeCount: number
  totalAttendanceDays: number
  totalPayablePresentDays: number
  totalOffdayPresentDays: number
  totalEligibleCalendarDays: number
  totalProratedBasicSalary: string
  totalAlphaDeduction: string
  totalPermissionDeduction: string
  totalPieceRateAmount: string
  totalBasicSalaryAmount: string
  totalEarnings: string
  totalGrossEarnings: string
  totalDeductions: string
  totalNetPay: string
  errorMessage: string | null
  currentRunId: number | null
}

export const runProjection = `SELECT pr.id,pr.uid,pr.payroll_period_id periodId,
  pp.uid periodUid,pp.site_id siteId,s.code siteCode,
  DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
  DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,
  pp.payroll_basis payrollBasis,pp.pay_frequency payFrequency,
  pp.employee_type_code employeeType,
  pr.run_number runNumber,pr.run_type runType,pr.status,
  CONCAT(DATE_FORMAT(pr.calculation_started_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') startedAt,
  IF(pr.calculation_finished_at IS NULL,NULL,CONCAT(DATE_FORMAT(pr.calculation_finished_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00')) finishedAt,
  pr.employee_count employeeCount,
  (SELECT COALESCE(SUM(result.attendance_days),0)
     FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) totalAttendanceDays,
  (SELECT COALESCE(SUM(detail.is_payable=1),0)
     FROM payroll_time_details detail
     JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
    WHERE result.payroll_run_id=pr.id) totalPayablePresentDays,
  (SELECT COALESCE(SUM(detail.warning_code='OFFDAY_PRESENT'),0)
     FROM payroll_time_details detail
     JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
    WHERE result.payroll_run_id=pr.id) totalOffdayPresentDays,
  (SELECT COALESCE(SUM(summary.eligible_calendar_days),0)
     FROM payroll_monthly_summaries summary
     JOIN payroll_employee_results result ON result.id=summary.payroll_employee_result_id
    WHERE result.payroll_run_id=pr.id) totalEligibleCalendarDays,
  (SELECT COALESCE(SUM(summary.prorated_basic_salary),0)
     FROM payroll_monthly_summaries summary
     JOIN payroll_employee_results result ON result.id=summary.payroll_employee_result_id
    WHERE result.payroll_run_id=pr.id) totalProratedBasicSalary,
  (SELECT COALESCE(SUM(summary.alpha_deduction),0)
     FROM payroll_monthly_summaries summary
     JOIN payroll_employee_results result ON result.id=summary.payroll_employee_result_id
    WHERE result.payroll_run_id=pr.id) totalAlphaDeduction,
  (SELECT COALESCE(SUM(summary.permission_deduction),0)
     FROM payroll_monthly_summaries summary
     JOIN payroll_employee_results result ON result.id=summary.payroll_employee_result_id
    WHERE result.payroll_run_id=pr.id) totalPermissionDeduction,
  pr.total_piece_rate_amount totalPieceRateAmount,
  pr.total_basic_salary_amount totalBasicSalaryAmount,
  pr.total_earnings totalEarnings,
  (SELECT COALESCE(SUM(result.gross_earnings),0)
     FROM payroll_employee_results result WHERE result.payroll_run_id=pr.id) totalGrossEarnings,
  pr.total_deductions totalDeductions,
  pr.total_net_pay totalNetPay,pr.error_message errorMessage,pp.current_run_id currentRunId
 FROM payroll_runs pr
 JOIN payroll_periods pp ON pp.id=pr.payroll_period_id
 JOIN sites s ON s.id=pp.site_id`

export function runDto(row: PayrollRunRow) {
  return {
    uid: row.uid,
    periodUid: row.periodUid,
    runNumber: Number(row.runNumber),
    runType: row.runType,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    employeeCount: Number(row.employeeCount),
    totalAttendanceDays: Number(row.totalAttendanceDays ?? 0),
    totalPayablePresentDays: Number(row.totalPayablePresentDays ?? 0),
    totalOffdayPresentDays: Number(row.totalOffdayPresentDays ?? 0),
    totalEligibleCalendarDays: Number(row.totalEligibleCalendarDays ?? 0),
    totalProratedBasicSalary: String(row.totalProratedBasicSalary ?? '0.00'),
    totalAlphaDeduction: String(row.totalAlphaDeduction ?? '0.00'),
    totalPermissionDeduction: String(
      row.totalPermissionDeduction ?? '0.00'
    ),
    payrollBasis: row.payrollBasis,
    payFrequency: row.payFrequency,
    employeeType: row.employeeType,
    totalPieceRateAmount: String(row.totalPieceRateAmount ?? '0.00'),
    totalBasicSalaryAmount: String(row.totalBasicSalaryAmount ?? '0.00'),
    totalEarnings: String(row.totalEarnings ?? '0.00'),
    totalGrossEarnings: String(row.totalGrossEarnings ?? '0.00'),
    totalDeductions: String(row.totalDeductions ?? '0.00'),
    totalNetPay: String(row.totalNetPay ?? '0.00'),
    errorMessage: row.errorMessage,
    isCurrent: Number(row.currentRunId ?? 0) === Number(row.id),
  }
}

type WeeklyTimeScope = {
  id: number
  uid: string
  periodId: number
  siteId: number
  periodStart: string
  periodEnd: string
  payrollBasis: 'TIME_BASED'
  payFrequency: 'WEEKLY'
  employeeType: 'HARIAN' | 'TRAINING'
  policySnapshot: unknown
}

type MonthlyTimeScope = Omit<WeeklyTimeScope, 'payFrequency' | 'employeeType'> & {
  payFrequency: 'MONTHLY'
  employeeType: 'BULANAN'
}

type TimeScope = WeeklyTimeScope | MonthlyTimeScope

async function assertNoTimeBasedRecurringComponents(
  conn: Pick<PoolConnection, 'query'>,
  scope: Omit<TimeScope, 'id' | 'uid' | 'periodId' | 'payrollBasis' | 'payFrequency' | 'policySnapshot'>
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(DISTINCT component.id) total
       FROM employee_payroll_components component
       JOIN employee_employment_histories history
         ON history.employee_id=component.employee_id AND history.site_id=?
        AND history.effective_from<=? AND (history.effective_to IS NULL OR history.effective_to>=?)
       JOIN employee_types employee_type
         ON employee_type.id=history.employee_type_id AND employee_type.code=?
      WHERE component.is_active=1 AND component.effective_from<=?
        AND (component.effective_to IS NULL OR component.effective_to>=?)`,
    [
      scope.siteId,
      scope.periodEnd,
      scope.periodStart,
      scope.employeeType,
      scope.periodEnd,
      scope.periodStart,
    ]
  )
  if (Number(rows[0]?.total ?? 0) > 0) {
    throw new ApiError(
      409,
      'Payroll berbasis waktu belum mendukung komponen berulang. Gunakan komponen manual pada periode ini.'
    )
  }
}

export async function createProcessingRun(input: {
  auth: AuthContext
  periodUid: string
  idempotencyKey: string
  request?: Parameters<typeof writeAudit>[0]['request']
}) {
  if (
    input.auth.roles.includes('DIRECTOR') &&
    !input.auth.roles.includes('SUPER_ADMIN')
  ) {
    throw new ApiError(403, 'Direktur memiliki akses baca-saja pada Payroll.')
  }
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [periodRows] = await conn.query<RowDataPacket[]>(
      `SELECT pp.id,pp.uid,pp.site_id siteId,pp.status,pp.payroll_basis payrollBasis,
              pp.pay_frequency payFrequency,pp.employee_type_code employeeType,
              snapshot.policy_snapshot policySnapshot,
              DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
              DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,s.code siteCode
         FROM payroll_periods pp JOIN sites s ON s.id=pp.site_id
         LEFT JOIN payroll_period_policy_snapshots snapshot
           ON snapshot.payroll_period_id=pp.id
        WHERE pp.uid=? FOR UPDATE`,
      [input.periodUid]
    )
    const period = periodRows[0]
    if (!period) throw new ApiError(404, 'Periode Payroll tidak ditemukan.')
    const global = input.auth.roles.includes('SUPER_ADMIN')
    if (!global && !input.auth.siteAccess.includes(String(period.siteCode))) {
      throw new ApiError(403, 'Akses site Payroll ditolak.')
    }
    const supportedPieceRate =
      period.payrollBasis === 'PIECE_RATE' &&
      period.employeeType === 'BORONGAN' &&
      period.payFrequency === 'WEEKLY'
    const supportedWeeklyTime =
      period.payrollBasis === 'TIME_BASED' &&
      ['HARIAN', 'TRAINING'].includes(String(period.employeeType)) &&
      period.payFrequency === 'WEEKLY'
    const supportedMonthlyTime =
      period.payrollBasis === 'TIME_BASED' &&
      period.employeeType === 'BULANAN' &&
      period.payFrequency === 'MONTHLY'
    if (!supportedPieceRate && !supportedWeeklyTime && !supportedMonthlyTime)
      throw new ApiError(
        409,
        'Kombinasi jenis karyawan, basis, dan frekuensi Payroll belum didukung.'
      )
    if (!['DRAFT', 'CALCULATED'].includes(String(period.status))) {
      throw new ApiError(
        409,
        'Periode Payroll tidak dapat dihitung pada status saat ini.'
      )
    }

    const [replayed] = await conn.query<PayrollRunRow[]>(
      `${runProjection} WHERE pr.idempotency_key=? FOR UPDATE`,
      [input.idempotencyKey]
    )
    if (replayed[0]) {
      if (Number(replayed[0].periodId) !== Number(period.id)) {
        throw new ApiError(
          409,
          'Idempotency key sudah digunakan untuk periode Payroll lain.'
        )
      }
      await conn.commit()
      return { row: replayed[0], replay: true }
    }

    const [processing] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM payroll_runs WHERE payroll_period_id=? AND status='PROCESSING' LIMIT 1 FOR UPDATE`,
      [period.id]
    )
    if (processing[0])
      throw new ApiError(
        409,
        'Perhitungan Payroll untuk periode ini sedang berjalan.'
      )
    const [approval] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM payroll_approvals
        WHERE payroll_period_id=? AND status IN ('PENDING','APPROVED') LIMIT 1 FOR UPDATE`,
      [period.id]
    )
    if (approval[0])
      throw new ApiError(
        409,
        'Payroll tidak dapat dihitung ulang karena sudah masuk proses persetujuan.'
      )

    const readiness = await evaluatePayrollReadiness(conn, {
      id: Number(period.id),
      siteId: Number(period.siteId),
      periodStart: String(period.periodStart),
      periodEnd: String(period.periodEnd),
      payrollBasis: period.payrollBasis,
      payFrequency: period.payFrequency,
      employeeType: period.employeeType,
      policySnapshot: period.policySnapshot,
    })
    if (readiness.status === 'BLOCKED') {
      const firstBlocker = readiness.blockers[0]?.message
      throw new ApiError(
        409,
        firstBlocker
          ? `Readiness Payroll masih BLOCKED: ${firstBlocker} Selesaikan seluruh blocker sebelum menghitung ulang.`
          : 'Readiness Payroll masih BLOCKED. Selesaikan seluruh blocker sebelum menghitung ulang.'
      )
    }
    if (supportedWeeklyTime || supportedMonthlyTime) {
      await assertNoTimeBasedRecurringComponents(conn, {
        siteId: Number(period.siteId),
        employeeType: String(period.employeeType) as TimeScope['employeeType'],
        periodStart: String(period.periodStart),
        periodEnd: String(period.periodEnd),
      })
    }

    const [numberRows] = await conn.query<RowDataPacket[]>(
      `SELECT COALESCE(MAX(run_number),0)+1 runNumber FROM payroll_runs WHERE payroll_period_id=?`,
      [period.id]
    )
    const uid = randomUUID()
    const [inserted] = await conn.execute<ResultSetHeader>(
      `INSERT INTO payroll_runs(
         uid,payroll_period_id,idempotency_key,run_number,run_type,status,
         processing_slot,calculation_version,calculation_started_at,parameters_json,
         calculated_by,created_by,updated_by
       ) VALUES(?,?,?,?,'SIMULATION','PROCESSING',1,?,NOW(3),?,?,?,?)`,
      [
        uid,
        period.id,
        input.idempotencyKey,
        Number(numberRows[0]?.runNumber ?? 1),
        supportedMonthlyTime
          ? '3.1-TIME-MONTHLY'
          : supportedWeeklyTime
            ? '3.0-TIME-WEEKLY'
            : '2.0',
        JSON.stringify({
          readinessStatus: readiness.status,
          evaluatedAt: readiness.evaluatedAt,
          payrollBasis: period.payrollBasis,
          employeeType: period.employeeType,
        }),
        input.auth.id,
        input.auth.id,
        input.auth.id,
      ]
    )
    await writeAudit(
      {
        auth: input.auth,
        request: input.request,
        module: 'PAYROLL',
        siteId: Number(period.siteId),
        action: 'GENERATE',
        table: 'payroll_runs',
        recordId: inserted.insertId,
        recordUid: uid,
        description: `Memulai simulasi Payroll run ke-${Number(numberRows[0]?.runNumber ?? 1)}.`,
        afterData: {
          status: 'PROCESSING',
          periodUid: input.periodUid,
          idempotencyKey: input.idempotencyKey,
        },
      },
      conn
    )
    const [created] = await conn.query<PayrollRunRow[]>(
      `${runProjection} WHERE pr.id=?`,
      [inserted.insertId]
    )
    await conn.commit()
    return { row: created[0], replay: false }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

async function calculateWeeklyTimeBasedRun(
  conn: PoolConnection,
  run: WeeklyTimeScope,
  auth: AuthContext
) {
  await assertNoTimeBasedRecurringComponents(conn, run)

  // Populasi mengikuti histori harian. Karyawan eligible tanpa PRESENT tetap
  // mempunyai hasil Rp0 agar review Payroll tidak menyembunyikan siapa pun.
  await conn.execute(
    `INSERT INTO payroll_employee_results(
       uid,payroll_run_id,payroll_period_id,employee_id,site_id,
       employee_number_snapshot,employee_name_snapshot,employee_type_snapshot,
       department_name_snapshot,position_name_snapshot,work_group_name_snapshot,
       bank_name_snapshot,bank_account_number_snapshot,bank_account_name_snapshot,
       created_by,updated_by
     )
     SELECT UUID(),?,?,population.employee_id,?,e.employee_number,e.full_name,
            ?,department.name,position_row.name,work_group.name,
            e.bank_name,e.bank_account_number,e.bank_account_name,?,?
       FROM (
         SELECT DISTINCT history.employee_id
           FROM employee_employment_histories history
           JOIN employee_types employee_type
             ON employee_type.id=history.employee_type_id AND employee_type.code=?
           JOIN employee_statuses employee_status
             ON employee_status.id=history.employee_status_id AND employee_status.allows_attendance=1
          WHERE history.site_id=? AND history.effective_from<=?
            AND (history.effective_to IS NULL OR history.effective_to>=?)
       ) population
       JOIN employees e ON e.id=population.employee_id
       JOIN employee_employment_histories snapshot_history ON snapshot_history.id=(
         SELECT candidate.id
           FROM employee_employment_histories candidate
           JOIN employee_types candidate_type
             ON candidate_type.id=candidate.employee_type_id AND candidate_type.code=?
          WHERE candidate.employee_id=population.employee_id AND candidate.site_id=?
            AND candidate.effective_from<=?
            AND (candidate.effective_to IS NULL OR candidate.effective_to>=?)
          ORDER BY candidate.effective_from DESC,candidate.id DESC LIMIT 1
       )
       LEFT JOIN departments department ON department.id=snapshot_history.department_id
       LEFT JOIN positions position_row ON position_row.id=snapshot_history.position_id
       LEFT JOIN work_groups work_group ON work_group.id=snapshot_history.work_group_id`,
    [
      run.id,
      run.periodId,
      run.siteId,
      run.employeeType,
      auth.id,
      auth.id,
      run.employeeType,
      run.siteId,
      run.periodEnd,
      run.periodStart,
      run.employeeType,
      run.siteId,
      run.periodEnd,
      run.periodStart,
    ]
  )

  const [resultCountRows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) total FROM payroll_employee_results WHERE payroll_run_id=?`,
    [run.id]
  )
  if (Number(resultCountRows[0]?.total ?? 0) === 0) {
    throw new ApiError(
      409,
      `Populasi simulasi Payroll ${run.employeeType} kosong setelah validasi histori.`
    )
  }

  // Satu baris immutable per tanggal eligible. Nilai per hari tidak dibulatkan;
  // pembulatan HALF_UP Rp1 dilakukan setelah seluruh tarif harian dijumlahkan.
  await conn.execute(
    `INSERT INTO payroll_time_details(
       uid,payroll_employee_result_id,attendance_record_id,
       employee_daily_rate_history_id,business_date,attendance_status_snapshot,
       calendar_day_type_snapshot,is_scheduled,is_payable,daily_rate_snapshot,
       amount_snapshot,worked_minutes_snapshot,warning_code,created_by,updated_by
     )
     WITH RECURSIVE dates AS (
       SELECT CAST(? AS DATE) business_date
       UNION ALL SELECT DATE_ADD(business_date,INTERVAL 1 DAY)
         FROM dates WHERE business_date<?
     ), eligible AS (
       SELECT dates.business_date,result.id result_id,result.employee_id,result.site_id
         FROM dates
         JOIN payroll_employee_results result ON result.payroll_run_id=?
         JOIN employee_employment_histories history
           ON history.employee_id=result.employee_id AND history.site_id=result.site_id
          AND history.effective_from<=dates.business_date
          AND (history.effective_to IS NULL OR history.effective_to>=dates.business_date)
         JOIN employee_types employee_type
           ON employee_type.id=history.employee_type_id AND employee_type.code=?
         JOIN employee_statuses employee_status
           ON employee_status.id=history.employee_status_id AND employee_status.allows_attendance=1
     )
     SELECT UUID(),eligible.result_id,attendance.id,rate.id,eligible.business_date,
            COALESCE(attendance.attendance_status,'NOT_RECORDED'),
            COALESCE(attendance.calendar_day_type,'NOT_RECORDED'),
            EXISTS(SELECT 1 FROM employee_shift_assignments assignment
              JOIN shifts shift_row ON shift_row.id=assignment.shift_id
             WHERE assignment.employee_id=eligible.employee_id
               AND shift_row.site_id=eligible.site_id
               AND assignment.effective_from<=eligible.business_date
               AND (assignment.effective_to IS NULL OR assignment.effective_to>=eligible.business_date)
               AND JSON_CONTAINS(assignment.work_days_json,
                 CAST((((DAYOFWEEK(eligible.business_date)+5)%7)+1) AS CHAR),'$')),
            COALESCE(attendance.attendance_status='PRESENT',0),rate.daily_rate,
            CASE WHEN attendance.attendance_status='PRESENT' THEN rate.daily_rate ELSE 0 END,
            attendance.worked_minutes,
            CASE WHEN attendance.attendance_status='PRESENT'
                       AND attendance.calendar_day_type<>'WORKDAY'
                 THEN 'OFFDAY_PRESENT' ELSE NULL END,?,?
       FROM eligible
       LEFT JOIN attendance_records attendance
         ON attendance.employee_id=eligible.employee_id
        AND attendance.site_id=eligible.site_id
        AND attendance.business_date=eligible.business_date
       JOIN employee_daily_rate_histories rate
         ON rate.employee_id=eligible.employee_id AND rate.site_id=eligible.site_id
        AND rate.employee_type_code=? AND rate.status='ACTIVE'
        AND rate.effective_from<=eligible.business_date
        AND (rate.effective_to IS NULL OR rate.effective_to>=eligible.business_date)`,
    [
      run.periodStart,
      run.periodEnd,
      run.id,
      run.employeeType,
      auth.id,
      auth.id,
      run.employeeType,
    ]
  )

  // M5B sengaja hanya menerima komponen manual untuk basis waktu.
  await conn.execute(
    `INSERT INTO payroll_employee_component_details(
       uid,payroll_employee_result_id,payroll_component_type_id,
       component_code_snapshot,component_name_snapshot,component_category,
       source_type,source_id,amount,notes,created_by,updated_by
     )
     SELECT UUID(),result.id,component_type.id,component_type.code,
            component_type.name,component_type.component_category,
            'MANUAL',manual.id,manual.amount,manual.notes,?,?
       FROM payroll_employee_results result
       JOIN payroll_period_manual_components manual
         ON manual.employee_id=result.employee_id
        AND manual.payroll_period_id=? AND manual.status='ACTIVE'
       JOIN payroll_component_types component_type
         ON component_type.id=manual.payroll_component_type_id
      WHERE result.payroll_run_id=?`,
    [auth.id, auth.id, run.periodId, run.id]
  )

  await conn.execute(
    `INSERT INTO payroll_attendance_summaries(
       uid,payroll_employee_result_id,scheduled_days,present_days,absent_days,
       leave_days,sick_days,permission_days,holiday_days,late_minutes,
       early_leave_minutes,worked_minutes,created_by,updated_by
     )
     SELECT UUID(),result.id,
            COALESCE(SUM(detail.is_scheduled=1),0),
            COALESCE(SUM(detail.attendance_status_snapshot='PRESENT'),0),
            COALESCE(SUM(detail.attendance_status_snapshot='ABSENT'),0),
            COALESCE(SUM(detail.attendance_status_snapshot='LEAVE'),0),
            COALESCE(SUM(detail.attendance_status_snapshot='SICK'),0),
            COALESCE(SUM(detail.attendance_status_snapshot='PERMISSION'),0),
            COALESCE(SUM(detail.calendar_day_type_snapshot='NON_WORKDAY'),0),
            COALESCE(SUM(attendance.late_minutes),0),
            COALESCE(SUM(attendance.early_leave_minutes),0),
            COALESCE(SUM(detail.worked_minutes_snapshot),0),?,?
       FROM payroll_employee_results result
       LEFT JOIN payroll_time_details detail
         ON detail.payroll_employee_result_id=result.id
       LEFT JOIN attendance_records attendance
         ON attendance.id=detail.attendance_record_id
      WHERE result.payroll_run_id=? GROUP BY result.id`,
    [auth.id, auth.id, run.id]
  )

  if (run.employeeType === 'TRAINING') {
    await conn.execute(
      `INSERT INTO payroll_training_production_details(
         uid,payroll_employee_result_id,production_transaction_id,
         production_job_id,business_date,transaction_number_snapshot,
         job_name_snapshot,unit_name_snapshot,quantity_snapshot,created_by,updated_by
       )
       SELECT UUID(),result.id,transaction_row.id,transaction_row.production_job_id,
              transaction_row.business_date,transaction_row.transaction_number,
              job.name,unit.name,transaction_row.quantity,?,?
         FROM payroll_employee_results result
         JOIN production_transactions transaction_row
           ON transaction_row.employee_id=result.employee_id
          AND transaction_row.site_id=result.site_id
          AND transaction_row.status='POSTED'
          AND transaction_row.business_date BETWEEN ? AND ?
          AND EXISTS (
            SELECT 1 FROM employee_employment_histories production_history
            JOIN employee_types production_employee_type
              ON production_employee_type.id=production_history.employee_type_id
             AND production_employee_type.code='TRAINING'
            WHERE production_history.employee_id=result.employee_id
              AND production_history.site_id=result.site_id
              AND production_history.effective_from<=transaction_row.business_date
              AND (production_history.effective_to IS NULL
                   OR production_history.effective_to>=transaction_row.business_date)
          )
         JOIN production_jobs job ON job.id=transaction_row.production_job_id
         JOIN work_units unit ON unit.id=transaction_row.unit_id
        WHERE result.payroll_run_id=?`,
      [auth.id, auth.id, run.periodStart, run.periodEnd, run.id]
    )
  }

  await conn.execute(
    `UPDATE payroll_employee_results result
     LEFT JOIN (
       SELECT payroll_employee_result_id,
              ROUND(SUM(amount_snapshot),0) baseAmount,
              SUM(is_payable=1) presentDays,
              SUM(warning_code='OFFDAY_PRESENT') offdayPresentDays
         FROM payroll_time_details GROUP BY payroll_employee_result_id
     ) time_detail ON time_detail.payroll_employee_result_id=result.id
     LEFT JOIN (
       SELECT payroll_employee_result_id,
              SUM(CASE WHEN component_category='EARNING' THEN amount ELSE 0 END) earnings,
              SUM(CASE WHEN component_category='DEDUCTION' THEN amount ELSE 0 END) deductions
         FROM payroll_employee_component_details GROUP BY payroll_employee_result_id
     ) component ON component.payroll_employee_result_id=result.id
     LEFT JOIN (
       SELECT payroll_employee_result_id,COUNT(*) transactionCount
         FROM payroll_training_production_details GROUP BY payroll_employee_result_id
     ) training ON training.payroll_employee_result_id=result.id
        SET result.attendance_days=COALESCE(time_detail.presentDays,0),
            result.production_transaction_count=COALESCE(training.transactionCount,0),
            result.piece_rate_amount=0,
            result.basic_salary_amount=COALESCE(time_detail.baseAmount,0),
            result.additional_earnings=COALESCE(component.earnings,0),
            result.gross_earnings=COALESCE(time_detail.baseAmount,0)+COALESCE(component.earnings,0),
            result.total_deductions=COALESCE(component.deductions,0),
            result.net_pay=COALESCE(time_detail.baseAmount,0)+COALESCE(component.earnings,0)-COALESCE(component.deductions,0),
            result.calculation_notes=CASE
              WHEN COALESCE(time_detail.offdayPresentDays,0)>0
                THEN CONCAT(time_detail.offdayPresentDays,' kehadiran hari nonkerja tetap dibayar.')
              ELSE NULL END
      WHERE result.payroll_run_id=?`,
    [run.id]
  )

  await conn.execute(
    `UPDATE payroll_runs run_row
       JOIN (
         SELECT payroll_run_id,COUNT(*) employeeCount,
                COALESCE(SUM(piece_rate_amount),0) pieceAmount,
                COALESCE(SUM(basic_salary_amount),0) basicAmount,
                COALESCE(SUM(additional_earnings),0) earnings,
                COALESCE(SUM(total_deductions),0) deductions,
                COALESCE(SUM(net_pay),0) netPay
           FROM payroll_employee_results WHERE payroll_run_id=? GROUP BY payroll_run_id
       ) totals ON totals.payroll_run_id=run_row.id
        SET run_row.status='COMPLETED',run_row.processing_slot=NULL,
            run_row.calculation_finished_at=NOW(3),
            run_row.employee_count=totals.employeeCount,
            run_row.total_piece_rate_amount=totals.pieceAmount,
            run_row.total_basic_salary_amount=totals.basicAmount,
            run_row.total_earnings=totals.earnings,
            run_row.total_deductions=totals.deductions,
            run_row.total_net_pay=totals.netPay,run_row.updated_by=?
      WHERE run_row.id=? AND run_row.status='PROCESSING'`,
    [run.id, auth.id, run.id]
  )
  await conn.execute(
    `UPDATE payroll_periods
        SET status='CALCULATED',current_run_id=?,updated_by=? WHERE id=?`,
    [run.id, auth.id, run.periodId]
  )
  await writeAudit(
    {
      auth,
      module: 'PAYROLL',
      siteId: run.siteId,
      action: 'GENERATE',
      table: 'payroll_runs',
      recordId: run.id,
      recordUid: run.uid,
      description: `Simulasi Payroll ${run.employeeType} mingguan selesai dihitung.`,
      afterData: {
        status: 'COMPLETED',
        payrollBasis: 'TIME_BASED',
        employeeType: run.employeeType,
      },
    },
    conn
  )
}

async function calculateMonthlyTimeBasedRun(
  conn: PoolConnection,
  run: MonthlyTimeScope,
  auth: AuthContext
) {
  await assertNoTimeBasedRecurringComponents(conn, run)

  await conn.execute(
    `INSERT INTO payroll_employee_results(
       uid,payroll_run_id,payroll_period_id,employee_id,site_id,
       employee_number_snapshot,employee_name_snapshot,employee_type_snapshot,
       department_name_snapshot,position_name_snapshot,work_group_name_snapshot,
       bank_name_snapshot,bank_account_number_snapshot,bank_account_name_snapshot,
       created_by,updated_by
     )
     SELECT UUID(),?,?,population.employee_id,?,e.employee_number,e.full_name,
            'BULANAN',department.name,position_row.name,work_group.name,
            e.bank_name,e.bank_account_number,e.bank_account_name,?,?
       FROM (
         SELECT DISTINCT history.employee_id
           FROM employee_employment_histories history
           JOIN employee_types employee_type
             ON employee_type.id=history.employee_type_id AND employee_type.code='BULANAN'
           JOIN employee_statuses employee_status
             ON employee_status.id=history.employee_status_id AND employee_status.allows_attendance=1
          WHERE history.site_id=? AND history.effective_from<=?
            AND (history.effective_to IS NULL OR history.effective_to>=?)
       ) population
       JOIN employees e ON e.id=population.employee_id
       JOIN employee_employment_histories snapshot_history ON snapshot_history.id=(
         SELECT candidate.id
           FROM employee_employment_histories candidate
           JOIN employee_types candidate_type
             ON candidate_type.id=candidate.employee_type_id AND candidate_type.code='BULANAN'
          WHERE candidate.employee_id=population.employee_id AND candidate.site_id=?
            AND candidate.effective_from<=?
            AND (candidate.effective_to IS NULL OR candidate.effective_to>=?)
          ORDER BY candidate.effective_from DESC,candidate.id DESC LIMIT 1
       )
       LEFT JOIN departments department ON department.id=snapshot_history.department_id
       LEFT JOIN positions position_row ON position_row.id=snapshot_history.position_id
       LEFT JOIN work_groups work_group ON work_group.id=snapshot_history.work_group_id`,
    [
      run.id,
      run.periodId,
      run.siteId,
      auth.id,
      auth.id,
      run.siteId,
      run.periodEnd,
      run.periodStart,
      run.siteId,
      run.periodEnd,
      run.periodStart,
    ]
  )

  const [resultCountRows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) total FROM payroll_employee_results WHERE payroll_run_id=?`,
    [run.id]
  )
  if (Number(resultCountRows[0]?.total ?? 0) === 0) {
    throw new ApiError(
      409,
      'Populasi simulasi Payroll BULANAN kosong setelah validasi histori.'
    )
  }

  // Ledger harian hanya menyimpan tanggal yang benar-benar eligible. Hari
  // kalender penuh periode tetap disnapshot pada summary sebagai pembagi prorata.
  await conn.execute(
    `INSERT INTO payroll_monthly_daily_details(
       uid,payroll_employee_result_id,attendance_record_id,
       employee_salary_history_id,business_date,attendance_status_snapshot,
       calendar_day_type_snapshot,calendar_reason_type_snapshot,
       is_scheduled,deduction_type,
       full_basic_salary_snapshot,currency_snapshot,worked_minutes_snapshot,
       created_by,updated_by
     )
     WITH RECURSIVE dates AS (
       SELECT CAST(? AS DATE) business_date
       UNION ALL SELECT DATE_ADD(business_date,INTERVAL 1 DAY)
         FROM dates WHERE business_date<?
     ), eligible AS (
       SELECT dates.business_date,result.id result_id,result.employee_id,result.site_id
         FROM dates
         JOIN payroll_employee_results result ON result.payroll_run_id=?
         JOIN employee_employment_histories history
           ON history.employee_id=result.employee_id AND history.site_id=result.site_id
          AND history.effective_from<=dates.business_date
          AND (history.effective_to IS NULL OR history.effective_to>=dates.business_date)
         JOIN employee_types employee_type
           ON employee_type.id=history.employee_type_id AND employee_type.code='BULANAN'
         JOIN employee_statuses employee_status
           ON employee_status.id=history.employee_status_id AND employee_status.allows_attendance=1
     ), facts AS (
       SELECT eligible.*,attendance.id attendance_id,
              COALESCE(attendance.attendance_status,'NOT_RECORDED') attendance_status,
              COALESCE(attendance.calendar_day_type,'NOT_RECORDED') calendar_day_type,
              COALESCE(attendance.calendar_reason_type,'NOT_RECORDED') calendar_reason_type,
              attendance.worked_minutes,salary.id salary_id,salary.basic_salary,salary.currency,
              (attendance.calendar_day_type='WORKDAY' AND (
                attendance.calendar_reason_type='WORKDAY_OVERRIDE'
                OR EXISTS(
                  SELECT 1 FROM employee_shift_assignments assignment
                  JOIN shifts shift_row ON shift_row.id=assignment.shift_id
                   AND shift_row.site_id=eligible.site_id
                  WHERE assignment.employee_id=eligible.employee_id
                    AND assignment.effective_from<=eligible.business_date
                    AND (assignment.effective_to IS NULL OR assignment.effective_to>=eligible.business_date)
                    AND JSON_CONTAINS(assignment.work_days_json,
                      CAST((((DAYOFWEEK(eligible.business_date)+5)%7)+1) AS CHAR),'$')
                )
              )) is_scheduled
         FROM eligible
         LEFT JOIN attendance_records attendance
           ON attendance.employee_id=eligible.employee_id
          AND attendance.site_id=eligible.site_id
          AND attendance.business_date=eligible.business_date
         JOIN employee_salary_histories salary
           ON salary.employee_id=eligible.employee_id AND salary.status='ACTIVE'
          AND salary.effective_from<=eligible.business_date
          AND (salary.effective_to IS NULL OR salary.effective_to>=eligible.business_date)
     )
     SELECT UUID(),result_id,attendance_id,salary_id,business_date,
            attendance_status,calendar_day_type,calendar_reason_type,is_scheduled,
            CASE
              WHEN is_scheduled=1 AND attendance_status='ABSENT' THEN 'ALPHA'
              WHEN is_scheduled=1 AND attendance_status='PERMISSION' THEN 'PERMISSION'
              ELSE 'NONE'
            END,
            basic_salary,currency,worked_minutes,?,?
       FROM facts`,
    [run.periodStart, run.periodEnd, run.id, auth.id, auth.id]
  )

  // Semua rumus uang dieksekusi sebagai DECIMAL MySQL. ROUND(...,0) adalah
  // HALF_UP untuk nilai positif dan dilakukan per komponen per karyawan.
  await conn.execute(
    `INSERT INTO payroll_monthly_summaries(
       uid,payroll_employee_result_id,employee_salary_history_id,
       full_basic_salary_snapshot,currency_snapshot,period_calendar_days,
       eligible_calendar_days,prorated_basic_salary,scheduled_work_days,
       alpha_days,permission_days,alpha_deduction,permission_deduction,
       created_by,updated_by
     )
     WITH RECURSIVE dates AS (
       SELECT CAST(? AS DATE) business_date
       UNION ALL SELECT DATE_ADD(business_date,INTERVAL 1 DAY)
         FROM dates WHERE business_date<?
     ), period_schedule AS (
       SELECT result.id result_id,dates.business_date,
              CASE
                WHEN EXISTS(
                  SELECT 1 FROM attendance_calendar_site_rules override_rule
                   WHERE override_rule.site_id=result.site_id
                     AND override_rule.business_date=dates.business_date
                     AND override_rule.rule_type='WORKDAY_OVERRIDE'
                     AND override_rule.cancelled_at IS NULL
                ) THEN 1
                WHEN EXISTS(
                  SELECT 1 FROM attendance_calendar_events holiday_event
                   WHERE holiday_event.event_date=dates.business_date
                     AND holiday_event.event_type='NATIONAL_HOLIDAY'
                     AND holiday_event.cancelled_at IS NULL
                ) OR EXISTS(
                  SELECT 1 FROM attendance_calendar_site_rules holiday_rule
                  LEFT JOIN attendance_calendar_events linked_event
                    ON linked_event.id=holiday_rule.calendar_event_id
                   WHERE holiday_rule.site_id=result.site_id
                     AND holiday_rule.business_date=dates.business_date
                     AND holiday_rule.rule_type IN ('COLLECTIVE_LEAVE','SITE_HOLIDAY')
                     AND holiday_rule.cancelled_at IS NULL
                     AND (linked_event.id IS NULL OR linked_event.cancelled_at IS NULL)
                ) THEN 0
                ELSE COALESCE(JSON_CONTAINS((
                  SELECT assignment.work_days_json
                    FROM employee_shift_assignments assignment
                    JOIN shifts shift_row ON shift_row.id=assignment.shift_id
                     AND shift_row.site_id=result.site_id
                   WHERE assignment.employee_id=result.employee_id
                     AND assignment.effective_from<=?
                     AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
                   ORDER BY
                     CASE
                       WHEN assignment.effective_from<=dates.business_date
                        AND (assignment.effective_to IS NULL OR assignment.effective_to>=dates.business_date)
                         THEN 0
                       WHEN dates.business_date<assignment.effective_from
                         THEN DATEDIFF(assignment.effective_from,dates.business_date)
                       ELSE DATEDIFF(dates.business_date,assignment.effective_to)
                     END,
                     assignment.effective_from DESC,assignment.id DESC
                   LIMIT 1
                ),CAST((((DAYOFWEEK(dates.business_date)+5)%7)+1) AS CHAR),'$'),0)
              END is_scheduled
         FROM payroll_employee_results result
         CROSS JOIN dates
        WHERE result.payroll_run_id=?
     ), schedule_totals AS (
       SELECT result_id,SUM(is_scheduled=1) scheduled_work_days
         FROM period_schedule GROUP BY result_id
     )
     SELECT UUID(),result.id,MAX(detail.employee_salary_history_id),
            MAX(detail.full_basic_salary_snapshot),MAX(detail.currency_snapshot),
            DATEDIFF(?,?)+1,COUNT(*),
            ROUND(MAX(detail.full_basic_salary_snapshot)*COUNT(*)/(DATEDIFF(?,?)+1),0),
            MAX(schedule.scheduled_work_days),
            SUM(detail.deduction_type='ALPHA'),
            SUM(detail.deduction_type='PERMISSION'),
            CASE WHEN MAX(schedule.scheduled_work_days)=0 THEN 0 ELSE ROUND(
              MAX(detail.full_basic_salary_snapshot)/MAX(schedule.scheduled_work_days)
              *SUM(detail.deduction_type='ALPHA'),0) END,
            CASE WHEN MAX(schedule.scheduled_work_days)=0 THEN 0 ELSE ROUND(
              MAX(detail.full_basic_salary_snapshot)/MAX(schedule.scheduled_work_days)
              *SUM(detail.deduction_type='PERMISSION'),0) END,?,?
       FROM payroll_employee_results result
       JOIN payroll_monthly_daily_details detail
         ON detail.payroll_employee_result_id=result.id
       JOIN schedule_totals schedule ON schedule.result_id=result.id
      WHERE result.payroll_run_id=? GROUP BY result.id`,
    [
      run.periodStart,
      run.periodEnd,
      run.periodEnd,
      run.periodStart,
      run.id,
      run.periodEnd,
      run.periodStart,
      run.periodEnd,
      run.periodStart,
      auth.id,
      auth.id,
      run.id,
    ]
  )

  await conn.execute(
    `INSERT INTO payroll_employee_component_details(
       uid,payroll_employee_result_id,payroll_component_type_id,
       component_code_snapshot,component_name_snapshot,component_category,
       source_type,source_id,amount,notes,created_by,updated_by
     )
     SELECT UUID(),summary.payroll_employee_result_id,component_type.id,
            component_type.code,component_type.name,'DEDUCTION','SYSTEM',summary.id,
            CASE component_type.code
              WHEN 'MONTHLY_ALPHA_DEDUCTION' THEN summary.alpha_deduction
              ELSE summary.permission_deduction END,
            'Potongan otomatis sesuai snapshot policy Payroll BULANAN.',?,?
       FROM payroll_monthly_summaries summary
       JOIN payroll_employee_results result
         ON result.id=summary.payroll_employee_result_id AND result.payroll_run_id=?
       JOIN payroll_component_types component_type
         ON component_type.code IN ('MONTHLY_ALPHA_DEDUCTION','MONTHLY_PERMISSION_DEDUCTION')
        AND component_type.is_active=1
      WHERE (component_type.code='MONTHLY_ALPHA_DEDUCTION' AND summary.alpha_deduction>0)
         OR (component_type.code='MONTHLY_PERMISSION_DEDUCTION' AND summary.permission_deduction>0)`,
    [auth.id, auth.id, run.id]
  )

  await conn.execute(
    `INSERT INTO payroll_employee_component_details(
       uid,payroll_employee_result_id,payroll_component_type_id,
       component_code_snapshot,component_name_snapshot,component_category,
       source_type,source_id,amount,notes,created_by,updated_by
     )
     SELECT UUID(),result.id,component_type.id,component_type.code,
            component_type.name,component_type.component_category,
            'MANUAL',manual.id,manual.amount,manual.notes,?,?
       FROM payroll_employee_results result
       JOIN payroll_period_manual_components manual
         ON manual.employee_id=result.employee_id
        AND manual.payroll_period_id=? AND manual.status='ACTIVE'
       JOIN payroll_component_types component_type
         ON component_type.id=manual.payroll_component_type_id
      WHERE result.payroll_run_id=?`,
    [auth.id, auth.id, run.periodId, run.id]
  )

  await conn.execute(
    `INSERT INTO payroll_attendance_summaries(
       uid,payroll_employee_result_id,scheduled_days,present_days,absent_days,
       leave_days,sick_days,permission_days,holiday_days,late_minutes,
       early_leave_minutes,worked_minutes,created_by,updated_by
     )
     SELECT UUID(),result.id,SUM(detail.is_scheduled=1),
            SUM(detail.attendance_status_snapshot='PRESENT'),
            SUM(detail.attendance_status_snapshot='ABSENT'),
            SUM(detail.attendance_status_snapshot='LEAVE'),
            SUM(detail.attendance_status_snapshot='SICK'),
            SUM(detail.attendance_status_snapshot='PERMISSION'),
            SUM(detail.calendar_day_type_snapshot='HOLIDAY'),
            COALESCE(SUM(attendance.late_minutes),0),
            COALESCE(SUM(attendance.early_leave_minutes),0),
            COALESCE(SUM(detail.worked_minutes_snapshot),0),?,?
       FROM payroll_employee_results result
       JOIN payroll_monthly_daily_details detail
         ON detail.payroll_employee_result_id=result.id
       LEFT JOIN attendance_records attendance ON attendance.id=detail.attendance_record_id
      WHERE result.payroll_run_id=? GROUP BY result.id`,
    [auth.id, auth.id, run.id]
  )

  await conn.execute(
    `UPDATE payroll_employee_results result
     JOIN payroll_monthly_summaries monthly
       ON monthly.payroll_employee_result_id=result.id
     LEFT JOIN (
       SELECT payroll_employee_result_id,
              SUM(CASE WHEN component_category='EARNING' THEN amount ELSE 0 END) earnings,
              SUM(CASE WHEN component_category='DEDUCTION' THEN amount ELSE 0 END) deductions
         FROM payroll_employee_component_details GROUP BY payroll_employee_result_id
     ) component ON component.payroll_employee_result_id=result.id
        SET result.attendance_days=monthly.eligible_calendar_days,
            result.production_transaction_count=0,result.piece_rate_amount=0,
            result.basic_salary_amount=monthly.prorated_basic_salary,
            result.additional_earnings=COALESCE(component.earnings,0),
            result.gross_earnings=monthly.prorated_basic_salary+COALESCE(component.earnings,0),
            result.total_deductions=COALESCE(component.deductions,0),
            result.net_pay=monthly.prorated_basic_salary+COALESCE(component.earnings,0)-COALESCE(component.deductions,0),
            result.calculation_notes=CONCAT(
              'Prorata ',monthly.eligible_calendar_days,'/',monthly.period_calendar_days,
              ' hari kalender; potongan Alpha ',monthly.alpha_days,
              ' hari dan Izin ',monthly.permission_days,' hari.')
      WHERE result.payroll_run_id=?`,
    [run.id]
  )

  await conn.execute(
    `UPDATE payroll_runs run_row
       JOIN (
         SELECT payroll_run_id,COUNT(*) employeeCount,
                COALESCE(SUM(piece_rate_amount),0) pieceAmount,
                COALESCE(SUM(basic_salary_amount),0) basicAmount,
                COALESCE(SUM(additional_earnings),0) earnings,
                COALESCE(SUM(total_deductions),0) deductions,
                COALESCE(SUM(net_pay),0) netPay
           FROM payroll_employee_results WHERE payroll_run_id=? GROUP BY payroll_run_id
       ) totals ON totals.payroll_run_id=run_row.id
        SET run_row.status='COMPLETED',run_row.processing_slot=NULL,
            run_row.calculation_finished_at=NOW(3),
            run_row.employee_count=totals.employeeCount,
            run_row.total_piece_rate_amount=totals.pieceAmount,
            run_row.total_basic_salary_amount=totals.basicAmount,
            run_row.total_earnings=totals.earnings,
            run_row.total_deductions=totals.deductions,
            run_row.total_net_pay=totals.netPay,run_row.updated_by=?
      WHERE run_row.id=? AND run_row.status='PROCESSING'`,
    [run.id, auth.id, run.id]
  )
  await conn.execute(
    `UPDATE payroll_periods SET status='CALCULATED',current_run_id=?,updated_by=? WHERE id=?`,
    [run.id, auth.id, run.periodId]
  )
  await writeAudit(
    {
      auth,
      module: 'PAYROLL',
      siteId: run.siteId,
      action: 'GENERATE',
      table: 'payroll_runs',
      recordId: run.id,
      recordUid: run.uid,
      description: 'Simulasi Payroll BULANAN selesai dihitung.',
      afterData: {
        status: 'COMPLETED',
        payrollBasis: 'TIME_BASED',
        employeeType: 'BULANAN',
      },
    },
    conn
  )
}

export async function calculatePayrollRun(runId: number, auth: AuthContext) {
  const conn = await pool.getConnection()
  let failedContext: { uid: string; siteId: number } | null = null
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT pr.id,pr.uid,pr.status,pr.payroll_period_id periodId,
              pp.site_id siteId,pp.status periodStatus,
              pp.payroll_basis payrollBasis,pp.pay_frequency payFrequency,
              pp.employee_type_code employeeType,
              snapshot.policy_snapshot policySnapshot,
              DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
              DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd
         FROM payroll_runs pr JOIN payroll_periods pp ON pp.id=pr.payroll_period_id
         LEFT JOIN payroll_period_policy_snapshots snapshot
           ON snapshot.payroll_period_id=pp.id
        WHERE pr.id=? FOR UPDATE`,
      [runId]
    )
    const run = rows[0]
    if (!run || run.status !== 'PROCESSING') {
      await conn.rollback()
      return
    }
    failedContext = { uid: String(run.uid), siteId: Number(run.siteId) }

    // Kunci semua source row setelah PROCESSING terlihat. Mutasi Produksi dan
    // Attendance juga membaca periode/run Payroll sehingga urutan lock ini
    // menutup celah antara phase A dan snapshot phase B.
    await conn.query(
      `SELECT id FROM production_transactions
        WHERE site_id=? AND business_date BETWEEN ? AND ? FOR UPDATE`,
      [run.siteId, run.periodStart, run.periodEnd]
    )
    await conn.query(
      `SELECT id FROM attendance_records
        WHERE site_id=? AND business_date BETWEEN ? AND ? FOR UPDATE`,
      [run.siteId, run.periodStart, run.periodEnd]
    )
    if (run.payrollBasis === 'TIME_BASED') {
      await conn.query(
        `SELECT assignment.id
           FROM employee_shift_assignments assignment
           JOIN shifts shift_row ON shift_row.id=assignment.shift_id AND shift_row.site_id=?
          WHERE assignment.effective_from<=?
            AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
            AND EXISTS (
              SELECT 1 FROM employee_employment_histories shift_history
               WHERE shift_history.employee_id=assignment.employee_id
                 AND shift_history.site_id=?
                 AND shift_history.effective_from<=?
                 AND (shift_history.effective_to IS NULL OR shift_history.effective_to>=?)
            ) FOR UPDATE`,
        [
          run.siteId,
          run.periodEnd,
          run.periodStart,
          run.siteId,
          run.periodEnd,
          run.periodStart,
        ]
      )
      await conn.query(
        `SELECT id FROM attendance_calendar_events
          WHERE event_date BETWEEN ? AND ? AND cancelled_at IS NULL FOR UPDATE`,
        [run.periodStart, run.periodEnd]
      )
      await conn.query(
        `SELECT id FROM attendance_calendar_site_rules
          WHERE site_id=? AND business_date BETWEEN ? AND ?
            AND cancelled_at IS NULL FOR UPDATE`,
        [run.siteId, run.periodStart, run.periodEnd]
      )
      if (run.employeeType === 'BULANAN') {
        await conn.query(
          `SELECT salary.id FROM employee_salary_histories salary
            WHERE salary.status='ACTIVE' AND salary.effective_from<=?
              AND (salary.effective_to IS NULL OR salary.effective_to>=?)
              AND EXISTS (
                SELECT 1 FROM employee_employment_histories salary_history
                 WHERE salary_history.employee_id=salary.employee_id
                   AND salary_history.site_id=?
                   AND salary_history.effective_from<=?
                   AND (salary_history.effective_to IS NULL OR salary_history.effective_to>=?)
              ) FOR UPDATE`,
          [
            run.periodEnd,
            run.periodStart,
            run.siteId,
            run.periodEnd,
            run.periodStart,
          ]
        )
      } else {
        await conn.query(
          `SELECT rate.id FROM employee_daily_rate_histories rate
            WHERE rate.site_id=? AND rate.employee_type_code=? AND rate.status='ACTIVE'
              AND rate.effective_from<=?
              AND (rate.effective_to IS NULL OR rate.effective_to>=?) FOR UPDATE`,
          [run.siteId, run.employeeType, run.periodEnd, run.periodStart]
        )
      }
    }
    await conn.query(
      `SELECT epc.id FROM employee_payroll_components epc
        WHERE epc.is_active=1 AND epc.effective_from<=?
          AND (epc.effective_to IS NULL OR epc.effective_to>=?)
          AND EXISTS (
            SELECT 1 FROM employee_employment_histories component_history
             WHERE component_history.employee_id=epc.employee_id
               AND component_history.site_id=?
               AND component_history.effective_from<=?
               AND (component_history.effective_to IS NULL OR component_history.effective_to>=?)
          ) FOR UPDATE`,
      [
        run.periodEnd,
        run.periodStart,
        run.siteId,
        run.periodEnd,
        run.periodStart,
      ]
    )
    await conn.query(
      `SELECT id FROM payroll_period_manual_components
        WHERE payroll_period_id=? FOR UPDATE`,
      [run.periodId]
    )
    await conn.query(
      `SELECT id FROM employee_employment_histories
        WHERE site_id=? AND effective_from<=?
          AND (effective_to IS NULL OR effective_to>=?) FOR UPDATE`,
      [run.siteId, run.periodEnd, run.periodStart]
    )
    const readiness = await evaluatePayrollReadiness(conn, {
      id: Number(run.periodId),
      siteId: Number(run.siteId),
      periodStart: String(run.periodStart),
      periodEnd: String(run.periodEnd),
      payrollBasis: run.payrollBasis,
      payFrequency: run.payFrequency,
      employeeType: run.employeeType,
      policySnapshot: run.policySnapshot,
    })
    if (readiness.status === 'BLOCKED') {
      throw new ApiError(
        409,
        'Readiness Payroll berubah menjadi BLOCKED sebelum snapshot dibuat.'
      )
    }
    if (run.payrollBasis === 'TIME_BASED') {
      if (
        run.payFrequency === 'MONTHLY' &&
        run.employeeType === 'BULANAN'
      ) {
        await calculateMonthlyTimeBasedRun(
          conn,
          run as MonthlyTimeScope,
          auth
        )
        await conn.commit()
        return
      }
      if (
        run.payFrequency !== 'WEEKLY' ||
        !['HARIAN', 'TRAINING'].includes(String(run.employeeType))
      ) {
        throw new ApiError(
          409,
          'Kombinasi Payroll TIME_BASED belum didukung.'
        )
      }
      await calculateWeeklyTimeBasedRun(
        conn,
        run as WeeklyTimeScope,
        auth
      )
      await conn.commit()
      return
    }

    // Populasi adalah gabungan fakta produksi, komponen berulang, dan komponen manual.
    await conn.execute(
      `INSERT INTO payroll_employee_results(
         uid,payroll_run_id,payroll_period_id,employee_id,site_id,
         employee_number_snapshot,employee_name_snapshot,employee_type_snapshot,
         department_name_snapshot,position_name_snapshot,work_group_name_snapshot,
         bank_name_snapshot,bank_account_number_snapshot,bank_account_name_snapshot,
         created_by,updated_by
       )
       SELECT UUID(),?,?,population.employee_id,?,e.employee_number,e.full_name,
              et.code,d.name,p.name,w.name,
              e.bank_name,e.bank_account_number,e.bank_account_name,?,?
         FROM (
           SELECT employee_id FROM production_transactions
            WHERE site_id=? AND status='POSTED' AND business_date BETWEEN ? AND ?
           UNION
           SELECT epc.employee_id FROM employee_payroll_components epc
            WHERE epc.is_active=1 AND epc.effective_from<=?
              AND (epc.effective_to IS NULL OR epc.effective_to>=?)
              AND EXISTS (SELECT 1 FROM employee_employment_histories scope_history
                           WHERE scope_history.employee_id=epc.employee_id AND scope_history.site_id=?
                             AND scope_history.effective_from<=? AND (scope_history.effective_to IS NULL OR scope_history.effective_to>=?))
           UNION
           SELECT manual.employee_id FROM payroll_period_manual_components manual
            WHERE manual.payroll_period_id=? AND manual.status='ACTIVE'
         ) population
         JOIN employees e ON e.id=population.employee_id
         JOIN employee_employment_histories eh ON eh.id=(
           SELECT historical.id
             FROM employee_employment_histories historical
             JOIN employee_types historical_type
               ON historical_type.id=historical.employee_type_id
              AND historical_type.payroll_basis='PIECE_RATE'
            WHERE historical.employee_id=population.employee_id AND historical.site_id=?
              AND historical.effective_from<=? AND (historical.effective_to IS NULL OR historical.effective_to>=?)
            ORDER BY historical.effective_from DESC,historical.id DESC LIMIT 1
         )
         JOIN employee_types et
           ON et.id=eh.employee_type_id
          AND et.payroll_basis='PIECE_RATE'
         LEFT JOIN departments d ON d.id=eh.department_id
         LEFT JOIN positions p ON p.id=eh.position_id
         LEFT JOIN work_groups w ON w.id=eh.work_group_id`,
      [
        run.id,
        run.periodId,
        run.siteId,
        auth.id,
        auth.id,
        run.siteId,
        run.periodStart,
        run.periodEnd,
        run.periodEnd,
        run.periodStart,
        run.siteId,
        run.periodEnd,
        run.periodStart,
        run.periodId,
        run.siteId,
        run.periodEnd,
        run.periodStart,
      ]
    )
    const [resultCountRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) total FROM payroll_employee_results WHERE payroll_run_id=?`,
      [run.id]
    )
    if (Number(resultCountRows[0]?.total ?? 0) === 0) {
      throw new ApiError(
        409,
        'Populasi simulasi Payroll kosong setelah validasi histori.'
      )
    }

    await conn.execute(
      `INSERT INTO payroll_production_details(
         uid,payroll_employee_result_id,production_transaction_id,production_job_id,
         business_date,transaction_number_snapshot,job_name_snapshot,unit_name_snapshot,
         quantity_snapshot,rate_snapshot,amount_snapshot,created_by,updated_by
       )
       SELECT UUID(),result.id,pt.id,pt.production_job_id,pt.business_date,
              pt.transaction_number,j.name,u.name,pt.quantity,pt.rate_snapshot,
              pt.gross_amount,?,?
         FROM production_transactions pt
         JOIN payroll_employee_results result ON result.payroll_run_id=? AND result.employee_id=pt.employee_id
         JOIN production_jobs j ON j.id=pt.production_job_id
         JOIN work_units u ON u.id=pt.unit_id
        WHERE pt.site_id=? AND pt.status='POSTED' AND pt.business_date BETWEEN ? AND ?
          AND NOT EXISTS (
            SELECT 1 FROM payroll_production_details other_detail
            JOIN payroll_employee_results other_result ON other_result.id=other_detail.payroll_employee_result_id
            WHERE other_detail.production_transaction_id=pt.id AND other_result.payroll_period_id<>?
          )`,
      [
        auth.id,
        auth.id,
        run.id,
        run.siteId,
        run.periodStart,
        run.periodEnd,
        run.periodId,
      ]
    )

    // Komponen berulang dibayar penuh satu kali bila periode efektif overlap.
    await conn.execute(
      `INSERT INTO payroll_employee_component_details(
         uid,payroll_employee_result_id,payroll_component_type_id,
         component_code_snapshot,component_name_snapshot,component_category,
         source_type,source_id,amount,notes,created_by,updated_by
       )
       SELECT UUID(),result.id,pct.id,pct.code,pct.name,pct.component_category,
              'RECURRING',epc.id,epc.amount,epc.notes,?,?
         FROM payroll_employee_results result
         JOIN employee_payroll_components epc ON epc.employee_id=result.employee_id
         JOIN payroll_component_types pct ON pct.id=epc.payroll_component_type_id
        WHERE result.payroll_run_id=? AND epc.is_active=1
          AND epc.effective_from<=? AND (epc.effective_to IS NULL OR epc.effective_to>=?)`,
      [auth.id, auth.id, run.id, run.periodEnd, run.periodStart]
    )
    await conn.execute(
      `INSERT INTO payroll_employee_component_details(
         uid,payroll_employee_result_id,payroll_component_type_id,
         component_code_snapshot,component_name_snapshot,component_category,
         source_type,source_id,amount,notes,created_by,updated_by
       )
       SELECT UUID(),result.id,pct.id,pct.code,pct.name,pct.component_category,
              'MANUAL',manual.id,manual.amount,manual.notes,?,?
         FROM payroll_employee_results result
         JOIN payroll_period_manual_components manual
           ON manual.employee_id=result.employee_id AND manual.payroll_period_id=? AND manual.status='ACTIVE'
         JOIN payroll_component_types pct ON pct.id=manual.payroll_component_type_id
        WHERE result.payroll_run_id=?`,
      [auth.id, auth.id, run.periodId, run.id]
    )

    await conn.execute(
      `INSERT INTO payroll_attendance_summaries(
         uid,payroll_employee_result_id,scheduled_days,present_days,absent_days,
         leave_days,sick_days,permission_days,holiday_days,late_minutes,
         early_leave_minutes,worked_minutes,created_by,updated_by
       )
       SELECT UUID(),result.id,
              COALESCE(SUM(ar.calendar_day_type='WORKDAY'),0),
              COALESCE(SUM(ar.attendance_status='PRESENT'
                           AND ar.calendar_day_type='WORKDAY'),0),
              COALESCE(SUM(ar.attendance_status='ABSENT'),0),
              COALESCE(SUM(ar.attendance_status='LEAVE'),0),
              COALESCE(SUM(ar.attendance_status='SICK'),0),
              COALESCE(SUM(ar.attendance_status='PERMISSION'),0),
              COALESCE(SUM(ar.calendar_day_type='NON_WORKDAY'),0),
              COALESCE(SUM(ar.late_minutes),0),COALESCE(SUM(ar.early_leave_minutes),0),
              COALESCE(SUM(ar.worked_minutes),0),?,?
         FROM payroll_employee_results result
         LEFT JOIN attendance_records ar ON ar.employee_id=result.employee_id
          AND ar.site_id=? AND ar.business_date BETWEEN ? AND ?
        WHERE result.payroll_run_id=? GROUP BY result.id`,
      [auth.id, auth.id, run.siteId, run.periodStart, run.periodEnd, run.id]
    )

    // Seluruh aritmetika uang dilakukan DECIMAL oleh database, tidak melalui JS Number.
    await conn.execute(
      `UPDATE payroll_employee_results result
       LEFT JOIN (
         SELECT payroll_employee_result_id,SUM(amount_snapshot) pieceAmount,COUNT(*) transactionCount
           FROM payroll_production_details GROUP BY payroll_employee_result_id
       ) production ON production.payroll_employee_result_id=result.id
       LEFT JOIN (
         SELECT payroll_employee_result_id,
                SUM(CASE WHEN component_category='EARNING' THEN amount ELSE 0 END) earnings,
                SUM(CASE WHEN component_category='DEDUCTION' THEN amount ELSE 0 END) deductions
           FROM payroll_employee_component_details GROUP BY payroll_employee_result_id
       ) component ON component.payroll_employee_result_id=result.id
       LEFT JOIN payroll_attendance_summaries attendance ON attendance.payroll_employee_result_id=result.id
          SET result.attendance_days=COALESCE(attendance.present_days,0),
              result.production_transaction_count=COALESCE(production.transactionCount,0),
              result.piece_rate_amount=COALESCE(production.pieceAmount,0),
              result.additional_earnings=COALESCE(component.earnings,0),
              result.gross_earnings=COALESCE(production.pieceAmount,0)+COALESCE(component.earnings,0),
              result.total_deductions=COALESCE(component.deductions,0),
              result.net_pay=COALESCE(production.pieceAmount,0)+COALESCE(component.earnings,0)-COALESCE(component.deductions,0)
        WHERE result.payroll_run_id=?`,
      [run.id]
    )
    await conn.execute(
      `UPDATE production_transactions pt
         JOIN payroll_production_details detail ON detail.production_transaction_id=pt.id
         JOIN payroll_employee_results result ON result.id=detail.payroll_employee_result_id
          SET pt.payroll_locked_at=COALESCE(pt.payroll_locked_at,NOW(3)),pt.updated_by=?
        WHERE result.payroll_run_id=?`,
      [auth.id, run.id]
    )
    await conn.execute(
      `UPDATE payroll_runs pr
         JOIN (
           SELECT payroll_run_id,COUNT(*) employeeCount,
                  COALESCE(SUM(piece_rate_amount),0) pieceAmount,
                  COALESCE(SUM(additional_earnings),0) earnings,
                  COALESCE(SUM(total_deductions),0) deductions,
                  COALESCE(SUM(net_pay),0) netPay
             FROM payroll_employee_results WHERE payroll_run_id=? GROUP BY payroll_run_id
         ) totals ON totals.payroll_run_id=pr.id
          SET pr.status='COMPLETED',pr.processing_slot=NULL,
              pr.calculation_finished_at=NOW(3),pr.employee_count=totals.employeeCount,
              pr.total_piece_rate_amount=totals.pieceAmount,pr.total_earnings=totals.earnings,
              pr.total_deductions=totals.deductions,pr.total_net_pay=totals.netPay,
              pr.updated_by=?
        WHERE pr.id=? AND pr.status='PROCESSING'`,
      [run.id, auth.id, run.id]
    )
    await conn.execute(
      `UPDATE payroll_periods SET status='CALCULATED',current_run_id=?,updated_by=? WHERE id=?`,
      [run.id, auth.id, run.periodId]
    )
    await writeAudit(
      {
        auth,
        module: 'PAYROLL',
        siteId: Number(run.siteId),
        action: 'GENERATE',
        table: 'payroll_runs',
        recordId: Number(run.id),
        recordUid: String(run.uid),
        description: 'Simulasi Payroll selesai dihitung.',
        afterData: { status: 'COMPLETED' },
      },
      conn
    )
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    const message =
      error instanceof Error
        ? error.message.slice(0, 1000)
        : 'Perhitungan Payroll gagal.'
    await pool.execute(
      `UPDATE payroll_runs SET status='FAILED',processing_slot=NULL,
              calculation_finished_at=NOW(3),error_message=?,updated_by=?
        WHERE id=? AND status='PROCESSING'`,
      [message, auth.id, runId]
    )
    if (failedContext) {
      try {
        await writeAudit({
          auth,
          module: 'PAYROLL',
          siteId: failedContext.siteId,
          action: 'OTHER',
          table: 'payroll_runs',
          recordId: runId,
          recordUid: failedContext.uid,
          description:
            'Simulasi Payroll gagal dihitung dan seluruh snapshot dibatalkan.',
          reason: message,
          afterData: { status: 'FAILED' },
        })
      } catch {
        // Status FAILED lebih penting daripada kegagalan audit sekunder. Audit
        // phase A tetap mempertahankan jejak run yang dimulai.
      }
    }
  } finally {
    conn.release()
  }
}

export function schedulePayrollCalculation(runId: number, auth: AuthContext) {
  setImmediate(() => {
    void calculatePayrollRun(runId, auth)
  })
}
