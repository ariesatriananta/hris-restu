import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const employeeTypeCode = z.enum([
  'BORONGAN',
  'HARIAN',
  'BULANAN',
  'TRAINING',
])

const csvList = <T extends z.ZodType<string>>(item: T) =>
  z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : undefined,
    z.array(item).optional()
  )

const summaryQuery = z
  .object({
    site: csvList(siteCode),
    employeeType: csvList(employeeTypeCode),
  })
  .strip()

function addListFilter(
  where: string[],
  values: unknown[],
  field: string,
  list?: string[]
) {
  if (!list?.length) return
  where.push(`${field} IN (${list.map(() => '?').join(',')})`)
  values.push(...list)
}

function addSiteScope(
  where: string[],
  values: unknown[],
  auth: AuthContext
) {
  if (auth.roles.includes('SUPER_ADMIN')) return
  where.push(`s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`)
  values.push(...auth.siteAccess)
}

export const employeeSummaryRouter = Router()

employeeSummaryRouter.get(
  '/summary',
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = summaryQuery.parse(req.query)
      const auth = res.locals.auth as AuthContext
      const where = ['1=1']
      const values: unknown[] = []

      addListFilter(where, values, 's.code', input.site)
      addListFilter(where, values, 'et.code', input.employeeType)
      addSiteScope(where, values, auth)

      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT
          COUNT(*) totalEmployees,
          COALESCE(SUM(es.code='ACTIVE'),0) activeEmployees,
          COALESCE(SUM(es.code='INACTIVE' AND e.resign_date IS NULL),0) inactiveEmployees,
          COALESCE(SUM(es.code='RESIGNED'),0) resignedEmployees,
          COALESCE(SUM(es.code='ACTIVE' AND et.code='TRAINING'),0) activeTrainingEmployees,
          COALESCE(SUM(
            es.code<>'RESIGNED'
            AND (
              e.current_position_id IS NULL
              OR e.current_production_module_section_id IS NULL
            )
          ),0) incompletePlacementEmployees
        FROM employees e
        JOIN employee_types et ON et.id=e.employee_type_id
        JOIN employee_statuses es ON es.id=e.employee_status_id
        JOIN sites s ON s.id=e.current_site_id
        WHERE ${where.join(' AND ')}`,
        values
      )
      const summary = rows[0] ?? {}

      res.json({
        totalEmployees: Number(summary.totalEmployees ?? 0),
        activeEmployees: Number(summary.activeEmployees ?? 0),
        inactiveEmployees: Number(summary.inactiveEmployees ?? 0),
        resignedEmployees: Number(summary.resignedEmployees ?? 0),
        activeTrainingEmployees: Number(
          summary.activeTrainingEmployees ?? 0
        ),
        incompletePlacementEmployees: Number(
          summary.incompletePlacementEmployees ?? 0
        ),
      })
    } catch (error) {
      next(error)
    }
  }
)
