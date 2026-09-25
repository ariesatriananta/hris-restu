import { Router, type Request } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const uid = z.string().uuid()
const year = z.coerce.number().int().min(2000).max(2100)
const rate = z.coerce.number().min(0).max(100)
const idempotencyKey = z.string().trim().min(8).max(100)
const reason = z.string().trim().min(5).max(500)
const policyInput = z.object({
  policyYear: year,
  healthEmployerEnabled: z.boolean(),
  healthEmployerRate: rate,
  healthEmployeeEnabled: z.boolean(),
  healthEmployeeRate: rate,
  jhtEmployerEnabled: z.boolean(),
  jhtEmployerRate: rate,
  jhtEmployeeEnabled: z.boolean(),
  jhtEmployeeRate: rate,
  jkkEmployerEnabled: z.boolean(),
  jkkEmployerRate: rate,
  jkmEmployerEnabled: z.boolean(),
  jkmEmployerRate: rate,
  jpEmployerEnabled: z.boolean(),
  jpEmployerRate: rate,
  jpEmployeeEnabled: z.boolean(),
  jpEmployeeRate: rate,
  healthWageCeiling: z.coerce.number().positive().nullable().optional(),
  jpWageCeiling: z.coerce.number().positive().nullable().optional(),
  roundingUnit: z.coerce.number().int().min(1).max(1_000_000),
  regulationReference: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  reason,
  idempotencyKey,
})
const enrollmentInput = z.object({
  configurationMode: z.enum(['GLOBAL', 'CUSTOM']),
  healthEmployerEnabled: z.boolean(),
  healthEmployeeEnabled: z.boolean(),
  jhtEmployerEnabled: z.boolean(),
  jhtEmployeeEnabled: z.boolean(),
  jkkEmployerEnabled: z.boolean(),
  jkmEmployerEnabled: z.boolean(),
  jpEmployerEnabled: z.boolean(),
  jpEmployeeEnabled: z.boolean(),
  reason,
  idempotencyKey,
})
const enrollmentImportRow = enrollmentInput.omit({ idempotencyKey: true }).extend({
  employeeNumber: z.string().trim().min(1).max(30),
})
const enrollmentImportInput = z.object({
  rows: z.array(enrollmentImportRow).min(1).max(2000),
  idempotencyKey: z.string().trim().min(8).max(60),
})
const enrollmentListQuery = z.object({
  year: year.default(new Date().getFullYear()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(500).default(50),
  site: z.string().trim().min(1).max(20).optional(),
  query: z.string().trim().max(150).default(''),
  numberStatus: z
    .preprocess(
      (value) =>
        typeof value === 'string'
          ? value.split(',').filter(Boolean)
          : value,
      z.array(z.enum(['COMPLETE', 'INCOMPLETE']))
    )
    .default([]),
  participationStatus: z
    .preprocess(
      (value) =>
        typeof value === 'string'
          ? value.split(',').filter(Boolean)
          : value,
      z.array(z.enum(['ALL_ACTIVE', 'ANY_DISABLED']))
    )
    .default([]),
  sortBy: z.enum(['employee', 'site', 'numberStatus']).default('employee'),
  sortDirection: z.enum(['asc', 'desc']).default('asc'),
})

function isGlobal(auth: AuthContext) {
  return auth.roles.includes('SUPER_ADMIN') || auth.roles.includes('DIRECTOR')
}

function assertSuper(auth: AuthContext) {
  if (!auth.roles.includes('SUPER_ADMIN'))
    throw new ApiError(403, 'Kebijakan BPJS global hanya dapat dikelola Super Admin.')
}

function enforceSite(auth: AuthContext, code: string) {
  if (!isGlobal(auth) && !auth.siteAccess.includes(code))
    throw new ApiError(403, 'Akses site BPJS ditolak.')
}

function bool(value: unknown) {
  return Number(value) === 1
}

type EnrollmentImportRow = z.infer<typeof enrollmentImportRow>

async function validateEnrollmentImport(
  rows: EnrollmentImportRow[],
  auth: AuthContext,
  conn: Pick<PoolConnection, 'query'> = pool
) {
  const numbers = [...new Set(rows.map((row) => row.employeeNumber))]
  const placeholders = numbers.map(() => '?').join(',') || "''"
  const [employees] = await conn.query<RowDataPacket[]>(
    `SELECT employee.id,employee.uid,employee.employee_number employeeNumber,
      employee.full_name fullName,type.code employeeType,
      site.id siteId,site.code siteCode,site.name siteName
     FROM employees employee
     JOIN employee_types type ON type.id=employee.employee_type_id
     JOIN employee_statuses employee_status
       ON employee_status.id=employee.employee_status_id
      AND employee_status.code='ACTIVE'
     JOIN sites site ON site.id=employee.current_site_id
     WHERE employee.employee_number IN (${placeholders})`,
    numbers
  )
  const byNumber = new Map(
    employees.map((employee) => [String(employee.employeeNumber), employee])
  )
  const occurrences = new Map<string, number>()
  rows.forEach((row) =>
    occurrences.set(
      row.employeeNumber,
      (occurrences.get(row.employeeNumber) ?? 0) + 1
    )
  )
  return rows.map((row, index) => {
    const employee = byNumber.get(row.employeeNumber)
    const issues: string[] = []
    if (!employee) issues.push('Employee ID tidak ditemukan.')
    else {
      if (String(employee.employeeType) !== 'BORONGAN')
        issues.push('Karyawan bukan jenis Borongan.')
      if (!isGlobal(auth) && !auth.siteAccess.includes(String(employee.siteCode)))
        issues.push('Site karyawan berada di luar akses Anda.')
    }
    if ((occurrences.get(row.employeeNumber) ?? 0) > 1)
      issues.push('Employee ID duplikat di dalam file.')
    return {
      rowNumber: index + 2,
      employeeNumber: row.employeeNumber,
      fullName: employee ? String(employee.fullName) : null,
      site: employee ? String(employee.siteName) : null,
      valid: issues.length === 0,
      issues,
      employee,
      input: row,
    }
  })
}

async function persistEnrollment(
  conn: PoolConnection,
  auth: AuthContext,
  request: Request,
  employee: RowDataPacket,
  input: z.infer<typeof enrollmentInput>
) {
  const [retry] = await conn.query<RowDataPacket[]>(
    `SELECT enrollment.id,enrollment.uid FROM employee_bpjs_enrollment_revisions revision
     JOIN employee_bpjs_enrollments enrollment ON enrollment.id=revision.employee_bpjs_enrollment_id
     WHERE revision.idempotency_key=? FOR UPDATE`,
    [input.idempotencyKey]
  )
  if (retry[0]) return { uid: String(retry[0].uid), replay: true as const }
  const [currentRows] = await conn.query<RowDataPacket[]>(
    `SELECT id,uid,configuration_mode configurationMode,
      health_employer_enabled healthEmployerEnabled,
      health_employee_enabled healthEmployeeEnabled,
      jht_employer_enabled jhtEmployerEnabled,
      jht_employee_enabled jhtEmployeeEnabled,
      jkk_employer_enabled jkkEmployerEnabled,
      jkm_employer_enabled jkmEmployerEnabled,
      jp_employer_enabled jpEmployerEnabled,
      jp_employee_enabled jpEmployeeEnabled,reason
     FROM employee_bpjs_enrollments
     WHERE employee_id=?
     ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [employee.id]
  )
  const current = currentRows[0]
  const beforeData = current
    ? {
        uid: String(current.uid),
        configurationMode: String(current.configurationMode),
        healthEmployerEnabled: bool(current.healthEmployerEnabled),
        healthEmployeeEnabled: bool(current.healthEmployeeEnabled),
        jhtEmployerEnabled: bool(current.jhtEmployerEnabled),
        jhtEmployeeEnabled: bool(current.jhtEmployeeEnabled),
        jkkEmployerEnabled: bool(current.jkkEmployerEnabled),
        jkmEmployerEnabled: bool(current.jkmEmployerEnabled),
        jpEmployerEnabled: bool(current.jpEmployerEnabled),
        jpEmployeeEnabled: bool(current.jpEmployeeEnabled),
        reason: current.reason ? String(current.reason) : null,
      }
    : null
  let enrollmentId: number
  let enrollmentUid: string
  if (current) {
    enrollmentId = Number(current.id)
    enrollmentUid = String(current.uid)
    await conn.execute(
      `UPDATE employee_bpjs_enrollments
       SET configuration_mode=?,health_employer_enabled=?,health_employee_enabled=?,
           jht_employer_enabled=?,jht_employee_enabled=?,jkk_employer_enabled=?,
           jkm_employer_enabled=?,jp_employer_enabled=?,jp_employee_enabled=?,
           reason=?,updated_by=?
       WHERE id=?`,
      [
        input.configurationMode,
        input.healthEmployerEnabled,
        input.healthEmployeeEnabled,
        input.jhtEmployerEnabled,
        input.jhtEmployeeEnabled,
        input.jkkEmployerEnabled,
        input.jkmEmployerEnabled,
        input.jpEmployerEnabled,
        input.jpEmployeeEnabled,
        input.reason,
        auth.id,
        enrollmentId,
      ]
    )
  } else {
    const [insert] = await conn.execute<ResultSetHeader>(
      `INSERT INTO employee_bpjs_enrollments(
        uid,employee_id,configuration_mode,
        health_employer_enabled,health_employee_enabled,
        jht_employer_enabled,jht_employee_enabled,jkk_employer_enabled,
        jkm_employer_enabled,jp_employer_enabled,jp_employee_enabled,
        reason,created_by,updated_by
      ) VALUES(UUID(),?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        employee.id,
        input.configurationMode,
        input.healthEmployerEnabled,
        input.healthEmployeeEnabled,
        input.jhtEmployerEnabled,
        input.jhtEmployeeEnabled,
        input.jkkEmployerEnabled,
        input.jkmEmployerEnabled,
        input.jpEmployerEnabled,
        input.jpEmployeeEnabled,
        input.reason,
        auth.id,
        auth.id,
      ]
    )
    enrollmentId = insert.insertId
    const [created] = await conn.query<RowDataPacket[]>(
      `SELECT uid FROM employee_bpjs_enrollments WHERE id=?`,
      [enrollmentId]
    )
    enrollmentUid = String(created[0].uid)
  }
  const afterData = {
    uid: enrollmentUid,
    idempotencyKey: input.idempotencyKey,
    configurationMode: input.configurationMode,
    healthEmployerEnabled: input.healthEmployerEnabled,
    healthEmployeeEnabled: input.healthEmployeeEnabled,
    jhtEmployerEnabled: input.jhtEmployerEnabled,
    jhtEmployeeEnabled: input.jhtEmployeeEnabled,
    jkkEmployerEnabled: input.jkkEmployerEnabled,
    jkmEmployerEnabled: input.jkmEmployerEnabled,
    jpEmployerEnabled: input.jpEmployerEnabled,
    jpEmployeeEnabled: input.jpEmployeeEnabled,
  }
  await conn.execute(
    `INSERT INTO employee_bpjs_enrollment_revisions(
      uid,employee_bpjs_enrollment_id,idempotency_key,before_data,after_data,reason,revised_by
    ) VALUES(UUID(),?,?,?,?,?,?)`,
    [
      enrollmentId,
      input.idempotencyKey,
      beforeData ? JSON.stringify(beforeData) : null,
      JSON.stringify(afterData),
      input.reason,
      auth.id,
    ]
  )
  await writeAudit(
    {
      auth,
      request,
      module: 'PAYROLL',
      siteId: Number(employee.siteId),
      action: current ? 'UPDATE' : 'CREATE',
      table: 'employee_bpjs_enrollments',
      recordId: enrollmentId,
      recordUid: enrollmentUid,
      description: `Memperbarui kepesertaan BPJS ${String(employee.employeeNumber)}.`,
      reason: input.reason,
      beforeData,
      afterData,
    },
    conn
  )
  return { ...afterData, replay: false as const, existing: Boolean(current) }
}

