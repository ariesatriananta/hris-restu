import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { ApiError } from './errors.js'

// Run inside the employment mutation transaction, after locking the employee.
export async function reconcileShiftAssignmentsAtSiteBoundary(
  conn: PoolConnection,
  input: {
    employeeId: number
    targetSiteId: number
    effectiveFrom: string
    actorUserId: number | null
  }
) {
  const [conflicts] = await conn.query<RowDataPacket[]>(
    `SELECT assignment.id FROM employee_shift_assignments assignment
       JOIN shifts shift_row ON shift_row.id=assignment.shift_id
     WHERE assignment.employee_id=? AND shift_row.site_id<>?
       AND assignment.effective_from>=?
     LIMIT 1 FOR UPDATE`,
    [input.employeeId, input.targetSiteId, input.effectiveFrom]
  )
  if (conflicts.length) {
    throw new ApiError(
      409,
      `Mutasi site diblokir karena ada penugasan Shift beda site yang mulai pada atau setelah ${input.effectiveFrom}. Sesuaikan penugasan Shift tersebut terlebih dahulu.`
    )
  }

  await conn.execute(
    `UPDATE employee_shift_assignments assignment
       JOIN shifts shift_row ON shift_row.id=assignment.shift_id
        SET assignment.effective_to=DATE_SUB(?,INTERVAL 1 DAY),
            assignment.updated_by=?
     WHERE assignment.employee_id=? AND shift_row.site_id<>?
       AND assignment.effective_from<?
       AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)`,
    [
      input.effectiveFrom,
      input.actorUserId,
      input.employeeId,
      input.targetSiteId,
      input.effectiveFrom,
      input.effectiveFrom,
    ]
  )
}
