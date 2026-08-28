import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { ApiError } from './errors.js'

export async function assertAttendancePayrollUnlocked(
  conn: PoolConnection,
  input: {
    siteId: number
    dateFrom: string
    dateTo: string
    employeeId?: number
  }
) {
  const [lockedPeriods] = await conn.query<RowDataPacket[]>(
    `SELECT pp.id,pp.status,
            EXISTS(SELECT 1 FROM payroll_runs pr
                    WHERE pr.payroll_period_id=pp.id AND pr.status='PROCESSING') processingRun
       FROM payroll_periods pp
      WHERE pp.site_id=?
        AND pp.period_start<=? AND pp.period_end>=?
        AND (pp.status IN ('CALCULATED','APPROVED','CLOSED') OR EXISTS(
          SELECT 1 FROM payroll_runs pr
           WHERE pr.payroll_period_id=pp.id AND pr.status='PROCESSING'
        ))
      LIMIT 1 FOR UPDATE`,
    [input.siteId, input.dateTo, input.dateFrom]
  )
  if (lockedPeriods[0]) {
    throw new ApiError(
      409,
      Number(lockedPeriods[0].processingRun) === 1
        ? 'Perhitungan Payroll untuk periode Attendance ini sedang berjalan.'
        : 'Attendance menyentuh periode Payroll yang sudah dihitung, disetujui, atau ditutup.'
    )
  }

  const employeeClause = input.employeeId ? 'AND per.employee_id=?' : ''
  const [snapshots] = await conn.query<RowDataPacket[]>(
    `SELECT pas.id
       FROM payroll_attendance_summaries pas
       JOIN payroll_employee_results per ON per.id=pas.payroll_employee_result_id
       JOIN payroll_periods pp ON pp.id=per.payroll_period_id
      WHERE pp.site_id=? AND pp.period_start<=? AND pp.period_end>=?
        ${employeeClause}
      LIMIT 1 FOR UPDATE`,
    input.employeeId
      ? [input.siteId, input.dateTo, input.dateFrom, input.employeeId]
      : [input.siteId, input.dateTo, input.dateFrom]
  )
  if (snapshots[0]) {
    throw new ApiError(
      409,
      'Attendance sudah tersimpan dalam snapshot Payroll dan tidak dapat diubah.'
    )
  }
}
