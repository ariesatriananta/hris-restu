import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import type { QueryError, ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import {
  canClockInExistingAttendance,
  hashDeviceSecret,
  isoWeekday,
  selectClosestShiftEnd,
  selectSingleOpenAttendance,
  shiftBusinessDate,
  terminalScanInput,
} from '../lib/attendance-device-policy.js'
import { deriveAttendanceQuality } from '../lib/attendance-correction-policy.js'
import { ApiError } from '../lib/errors.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

type ScanInput = ReturnType<typeof terminalScanInput.parse>
type ScanContext = {
  deviceId: number
  siteId: number
  actorId: number
  employeeId?: number | null
  attendanceRecordId?: number | null
}

type AttendanceContext = {
  id: number
  uid: string
  attendanceStatus: string
  clockInAt: unknown
  clockOutAt: unknown
}

type ShiftContext = {
  shiftId: number
  startTime: string
  endTime: string
  crossesMidnight: number
  lateToleranceMinutes: number
  earlyLeaveToleranceMinutes: number
}

type ShiftEndCandidate = Omit<ShiftContext, 'crossesMidnight'> & {
  effectiveFrom: string
  effectiveTo: string | null
  workDays: number[]
  crossesMidnight: boolean
}

function enforceSite(auth: AuthContext, site: string) {
  if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site perangkat ditolak.')
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

function requestMetadata(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
  }
}

async function insertScanEvent(
  conn: PoolConnection,
  req: Request,
  input: ScanInput,
  scanTimestamp: string,
  context: ScanContext,
  status: 'SUCCESS' | 'REJECTED' | 'ERROR',
  message: string
) {
  const metadata = requestMetadata(req)
  await conn.execute(
    `INSERT INTO attendance_scan_events
      (uid,attendance_record_id,employee_id,site_id,device_id,barcode_value,
       event_type,scanned_at,result_status,result_message,idempotency_key,
       ip_address,user_agent,created_by,updated_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      randomUUID(),
      context.attendanceRecordId ?? null,
      context.employeeId ?? null,
      context.siteId,
      context.deviceId,
      input.barcode,
      input.eventType,
      scanTimestamp,
      status,
      message.slice(0, 255),
      input.idempotencyKey,
      metadata.ipAddress,
      metadata.userAgent,
      context.actorId,
      context.actorId,
    ]
  )
}

async function attendanceResponse(
  conn: PoolConnection,
  attendanceRecordId: number,
  eventType: ScanInput['eventType'],
  scannedAt: string,
  message: string,
  duplicate: boolean
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT ar.uid,DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
            DATE_FORMAT(ar.clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00') clockInAt,
            DATE_FORMAT(ar.clock_out_at,'%Y-%m-%dT%H:%i:%s+07:00') clockOutAt,
            ar.late_minutes lateMinutes,ar.early_leave_minutes earlyLeaveMinutes,
            ar.worked_minutes workedMinutes,ar.attendance_status attendanceStatus,
            DATE_FORMAT(NOW(3),'%Y-%m-%d %H:%i:%s') asOf,
            DATE_FORMAT(
              CASE WHEN sh.crosses_midnight=1
                   THEN DATE_ADD(TIMESTAMP(ar.business_date,sh.end_time),INTERVAL 1 DAY)
                   ELSE TIMESTAMP(ar.business_date,sh.end_time) END,
              '%Y-%m-%d %H:%i:%s') scheduledEndAt,
            e.uid employeeUid,
            e.employee_number employeeNumber,e.full_name fullName
       FROM attendance_records ar
       JOIN employees e ON e.id=ar.employee_id
       LEFT JOIN shifts sh ON sh.id=ar.shift_id
      WHERE ar.id=?`,
    [attendanceRecordId]
  )
  const row = rows[0]
  if (!row) throw new ApiError(500, 'Hasil Attendance tidak dapat dimuat.')
  const quality = deriveAttendanceQuality({
    attendanceStatus: String(row.attendanceStatus),
    clockInAt: row.clockInAt,
    clockOutAt: row.clockOutAt,
    scheduledEndAt: row.scheduledEndAt,
    asOf: row.asOf,
  })
  const warnings = quality.abnormalReasons.map((reason) => ({
    code: reason,
    message:
      reason === 'MISSING_CLOCK_IN'
        ? 'Clock out tersimpan, tetapi clock in belum tercatat. Ajukan koreksi ke HR.'
        : 'Clock in tersimpan, tetapi clock out belum tercatat. Ajukan koreksi ke HR.',
  }))
  return {
    result: 'SUCCESS' as const,
    duplicate,
    eventType,
    businessDate: row.businessDate,
    scannedAt,
    message,
    warnings,
    employee: {
      uid: row.employeeUid,
      employeeNumber: row.employeeNumber,
      fullName: row.fullName,
    },
    attendance: {
      uid: row.uid,
      clockInAt: row.clockInAt ?? null,
      clockOutAt: row.clockOutAt ?? null,
      lateMinutes: Number(row.lateMinutes ?? 0),
      earlyLeaveMinutes: Number(row.earlyLeaveMinutes ?? 0),
      workedMinutes:
        row.workedMinutes === null || row.workedMinutes === undefined
          ? null
          : Number(row.workedMinutes),
      ...quality,
    },
  }
}

export const attendanceTerminalRouter = Router()

attendanceTerminalRouter.post(
  '/terminal/scan',
  requirePermission('attendance.scan'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    let input: ScanInput | undefined
    let scanTimestamp: string | undefined
    let eventContext: ScanContext | undefined
    try {
      input = terminalScanInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const deviceToken = req.get('X-Attendance-Device-Token')?.trim()
      if (!deviceToken || deviceToken.length < 40 || deviceToken.length > 200) {
        throw new ApiError(401, 'Token perangkat Attendance tidak valid.')
      }

      await conn.beginTransaction()
      const [timeRows] = await conn.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(NOW(3),'%Y-%m-%d %H:%i:%s.%f') scanTimestamp,
                DATE_FORMAT(NOW(3),'%Y-%m-%dT%H:%i:%s+07:00') scannedAt,
                DATE_FORMAT(CURDATE(),'%Y-%m-%d') currentDate,
                DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 1 DAY),'%Y-%m-%d') previousDate,
                TIME_FORMAT(CURTIME(3),'%H:%i:%s') currentTime`
      )
      const time = timeRows[0]
      const scanTime = String(time.scanTimestamp)
      scanTimestamp = scanTime

      const [deviceRows] = await conn.query<RowDataPacket[]>(
        `SELECT d.id,d.uid,d.code,d.name,d.site_id siteId,d.is_active isActive,
                s.code site
           FROM scan_devices d
           JOIN sites s ON s.id=d.site_id
          WHERE d.device_token_hash=?
          FOR UPDATE`,
        [hashDeviceSecret(deviceToken)]
      )
      const device = deviceRows[0]
      if (!device || Number(device.isActive) !== 1) {
        throw new ApiError(401, 'Perangkat Attendance tidak aktif atau belum terdaftar.')
      }
      enforceSite(auth, device.site)
      eventContext = {
        deviceId: device.id,
        siteId: device.siteId,
        actorId: auth.id,
      }

      const [existingEvents] = await conn.query<RowDataPacket[]>(
        `SELECT ase.device_id deviceId,ase.attendance_record_id attendanceRecordId,
                ase.barcode_value barcode,ase.event_type eventType,
                ase.result_status resultStatus,ase.result_message resultMessage,
                DATE_FORMAT(ase.scanned_at,'%Y-%m-%dT%H:%i:%s+07:00') scannedAt
           FROM attendance_scan_events ase
          WHERE ase.idempotency_key=?
          FOR UPDATE`,
        [input.idempotencyKey]
      )
      const existingEvent = existingEvents[0]
      if (existingEvent) {
        if (
          Number(existingEvent.deviceId) !== Number(device.id) ||
          existingEvent.barcode !== input.barcode ||
          existingEvent.eventType !== input.eventType
        ) {
          throw new ApiError(409, 'Idempotency key sudah dipakai untuk scan lain.')
        }
        await conn.execute(
          'UPDATE scan_devices SET last_seen_at=?,updated_by=? WHERE id=?',
          [scanTime, auth.id, device.id]
        )
        await conn.commit()
        if (
          existingEvent.resultStatus === 'SUCCESS' &&
          existingEvent.attendanceRecordId
        ) {
          return res.json(
            await attendanceResponse(
              conn,
              Number(existingEvent.attendanceRecordId),
              input.eventType,
              existingEvent.scannedAt,
              existingEvent.resultMessage,
              true
            )
          )
        }
        return res
          .status(existingEvent.resultStatus === 'REJECTED' ? 422 : 500)
          .json({
            result: existingEvent.resultStatus,
            duplicate: true,
            eventType: input.eventType,
            message: existingEvent.resultMessage,
            idempotencyKey: input.idempotencyKey,
          })
      }

      const reject = async (message: string) => {
        if (!input || !eventContext) return
        await insertScanEvent(
          conn,
          req,
          input,
          scanTime,
          eventContext,
          'REJECTED',
          message
        )
        await conn.execute(
          'UPDATE scan_devices SET last_seen_at=?,updated_by=? WHERE id=?',
          [scanTime, auth.id, device.id]
        )
        await conn.commit()
        res.status(422).json({
          result: 'REJECTED',
          duplicate: false,
          eventType: input.eventType,
          message,
          idempotencyKey: input.idempotencyKey,
        })
      }

      const [employeeRows] = await conn.query<RowDataPacket[]>(
        `SELECT e.id,e.uid,e.employee_number employeeNumber,e.full_name fullName,
                es.code employeeStatus,es.allows_attendance allowsAttendance,
                s.id siteId,s.code site
           FROM employees e
           JOIN employee_statuses es ON es.id=e.employee_status_id
           JOIN sites s ON s.id=e.current_site_id
          WHERE e.barcode=?
          FOR UPDATE`,
        [input.barcode]
      )
      const employee = employeeRows[0]
      if (!employee) return await reject('Barcode karyawan tidak dikenali.')
      eventContext.employeeId = employee.id
      if (
        employee.employeeStatus !== 'ACTIVE' ||
        Number(employee.allowsAttendance) !== 1
      ) {
        return await reject('Karyawan tidak aktif untuk Attendance.')
      }
      if (employee.site !== device.site) {
        return await reject('Karyawan tidak terdaftar pada site perangkat ini.')
      }

      let assignment: ShiftContext
      let attendance: AttendanceContext | undefined
      let businessDate: string

      if (input.eventType === 'CLOCK_OUT') {
        const [openRows] = await conn.query<RowDataPacket[]>(
          `SELECT ar.id,ar.uid,ar.attendance_status attendanceStatus,
                  ar.clock_in_at clockInAt,ar.clock_out_at clockOutAt,
                  DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
                  sh.id shiftId,sh.start_time startTime,sh.end_time endTime,
                  sh.crosses_midnight crossesMidnight,
                  sh.late_tolerance_minutes lateToleranceMinutes,
                  sh.early_leave_tolerance_minutes earlyLeaveToleranceMinutes
             FROM attendance_records ar
             JOIN shifts sh ON sh.id=ar.shift_id
            WHERE ar.employee_id=? AND ar.site_id=?
              AND ar.clock_in_at IS NOT NULL AND ar.clock_out_at IS NULL
              AND ar.business_date IN (?,?)
            ORDER BY ar.business_date DESC,ar.id DESC
            FOR UPDATE`,
          [employee.id, device.siteId, time.currentDate, time.previousDate]
        )
        if (openRows.length > 1) {
          return await reject(
            'Terdapat lebih dari satu Attendance terbuka. Hubungi HR untuk koreksi.'
          )
        }
        if (openRows.length) {
          const open = selectSingleOpenAttendance(openRows)
          attendance = {
            id: Number(open.id),
            uid: String(open.uid),
            attendanceStatus: String(open.attendanceStatus),
            clockInAt: open.clockInAt,
            clockOutAt: open.clockOutAt,
          }
          assignment = {
            shiftId: Number(open.shiftId),
            startTime: String(open.startTime),
            endTime: String(open.endTime),
            crossesMidnight: Number(open.crossesMidnight),
            lateToleranceMinutes: Number(open.lateToleranceMinutes),
            earlyLeaveToleranceMinutes: Number(open.earlyLeaveToleranceMinutes),
          }
          businessDate = String(open.businessDate)
        } else {
          const [assignmentRows] = await conn.query<RowDataPacket[]>(
            `SELECT DATE_FORMAT(esa.effective_from,'%Y-%m-%d') effectiveFrom,
                    DATE_FORMAT(esa.effective_to,'%Y-%m-%d') effectiveTo,
                    esa.work_days_json workDays,sh.id shiftId,
                    sh.start_time startTime,sh.end_time endTime,
                    sh.crosses_midnight crossesMidnight,
                    sh.late_tolerance_minutes lateToleranceMinutes,
                    sh.early_leave_tolerance_minutes earlyLeaveToleranceMinutes
               FROM employee_shift_assignments esa
               JOIN shifts sh ON sh.id=esa.shift_id
              WHERE esa.employee_id=? AND sh.site_id=? AND sh.is_active=1
                AND esa.effective_from<=?
                AND (esa.effective_to IS NULL OR esa.effective_to>=?)
              ORDER BY esa.effective_from DESC,esa.id DESC
              FOR UPDATE`,
            [employee.id, device.siteId, time.currentDate, time.previousDate]
          )
          let closest:
            | {
                assignment: ShiftEndCandidate
                businessDate: string
                distanceMs: number
              }
            | undefined
          try {
            closest = selectClosestShiftEnd({
              currentDate: String(time.currentDate),
              previousDate: String(time.previousDate),
              currentTime: String(time.currentTime),
              assignments: assignmentRows.map((candidate) => ({
                effectiveFrom: String(candidate.effectiveFrom),
                effectiveTo: candidate.effectiveTo
                  ? String(candidate.effectiveTo)
                  : null,
                workDays: parseWorkDays(candidate.workDays),
                shiftId: Number(candidate.shiftId),
                startTime: String(candidate.startTime),
                endTime: String(candidate.endTime),
                crossesMidnight: Number(candidate.crossesMidnight) === 1,
                lateToleranceMinutes: Number(candidate.lateToleranceMinutes),
                earlyLeaveToleranceMinutes: Number(
                  candidate.earlyLeaveToleranceMinutes
                ),
              })),
            })
          } catch (error) {
            if (error instanceof ApiError) return await reject(error.message)
            throw error
          }
          if (!closest) {
            return await reject('Tidak ada assignment Shift aktif pada hari kerja ini.')
          }
          const selected = closest.assignment
          assignment = {
            shiftId: Number(selected.shiftId),
            startTime: String(selected.startTime),
            endTime: String(selected.endTime),
            crossesMidnight: selected.crossesMidnight ? 1 : 0,
            lateToleranceMinutes: Number(selected.lateToleranceMinutes),
            earlyLeaveToleranceMinutes: Number(selected.earlyLeaveToleranceMinutes),
          }
          businessDate = closest.businessDate
          const [attendanceRows] = await conn.query<RowDataPacket[]>(
            `SELECT id,uid,attendance_status attendanceStatus,
                    clock_in_at clockInAt,clock_out_at clockOutAt
               FROM attendance_records
              WHERE employee_id=? AND business_date=?
              FOR UPDATE`,
            [employee.id, businessDate]
          )
          const row = attendanceRows[0]
          attendance = row
            ? {
                id: Number(row.id),
                uid: String(row.uid),
                attendanceStatus: String(row.attendanceStatus),
                clockInAt: row.clockInAt,
                clockOutAt: row.clockOutAt,
              }
            : undefined
        }
      } else {
        const [assignmentRows] = await conn.query<RowDataPacket[]>(
          `SELECT esa.id,DATE_FORMAT(esa.effective_from,'%Y-%m-%d') effectiveFrom,
                  DATE_FORMAT(esa.effective_to,'%Y-%m-%d') effectiveTo,
                  esa.work_days_json workDays,sh.id shiftId,sh.start_time startTime,
                  sh.end_time endTime,sh.crosses_midnight crossesMidnight,
                  sh.late_tolerance_minutes lateToleranceMinutes,
                  sh.early_leave_tolerance_minutes earlyLeaveToleranceMinutes
             FROM employee_shift_assignments esa
             JOIN shifts sh ON sh.id=esa.shift_id
            WHERE esa.employee_id=? AND sh.site_id=? AND sh.is_active=1
              AND esa.effective_from<=?
              AND (esa.effective_to IS NULL OR esa.effective_to>=?)
            ORDER BY esa.effective_from DESC,esa.id DESC
            FOR UPDATE`,
          [employee.id, device.siteId, time.currentDate, time.previousDate]
        )
        const assignments = assignmentRows.filter((candidate) => {
          const candidateDate = shiftBusinessDate({
            currentDate: time.currentDate,
            previousDate: time.previousDate,
            currentTime: time.currentTime,
            endTime: String(candidate.endTime),
            crossesMidnight: Number(candidate.crossesMidnight) === 1,
          })
          return (
            candidate.effectiveFrom <= candidateDate &&
            (!candidate.effectiveTo || candidate.effectiveTo >= candidateDate) &&
            parseWorkDays(candidate.workDays).includes(isoWeekday(candidateDate))
          )
        })
        if (!assignments.length) {
          return await reject('Tidak ada assignment Shift aktif pada hari kerja ini.')
        }
        if (assignments.length > 1) {
          return await reject('Assignment Shift karyawan bertumpang-tindih.')
        }
        const selected = assignments[0]
        assignment = {
          shiftId: Number(selected.shiftId),
          startTime: String(selected.startTime),
          endTime: String(selected.endTime),
          crossesMidnight: Number(selected.crossesMidnight),
          lateToleranceMinutes: Number(selected.lateToleranceMinutes),
          earlyLeaveToleranceMinutes: Number(selected.earlyLeaveToleranceMinutes),
        }
        businessDate = shiftBusinessDate({
          currentDate: time.currentDate,
          previousDate: time.previousDate,
          currentTime: time.currentTime,
          endTime: assignment.endTime,
          crossesMidnight: assignment.crossesMidnight === 1,
        })
        const [attendanceRows] = await conn.query<RowDataPacket[]>(
          `SELECT id,uid,attendance_status attendanceStatus,
                  clock_in_at clockInAt,clock_out_at clockOutAt
             FROM attendance_records
            WHERE employee_id=? AND business_date=?
            FOR UPDATE`,
          [employee.id, businessDate]
        )
        const row = attendanceRows[0]
        attendance = row
          ? {
              id: Number(row.id),
              uid: String(row.uid),
              attendanceStatus: String(row.attendanceStatus),
              clockInAt: row.clockInAt,
              clockOutAt: row.clockOutAt,
            }
          : undefined
      }

      if (input.eventType === 'CLOCK_IN') {
        if (
          attendance &&
          !canClockInExistingAttendance(attendance.attendanceStatus)
        ) {
          eventContext.attendanceRecordId = attendance.id
          return await reject(
            `Attendance berstatus ${attendance.attendanceStatus} dan hanya dapat diubah melalui koreksi HR.`
          )
        }
        if (attendance?.clockInAt) {
          eventContext.attendanceRecordId = attendance.id
          return await reject('Karyawan sudah melakukan clock in untuk Shift ini.')
        }
        if (attendance?.clockOutAt) {
          eventContext.attendanceRecordId = attendance.id
          return await reject('Catatan Attendance tidak valid dan perlu dikoreksi HR.')
        }
        const [metricRows] = await conn.query<RowDataPacket[]>(
          `SELECT GREATEST(0,TIMESTAMPDIFF(MINUTE,TIMESTAMP(?,?),?)) delayMinutes`,
          [businessDate, assignment.startTime, scanTime]
        )
        const delayMinutes = Number(metricRows[0].delayMinutes ?? 0)
        const lateMinutes =
          delayMinutes > Number(assignment.lateToleranceMinutes)
            ? delayMinutes
            : 0
        if (attendance) {
          await conn.execute(
            `UPDATE attendance_records
                SET shift_id=?,attendance_status='PRESENT',clock_in_at=?,
                    clock_in_device_id=?,clock_in_source='TERMINAL',late_minutes=?,
                    updated_by=?
              WHERE id=?`,
            [
              assignment.shiftId,
              scanTime,
              device.id,
              lateMinutes,
              auth.id,
              attendance.id,
            ]
          )
        } else {
          const attendanceUid = randomUUID()
          const [insertResult] = await conn.execute<ResultSetHeader>(
            `INSERT INTO attendance_records
              (uid,employee_id,site_id,shift_id,business_date,attendance_status,
               clock_in_at,clock_in_device_id,clock_in_source,late_minutes,
               created_by,updated_by)
             VALUES(?,?,?,?,?,'PRESENT',?,?,'TERMINAL',?,?,?)`,
            [
              attendanceUid,
              employee.id,
              device.siteId,
              assignment.shiftId,
              businessDate,
              scanTime,
              device.id,
              lateMinutes,
              auth.id,
              auth.id,
            ]
          )
          attendance = {
            id: insertResult.insertId,
            uid: attendanceUid,
            attendanceStatus: 'PRESENT',
            clockInAt: scanTime,
            clockOutAt: null,
          }
        }
      } else {
        if (attendance && attendance.attendanceStatus !== 'PRESENT') {
          eventContext.attendanceRecordId = attendance.id
          return await reject(
            `Attendance berstatus ${attendance.attendanceStatus} dan hanya dapat diubah melalui koreksi HR.`
          )
        }
        if (attendance?.clockOutAt) {
          eventContext.attendanceRecordId = attendance.id
          return await reject('Karyawan sudah melakukan clock out untuk Shift ini.')
        }
        const [metricRows] = await conn.query<RowDataPacket[]>(
          `SELECT GREATEST(0,TIMESTAMPDIFF(MINUTE,?,
                    ${assignment.crossesMidnight === 1 ? 'DATE_ADD(TIMESTAMP(?,?),INTERVAL 1 DAY)' : 'TIMESTAMP(?,?)'})) earlyMinutes`,
          [
            scanTime,
            businessDate,
            assignment.endTime,
          ]
        )
        const rawEarlyMinutes = Number(metricRows[0].earlyMinutes ?? 0)
        const earlyLeaveMinutes =
          rawEarlyMinutes > Number(assignment.earlyLeaveToleranceMinutes)
            ? rawEarlyMinutes
            : 0
        let workedMinutes: number | null = null
        if (attendance?.clockInAt) {
          const [workedRows] = await conn.query<RowDataPacket[]>(
            'SELECT GREATEST(0,TIMESTAMPDIFF(MINUTE,?,?)) workedMinutes',
            [attendance.clockInAt, scanTime]
          )
          workedMinutes = Number(workedRows[0].workedMinutes ?? 0)
        }
        if (attendance) {
          await conn.execute(
            `UPDATE attendance_records
                SET shift_id=?,attendance_status='PRESENT',clock_out_at=?,
                    clock_out_device_id=?,clock_out_source='TERMINAL',
                    early_leave_minutes=?,worked_minutes=?,updated_by=?
              WHERE id=?`,
            [
              assignment.shiftId,
              scanTime,
              device.id,
              earlyLeaveMinutes,
              workedMinutes,
              auth.id,
              attendance.id,
            ]
          )
        } else {
          const attendanceUid = randomUUID()
          const [insertResult] = await conn.execute<ResultSetHeader>(
            `INSERT INTO attendance_records
              (uid,employee_id,site_id,shift_id,business_date,attendance_status,
               clock_out_at,clock_out_device_id,clock_out_source,
               early_leave_minutes,worked_minutes,created_by,updated_by)
             VALUES(?,?,?,?,?,'PRESENT',?,?,'TERMINAL',?,?,?,?)`,
            [
              attendanceUid,
              employee.id,
              device.siteId,
              assignment.shiftId,
              businessDate,
              scanTime,
              device.id,
              earlyLeaveMinutes,
              null,
              auth.id,
              auth.id,
            ]
          )
          attendance = {
            id: insertResult.insertId,
            uid: attendanceUid,
            attendanceStatus: 'PRESENT',
            clockInAt: null,
            clockOutAt: scanTime,
          }
        }
      }

      eventContext.attendanceRecordId = attendance.id
      const successMessage = `${employee.fullName} berhasil ${input.eventType === 'CLOCK_IN' ? 'clock in' : 'clock out'}.`
      await insertScanEvent(
        conn,
        req,
        input,
        scanTime,
        eventContext,
        'SUCCESS',
        successMessage
      )
      await conn.execute(
        'UPDATE scan_devices SET last_seen_at=?,updated_by=? WHERE id=?',
        [scanTime, auth.id, device.id]
      )
      const response = await attendanceResponse(
        conn,
        attendance.id,
        input.eventType,
        time.scannedAt,
        successMessage,
        false
      )
      await conn.commit()
      res.json(response)
    } catch (error) {
      await conn.rollback()
      if (input && scanTimestamp && eventContext) {
        try {
          const fallback = await pool.getConnection()
          try {
            await insertScanEvent(
              fallback,
              req,
              input,
              scanTimestamp,
              eventContext,
              'ERROR',
              'Terjadi gangguan saat memproses scan.'
            )
          } finally {
            fallback.release()
          }
        } catch (logError) {
          if ((logError as QueryError).code !== 'ER_DUP_ENTRY') {
            // Error scan utama tetap menjadi respons; kegagalan audit tidak diekspos.
          }
        }
      }
      next(error)
    } finally {
      conn.release()
    }
  }
)
