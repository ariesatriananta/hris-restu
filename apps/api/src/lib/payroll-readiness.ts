import type { RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'

export type PayrollReadinessStatus = 'READY' | 'ATTENTION' | 'BLOCKED'

export type PayrollReadinessIssue = {
  code: string
  message: string
  count: number
  severity: 'BLOCKER' | 'WARNING'
  group:
    | 'PERIOD'
    | 'ATTENDANCE'
    | 'EMPLOYMENT'
    | 'PRODUCTION'
    | 'COMPONENT'
    | 'PAYMENT'
  actionUrl: string | null
}

export type PayrollReadiness = {
  status: PayrollReadinessStatus
  evaluatedAt: string
  populationCount: number
  productionEmployeeCount: number
  componentOnlyEmployeeCount: number
  blockerCount: number
  warningCount: number
  blockers: PayrollReadinessIssue[]
  warnings: PayrollReadinessIssue[]
  facts: {
    periodFinished: boolean
    expectedAttendanceDays: number
    finalizedAttendanceDays: number
    pendingAttendanceCorrections: number
    pendingAttendanceClassifications: number
    ambiguousEmploymentEmployees: number
    conflictingProductionTransactions: number
    unsupportedFormulaComponents: number
    missingBankAccounts: number
    postedTransactionCount: number
    productionGrossAmount: number
    activeComponentCount: number
    recurringComponentCount: number
    missingEmploymentHistoryEmployees: number
    attendance: { absent: number; late: number; earlyLeave: number }
  }
}

type Executor = Pick<Pool | PoolConnection, 'query'>

type PeriodScope = {
  id: number
  siteId: number
  periodStart: string
  periodEnd: string
}

function number(value: unknown) {
  return Number(value ?? 0)
}

function issue(
  code: string,
  message: string,
  count: number,
  severity: PayrollReadinessIssue['severity'],
  group: PayrollReadinessIssue['group'],
  actionUrl: string | null
): PayrollReadinessIssue {
  return { code, message, count, severity, group, actionUrl }
}

export async function evaluatePayrollReadiness(
  executor: Executor,
  period: PeriodScope
): Promise<PayrollReadiness> {
  const [populationRows] = await executor.query<RowDataPacket[]>(
    `WITH population AS (
       SELECT pt.employee_id,1 has_production
         FROM production_transactions pt
        WHERE pt.site_id=? AND pt.status='POSTED'
          AND pt.business_date BETWEEN ? AND ?
        GROUP BY pt.employee_id
       UNION ALL
       SELECT epc.employee_id,0 has_production
         FROM employee_payroll_components epc
        WHERE epc.is_active=1
          AND epc.effective_from<=?
          AND (epc.effective_to IS NULL OR epc.effective_to>=?)
          AND EXISTS (
            SELECT 1 FROM employee_employment_histories eh
             WHERE eh.employee_id=epc.employee_id AND eh.site_id=?
               AND eh.effective_from<=?
               AND (eh.effective_to IS NULL OR eh.effective_to>=?)
          )
        GROUP BY epc.employee_id
       UNION ALL
       SELECT manual.employee_id,0 has_production
         FROM payroll_period_manual_components manual
        WHERE manual.payroll_period_id=? AND manual.status='ACTIVE'
        GROUP BY manual.employee_id
     ), rolled AS (
       SELECT employee_id,MAX(has_production) has_production
         FROM population GROUP BY employee_id
     )
     SELECT COUNT(*) populationCount,
            COALESCE(SUM(has_production=1),0) productionEmployeeCount,
            COALESCE(SUM(has_production=0),0) componentOnlyEmployeeCount,
            COALESCE(SUM(e.bank_name IS NULL OR TRIM(e.bank_name)=''
                      OR e.bank_account_number IS NULL OR TRIM(e.bank_account_number)=''
                      OR e.bank_account_name IS NULL OR TRIM(e.bank_account_name)=''),0) missingBankAccounts
            ,(SELECT COUNT(*) FROM production_transactions posted
                WHERE posted.site_id=? AND posted.status='POSTED'
                  AND posted.business_date BETWEEN ? AND ?) postedTransactionCount
            ,(SELECT COALESCE(SUM(posted.gross_amount),0) FROM production_transactions posted
                WHERE posted.site_id=? AND posted.status='POSTED'
                  AND posted.business_date BETWEEN ? AND ?) productionGrossAmount
            ,(SELECT COUNT(*) FROM employee_payroll_components active_component
                WHERE active_component.is_active=1
                  AND active_component.effective_from<=?
                  AND (active_component.effective_to IS NULL OR active_component.effective_to>=?)
                  AND EXISTS (
                    SELECT 1 FROM employee_employment_histories component_history
                     WHERE component_history.employee_id=active_component.employee_id
                       AND component_history.site_id=?
                       AND component_history.effective_from<=?
                       AND (component_history.effective_to IS NULL OR component_history.effective_to>=?)
                  )) activeComponentCount
            ,COALESCE(SUM(NOT EXISTS (
                SELECT 1 FROM employee_employment_histories payroll_history
                JOIN employee_types payroll_type
                  ON payroll_type.id=payroll_history.employee_type_id
                 AND payroll_type.payroll_basis='PIECE_RATE'
                 WHERE payroll_history.employee_id=rolled.employee_id
                   AND payroll_history.site_id=?
                   AND payroll_history.effective_from<=?
                   AND (payroll_history.effective_to IS NULL OR payroll_history.effective_to>=?)
              )),0) missingEmploymentHistoryEmployees
       FROM rolled JOIN employees e ON e.id=rolled.employee_id`,
    [
      period.siteId,
      period.periodStart,
      period.periodEnd,
      period.periodEnd,
      period.periodStart,
      period.siteId,
      period.periodEnd,
      period.periodStart,
      period.id,
      period.siteId,
      period.periodStart,
      period.periodEnd,
      period.siteId,
      period.periodStart,
      period.periodEnd,
      period.periodEnd,
      period.periodStart,
      period.siteId,
      period.periodEnd,
      period.periodStart,
      period.siteId,
      period.periodEnd,
      period.periodStart,
    ]
  )

  const [integrityRows] = await executor.query<RowDataPacket[]>(
    `SELECT
       CURRENT_DATE() dbToday,
       (SELECT COUNT(*)
          FROM attendance_corrections ac
          JOIN attendance_records ar ON ar.id=ac.attendance_record_id
         WHERE ar.site_id=? AND ar.business_date BETWEEN ? AND ?
           AND ac.approval_status='PENDING') pendingCorrections,
       (SELECT COUNT(*) FROM attendance_classification_requests acr
         WHERE acr.site_id=? AND acr.approval_status='PENDING'
           AND acr.start_date<=? AND acr.end_date>=?) pendingClassifications,
       (SELECT COUNT(DISTINCT first_history.employee_id)
          FROM employee_employment_histories first_history
          JOIN employee_employment_histories second_history
            ON second_history.employee_id=first_history.employee_id
           AND second_history.id>first_history.id
           AND second_history.effective_from<=COALESCE(first_history.effective_to,'9999-12-31')
           AND first_history.effective_from<=COALESCE(second_history.effective_to,'9999-12-31')
         WHERE (first_history.site_id=? OR second_history.site_id=?)
           AND first_history.effective_from<=?
           AND COALESCE(first_history.effective_to,'9999-12-31')>=?
           AND second_history.effective_from<=?
           AND COALESCE(second_history.effective_to,'9999-12-31')>=?
           AND (
             EXISTS (
               SELECT 1 FROM production_transactions paid_production
                WHERE paid_production.employee_id=first_history.employee_id
                  AND paid_production.site_id=? AND paid_production.status='POSTED'
                  AND paid_production.business_date BETWEEN ? AND ?
             )
             OR EXISTS (
               SELECT 1 FROM employee_payroll_components paid_component
                WHERE paid_component.employee_id=first_history.employee_id
                  AND paid_component.is_active=1
                  AND paid_component.effective_from<=?
                  AND (paid_component.effective_to IS NULL OR paid_component.effective_to>=?)
             )
           )) ambiguousEmployment,
       (SELECT COUNT(DISTINCT pt.id)
          FROM production_transactions pt
          JOIN payroll_production_details ppd ON ppd.production_transaction_id=pt.id
          JOIN payroll_employee_results per ON per.id=ppd.payroll_employee_result_id
         WHERE pt.site_id=? AND pt.status='POSTED'
           AND pt.business_date BETWEEN ? AND ?
           AND per.payroll_period_id<>?) conflictingProduction,
       (SELECT COUNT(*)
          FROM employee_payroll_components epc
          JOIN payroll_component_types pct ON pct.id=epc.payroll_component_type_id
         WHERE epc.is_active=1 AND pct.calculation_method='FORMULA'
           AND epc.effective_from<=?
           AND (epc.effective_to IS NULL OR epc.effective_to>=?)
           AND EXISTS (
             SELECT 1 FROM employee_employment_histories eh
              WHERE eh.employee_id=epc.employee_id AND eh.site_id=?
                AND eh.effective_from<=?
                AND (eh.effective_to IS NULL OR eh.effective_to>=?)
           )) unsupportedFormula,
       (SELECT COALESCE(SUM(ar.attendance_status='ABSENT'),0)
          FROM attendance_records ar
         WHERE ar.site_id=? AND ar.business_date BETWEEN ? AND ?) absentCount,
       (SELECT COALESCE(SUM(ar.late_minutes>0),0)
          FROM attendance_records ar
         WHERE ar.site_id=? AND ar.business_date BETWEEN ? AND ?) lateCount,
       (SELECT COALESCE(SUM(ar.early_leave_minutes>0),0)
          FROM attendance_records ar
         WHERE ar.site_id=? AND ar.business_date BETWEEN ? AND ?) earlyLeaveCount`,
    [
      period.siteId,
      period.periodStart,
      period.periodEnd,
      period.siteId,
      period.periodEnd,
      period.periodStart,
      // Histori employment ambigu: dua site + rentang dua histori.
      period.siteId,
      period.siteId,
      period.periodEnd,
      period.periodStart,
      period.periodEnd,
      period.periodStart,
      // Populasi pembayarannya: transaksi Produksi atau komponen berulang.
      period.siteId,
      period.periodStart,
      period.periodEnd,
      period.periodEnd,
      period.periodStart,
      // Konflik snapshot Produksi.
      period.siteId,
      period.periodStart,
      period.periodEnd,
      period.id,
      // Formula komponen yang belum didukung.
      period.periodEnd,
      period.periodStart,
      period.siteId,
      period.periodEnd,
      period.periodStart,
      // Statistik Attendance informasional.
      period.siteId,
      period.periodStart,
      period.periodEnd,
      period.siteId,
      period.periodStart,
      period.periodEnd,
      period.siteId,
      period.periodStart,
      period.periodEnd,
    ]
  )

  const [attendanceRows] = await executor.query<RowDataPacket[]>(
    `WITH RECURSIVE dates AS (
       SELECT CAST(? AS DATE) business_date
       UNION ALL
       SELECT DATE_ADD(business_date,INTERVAL 1 DAY)
         FROM dates WHERE business_date<?
     ), expected AS (
       SELECT d.business_date
         FROM dates d
        WHERE EXISTS (
          SELECT 1
            FROM employee_shift_assignments esa
            JOIN employee_employment_histories eh ON eh.employee_id=esa.employee_id
            JOIN employee_statuses es ON es.id=eh.employee_status_id
           WHERE eh.site_id=? AND es.allows_attendance=1
             AND esa.effective_from<=d.business_date
             AND (esa.effective_to IS NULL OR esa.effective_to>=d.business_date)
             AND eh.effective_from<=d.business_date
             AND (eh.effective_to IS NULL OR eh.effective_to>=d.business_date)
             AND JSON_CONTAINS(esa.work_days_json,CAST((((DAYOFWEEK(d.business_date)+5)%7)+1) AS CHAR),'$')
        )
     )
     SELECT COUNT(*) expectedDays,
            COALESCE(SUM(latest.status='SUCCEEDED'),0) finalizedDays,
            COALESCE(SUM(latest.status='RUNNING'),0) runningDays,
            COALESCE(SUM(latest.status IN ('FAILED','SKIPPED') OR latest.status IS NULL),0) invalidDays
       FROM expected
       LEFT JOIN attendance_daily_finalization_runs latest
         ON latest.id=(
           SELECT MAX(candidate.id)
             FROM attendance_daily_finalization_runs candidate
            WHERE candidate.site_id=? AND candidate.business_date=expected.business_date
         )`,
    [period.periodStart, period.periodEnd, period.siteId, period.siteId]
  )

  const population = populationRows[0] ?? {}
  const integrity = integrityRows[0] ?? {}
  const attendance = attendanceRows[0] ?? {}
  const periodFinished = String(integrity.dbToday ?? '') > period.periodEnd
  const expectedAttendanceDays = number(attendance.expectedDays)
  const finalizedAttendanceDays = number(attendance.finalizedDays)
  const pendingAttendanceCorrections = number(integrity.pendingCorrections)
  const pendingAttendanceClassifications = number(
    integrity.pendingClassifications
  )
  const ambiguousEmploymentEmployees = number(integrity.ambiguousEmployment)
  const conflictingProductionTransactions = number(
    integrity.conflictingProduction
  )
  const unsupportedFormulaComponents = number(integrity.unsupportedFormula)
  const populationCount = number(population.populationCount)
  const productionEmployeeCount = number(population.productionEmployeeCount)
  const componentOnlyEmployeeCount = number(
    population.componentOnlyEmployeeCount
  )
  const missingBankAccounts = number(population.missingBankAccounts)
  const postedTransactionCount = number(population.postedTransactionCount)
  const productionGrossAmount = number(population.productionGrossAmount)
  const activeComponentCount = number(population.activeComponentCount)
  const missingEmploymentHistoryEmployees = number(
    population.missingEmploymentHistoryEmployees
  )
  const blockers: PayrollReadinessIssue[] = []
  const warnings: PayrollReadinessIssue[] = []

  if (!periodFinished)
    blockers.push(
      issue(
        'PERIOD_NOT_ENDED',
        'Periode Payroll belum selesai.',
        1,
        'BLOCKER',
        'PERIOD',
        null
      )
    )
  if (expectedAttendanceDays !== finalizedAttendanceDays) {
    blockers.push(
      issue(
        'ATTENDANCE_NOT_FINALIZED',
        'Finalisasi Attendance belum lengkap atau hasil terakhirnya tidak berhasil.',
        Math.max(0, expectedAttendanceDays - finalizedAttendanceDays),
        'BLOCKER',
        'ATTENDANCE',
        '/attendance/monitoring-harian'
      )
    )
  }
  if (number(attendance.runningDays) > 0) {
    blockers.push(
      issue(
        'ATTENDANCE_FINALIZATION_RUNNING',
        'Finalisasi Attendance masih berjalan.',
        number(attendance.runningDays),
        'BLOCKER',
        'ATTENDANCE',
        '/attendance/monitoring-harian'
      )
    )
  }
  if (pendingAttendanceCorrections > 0) {
    blockers.push(
      issue(
        'PENDING_ATTENDANCE_CORRECTION',
        'Masih ada koreksi Attendance yang menunggu keputusan.',
        pendingAttendanceCorrections,
        'BLOCKER',
        'ATTENDANCE',
        '/attendance/tindak-lanjut'
      )
    )
  }
  if (pendingAttendanceClassifications > 0) {
    blockers.push(
      issue(
        'PENDING_ATTENDANCE_CLASSIFICATION',
        'Masih ada klasifikasi Attendance yang menunggu keputusan.',
        pendingAttendanceClassifications,
        'BLOCKER',
        'ATTENDANCE',
        '/attendance/tindak-lanjut'
      )
    )
  }
  if (ambiguousEmploymentEmployees > 0) {
    blockers.push(
      issue(
        'AMBIGUOUS_EMPLOYMENT',
        'Ditemukan histori employment yang bertumpang-tindih.',
        ambiguousEmploymentEmployees,
        'BLOCKER',
        'EMPLOYMENT',
        '/karyawan/data-karyawan'
      )
    )
  }
  if (missingEmploymentHistoryEmployees > 0) {
    blockers.push(
      issue(
        'EMPLOYMENT_HISTORY_MISSING',
        'Karyawan dalam populasi Payroll tidak memiliki histori employment valid pada site dan periode.',
        missingEmploymentHistoryEmployees,
        'BLOCKER',
        'EMPLOYMENT',
        '/karyawan/data-karyawan'
      )
    )
  }
  if (populationCount === 0)
    blockers.push(
      issue(
        'EMPTY_POPULATION',
        'Tidak ada karyawan yang masuk populasi Payroll.',
        1,
        'BLOCKER',
        'PERIOD',
        null
      )
    )
  if (conflictingProductionTransactions > 0) {
    blockers.push(
      issue(
        'PRODUCTION_SNAPSHOT_CONFLICT',
        'Transaksi Produksi sudah digunakan oleh periode Payroll lain.',
        conflictingProductionTransactions,
        'BLOCKER',
        'PRODUCTION',
        '/produksi/transaksi'
      )
    )
  }
  if (unsupportedFormulaComponents > 0) {
    blockers.push(
      issue(
        'UNSUPPORTED_FORMULA_COMPONENT',
        'Ada komponen formula yang belum didukung.',
        unsupportedFormulaComponents,
        'BLOCKER',
        'COMPONENT',
        null
      )
    )
  }
  if (missingBankAccounts > 0)
    warnings.push(
      issue(
        'MISSING_BANK_ACCOUNT',
        'Data rekening sebagian karyawan belum lengkap.',
        missingBankAccounts,
        'WARNING',
        'PAYMENT',
        '/karyawan/data-karyawan'
      )
    )
  if (componentOnlyEmployeeCount > 0) {
    warnings.push(
      issue(
        'COMPONENT_ONLY_EMPLOYEE',
        'Sebagian karyawan hanya memiliki komponen Payroll tanpa transaksi Produksi.',
        componentOnlyEmployeeCount,
        'WARNING',
        'COMPONENT',
        null
      )
    )
  }

  const absent = number(integrity.absentCount)
  const late = number(integrity.lateCount)
  const earlyLeave = number(integrity.earlyLeaveCount)
  if (absent + late + earlyLeave > 0) {
    warnings.push(
      issue(
        'ATTENDANCE_INFORMATION',
        'Terdapat informasi Alpha, terlambat, atau pulang awal. Informasi ini tidak otomatis memotong upah.',
        absent + late + earlyLeave,
        'WARNING',
        'ATTENDANCE',
        '/attendance/rekap'
      )
    )
  }

  return {
    status: blockers.length
      ? 'BLOCKED'
      : warnings.length
        ? 'ATTENTION'
        : 'READY',
    evaluatedAt: new Date().toISOString(),
    populationCount,
    productionEmployeeCount,
    componentOnlyEmployeeCount,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    facts: {
      periodFinished,
      expectedAttendanceDays,
      finalizedAttendanceDays,
      pendingAttendanceCorrections,
      pendingAttendanceClassifications,
      ambiguousEmploymentEmployees,
      conflictingProductionTransactions,
      unsupportedFormulaComponents,
      missingBankAccounts,
      postedTransactionCount,
      productionGrossAmount,
      activeComponentCount,
      recurringComponentCount: activeComponentCount,
      missingEmploymentHistoryEmployees,
      attendance: { absent, late, earlyLeave },
    },
  }
}
