import type { ResultSetHeader, RowDataPacket } from 'mysql2'
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
  runNumber: number
  runType: 'SIMULATION' | 'FINAL'
  status: PayrollRunStatus
  startedAt: string
  finishedAt: string | null
  employeeCount: number
  totalPieceRateAmount: string
  totalEarnings: string
  totalDeductions: string
  totalNetPay: string
  errorMessage: string | null
  currentRunId: number | null
}

export const runProjection = `SELECT pr.id,pr.uid,pr.payroll_period_id periodId,
  pp.uid periodUid,pp.site_id siteId,s.code siteCode,
  DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
  DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,
  pr.run_number runNumber,pr.run_type runType,pr.status,
  CONCAT(DATE_FORMAT(pr.calculation_started_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') startedAt,
  IF(pr.calculation_finished_at IS NULL,NULL,CONCAT(DATE_FORMAT(pr.calculation_finished_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00')) finishedAt,
  pr.employee_count employeeCount,pr.total_piece_rate_amount totalPieceRateAmount,
  pr.total_earnings totalEarnings,pr.total_deductions totalDeductions,
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
    totalPieceRateAmount: String(row.totalPieceRateAmount ?? '0.00'),
    totalEarnings: String(row.totalEarnings ?? '0.00'),
    totalDeductions: String(row.totalDeductions ?? '0.00'),
    totalNetPay: String(row.totalNetPay ?? '0.00'),
    errorMessage: row.errorMessage,
    isCurrent: Number(row.currentRunId ?? 0) === Number(row.id),
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
              DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
              DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,s.code siteCode
         FROM payroll_periods pp JOIN sites s ON s.id=pp.site_id
        WHERE pp.uid=? FOR UPDATE`,
      [input.periodUid]
    )
    const period = periodRows[0]
    if (!period) throw new ApiError(404, 'Periode Payroll tidak ditemukan.')
    const global = input.auth.roles.includes('SUPER_ADMIN')
    if (!global && !input.auth.siteAccess.includes(String(period.siteCode))) {
      throw new ApiError(403, 'Akses site Payroll ditolak.')
    }
    if (period.payrollBasis !== 'PIECE_RATE')
      throw new ApiError(
        409,
        'Simulasi awal hanya mendukung Payroll PIECE_RATE.'
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
    })
    if (readiness.status === 'BLOCKED') {
      throw new ApiError(
        409,
        'Readiness Payroll masih BLOCKED. Selesaikan seluruh blocker sebelum menghitung.'
      )
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
       ) VALUES(?,?,?,?,'SIMULATION','PROCESSING',1,'2.0',NOW(3),?,?,?,?)`,
      [
        uid,
        period.id,
        input.idempotencyKey,
        Number(numberRows[0]?.runNumber ?? 1),
        JSON.stringify({
          readinessStatus: readiness.status,
          evaluatedAt: readiness.evaluatedAt,
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

export async function calculatePayrollRun(runId: number, auth: AuthContext) {
  const conn = await pool.getConnection()
  let failedContext: { uid: string; siteId: number } | null = null
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT pr.id,pr.uid,pr.status,pr.payroll_period_id periodId,
              pp.site_id siteId,pp.status periodStatus,
              DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
              DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd
         FROM payroll_runs pr JOIN payroll_periods pp ON pp.id=pr.payroll_period_id
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
    })
    if (readiness.status === 'BLOCKED') {
      throw new ApiError(
        409,
        'Readiness Payroll berubah menjadi BLOCKED sebelum snapshot dibuat.'
      )
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
