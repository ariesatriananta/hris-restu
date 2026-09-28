import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'

export type ContinuedShiftAssignment = {
  mode: 'CREATED' | 'REALIGNED'
  source: 'PREVIOUS_ASSIGNMENT' | 'SITE_DEFAULT'
  id: number
  uid: string
  employeeId: number
  siteId: number
  shiftId: number
  sourceAssignmentUid?: string
  effectiveFrom: string
  previousEffectiveFrom?: string
  effectiveTo?: string
}

/**
 * Continues the latest Shift assignment that covered the renewal source
 * contract through its final day. Existing history is preserved; a new segment
 * is created from the renewed contract start, or an identical future segment
 * is moved back to that date.
 */
export async function continueShiftAssignmentAfterRenewal(
  conn: PoolConnection,
  input: {
    employeeId: number
    contractStartDate: string
    previousCoverageEnd: string
    actorUserId: number | null
  }
): Promise<ContinuedShiftAssignment | undefined> {
  const [eligibleHistories] = await conn.query<RowDataPacket[]>(
    `SELECT history.site_id siteId,employee_type.code employeeType
       FROM employee_employment_histories history
       JOIN employee_statuses employee_status
         ON employee_status.id=history.employee_status_id
        AND employee_status.allows_attendance=1
       JOIN employee_types employee_type
         ON employee_type.id=history.employee_type_id
      WHERE history.employee_id=?
        AND history.effective_from<=?
        AND (history.effective_to IS NULL OR history.effective_to>=?)
      ORDER BY history.id
      FOR UPDATE`,
    [input.employeeId, input.contractStartDate, input.contractStartDate]
  )
  if (eligibleHistories.length !== 1) return undefined

  const siteId = Number(eligibleHistories[0].siteId)
  const employeeType = String(eligibleHistories[0].employeeType)
  const [coveringAssignments] = await conn.query<RowDataPacket[]>(
    `SELECT assignment.id
       FROM employee_shift_assignments assignment
       JOIN shifts shift
         ON shift.id=assignment.shift_id
        AND shift.site_id=? AND shift.is_active=1
      WHERE assignment.employee_id=?
        AND assignment.effective_from<=?
        AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
      LIMIT 1 FOR UPDATE`,
    [siteId, input.employeeId, input.contractStartDate, input.contractStartDate]
  )
  if (coveringAssignments[0]) return undefined

  const [previousAssignments] = await conn.query<RowDataPacket[]>(
    `SELECT assignment.id,assignment.uid,assignment.shift_id shiftId,
            assignment.work_days_json workDays
       FROM employee_shift_assignments assignment
       JOIN shifts shift
         ON shift.id=assignment.shift_id
        AND shift.site_id=? AND shift.is_active=1
      WHERE assignment.employee_id=?
        AND assignment.effective_to=?
        AND NOT EXISTS (
          SELECT 1 FROM audit_logs audit
           WHERE audit.table_name='employee_shift_assignments'
             AND audit.record_id=assignment.id
             AND audit.action='UPDATE'
             AND audit.description LIKE 'Mengoreksi histori Shift %'
        )
      ORDER BY assignment.effective_from DESC,assignment.id DESC
      LIMIT 1 FOR UPDATE`,
    [siteId, input.employeeId, input.previousCoverageEnd]
  )
  const previousAssignmentRow = previousAssignments[0]
  let previousAssignment:
    | { uid?: string; shiftId: number; workDays: unknown }
    | undefined = previousAssignmentRow
    ? {
        uid: String(previousAssignmentRow.uid),
        shiftId: Number(previousAssignmentRow.shiftId),
        workDays: previousAssignmentRow.workDays,
      }
    : undefined
  let source: ContinuedShiftAssignment['source'] = 'PREVIOUS_ASSIGNMENT'
  if (!previousAssignment) {
    const [assignmentHistories] = await conn.query<RowDataPacket[]>(
      `SELECT assignment.id,shift.site_id siteId,
              DATE_FORMAT(assignment.effective_to,'%Y-%m-%d') effectiveTo
         FROM employee_shift_assignments assignment
         JOIN shifts shift ON shift.id=assignment.shift_id
        WHERE assignment.employee_id=?
        ORDER BY assignment.id
        FOR UPDATE`,
      [input.employeeId]
    )
    const onlyClosedAssignmentsFromOtherSites =
      assignmentHistories.length > 0 &&
      assignmentHistories.every(
        (assignment) =>
          Number(assignment.siteId) !== siteId &&
          Boolean(assignment.effectiveTo) &&
          String(assignment.effectiveTo) < input.contractStartDate
      )
    if (
      (assignmentHistories.length > 0 &&
        !onlyClosedAssignmentsFromOtherSites) ||
      employeeType !== 'BORONGAN'
    ) {
      return undefined
    }
    const [siteDefaults] = await conn.query<RowDataPacket[]>(
      `SELECT shift.id shiftId
         FROM shifts shift
        WHERE shift.site_id=? AND shift.code='BORONGAN_DEFAULT'
          AND shift.is_active=1
        ORDER BY shift.id
        FOR UPDATE`,
      [siteId]
    )
    if (siteDefaults.length !== 1) return undefined
    previousAssignment = {
      shiftId: siteDefaults[0].shiftId,
      workDays: [1, 2, 3, 4, 5],
    }
    source = 'SITE_DEFAULT'
  }

  const [futureAssignments] = await conn.query<RowDataPacket[]>(
    `SELECT assignment.id,assignment.uid,assignment.shift_id shiftId,
            assignment.work_days_json workDays,
            DATE_FORMAT(assignment.effective_from,'%Y-%m-%d') effectiveFrom
       FROM employee_shift_assignments assignment
       JOIN shifts shift
         ON shift.id=assignment.shift_id
        AND shift.site_id=? AND shift.is_active=1
      WHERE assignment.employee_id=? AND assignment.effective_from>?
      ORDER BY assignment.effective_from,assignment.id
      LIMIT 1 FOR UPDATE`,
    [siteId, input.employeeId, input.contractStartDate]
  )
  const futureAssignment = futureAssignments[0]
  if (
    futureAssignment &&
    Number(futureAssignment.shiftId) === Number(previousAssignment.shiftId) &&
    normalizedJson(futureAssignment.workDays) ===
      normalizedJson(previousAssignment.workDays)
  ) {
    await conn.execute(
      `UPDATE employee_shift_assignments
          SET effective_from=?,updated_by=?
        WHERE id=? AND effective_from>?`,
      [
        input.contractStartDate,
        input.actorUserId,
        futureAssignment.id,
        input.contractStartDate,
      ]
    )
    return {
      mode: 'REALIGNED',
      source,
      id: Number(futureAssignment.id),
      uid: String(futureAssignment.uid),
      employeeId: input.employeeId,
      siteId,
      shiftId: Number(previousAssignment.shiftId),
      sourceAssignmentUid: previousAssignment.uid
        ? String(previousAssignment.uid)
        : undefined,
      effectiveFrom: input.contractStartDate,
      previousEffectiveFrom: String(futureAssignment.effectiveFrom),
    }
  }

  const effectiveTo = futureAssignment
    ? addDays(String(futureAssignment.effectiveFrom), -1)
    : undefined
  const [overlaps] = await conn.query<RowDataPacket[]>(
    `SELECT assignment.id
       FROM employee_shift_assignments assignment
      WHERE assignment.employee_id=?
        AND assignment.effective_from<=COALESCE(?, '9999-12-31')
        AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
      LIMIT 1 FOR UPDATE`,
    [input.employeeId, effectiveTo ?? null, input.contractStartDate]
  )
  if (overlaps[0]) return undefined

  const uid = randomUUID()
  const [created] = await conn.execute<ResultSetHeader>(
    `INSERT INTO employee_shift_assignments(
       uid,employee_id,shift_id,effective_from,effective_to,work_days_json,
       created_by,updated_by
     ) VALUES(?,?,?,?,?,?,?,?)`,
    [
      uid,
      input.employeeId,
      previousAssignment.shiftId,
      input.contractStartDate,
      effectiveTo ?? null,
      serializedJson(previousAssignment.workDays),
      input.actorUserId,
      input.actorUserId,
    ]
  )

  return {
    mode: 'CREATED',
    source,
    id: Number(created.insertId),
    uid,
    employeeId: input.employeeId,
    siteId,
    shiftId: Number(previousAssignment.shiftId),
    sourceAssignmentUid: previousAssignment.uid
      ? String(previousAssignment.uid)
      : undefined,
    effectiveFrom: input.contractStartDate,
    effectiveTo,
  }
}

function normalizedJson(value: unknown) {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value))
    } catch {
      return value
    }
  }
  return JSON.stringify(value ?? null)
}

function serializedJson(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value ?? null)
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