function policyDto(row?: RowDataPacket) {
  if (!row) return null
  return {
    uid: String(row.uid),
    policyYear: Number(row.policyYear),
    healthEmployerEnabled: bool(row.healthEmployerEnabled),
    healthEmployerRate: String(row.healthEmployerRate),
    healthEmployeeEnabled: bool(row.healthEmployeeEnabled),
    healthEmployeeRate: String(row.healthEmployeeRate),
    jhtEmployerEnabled: bool(row.jhtEmployerEnabled),
    jhtEmployerRate: String(row.jhtEmployerRate),
    jhtEmployeeEnabled: bool(row.jhtEmployeeEnabled),
    jhtEmployeeRate: String(row.jhtEmployeeRate),
    jkkEmployerEnabled: bool(row.jkkEmployerEnabled),
    jkkEmployerRate: String(row.jkkEmployerRate),
    jkmEmployerEnabled: bool(row.jkmEmployerEnabled),
    jkmEmployerRate: String(row.jkmEmployerRate),
    jpEmployerEnabled: bool(row.jpEmployerEnabled),
    jpEmployerRate: String(row.jpEmployerRate),
    jpEmployeeEnabled: bool(row.jpEmployeeEnabled),
    jpEmployeeRate: String(row.jpEmployeeRate),
    healthWageCeiling:
      row.healthWageCeiling == null ? null : String(row.healthWageCeiling),
    jpWageCeiling: row.jpWageCeiling == null ? null : String(row.jpWageCeiling),
    roundingUnit: Number(row.roundingUnit),
    regulationReference:
      row.regulationReference == null ? null : String(row.regulationReference),
    notes: row.notes == null ? null : String(row.notes),
    status: String(row.status),
    updatedAt: String(row.updatedAt),
  }
}

