import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import { attendanceCapabilities } from '../lib/attendance-policy.js'
import {
  deriveCrossesMidnight,
  jakartaBusinessDate,
  previousDate,
  shiftAssignmentBatchInput,
  shiftInput,
} from '../lib/attendance-shift-policy.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import { attendanceDevicesRouter } from './attendance-devices.js'
import { attendanceTerminalRouter } from './attendance-terminal.js'
import { attendanceCorrectionsRouter } from './attendance-corrections.js'
import { attendanceClassificationsRouter } from './attendance-classifications.js'
import { attendanceCalendarRouter } from './attendance-calendar.js'
import {
  attendanceClassificationApprovalStatuses,
  attendanceClassificationTypes,
} from '../lib/attendance-classification-policy.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCodes = ['JEPARA', 'SEMARANG', 'KLATEN'] as const
const employeeTypes = ['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'] as const
const assignmentStatuses = ['CURRENT', 'UPCOMING', 'ENDED'] as const
const routeParam = (value: string | string[]) =>
  Array.isArray(value) ? value[0] : value

const attendanceStatuses = [
  { value: 'PRESENT', label: 'Hadir' },
  { value: 'ABSENT', label: 'Tidak hadir' },
  { value: 'LEAVE', label: 'Cuti' },
  { value: 'SICK', label: 'Sakit' },
  { value: 'PERMISSION', label: 'Izin' },
  { value: 'HOLIDAY', label: 'Libur' },
] as const
const correctionApprovalStatuses = [
  { value: 'PENDING', label: 'Menunggu persetujuan' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
] as const
const deviceTypes = [
  { value: 'MOBILE_CAMERA', label: 'Kamera HP' },
  { value: 'USB_SCANNER', label: 'Scanner USB' },
  { value: 'TERMINAL', label: 'Terminal' },
  { value: 'OTHER', label: 'Lainnya' },
] as const

function pageParams(page: unknown, pageSize: unknown) {
  const parsedPage = Number(page ?? 1)
  const parsedPageSize = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize:
      Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(500, parsedPageSize)
        : 50,
  }
}

function listFilter<T extends string>(raw: unknown, allowed: readonly T[]) {
  return String(raw ?? '')
    .split(',')
    .filter((value): value is T => allowed.includes(value as T))
}

function activeFilter(raw: unknown) {
  const values = listFilter(raw, ['true', 'false'] as const)
  return values.length === 1 ? (values[0] === 'true' ? 1 : 0) : undefined
}

function scopeWhere(auth: AuthContext, column = 's.code') {
  return auth.roles.includes('SUPER_ADMIN')
    ? { sql: '1=1', params: [] as string[] }
    : {
        sql: `${column} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`,
        params: auth.siteAccess,
      }
}

function enforceSite(auth: AuthContext, site: string) {
  if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

function parseWorkDays(value: unknown) {
  if (Array.isArray(value)) return value.map(Number)
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(Number) : []
  } catch {
    return []
  }
}

function mapAssignment(row: RowDataPacket) {
  return { ...row, workDays: parseWorkDays(row.workDays) }
}

