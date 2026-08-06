import { randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { env } from '../config.js'
import { pool } from '../db.js'
import {
  attendanceClassificationApprovalStatuses,
  attendanceClassificationRequestInput,
  attendanceClassificationReviewInput,
  attendanceClassificationTypes,
  enumerateDates,
  isScheduledWorkday,
  parseWorkDays,
} from '../lib/attendance-classification-policy.js'
import { jakartaBusinessDate } from '../lib/attendance-shift-policy.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCodes = ['JEPARA', 'SEMARANG', 'KLATEN'] as const
const routeParam = (value: string | string[]) =>
  Array.isArray(value) ? value[0] : value
const fileUrl = (path?: string) =>
  path ? `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${path}` : undefined

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

function requireClassificationRole(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  const auth = res.locals.auth as AuthContext
  if (
    !auth.roles.includes('SUPER_ADMIN') &&
    !auth.roles.includes('HR_OFFICER')
  ) {
    return next(
      new ApiError(403, 'Klasifikasi Attendance hanya dapat dikelola HR.')
    )
  }
  next()
}

function requireClassificationListAccess(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  const auth = res.locals.auth as AuthContext
  if (
    !auth.roles.includes('SUPER_ADMIN') &&
    !auth.permissions.includes('attendance.correct') &&
    !auth.permissions.includes('attendance.approve')
  ) {
    return next(new ApiError(403, 'Anda tidak memiliki izin untuk aksi ini.'))
  }
  next()
}

function mapClassification(row: RowDataPacket) {
  const {
    employeeUid,
    employeeNumber,
    employeeName,
    employeeType,
    attachmentUid,
    attachmentName,
    attachmentMimeType,
    attachmentSizeBytes,
    attachmentExtension,
    attachmentPath,
    ...classification
  } = row
  return {
    ...classification,
    employee: {
      uid: employeeUid,
      employeeNumber,
      fullName: employeeName,
      employeeType,
    },
    detailCount: Number(row.detailCount ?? 0),
    appliedCount: Number(row.appliedCount ?? 0),
    skippedCount: Number(row.skippedCount ?? 0),
    attachment: attachmentUid
      ? {
          uid: attachmentUid,
          originalName: attachmentName,
          mimeType: attachmentMimeType,
          sizeBytes: Number(attachmentSizeBytes),
          extension: attachmentExtension ?? undefined,
          url: fileUrl(attachmentPath),
        }
      : undefined,
  }
}

const classificationSelect = `SELECT acr.uid,e.uid employeeUid,
  e.employee_number employeeNumber,e.full_name employeeName,
  et.code employeeType,s.code site,acr.classification_type classificationType,
  DATE_FORMAT(acr.start_date,'%Y-%m-%d') startDate,
  DATE_FORMAT(acr.end_date,'%Y-%m-%d') endDate,acr.reason,
  acr.approval_status approvalStatus,
  DATE_FORMAT(acr.requested_at,'%Y-%m-%dT%H:%i:%s+07:00') requestedAt,
  requester.full_name requestedByName,
  DATE_FORMAT(acr.reviewed_at,'%Y-%m-%dT%H:%i:%s+07:00') reviewedAt,
  reviewer.full_name reviewedByName,acr.review_notes reviewNotes,
  DATE_FORMAT(acr.cancelled_at,'%Y-%m-%dT%H:%i:%s+07:00') cancelledAt,
  canceller.full_name cancelledByName,
  (SELECT COUNT(*) FROM attendance_classification_details detail
    WHERE detail.request_id=acr.id) detailCount,
  (SELECT COUNT(*) FROM attendance_classification_details detail
    WHERE detail.request_id=acr.id AND detail.outcome='APPLIED') appliedCount,
  (SELECT COUNT(*) FROM attendance_classification_details detail
    WHERE detail.request_id=acr.id AND detail.outcome='SKIPPED_NON_WORKDAY') skippedCount,
  f.uid attachmentUid,f.original_name attachmentName,
  f.mime_type attachmentMimeType,f.size_bytes attachmentSizeBytes,
  f.extension attachmentExtension,f.storage_path attachmentPath`

const classificationFrom = `FROM attendance_classification_requests acr
  JOIN employees e ON e.id=acr.employee_id
  JOIN employee_types et ON et.id=e.employee_type_id
  JOIN sites s ON s.id=acr.site_id
  JOIN users requester ON requester.id=acr.requested_by
  LEFT JOIN users reviewer ON reviewer.id=acr.reviewed_by
  LEFT JOIN users canceller ON canceller.id=acr.cancelled_by
  LEFT JOIN files f ON f.id=acr.attachment_file_id`

async function getClassificationForUpdate(conn: PoolConnection, uid: string) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT acr.*,e.uid employeeUid,e.full_name employeeName,
            e.employee_number employeeNumber,s.code site,
            DATE_FORMAT(acr.start_date,'%Y-%m-%d') startDate,
            DATE_FORMAT(acr.end_date,'%Y-%m-%d') endDate
       FROM attendance_classification_requests acr
       JOIN employees e ON e.id=acr.employee_id
       JOIN sites s ON s.id=acr.site_id
      WHERE acr.uid=? FOR UPDATE`,
    [uid]
  )
  if (!rows[0]) throw new ApiError(404, 'Klasifikasi Attendance tidak ditemukan.')
  return rows[0]
}

export const attendanceClassificationsRouter = Router()
attendanceClassificationsRouter.use('/classification-employees', requireClassificationRole)
attendanceClassificationsRouter.use('/classifications', requireClassificationRole)

attendanceClassificationsRouter.get(
  '/classification-employees',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
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
      const scope = scopeWhere(auth)
      where.push(scope.sql)
      values.push(...scope.params)
      const today = jakartaBusinessDate()
      const from = `FROM employees e
        JOIN employee_types et ON et.id=e.employee_type_id
        JOIN employee_statuses es ON es.id=e.employee_status_id
        JOIN sites s ON s.id=e.current_site_id`
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${from} WHERE ${where.join(' AND ')}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT e.uid,e.employee_number employeeNumber,e.full_name fullName,
                et.code employeeType,s.code site,
                (SELECT sh.name FROM employee_shift_assignments esa
                  JOIN shifts sh ON sh.id=esa.shift_id
                 WHERE esa.employee_id=e.id AND esa.effective_from<=?
                   AND (esa.effective_to IS NULL OR esa.effective_to>=?)
                 ORDER BY esa.effective_from DESC,esa.id DESC LIMIT 1) shiftName
           ${from}
          WHERE ${where.join(' AND ')}
          ORDER BY e.full_name,e.id LIMIT ? OFFSET ?`,
        [today, today, ...values, pageSize, (page - 1) * pageSize]
      )
      res.json({
        items: rows,
        total: Number(countRows[0].total),
        page,
        pageSize,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceClassificationsRouter.get(
  '/classifications',
  requireClassificationListAccess,
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const where = ['1=1']
      const values: unknown[] = []
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push('(e.full_name LIKE ? OR e.employee_number LIKE ?)')
        values.push(`%${query}%`, `%${query}%`)
      }
      for (const [raw, allowed, column] of [
        [req.query.site, siteCodes, 's.code'],
        [
          req.query.classificationType,
          attendanceClassificationTypes,
          'acr.classification_type',
        ],
        [
          req.query.approvalStatus,
          attendanceClassificationApprovalStatuses,
          'acr.approval_status',
        ],
      ] as const) {
        const selected = listFilter(raw, allowed)
        if (selected.length) {
          where.push(`${column} IN (${selected.map(() => '?').join(',')})`)
          values.push(...selected)
        }
      }
      if (req.query.dateFrom) {
        where.push('acr.end_date>=?')
        values.push(z.string().date().parse(req.query.dateFrom))
      }
      if (req.query.dateTo) {
        where.push('acr.start_date<=?')
        values.push(z.string().date().parse(req.query.dateTo))
      }
      const scope = scopeWhere(auth)
      where.push(scope.sql)
      values.push(...scope.params)
      const clause = where.join(' AND ')
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total FROM attendance_classification_requests acr
          JOIN employees e ON e.id=acr.employee_id
          JOIN sites s ON s.id=acr.site_id WHERE ${clause}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `${classificationSelect} ${classificationFrom}
          WHERE ${clause}
          ORDER BY acr.requested_at DESC,acr.id DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      res.json({
        items: rows.map(mapClassification),
        total: Number(countRows[0].total),
        page,
        pageSize,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceClassificationsRouter.get(
  '/classifications/:uid',
  requireClassificationListAccess,
  async (req, res, next) => {
    try {
      const uid = routeParam(req.params.uid)
      const auth = res.locals.auth as AuthContext
      const scope = scopeWhere(auth)
      const [rows] = await pool.query<RowDataPacket[]>(
        `${classificationSelect} ${classificationFrom}
          WHERE acr.uid=? AND ${scope.sql}`,
        [uid, ...scope.params]
      )
      if (!rows[0]) throw new ApiError(404, 'Klasifikasi Attendance tidak ditemukan.')
      const [details] = await pool.query<RowDataPacket[]>(
        `SELECT acd.uid,DATE_FORMAT(acd.business_date,'%Y-%m-%d') businessDate,
                acd.outcome,ar.uid attendanceUid,sh.name shiftName,acd.notes
           FROM attendance_classification_details acd
           JOIN attendance_classification_requests acr ON acr.id=acd.request_id
           LEFT JOIN attendance_records ar ON ar.id=acd.attendance_record_id
           LEFT JOIN employee_shift_assignments esa ON esa.id=acd.shift_assignment_id
           LEFT JOIN shifts sh ON sh.id=esa.shift_id
          WHERE acr.uid=? ORDER BY acd.business_date,acd.id`,
        [uid]
      )
      res.json({ ...mapClassification(rows[0]), details })
    } catch (error) {
      next(error)
    }
  }
)

attendanceClassificationsRouter.post(
  '/classifications',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const input = attendanceClassificationRequestInput.parse(req.body)
      const dates = enumerateDates(input.startDate, input.endDate)
      await conn.beginTransaction()
      const [employees] = await conn.query<RowDataPacket[]>(
        `SELECT e.id,e.uid,e.current_site_id siteId,s.code site,
                e.full_name employeeName,es.code employeeStatus,
                es.allows_attendance allowsAttendance
           FROM employees e
           JOIN employee_statuses es ON es.id=e.employee_status_id
           JOIN sites s ON s.id=e.current_site_id
          WHERE e.uid=? FOR UPDATE`,
        [input.employeeUid]
      )
      const employee = employees[0]
      if (!employee) throw new ApiError(404, 'Karyawan tidak ditemukan.')
      enforceSite(auth, employee.site)
      if (
        employee.employeeStatus !== 'ACTIVE' ||
        Number(employee.allowsAttendance) !== 1
      ) {
        throw new ApiError(422, 'Karyawan tidak aktif untuk Attendance.')
      }
      const [overlap] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM attendance_classification_requests
          WHERE employee_id=? AND approval_status='PENDING'
            AND start_date<=? AND end_date>=? LIMIT 1 FOR UPDATE`,
        [employee.id, input.endDate, input.startDate]
      )
      if (overlap[0]) {
        throw new ApiError(
          409,
          'Karyawan memiliki klasifikasi menunggu persetujuan pada rentang ini.'
        )
      }
      let attachmentFileId: number | null = null
      if (input.fileUid) {
        const [files] = await conn.query<RowDataPacket[]>(
          `SELECT f.id,f.mime_type mimeType,f.uploaded_by uploadedBy,
                  f.storage_path storagePath,
                  EXISTS(SELECT 1 FROM attendance_classification_requests used
                          WHERE used.attachment_file_id=f.id) alreadyUsed
             FROM files f WHERE f.uid=? FOR UPDATE`,
          [input.fileUid]
        )
        const file = files[0]
        if (!file) throw new ApiError(422, 'Lampiran tidak ditemukan.')
        if (
          !String(file.mimeType).startsWith('image/') &&
          file.mimeType !== 'application/pdf'
        ) {
          throw new ApiError(422, 'Lampiran hanya mendukung image atau PDF.')
        }
        if (!String(file.storagePath).includes('attendance-classifications/')) {
          throw new ApiError(
            422,
            'Lampiran harus diunggah khusus untuk klasifikasi Attendance.'
          )
        }
        if (Number(file.uploadedBy) !== auth.id || Number(file.alreadyUsed) === 1) {
          throw new ApiError(403, 'Lampiran tidak dapat digunakan untuk request ini.')
        }
        attachmentFileId = Number(file.id)
      }
      const uid = randomUUID()
      const [inserted] = await conn.execute<ResultSetHeader>(
        `INSERT INTO attendance_classification_requests
          (uid,employee_id,site_id,classification_type,start_date,end_date,reason,
           attachment_file_id,approval_status,requested_by,requested_at,created_by,updated_by)
         VALUES(?,?,?,?,?,?,?,?,'PENDING',?,CURRENT_TIMESTAMP(3),?,?)`,
        [
          uid,
          employee.id,
          employee.siteId,
          input.classificationType,
          input.startDate,
          input.endDate,
          input.reason,
          attachmentFileId,
          auth.id,
          auth.id,
          auth.id,
        ]
      )
      for (const date of dates) {
        await conn.execute(
          `INSERT INTO attendance_classification_details
            (uid,request_id,employee_id,business_date,outcome,created_by,updated_by)
           VALUES(?,?,?,?, 'PENDING',?,?)`,
          [randomUUID(), inserted.insertId, employee.id, date, auth.id, auth.id]
        )
      }
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: employee.siteId,
          action: 'CREATE',
          table: 'attendance_classification_requests',
          recordId: inserted.insertId,
          recordUid: uid,
          description: `Mengajukan klasifikasi ${input.classificationType} Attendance ${employee.employeeName}.`,
          reason: input.reason,
          afterData: {
            employeeUid: input.employeeUid,
            classificationType: input.classificationType,
            startDate: input.startDate,
            endDate: input.endDate,
            attachmentFileUid: input.fileUid ?? null,
          },
        },
        conn
      )
      await conn.commit()
      res.status(201).json({ uid, approvalStatus: 'PENDING' })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceClassificationsRouter.post(
  '/classifications/:uid/cancel',
  requirePermission('attendance.correct'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      await conn.beginTransaction()
      const classification = await getClassificationForUpdate(conn, uid)
      enforceSite(auth, classification.site)
      if (classification.approval_status !== 'PENDING') {
        throw new ApiError(409, 'Hanya klasifikasi pending yang dapat dibatalkan.')
      }
      await conn.execute(
        `UPDATE attendance_classification_requests
            SET approval_status='CANCELLED',cancelled_by=?,
                cancelled_at=CURRENT_TIMESTAMP(3),updated_by=? WHERE id=?`,
        [auth.id, auth.id, classification.id]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: classification.site_id,
          action: 'UPDATE',
          table: 'attendance_classification_requests',
          recordId: classification.id,
          recordUid: uid,
          description: 'Membatalkan request klasifikasi Attendance.',
          beforeData: { approvalStatus: 'PENDING' },
          afterData: { approvalStatus: 'CANCELLED' },
        },
        conn
      )
      await conn.commit()
      res.json({ uid, approvalStatus: 'CANCELLED' })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceClassificationsRouter.post(
  '/classifications/:uid/review',
  requirePermission('attendance.approve'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      const input = attendanceClassificationReviewInput.parse(req.body)
      await conn.beginTransaction()
      const classification = await getClassificationForUpdate(conn, uid)
      enforceSite(auth, classification.site)
      if (classification.approval_status !== 'PENDING') {
        throw new ApiError(409, 'Klasifikasi Attendance ini sudah ditinjau.')
      }
      if (input.decision === 'REJECTED') {
        await conn.execute(
          `UPDATE attendance_classification_requests
              SET approval_status='REJECTED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP(3),
                  review_notes=?,updated_by=? WHERE id=?`,
          [auth.id, input.reviewNotes, auth.id, classification.id]
        )
        await writeAudit(
          {
            auth,
            request: req,
            module: 'ATTENDANCE',
            siteId: classification.site_id,
            action: 'REJECT',
            table: 'attendance_classification_requests',
            recordId: classification.id,
            recordUid: uid,
            description: 'Menolak klasifikasi Attendance.',
            reason: input.reviewNotes,
          },
          conn
        )
        await conn.commit()
        return res.json({
          uid,
          approvalStatus: 'REJECTED',
          appliedCount: 0,
          skippedCount: 0,
        })
      }

      await conn.query('SELECT id FROM employees WHERE id=? FOR UPDATE', [
        classification.employee_id,
      ])
      const dates = enumerateDates(
        classification.startDate,
        classification.endDate
      )
      const [assignments] = await conn.query<RowDataPacket[]>(
        `SELECT esa.id,esa.shift_id shiftId,sh.site_id shiftSiteId,
                esa.work_days_json workDays,
                DATE_FORMAT(esa.effective_from,'%Y-%m-%d') effectiveFrom,
                DATE_FORMAT(esa.effective_to,'%Y-%m-%d') effectiveTo,sh.name shiftName
           FROM employee_shift_assignments esa
           JOIN shifts sh ON sh.id=esa.shift_id
          WHERE esa.employee_id=? AND esa.effective_from<=?
            AND (esa.effective_to IS NULL OR esa.effective_to>=?)
          ORDER BY esa.effective_from DESC,esa.id DESC FOR UPDATE`,
        [classification.employee_id, classification.end_date, classification.start_date]
      )
      const resolved = dates.map((date) => {
        const matches = assignments.filter(
          (assignment) =>
            assignment.effectiveFrom <= date &&
            (!assignment.effectiveTo || assignment.effectiveTo >= date)
        )
        if (matches.length !== 1) {
          throw new ApiError(
            409,
            `Penugasan Shift tanggal ${date} tidak tersedia atau tumpang tindih.`
          )
        }
        if (Number(matches[0].shiftSiteId) !== Number(classification.site_id)) {
          throw new ApiError(
            409,
            `Shift tanggal ${date} tidak sesuai site request klasifikasi.`
          )
        }
        if (parseWorkDays(matches[0].workDays).length === 0) {
          throw new ApiError(409, `Hari kerja Shift tanggal ${date} belum diatur.`)
        }
        return {
          date,
          assignment: matches[0],
          isWorkday: isScheduledWorkday(date, matches[0].workDays),
        }
      })
      const workdays = resolved.filter((item) => item.isWorkday)
      if (workdays.length) {
        const placeholders = workdays.map(() => '?').join(',')
        const workDates = workdays.map((item) => item.date)
        const [closedPayroll] = await conn.query<RowDataPacket[]>(
          `SELECT pp.id,pp.period_code periodCode FROM payroll_periods pp
            WHERE pp.site_id=? AND pp.status='CLOSED'
              AND (${workDates
                .map(() => '? BETWEEN pp.period_start AND pp.period_end')
                .join(' OR ')})
            LIMIT 1 FOR UPDATE`,
          [classification.site_id, ...workDates]
        )
        if (closedPayroll[0]) {
          throw new ApiError(
            409,
            'Klasifikasi menyentuh periode payroll yang sudah closing.'
          )
        }
        const [otherApplied] = await conn.query<RowDataPacket[]>(
          `SELECT acd.business_date FROM attendance_classification_details acd
            JOIN attendance_classification_requests other ON other.id=acd.request_id
           WHERE acd.employee_id=? AND acd.business_date IN (${placeholders})
             AND acd.outcome='APPLIED' AND other.id<>? LIMIT 1 FOR UPDATE`,
          [classification.employee_id, ...workDates, classification.id]
        )
        if (otherApplied[0]) {
          throw new ApiError(409, 'Tanggal sudah memiliki klasifikasi Attendance lain.')
        }
        const [attendanceRows] = await conn.query<RowDataPacket[]>(
          `SELECT ar.id,ar.uid,DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
                  ar.site_id siteId,ar.attendance_status attendanceStatus,
                  ar.clock_in_at clockInAt,
                  ar.clock_out_at clockOutAt,ar.clock_in_source clockInSource,
                  ar.clock_out_source clockOutSource,
                  EXISTS(SELECT 1 FROM attendance_scan_events ase
                          WHERE ase.attendance_record_id=ar.id AND ase.result_status='SUCCESS') hasScan,
                  EXISTS(SELECT 1 FROM production_transactions pt
                          WHERE pt.attendance_record_id=ar.id AND pt.status='POSTED') hasProduction
             FROM attendance_records ar
            WHERE ar.employee_id=? AND ar.business_date IN (${placeholders}) FOR UPDATE`,
          [classification.employee_id, ...workDates]
        )
        const attendanceByDate = new Map(
          attendanceRows.map((row) => [String(row.businessDate), row])
        )
        for (const item of workdays) {
          const attendance = attendanceByDate.get(item.date)
          if (
            attendance &&
            Number(attendance.siteId) !== Number(classification.site_id)
          ) {
            throw new ApiError(
              409,
              `Attendance tanggal ${item.date} tercatat pada site berbeda.`
            )
          }
          if (
            attendance &&
            (attendance.clockInAt ||
              attendance.clockOutAt ||
              attendance.clockInSource === 'TERMINAL' ||
              attendance.clockOutSource === 'TERMINAL' ||
              Number(attendance.hasScan) === 1)
          ) {
            throw new ApiError(
              409,
              `Attendance tanggal ${item.date} memiliki scan terminal dan tidak dapat ditimpa.`
            )
          }
          if (attendance?.attendanceStatus === 'PRESENT') {
            throw new ApiError(
              409,
              `Attendance tanggal ${item.date} sudah berstatus Hadir.`
            )
          }
          if (Number(attendance?.hasProduction) === 1) {
            throw new ApiError(
              409,
              `Attendance tanggal ${item.date} sudah dipakai setoran produksi.`
            )
          }
        }

        for (const item of workdays) {
          const attendance = attendanceByDate.get(item.date)
          let attendanceId: number
          if (attendance) {
            attendanceId = Number(attendance.id)
            await conn.execute(
              `UPDATE attendance_records
                  SET site_id=?,shift_id=?,attendance_status=?,notes=?,updated_by=?
                WHERE id=?`,
              [
                classification.site_id,
                item.assignment.shiftId,
                classification.classification_type,
                classification.reason,
                auth.id,
                attendanceId,
              ]
            )
          } else {
            const attendanceUid = randomUUID()
            const [inserted] = await conn.execute<ResultSetHeader>(
              `INSERT INTO attendance_records
                (uid,employee_id,site_id,shift_id,business_date,attendance_status,
                 notes,created_by,updated_by)
               VALUES(?,?,?,?,?,?,?,?,?)`,
              [
                attendanceUid,
                classification.employee_id,
                classification.site_id,
                item.assignment.shiftId,
                item.date,
                classification.classification_type,
                classification.reason,
                auth.id,
                auth.id,
              ]
            )
            attendanceId = inserted.insertId
          }
          await conn.execute(
            `UPDATE attendance_classification_details
                SET shift_assignment_id=?,attendance_record_id=?,outcome='APPLIED',
                    notes=NULL,updated_by=?
              WHERE request_id=? AND business_date=?`,
            [
              item.assignment.id,
              attendanceId,
              auth.id,
              classification.id,
              item.date,
            ]
          )
        }
      }
      for (const item of resolved.filter((entry) => !entry.isWorkday)) {
        await conn.execute(
          `UPDATE attendance_classification_details
              SET shift_assignment_id=?,attendance_record_id=NULL,
                  outcome='SKIPPED_NON_WORKDAY',notes='Hari nonkerja dilewati otomatis.',
                  updated_by=? WHERE request_id=? AND business_date=?`,
          [item.assignment.id, auth.id, classification.id, item.date]
        )
      }
      await conn.execute(
        `UPDATE attendance_classification_requests
            SET approval_status='APPROVED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP(3),
                review_notes=?,updated_by=? WHERE id=?`,
        [auth.id, input.reviewNotes ?? null, auth.id, classification.id]
      )
      const appliedCount = workdays.length
      const skippedCount = resolved.length - appliedCount
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: classification.site_id,
          action: 'APPROVE',
          table: 'attendance_classification_requests',
          recordId: classification.id,
          recordUid: uid,
          description: `Menyetujui klasifikasi Attendance: ${appliedCount} hari diterapkan, ${skippedCount} hari nonkerja dilewati.`,
          reason: classification.reason,
          beforeData: { approvalStatus: 'PENDING' },
          afterData: {
            approvalStatus: 'APPROVED',
            appliedCount,
            skippedCount,
          },
        },
        conn
      )
      await conn.commit()
      res.json({ uid, approvalStatus: 'APPROVED', appliedCount, skippedCount })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)
