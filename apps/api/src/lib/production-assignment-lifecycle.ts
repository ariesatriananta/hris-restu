import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'

export type ContinuedProductionAssignment = {
  mode: 'CREATED' | 'REALIGNED'
  source: 'PREVIOUS_ASSIGNMENT' | 'SECTION_DEFAULT'
  id: number
  uid: string
  employeeId: number
  siteId: number
  jobId: number
  sourceAssignmentUid?: string
  effectiveFrom: string
  previousEffectiveFrom?: string
  effectiveTo?: string
}

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
  return (
    Number(result.affectedRows ?? 0) + Number(futureResult.affectedRows ?? 0)
  )
}

/**
 * Continues a primary Production assignment that was closed automatically on
 * the exact end date of the previous contract. Manually closed/corrected
 * assignments are deliberately left alone.
 *
 * New contract/status boundaries no longer close Production assignments, so
 * this is only a compatibility repair for assignments ended by the previous
 * lifecycle behavior.
 */
export async function continuePrimaryProductionAssignmentAfterRenewal(
  conn: PoolConnection,
  input: {
    contractId: number
    employeeId: number
    contractStartDate: string
    previousCoverageEnd?: string
    actorUserId: number | null
  }
): Promise<ContinuedProductionAssignment | undefined> {
  const [eligibleHistories] = await conn.query<RowDataPacket[]>(
    `SELECT history.site_id siteId,employee_type.code employeeType,
            production_section.code productionSectionCode
       FROM employee_employment_histories history
       JOIN employee_statuses employee_status
         ON employee_status.id=history.employee_status_id
        AND employee_status.allows_production=1
       JOIN employee_types employee_type
         ON employee_type.id=history.employee_type_id
        AND employee_type.payroll_basis='PIECE_RATE'
       LEFT JOIN production_module_sections module_section
         ON module_section.id=history.production_module_section_id
        AND module_section.is_active=1
       LEFT JOIN production_sections production_section
         ON production_section.id=module_section.production_section_id
        AND production_section.is_active=1
      WHERE history.employee_id=?
        AND history.effective_from<=?
        AND (history.effective_to IS NULL OR history.effective_to>=?)
      ORDER BY history.id
      FOR UPDATE`,
    [input.employeeId, input.contractStartDate, input.contractStartDate]
  )
  if (eligibleHistories.length !== 1) return undefined

  const eligibleHistory = eligibleHistories[0]
  const siteId = Number(eligibleHistory.siteId)
  let previousCoverageEnd = input.previousCoverageEnd
  if (!previousCoverageEnd) {
    const [previousContracts] = await conn.query<RowDataPacket[]>(
      `SELECT contract.id,
              DATE_FORMAT(COALESCE(
                CASE WHEN contract.status='TERMINATED'
                  THEN contract.terminated_at ELSE contract.end_date END,
                contract.end_date
              ),'%Y-%m-%d') coverageEnd
         FROM employee_contracts contract
        WHERE contract.employee_id=? AND contract.id<>?
          AND contract.status IN ('EXPIRED','TERMINATED')
          AND COALESCE(
            CASE WHEN contract.status='TERMINATED'
              THEN contract.terminated_at ELSE contract.end_date END,
            contract.end_date
          )<?
        ORDER BY COALESCE(
          CASE WHEN contract.status='TERMINATED'
            THEN contract.terminated_at ELSE contract.end_date END,
          contract.end_date
        ) DESC,contract.id DESC
        LIMIT 1 FOR UPDATE`,
      [input.employeeId, input.contractId, input.contractStartDate]
    )
    previousCoverageEnd = previousContracts[0]?.coverageEnd
  }
  if (!previousCoverageEnd) return undefined

  const [previousAssignments] = await conn.query<RowDataPacket[]>(
    `SELECT assignment.id,assignment.uid,
            assignment.production_job_id jobId
       FROM employee_job_assignments assignment
       JOIN production_jobs job
         ON job.id=assignment.production_job_id AND job.is_active=1
      WHERE assignment.employee_id=? AND assignment.site_id=?
        AND assignment.status='ACTIVE' AND assignment.is_primary=1
        AND assignment.effective_to=?
        AND NOT EXISTS (
          SELECT 1 FROM audit_logs audit
           WHERE audit.table_name='employee_job_assignments'
             AND audit.record_id=assignment.id
             AND audit.action='UPDATE'
             AND audit.description IN (
               'Menutup penugasan pekerjaan Produksi.',
               'Mengoreksi histori penugasan pekerjaan Produksi.'
             )
        )
      ORDER BY assignment.effective_from DESC,assignment.id DESC
      LIMIT 1 FOR UPDATE`,
    [input.employeeId, siteId, previousCoverageEnd]
  )
  const previousAssignmentRow = previousAssignments[0]
  let previousAssignment: { uid?: string; jobId: number } | undefined =
    previousAssignmentRow
      ? {
          uid: String(previousAssignmentRow.uid),
          jobId: Number(previousAssignmentRow.jobId),
        }
      : undefined
  let source: ContinuedProductionAssignment['source'] = 'PREVIOUS_ASSIGNMENT'
  if (!previousAssignment) {
    const sectionCode = String(eligibleHistory.productionSectionCode ?? '')
      .trim()
      .toUpperCase()
    if (String(eligibleHistory.employeeType) !== 'BORONGAN' || !sectionCode) {
      return undefined
    }
    const [sectionDefaults] = await conn.query<RowDataPacket[]>(
      `SELECT job.id jobId
         FROM production_jobs job
         JOIN work_units unit
           ON unit.id=job.default_unit_id AND unit.is_active=1
         JOIN production_job_rates rate
           ON rate.production_job_id=job.id AND rate.site_id=?
          AND rate.status='ACTIVE' AND rate.effective_from<=?
          AND (rate.effective_to IS NULL OR rate.effective_to>=?)
        WHERE UPPER(job.code)=? AND job.is_active=1
        ORDER BY job.id,rate.id
        FOR UPDATE`,
      [
        siteId,
        input.contractStartDate,
        input.contractStartDate,
        `BORONGAN-${sectionCode}`,
      ]
    )
    if (sectionDefaults.length !== 1) return undefined
    const defaultJobId = Number(sectionDefaults[0].jobId)
    const [assignmentHistories] = await conn.query<RowDataPacket[]>(
      `SELECT assignment.id,assignment.site_id siteId,
              assignment.production_job_id jobId,assignment.status,
              assignment.is_primary isPrimary,
              DATE_FORMAT(assignment.effective_from,'%Y-%m-%d') effectiveFrom,
              DATE_FORMAT(assignment.effective_to,'%Y-%m-%d') effectiveTo
         FROM employee_job_assignments assignment
        WHERE assignment.employee_id=?
        ORDER BY assignment.effective_from,assignment.id
        FOR UPDATE`,
      [input.employeeId]
    )
    if (
      assignmentHistories.some(
        (assignment) =>
          String(assignment.status) !== 'ACTIVE' ||
          Number(assignment.isPrimary) !== 1 ||
          (Number(assignment.siteId) === siteId
            ? Number(assignment.jobId) !== defaultJobId ||
              String(assignment.effectiveFrom) <= input.contractStartDate
            : !assignment.effectiveTo ||
              String(assignment.effectiveTo) >= input.contractStartDate)
      ) ||
      assignmentHistories.length > 1
    ) {
      return undefined
    }
    previousAssignment = { jobId: defaultJobId }
    source = 'SECTION_DEFAULT'
  }

  const [coveringAssignments] = await conn.query<RowDataPacket[]>(
    `SELECT assignment.id
       FROM employee_job_assignments assignment
      WHERE assignment.employee_id=? AND assignment.status='ACTIVE'
        AND assignment.is_primary=1
        AND assignment.effective_from<=?
        AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
      LIMIT 1 FOR UPDATE`,
    [input.employeeId, input.contractStartDate, input.contractStartDate]
  )
  if (coveringAssignments[0]) return undefined

  const [futureAssignments] = await conn.query<RowDataPacket[]>(
    `SELECT assignment.id,assignment.uid,assignment.site_id siteId,
            assignment.production_job_id jobId,
            DATE_FORMAT(assignment.effective_from,'%Y-%m-%d') effectiveFrom
       FROM employee_job_assignments assignment
      WHERE assignment.employee_id=? AND assignment.status='ACTIVE'
        AND assignment.is_primary=1 AND assignment.effective_from>?
      ORDER BY assignment.effective_from,assignment.id
      LIMIT 1 FOR UPDATE`,
    [input.employeeId, input.contractStartDate]
  )
  const futureAssignment = futureAssignments[0]
  if (
    futureAssignment &&
    Number(futureAssignment.siteId) === siteId &&
    Number(futureAssignment.jobId) === Number(previousAssignment.jobId)
  ) {
    await conn.execute(
      `UPDATE employee_job_assignments
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
      jobId: Number(previousAssignment.jobId),
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
  const [sameJobOverlap] = await conn.query<RowDataPacket[]>(
    `SELECT assignment.id
       FROM employee_job_assignments assignment
      WHERE assignment.employee_id=?
        AND assignment.production_job_id=?
        AND assignment.site_id=?
        AND assignment.status='ACTIVE'
        AND assignment.effective_from<=COALESCE(?, '9999-12-31')
        AND (assignment.effective_to IS NULL OR assignment.effective_to>=?)
      LIMIT 1 FOR UPDATE`,
    [
      input.employeeId,
      previousAssignment.jobId,
      siteId,
      effectiveTo ?? null,
      input.contractStartDate,
    ]
  )
  if (sameJobOverlap[0]) return undefined

  const uid = randomUUID()
  const [created] = await conn.execute<ResultSetHeader>(
    `INSERT INTO employee_job_assignments(
       uid,employee_id,production_job_id,site_id,effective_from,effective_to,
       is_primary,status,created_by,updated_by
     ) VALUES(?,?,?,?,?,?,1,'ACTIVE',?,?)`,
    [
      uid,
      input.employeeId,
      previousAssignment.jobId,
      siteId,
      input.contractStartDate,
      effectiveTo ?? null,
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
    jobId: Number(previousAssignment.jobId),
    sourceAssignmentUid: previousAssignment.uid
      ? String(previousAssignment.uid)
      : undefined,
    effectiveFrom: input.contractStartDate,
    effectiveTo,
  }
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