const policySelect = `SELECT policy.id,policy.uid,policy.policy_year policyYear,
 policy.health_employer_enabled healthEmployerEnabled,policy.health_employer_rate healthEmployerRate,
 policy.health_employee_enabled healthEmployeeEnabled,policy.health_employee_rate healthEmployeeRate,
 policy.jht_employer_enabled jhtEmployerEnabled,policy.jht_employer_rate jhtEmployerRate,
 policy.jht_employee_enabled jhtEmployeeEnabled,policy.jht_employee_rate jhtEmployeeRate,
 policy.jkk_employer_enabled jkkEmployerEnabled,policy.jkk_employer_rate jkkEmployerRate,
 policy.jkm_employer_enabled jkmEmployerEnabled,policy.jkm_employer_rate jkmEmployerRate,
 policy.jp_employer_enabled jpEmployerEnabled,policy.jp_employer_rate jpEmployerRate,
 policy.jp_employee_enabled jpEmployeeEnabled,policy.jp_employee_rate jpEmployeeRate,
 policy.health_wage_ceiling healthWageCeiling,policy.jp_wage_ceiling jpWageCeiling,
 policy.rounding_unit roundingUnit,policy.regulation_reference regulationReference,
 policy.notes,policy.status,
 CONCAT(DATE_FORMAT(policy.updated_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') updatedAt
 FROM payroll_bpjs_policies policy`