async function getShiftForUpdate(conn: PoolConnection, uid: string) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT sh.*,s.code site,s.name siteName
       FROM shifts sh
       JOIN sites s ON s.id=sh.site_id
      WHERE sh.uid=?
      FOR UPDATE`,
    [uid]
  )
  if (!rows[0]) throw new ApiError(404, 'Shift tidak ditemukan.')
  return rows[0]
}

export const attendanceRouter = Router()
attendanceRouter.use(authenticate)
attendanceRouter.use(attendanceDevicesRouter)
attendanceRouter.use(attendanceTerminalRouter)
attendanceRouter.use(attendanceCorrectionsRouter)
attendanceRouter.use(attendanceClassificationsRouter)
attendanceRouter.use(attendanceCalendarRouter)

attendanceRouter.get(
  '/foundation',
  requirePermission('attendance.view'),
  async (_req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const scope = scopeWhere(auth)
      const [sites] = await pool.query<RowDataPacket[]>(
        `SELECT s.uid,s.code,s.name,s.timezone
           FROM sites s
          WHERE s.is_active=1 AND ${scope.sql}
          ORDER BY s.name,s.id`,
        scope.params
      )
      const [productionModules] = await pool.query<RowDataPacket[]>(
        `SELECT m.uid,m.code,m.name,s.code site
           FROM production_modules m
           JOIN sites s ON s.id=m.site_id
          WHERE m.is_active=1 AND s.is_active=1 AND ${scope.sql}
          ORDER BY s.name,m.name,m.id`,
        scope.params
      )
      const [productionSections] = await pool.query<RowDataPacket[]>(
        `SELECT DISTINCT ps.uid,ps.code,ps.name,m.uid moduleUid,s.code site
           FROM production_module_sections pms
           JOIN production_modules m ON m.id=pms.production_module_id
           JOIN production_sections ps ON ps.id=pms.production_section_id
           JOIN sites s ON s.id=m.site_id
          WHERE pms.is_active=1 AND m.is_active=1 AND ps.is_active=1
            AND s.is_active=1 AND ${scope.sql}
          ORDER BY s.code,m.uid,ps.name,ps.uid`,
        scope.params
      )
      res.json({
        capabilities: attendanceCapabilities(auth),
        sites,
        lookups: {
          attendanceStatuses,
          correctionApprovalStatuses,
          classificationTypes: [
            { value: attendanceClassificationTypes[0], label: 'Cuti' },
            { value: attendanceClassificationTypes[1], label: 'Sakit' },
            { value: attendanceClassificationTypes[2], label: 'Izin' },
          ],
          classificationApprovalStatuses: [
            { value: attendanceClassificationApprovalStatuses[0], label: 'Menunggu persetujuan' },
            { value: attendanceClassificationApprovalStatuses[1], label: 'Disetujui' },
            { value: attendanceClassificationApprovalStatuses[2], label: 'Ditolak' },
            { value: attendanceClassificationApprovalStatuses[3], label: 'Dibatalkan' },
          ],
          deviceTypes,
          productionModules,
          productionSections,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceRouter.get(
  '/shifts',
  requirePermission('attendance.manage_shift'),
  async (req, res, next) => {
    try {
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const where = ['1=1']
      const values: unknown[] = []
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push('(sh.code LIKE ? OR sh.name LIKE ?)')
        values.push(`%${query}%`, `%${query}%`)
      }
      const sites = listFilter(req.query.site, siteCodes)
      if (sites.length) {
        where.push(`s.code IN (${sites.map(() => '?').join(',')})`)
        values.push(...sites)
      }
      const isActive = activeFilter(req.query.isActive)
      if (isActive !== undefined) {
        where.push('sh.is_active=?')
        values.push(isActive)
      }
      const scope = scopeWhere(res.locals.auth as AuthContext)
      where.push(scope.sql)
      values.push(...scope.params)
      const clause = where.join(' AND ')
      const from = 'FROM shifts sh JOIN sites s ON s.id=sh.site_id'
      const [count] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${from} WHERE ${clause}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT sh.uid,sh.code,sh.name,s.code site,s.name siteName,
                TIME_FORMAT(sh.start_time,'%H:%i') startTime,
                TIME_FORMAT(sh.end_time,'%H:%i') endTime,
                sh.crosses_midnight crossesMidnight,
                sh.late_tolerance_minutes lateToleranceMinutes,
                sh.early_leave_tolerance_minutes earlyLeaveToleranceMinutes,
                sh.is_active isActive,
                EXISTS(SELECT 1 FROM attendance_records ar WHERE ar.shift_id=sh.id) hasAttendance,
                (SELECT COUNT(*) FROM employee_shift_assignments esa WHERE esa.shift_id=sh.id) assignmentCount
           ${from}
          WHERE ${clause}
          ORDER BY sh.created_at DESC,sh.id DESC
          LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      res.json({
        items: rows.map((row) => ({
          ...row,
          crossesMidnight: Number(row.crossesMidnight) === 1,
          isActive: Number(row.isActive) === 1,
          hasAttendance: Number(row.hasAttendance) === 1,
          assignmentCount: Number(row.assignmentCount),
        })),
        total: Number(count[0].total),
        page,
        pageSize,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceRouter.post(
  '/shifts',
  requirePermission('attendance.manage_shift'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = shiftInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.siteCode)
      await conn.beginTransaction()
      const [sites] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM sites WHERE code=? AND is_active=1 FOR UPDATE',
        [input.siteCode]
      )
      if (!sites[0]) throw new ApiError(422, 'Site tidak valid atau tidak aktif.')
      const uid = randomUUID()
      await conn.execute(
        `INSERT INTO shifts
          (uid,site_id,code,name,start_time,end_time,crosses_midnight,late_tolerance_minutes,early_leave_tolerance_minutes,is_active,created_by,updated_by)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          uid,
          sites[0].id,
          input.code.toUpperCase(),
          input.name,
          input.startTime,
          input.endTime,
          deriveCrossesMidnight(input.startTime, input.endTime) ? 1 : 0,
          input.lateToleranceMinutes,
          input.earlyLeaveToleranceMinutes,
          input.isActive ? 1 : 0,
          auth.id,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: sites[0].id,
          action: 'CREATE',
          table: 'shifts',
          recordUid: uid,
          description: `Menambah Shift ${input.name}.`,
          afterData: input,
        },
        conn
      )
      await conn.commit()
      res.status(201).json({ uid })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceRouter.patch(
  '/shifts/:uid',
  requirePermission('attendance.manage_shift'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = shiftInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      await conn.beginTransaction()
      const shift = await getShiftForUpdate(conn, uid)
      enforceSite(auth, shift.site)
      if (shift.site !== input.siteCode) {
        throw new ApiError(422, 'Site Shift tidak dapat diubah.')
      }
      const [attendance] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM attendance_records WHERE shift_id=? LIMIT 1 FOR UPDATE',
        [shift.id]
      )
      const scheduleChanged =
        shift.code !== input.code.toUpperCase() ||
        String(shift.start_time).slice(0, 5) !== input.startTime ||
        String(shift.end_time).slice(0, 5) !== input.endTime ||
        Number(shift.late_tolerance_minutes) !== input.lateToleranceMinutes ||
        Number(shift.early_leave_tolerance_minutes) !==
          input.earlyLeaveToleranceMinutes
      if (attendance[0] && scheduleChanged) {
        throw new ApiError(
          409,
          'Jadwal Shift yang sudah dipakai Attendance tidak dapat diubah. Nonaktifkan lalu buat Shift baru.'
        )
      }
      if (!input.isActive && Number(shift.is_active) === 1) {
        const today = jakartaBusinessDate()
        const [openAssignments] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM employee_shift_assignments
            WHERE shift_id=? AND (effective_to IS NULL OR effective_to>=?)
            LIMIT 1 FOR UPDATE`,
          [shift.id, today]
        )
        if (openAssignments[0]) {
          throw new ApiError(
            409,
            'Shift tidak dapat dinonaktifkan karena masih memiliki penugasan aktif atau masa depan.'
          )
        }
      }
      const beforeData = {
        siteCode: shift.site,
        code: shift.code,
        name: shift.name,
        startTime: String(shift.start_time).slice(0, 5),
        endTime: String(shift.end_time).slice(0, 5),
        lateToleranceMinutes: Number(shift.late_tolerance_minutes),
        earlyLeaveToleranceMinutes: Number(
          shift.early_leave_tolerance_minutes
        ),
        isActive: Number(shift.is_active) === 1,
      }
      await conn.execute(
        `UPDATE shifts
            SET code=?,name=?,start_time=?,end_time=?,crosses_midnight=?,
                late_tolerance_minutes=?,early_leave_tolerance_minutes=?,is_active=?,updated_by=?
          WHERE id=?`,
        [
          input.code.toUpperCase(),
          input.name,
          input.startTime,
          input.endTime,
          deriveCrossesMidnight(input.startTime, input.endTime) ? 1 : 0,
          input.lateToleranceMinutes,
          input.earlyLeaveToleranceMinutes,
          input.isActive ? 1 : 0,
          auth.id,
          shift.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: shift.site_id,
          action: 'UPDATE',
          table: 'shifts',
          recordId: shift.id,
          recordUid: uid,
          description: `Memperbarui Shift ${input.name}.`,
          beforeData,
          afterData: input,
        },
        conn
      )
      await conn.commit()
      res.status(204).end()
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceRouter.delete(
  '/shifts/:uid',
  requirePermission('attendance.manage_shift'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      await conn.beginTransaction()
      const shift = await getShiftForUpdate(conn, uid)
      enforceSite(auth, shift.site)
      const [attendance] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM attendance_records WHERE shift_id=? LIMIT 1 FOR UPDATE',
        [shift.id]
      )
      if (attendance[0]) {
        throw new ApiError(
          409,
          'Shift tidak dapat dihapus karena sudah dipakai Attendance.'
        )
      }
      const [deletedAssignments] = await conn.execute<ResultSetHeader>(
        'DELETE FROM employee_shift_assignments WHERE shift_id=?',
        [shift.id]
      )
      await conn.execute('DELETE FROM shifts WHERE id=?', [shift.id])
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: shift.site_id,
          action: 'DELETE',
          table: 'shifts',
          recordId: shift.id,
          recordUid: uid,
          description: `Menghapus Shift ${shift.name} dan ${deletedAssignments.affectedRows} penugasan yang belum dipakai.`,
          beforeData: {
            code: shift.code,
            name: shift.name,
            deletedAssignmentCount: deletedAssignments.affectedRows,
          },
        },
        conn
      )
      await conn.commit()
      res.status(204).end()
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceRouter.get(
  '/shift-assignment-candidates',
  requirePermission('attendance.manage_shift'),
  async (req, res, next) => {
    try {
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const today = jakartaBusinessDate()
      const where = ["es.code='ACTIVE'", 'es.allows_attendance=1']
      const values: unknown[] = []
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push('(e.full_name LIKE ? OR e.employee_number LIKE ?)')
        values.push(`%${query}%`, `%${query}%`)
      }
      const sites = listFilter(req.query.site, siteCodes)
      if (sites.length) {
        where.push(`s.code IN (${sites.map(() => '?').join(',')})`)
        values.push(...sites)
      }
      const types = listFilter(req.query.employeeType, employeeTypes)
      if (types.length) {
        where.push(`et.code IN (${types.map(() => '?').join(',')})`)
        values.push(...types)
      }
      const modules = String(req.query.productionModule ?? '')
        .split(',')
        .filter(Boolean)
      if (modules.length) {
        where.push(`pm.uid IN (${modules.map(() => '?').join(',')})`)
        values.push(...modules)
      }
      const sections = String(req.query.productionSection ?? '')
        .split(',')
        .filter(Boolean)
      if (sections.length) {
        where.push(`ps.uid IN (${sections.map(() => '?').join(',')})`)
        values.push(...sections)
      }
      const scope = scopeWhere(res.locals.auth as AuthContext)
      where.push(scope.sql)
      values.push(...scope.params)
      const clause = where.join(' AND ')
      const from = `FROM employees e
        JOIN employee_types et ON et.id=e.employee_type_id
        JOIN employee_statuses es ON es.id=e.employee_status_id
        JOIN sites s ON s.id=e.current_site_id
        LEFT JOIN production_module_sections pms ON pms.id=e.current_production_module_section_id
        LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
        LEFT JOIN production_sections ps ON ps.id=pms.production_section_id`
      const [count] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${from} WHERE ${clause}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT e.uid,e.employee_number employeeNumber,e.full_name fullName,
                et.code employeeType,s.code site,pm.uid productionModuleUid,
                pm.name productionModule,ps.uid productionSectionUid,
                ps.name productionSection,
                (SELECT sh.name
                   FROM employee_shift_assignments esa
                   JOIN shifts sh ON sh.id=esa.shift_id
                  WHERE esa.employee_id=e.id AND esa.effective_from<=?
                    AND (esa.effective_to IS NULL OR esa.effective_to>=?)
                  ORDER BY esa.effective_from DESC,esa.id DESC LIMIT 1) currentShiftName,
                (SELECT DATE_FORMAT(esa.effective_from,'%Y-%m-%d')
                   FROM employee_shift_assignments esa
                  WHERE esa.employee_id=e.id AND esa.effective_from<=?
                    AND (esa.effective_to IS NULL OR esa.effective_to>=?)
                  ORDER BY esa.effective_from DESC,esa.id DESC LIMIT 1) currentShiftEffectiveFrom
           ${from}
          WHERE ${clause}
          ORDER BY e.full_name,e.id
          LIMIT ? OFFSET ?`,
        [today, today, today, today, ...values, pageSize, (page - 1) * pageSize]
      )
      res.json({
        items: rows,
        total: Number(count[0].total),
        page,
        pageSize,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceRouter.get(
  '/shift-assignments',
  requirePermission('attendance.manage_shift'),
  async (req, res, next) => {
    try {
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const today = jakartaBusinessDate()
      const where = ['1=1']
      const values: unknown[] = []
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push(
          '(e.full_name LIKE ? OR e.employee_number LIKE ? OR sh.name LIKE ?)'
        )
        values.push(`%${query}%`, `%${query}%`, `%${query}%`)
      }
      const sites = listFilter(req.query.site, siteCodes)
      if (sites.length) {
        where.push(`s.code IN (${sites.map(() => '?').join(',')})`)
        values.push(...sites)
      }
      const types = listFilter(req.query.employeeType, employeeTypes)
      if (types.length) {
        where.push(`et.code IN (${types.map(() => '?').join(',')})`)
        values.push(...types)
      }
      for (const [queryKey, column] of [
        ['productionModule', 'pm.uid'],
        ['productionSection', 'ps.uid'],
        ['shiftUid', 'sh.uid'],
      ] as const) {
        const selected = String(req.query[queryKey] ?? '')
          .split(',')
          .filter(Boolean)
        if (selected.length) {
          where.push(`${column} IN (${selected.map(() => '?').join(',')})`)
          values.push(...selected)
        }
      }
      const statuses = listFilter(req.query.status, assignmentStatuses)
      if (statuses.length) {
        where.push(
          `(CASE WHEN esa.effective_from>? THEN 'UPCOMING'
                 WHEN esa.effective_to IS NULL OR esa.effective_to>=? THEN 'CURRENT'
                 ELSE 'ENDED' END) IN (${statuses.map(() => '?').join(',')})`
        )
        values.push(today, today, ...statuses)
      }
      const scope = scopeWhere(res.locals.auth as AuthContext)
      where.push(scope.sql)
      values.push(...scope.params)
      const clause = where.join(' AND ')
      const from = `FROM employee_shift_assignments esa
        JOIN employees e ON e.id=esa.employee_id
        JOIN employee_types et ON et.id=e.employee_type_id
        JOIN shifts sh ON sh.id=esa.shift_id
        JOIN sites s ON s.id=sh.site_id
        LEFT JOIN production_module_sections pms ON pms.id=e.current_production_module_section_id
        LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
        LEFT JOIN production_sections ps ON ps.id=pms.production_section_id`
      const [count] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${from} WHERE ${clause}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT esa.uid,e.uid employeeUid,e.employee_number employeeNumber,
                e.full_name employeeName,et.code employeeType,s.code site,
                pm.uid productionModuleUid,pm.name productionModule,
                ps.uid productionSectionUid,ps.name productionSection,
                sh.uid shiftUid,sh.code shiftCode,sh.name shiftName,
                TIME_FORMAT(sh.start_time,'%H:%i') startTime,
                TIME_FORMAT(sh.end_time,'%H:%i') endTime,
                DATE_FORMAT(esa.effective_from,'%Y-%m-%d') effectiveFrom,
                DATE_FORMAT(esa.effective_to,'%Y-%m-%d') effectiveTo,
                esa.work_days_json workDays,
                CASE WHEN esa.effective_from>? THEN 'UPCOMING'
                     WHEN esa.effective_to IS NULL OR esa.effective_to>=? THEN 'CURRENT'
                     ELSE 'ENDED' END status
           ${from}
          WHERE ${clause}
          ORDER BY esa.effective_from DESC,esa.id DESC
          LIMIT ? OFFSET ?`,
        [today, today, ...values, pageSize, (page - 1) * pageSize]
      )
      res.json({
        items: rows.map(mapAssignment),
        total: Number(count[0].total),
        page,
        pageSize,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceRouter.post(
  '/shift-assignments/batch',
  requirePermission('attendance.manage_shift'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = shiftAssignmentBatchInput.parse(req.body)
      const today = jakartaBusinessDate()
      if (input.effectiveFrom < today) {
        throw new ApiError(
          422,
          'Tanggal mulai Shift hanya boleh hari ini atau masa depan.'
        )
      }
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const shift = await getShiftForUpdate(conn, input.shiftUid)
      enforceSite(auth, shift.site)
      if (Number(shift.is_active) !== 1) {
        throw new ApiError(422, 'Shift sudah nonaktif.')
      }
      const placeholders = input.employeeUids.map(() => '?').join(',')
      const [employees] = await conn.query<RowDataPacket[]>(
        `SELECT e.id,e.uid,e.full_name fullName,s.code site,es.code employeeStatus,
                es.allows_attendance allowsAttendance
           FROM employees e
           JOIN sites s ON s.id=e.current_site_id
           JOIN employee_statuses es ON es.id=e.employee_status_id
          WHERE e.uid IN (${placeholders})
          FOR UPDATE`,
        input.employeeUids
      )
      if (employees.length !== input.employeeUids.length) {
        throw new ApiError(422, 'Satu atau lebih karyawan tidak ditemukan.')
      }
      let closedPreviousCount = 0
      const createdUids: string[] = []
      for (const employee of employees) {
        if (employee.employeeStatus !== 'ACTIVE' || !employee.allowsAttendance) {
          throw new ApiError(
            422,
            `${employee.fullName} tidak berstatus aktif untuk Attendance.`
          )
        }
        if (employee.site !== shift.site) {
          throw new ApiError(
            422,
            `${employee.fullName} tidak berada pada site Shift ${shift.site}.`
          )
        }
        const [previous] = await conn.query<RowDataPacket[]>(
          `SELECT id,effective_from effectiveFrom
             FROM employee_shift_assignments
            WHERE employee_id=? AND effective_from<?
              AND (effective_to IS NULL OR effective_to>=?)
            ORDER BY effective_from DESC,id DESC
            FOR UPDATE`,
          [employee.id, input.effectiveFrom, input.effectiveFrom]
        )
        if (previous.length > 1) {
          throw new ApiError(
            409,
            `${employee.fullName} memiliki assignment Shift legacy yang bertumpang-tindih.`
          )
        }
        if (previous[0]) {
          await conn.execute(
            'UPDATE employee_shift_assignments SET effective_to=?,updated_by=? WHERE id=?',
            [previousDate(input.effectiveFrom), auth.id, previous[0].id]
          )
          closedPreviousCount += 1
        }
        const [overlap] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM employee_shift_assignments
            WHERE employee_id=? AND effective_from<=?
              AND (effective_to IS NULL OR effective_to>=?)
            LIMIT 1 FOR UPDATE`,
          [
            employee.id,
            input.effectiveTo ?? '9999-12-31',
            input.effectiveFrom,
          ]
        )
        if (overlap[0]) {
          throw new ApiError(
            409,
            `${employee.fullName} sudah memiliki assignment Shift pada periode tersebut.`
          )
        }
        const uid = randomUUID()
        createdUids.push(uid)
        await conn.execute(
          `INSERT INTO employee_shift_assignments
            (uid,employee_id,shift_id,effective_from,effective_to,work_days_json,created_by,updated_by)
           VALUES(?,?,?,?,?,?,?,?)`,
          [
            uid,
            employee.id,
            shift.id,
            input.effectiveFrom,
            input.effectiveTo ?? null,
            JSON.stringify(input.workDays),
            auth.id,
            auth.id,
          ]
        )
      }
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: shift.site_id,
          action: 'CREATE',
          table: 'employee_shift_assignments',
          description: `Menugaskan Shift ${shift.name} kepada ${employees.length} karyawan.`,
          afterData: {
            shiftUid: input.shiftUid,
            employeeCount: employees.length,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo ?? null,
            workDays: input.workDays,
            closedPreviousCount,
          },
        },
        conn
      )
      await conn.commit()
      res.status(201).json({
        createdCount: createdUids.length,
        closedPreviousCount,
      })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceRouter.delete(
  '/shift-assignments/:uid',
  requirePermission('attendance.manage_shift'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const uid = routeParam(req.params.uid)
      const auth = res.locals.auth as AuthContext
      const today = jakartaBusinessDate()
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT esa.id,esa.employee_id employeeId,esa.shift_id shiftId,
                DATE_FORMAT(esa.effective_from,'%Y-%m-%d') effectiveFrom,
                DATE_FORMAT(esa.effective_to,'%Y-%m-%d') effectiveTo,
                e.full_name employeeName,sh.name shiftName,s.id siteId,s.code site
           FROM employee_shift_assignments esa
           JOIN employees e ON e.id=esa.employee_id
           JOIN shifts sh ON sh.id=esa.shift_id
           JOIN sites s ON s.id=sh.site_id
          WHERE esa.uid=?
          FOR UPDATE`,
        [uid]
      )
      const assignment = rows[0]
      if (!assignment) throw new ApiError(404, 'Assignment Shift tidak ditemukan.')
      enforceSite(auth, assignment.site)
      if (assignment.effectiveFrom <= today) {
        throw new ApiError(
          409,
          'Hanya assignment Shift masa depan yang dapat dihapus.'
        )
      }
      const [attendance] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM attendance_records
          WHERE employee_id=? AND shift_id=? AND business_date>=?
            AND (business_date<=? OR ? IS NULL)
          LIMIT 1 FOR UPDATE`,
        [
          assignment.employeeId,
          assignment.shiftId,
          assignment.effectiveFrom,
          assignment.effectiveTo,
          assignment.effectiveTo,
        ]
      )
      if (attendance[0]) {
        throw new ApiError(409, 'Assignment sudah dipakai Attendance.')
      }
      await conn.execute('DELETE FROM employee_shift_assignments WHERE id=?', [
        assignment.id,
      ])
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: assignment.siteId,
          action: 'DELETE',
          table: 'employee_shift_assignments',
          recordId: assignment.id,
          recordUid: uid,
          description: `Menghapus assignment Shift masa depan ${assignment.shiftName} untuk ${assignment.employeeName}.`,
          beforeData: {
            effectiveFrom: assignment.effectiveFrom,
            effectiveTo: assignment.effectiveTo,
          },
        },
        conn
      )
      await conn.commit()
      res.status(204).end()
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)
