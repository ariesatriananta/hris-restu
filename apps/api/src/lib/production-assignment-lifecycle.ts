import type { ResultSetHeader } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'

/**
 * Closes open Production assignments when a new employment-history boundary
 * makes the employee ineligible or moves them to another site. Assignments on
 * an eligible history at the same site remain valid.
 *
 * The boundary is inclusive, therefore the old assignment ends one day before
 * effectiveDate. Future assignments without eligible coverage are marked
 * CANCELLED so they cannot silently revive after a later rehire.
 */
export async function reconcileProductionAssignmentsAtEmploymentBoundary(
  conn: PoolConnection,
  employeeId: number,
  effectiveDate: string,
  actorUserId: number | null
) {
  const [result] = await conn.execute<ResultSetHeader>(
    `UPDATE employee_job_assignments assignment
        SET assignment.effective_to=DATE_SUB(?,INTERVAL 1 DAY),
            assignment.updated_by=?
      WHERE assignment.employee_id=?
        AND assignment.status='ACTIVE'
        AND assignment.effective_from<?
        AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
        AND NOT EXISTS (
          SELECT 1
            FROM employee_employment_histories history
            JOIN employee_statuses employee_status
              ON employee_status.id=history.employee_status_id
             AND employee_status.allows_production=1
            JOIN employee_types employee_type
              ON employee_type.id=history.employee_type_id
             AND employee_type.payroll_basis='PIECE_RATE'
           WHERE history.employee_id=assignment.employee_id
             AND history.site_id=assignment.site_id
             AND history.effective_from<=?
             AND (history.effective_to IS NULL OR history.effective_to>=?)
        )`,
    [
      effectiveDate,
      actorUserId,
      employeeId,
      effectiveDate,
      effectiveDate,
      effectiveDate,
      effectiveDate,
    ]
  )
  const [futureResult] = await conn.execute<ResultSetHeader>(
    `UPDATE employee_job_assignments assignment
        SET assignment.status='CANCELLED',assignment.updated_by=?
      WHERE assignment.employee_id=? AND assignment.status='ACTIVE'
        AND assignment.effective_from>=?
        AND NOT EXISTS (
          SELECT 1 FROM employee_employment_histories history
          JOIN employee_statuses employee_status
            ON employee_status.id=history.employee_status_id
           AND employee_status.allows_production=1
          JOIN employee_types employee_type
            ON employee_type.id=history.employee_type_id
           AND employee_type.payroll_basis='PIECE_RATE'
          WHERE history.employee_id=assignment.employee_id
            AND history.site_id=assignment.site_id
            AND history.effective_from<=assignment.effective_from
            AND (history.effective_to IS NULL OR history.effective_to>=assignment.effective_from)
        )`,
    [actorUserId, employeeId, effectiveDate]
  )
  return Number(result.affectedRows ?? 0) + Number(futureResult.affectedRows ?? 0)
}