export const payrollBpjsRouter = Router()
payrollBpjsRouter.use(authenticate)

payrollBpjsRouter.get(
  '/configuration/bpjs',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const selectedYear = year.parse(req.query.year ?? new Date().getFullYear())
      if (req.query.site) {
        enforceSite(auth, String(req.query.site))
      }
      const [policies] = await pool.query<RowDataPacket[]>(
        `${policySelect} WHERE policy.policy_year=?`,
        [selectedYear]
      )
      res.json({
        data: {
          policy: policyDto(policies[0]),
          year: selectedYear,
        },
        meta: {
          capabilities: {
            canManagePolicy: auth.roles.includes('SUPER_ADMIN'),
          },
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

payrollBpjsRouter.post(
  '/configuration/bpjs/policy',
  requirePermission('payroll.policy.manage'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      assertSuper(auth)
      const input = policyInput.parse(req.body)
      await conn.beginTransaction()
      const [retry] = await conn.query<RowDataPacket[]>(
        `SELECT payroll_bpjs_policy_id id FROM payroll_bpjs_policy_revisions WHERE idempotency_key=? FOR UPDATE`,
        [input.idempotencyKey]
      )
      if (retry[0]) {
        const [rows] = await conn.query<RowDataPacket[]>(`${policySelect} WHERE policy.id=?`, [retry[0].id])
        await conn.commit()
        res.json({ data: policyDto(rows[0]) })
        return
      }
      const [beforeRows] = await conn.query<RowDataPacket[]>(
        `${policySelect} WHERE policy.policy_year=? FOR UPDATE`,
        [input.policyYear]
      )
      const before = beforeRows[0]
      const values = [
        input.healthEmployerEnabled,input.healthEmployerRate,input.healthEmployeeEnabled,input.healthEmployeeRate,
        input.jhtEmployerEnabled,input.jhtEmployerRate,input.jhtEmployeeEnabled,input.jhtEmployeeRate,
        input.jkkEmployerEnabled,input.jkkEmployerRate,input.jkmEmployerEnabled,input.jkmEmployerRate,
        input.jpEmployerEnabled,input.jpEmployerRate,
        input.jpEmployeeEnabled,input.jpEmployeeRate,input.healthWageCeiling ?? null,input.jpWageCeiling ?? null,
        input.roundingUnit,input.regulationReference ?? null,input.notes ?? null,auth.id,
      ]
      let policyId: number
      if (before) {
        await conn.execute(
          `UPDATE payroll_bpjs_policies SET
           health_employer_enabled=?,health_employer_rate=?,health_employee_enabled=?,health_employee_rate=?,
           jht_employer_enabled=?,jht_employer_rate=?,jht_employee_enabled=?,jht_employee_rate=?,
           jkk_employer_enabled=?,jkk_employer_rate=?,jkm_employer_enabled=?,jkm_employer_rate=?,
           jp_employer_enabled=?,jp_employer_rate=?,
           jp_employee_enabled=?,jp_employee_rate=?,health_wage_ceiling=?,jp_wage_ceiling=?,
           rounding_unit=?,regulation_reference=?,notes=?,status='ACTIVE',cancelled_at=NULL,cancelled_by=NULL,
           cancellation_reason=NULL,updated_by=? WHERE id=?`,
          [...values, before.id]
        )
        policyId = Number(before.id)
      } else {
        const [insert] = await conn.execute<ResultSetHeader>(
          `INSERT INTO payroll_bpjs_policies(uid,policy_year,
           health_employer_enabled,health_employer_rate,health_employee_enabled,health_employee_rate,
           jht_employer_enabled,jht_employer_rate,jht_employee_enabled,jht_employee_rate,
           jkk_employer_enabled,jkk_employer_rate,jkm_employer_enabled,jkm_employer_rate,
           jp_employer_enabled,jp_employer_rate,
           jp_employee_enabled,jp_employee_rate,health_wage_ceiling,jp_wage_ceiling,
           rounding_unit,regulation_reference,notes,created_by,updated_by)
           VALUES(UUID(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [input.policyYear,...values,auth.id]
        )
        policyId = insert.insertId
      }
      const [afterRows] = await conn.query<RowDataPacket[]>(`${policySelect} WHERE policy.id=?`, [policyId])
      const after = policyDto(afterRows[0])
      await conn.execute(
        `INSERT INTO payroll_bpjs_policy_revisions(uid,payroll_bpjs_policy_id,revision_type,idempotency_key,before_data,after_data,reason,revised_by)
         VALUES(UUID(),?,?,?,?,?,?,?)`,
        [policyId,before ? 'CORRECTION' : 'CREATE',input.idempotencyKey,before ? JSON.stringify(policyDto(before)) : null,JSON.stringify(after),input.reason,auth.id]
      )
      await writeAudit({ auth,request:req,module:'PAYROLL',action:before ? 'UPDATE' : 'CREATE',table:'payroll_bpjs_policies',recordId:policyId,recordUid:String(after?.uid),description:`Menyimpan kebijakan BPJS ${input.policyYear}.`,reason:input.reason,beforeData:policyDto(before),afterData:after },conn)
      await conn.commit()
      res.status(before ? 200 : 201).json({ data: after })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

payrollBpjsRouter.get(
  '/configuration/bpjs/enrollments',
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const input = enrollmentListQuery.parse(req.query)
      const where = [`type.code='BORONGAN'`]
      const values: unknown[] = []
      if (!isGlobal(auth)) {
        where.push(
          `site.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`
        )
        values.push(...auth.siteAccess)
      }
      if (input.site) {
        enforceSite(auth, input.site)
        where.push('site.code=?')
        values.push(input.site)
      }
      if (input.query) {
        where.push(
          '(employee.full_name LIKE ? OR employee.employee_number LIKE ?)'
        )
        values.push(`%${input.query}%`, `%${input.query}%`)
      }
      if (input.numberStatus.length === 1) {
        where.push(
          input.numberStatus[0] === 'COMPLETE'
            ? `(employee.bpjs_health_number IS NOT NULL AND TRIM(employee.bpjs_health_number)<>'' AND employee.bpjs_employment_number IS NOT NULL AND TRIM(employee.bpjs_employment_number)<>'')`
            : `(employee.bpjs_health_number IS NULL OR TRIM(employee.bpjs_health_number)='' OR employee.bpjs_employment_number IS NULL OR TRIM(employee.bpjs_employment_number)='')`
        )
      }
      const effective = (component: string) =>
        `(CASE WHEN enrollment.configuration_mode='CUSTOM' THEN enrollment.${component} ELSE COALESCE(policy.${component},0) END)`
      const effectiveColumns = [
        'health_employer_enabled',
        'health_employee_enabled',
        'jht_employer_enabled',
        'jht_employee_enabled',
        'jkk_employer_enabled',
        'jkm_employer_enabled',
        'jp_employer_enabled',
        'jp_employee_enabled',
      ]
      const allProgramsActive = `(${effectiveColumns
        .map((column) => `${effective(column)}=1`)
        .join(' AND ')})`
      if (input.participationStatus.length === 1) {
        where.push(
          input.participationStatus[0] === 'ALL_ACTIVE'
            ? allProgramsActive
            : `NOT ${allProgramsActive}`
        )
      }
      const fromSql = `FROM employees employee
        JOIN employee_types type ON type.id=employee.employee_type_id
        JOIN employee_statuses employee_status
          ON employee_status.id=employee.employee_status_id
         AND employee_status.code='ACTIVE'
        JOIN sites site ON site.id=employee.current_site_id
        LEFT JOIN employee_bpjs_enrollments enrollment ON enrollment.id=(
          SELECT latest.id FROM employee_bpjs_enrollments latest
          WHERE latest.employee_id=employee.id
          ORDER BY latest.id DESC LIMIT 1
        )
        LEFT JOIN payroll_bpjs_policies policy
          ON policy.policy_year=? AND policy.status='ACTIVE'`
      const numberCompleteSql = `(employee.bpjs_health_number IS NOT NULL AND TRIM(employee.bpjs_health_number)<>'' AND employee.bpjs_employment_number IS NOT NULL AND TRIM(employee.bpjs_employment_number)<>'')`
      const orderColumns = {
        employee: 'employee.full_name',
        site: 'site.name',
        numberStatus: numberCompleteSql,
      } as const
      const direction = input.sortDirection.toUpperCase()
      const [counts] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${fromSql} WHERE ${where.join(' AND ')}`,
        [input.year, ...values]
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT employee.uid,employee.employee_number employeeNumber,employee.full_name fullName,
          site.uid siteUid,site.code siteCode,site.name siteName,
          employee.bpjs_health_number IS NOT NULL AND TRIM(employee.bpjs_health_number)<>'' hasHealthNumber,
          employee.bpjs_employment_number IS NOT NULL AND TRIM(employee.bpjs_employment_number)<>'' hasEmploymentNumber,
          enrollment.uid enrollmentUid,enrollment.configuration_mode configurationMode,
          ${effective('health_employer_enabled')} healthEmployerEnabled,
          ${effective('health_employee_enabled')} healthEmployeeEnabled,
          ${effective('jht_employer_enabled')} jhtEmployerEnabled,
          ${effective('jht_employee_enabled')} jhtEmployeeEnabled,
          ${effective('jkk_employer_enabled')} jkkEmployerEnabled,
          ${effective('jkm_employer_enabled')} jkmEmployerEnabled,
          ${effective('jp_employer_enabled')} jpEmployerEnabled,
          ${effective('jp_employee_enabled')} jpEmployeeEnabled
        ${fromSql} WHERE ${where.join(' AND ')}
        ORDER BY ${orderColumns[input.sortBy]} ${direction},employee.full_name ASC,employee.employee_number ASC
        LIMIT ? OFFSET ?`,
        [input.year, ...values, input.pageSize, (input.page - 1) * input.pageSize]
      )
      const total = Number(counts[0]?.total ?? 0)
      res.json({
        data: rows.map((row) => ({
          employee: {
            uid: String(row.uid),
            employeeNumber: String(row.employeeNumber),
            fullName: String(row.fullName),
          },
          site: {
            uid: String(row.siteUid),
            code: String(row.siteCode),
            name: String(row.siteName),
          },
          configurationMode:
            row.enrollmentUid && row.configurationMode === 'CUSTOM'
              ? 'CUSTOM'
              : 'GLOBAL',
          healthEmployerEnabled: bool(row.healthEmployerEnabled),
          healthEmployeeEnabled: bool(row.healthEmployeeEnabled),
          jhtEmployerEnabled: bool(row.jhtEmployerEnabled),
          jhtEmployeeEnabled: bool(row.jhtEmployeeEnabled),
          jkkEmployerEnabled: bool(row.jkkEmployerEnabled),
          jkmEmployerEnabled: bool(row.jkmEmployerEnabled),
          jpEmployerEnabled: bool(row.jpEmployerEnabled),
          jpEmployeeEnabled: bool(row.jpEmployeeEnabled),
          hasHealthNumber: bool(row.hasHealthNumber),
          hasEmploymentNumber: bool(row.hasEmploymentNumber),
        })),
        meta: {
          page: input.page,
          pageSize: input.pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

payrollBpjsRouter.post(
  '/configuration/bpjs/enrollments/import/preview',
  requirePermission('payroll.rate.manage'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const input = enrollmentImportInput.pick({ rows: true }).parse(req.body)
      const result = await validateEnrollmentImport(input.rows, auth)
      res.json({
        data: {
          total: result.length,
          valid: result.filter((row) => row.valid).length,
          invalid: result.filter((row) => !row.valid).length,
          rows: result.map(({ employee: _employee, input: _input, ...row }) => row),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

payrollBpjsRouter.post(
  '/configuration/bpjs/enrollments/import',
  requirePermission('payroll.rate.manage'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const input = enrollmentImportInput.parse(req.body)
      await conn.beginTransaction()
      const validation = await validateEnrollmentImport(input.rows, auth, conn)
      const invalid = validation.filter((row) => !row.valid)
      if (invalid.length)
        throw new ApiError(
          422,
          `Import dibatalkan: ${invalid.length} baris tidak lagi valid. Muat ulang preview.`
        )
      let changed = 0
      let replayed = 0
      for (const [index, row] of validation.entries()) {
        const result = await persistEnrollment(conn, auth, req, row.employee!, {
          ...row.input,
          idempotencyKey: `${input.idempotencyKey}-${index + 1}`,
        })
        if (result.replay) replayed += 1
        else changed += 1
      }
      await conn.commit()
      res.json({ data: { total: validation.length, changed, replayed } })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

payrollBpjsRouter.post(
  '/configuration/bpjs/enrollments/:employeeUid',
  requirePermission('payroll.rate.manage'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const employeeUid = uid.parse(req.params.employeeUid)
      const input = enrollmentInput.parse(req.body)
      await conn.beginTransaction()
      const [employees] = await conn.query<RowDataPacket[]>(
        `SELECT employee.id,employee.uid,employee.employee_number employeeNumber,
          employee.full_name fullName,site.id siteId,site.code siteCode
         FROM employees employee
         JOIN employee_types type ON type.id=employee.employee_type_id AND type.code='BORONGAN'
         JOIN employee_statuses employee_status
           ON employee_status.id=employee.employee_status_id
          AND employee_status.code='ACTIVE'
         JOIN sites site ON site.id=employee.current_site_id
         WHERE employee.uid=? FOR UPDATE`,
        [employeeUid]
      )
      const employee = employees[0]
      if (!employee)
        throw new ApiError(404, 'Karyawan Borongan aktif tidak ditemukan.')
      enforceSite(auth, String(employee.siteCode))
      const result = await persistEnrollment(conn, auth, req, employee, input)
      await conn.commit()
      const existingRecord =
        result.replay || ('existing' in result && result.existing)
      res.status(existingRecord ? 200 : 201).json({ data: result })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)
