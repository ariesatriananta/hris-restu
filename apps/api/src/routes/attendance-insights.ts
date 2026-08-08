import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { pool } from '../db.js'
import { jakartaBusinessDate } from '../lib/attendance-shift-policy.js'
import { ApiError } from '../lib/errors.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCodes = ['JEPARA', 'SEMARANG', 'KLATEN'] as const
const routeParam = (value: string | string[]) =>
  Array.isArray(value) ? value[0] : value

function enforceSite(auth: AuthContext, site: string) {
  if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

function requestedSites(raw: unknown) {
  const values = Array.isArray(raw)
    ? raw.flatMap((item) => String(item).split(','))
    : String(raw ?? '').split(',')
  return [
    ...new Set(
      values.filter((value): value is (typeof siteCodes)[number] =>
        siteCodes.some((site) => site === value)
      )
    ),
  ]
}

export const attendanceInsightsRouter = Router()

attendanceInsightsRouter.get(
  '/readiness',
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const requested = requestedSites(req.query.site)
      requested.forEach((site) => enforceSite(auth, site))
      const visible = auth.roles.includes('SUPER_ADMIN')
        ? requested
        : requested.length
          ? requested
          : auth.siteAccess.filter((site) =>
              siteCodes.some((siteCode) => siteCode === site)
            )
      const where = ['s.is_active=1']
      const values: unknown[] = []
      if (visible.length) {
        where.push(`s.code IN (${visible.map(() => '?').join(',')})`)
        values.push(...visible)
      } else if (!auth.roles.includes('SUPER_ADMIN')) {
        where.push('1=0')
      }
      const today = jakartaBusinessDate()
      const year = Number(today.slice(0, 4))
      const [sites] = await pool.query<RowDataPacket[]>(
        `SELECT s.id,s.code site,s.name siteName FROM sites s
          WHERE ${where.join(' AND ')} ORDER BY s.code`,
        values
      )
      const [calendarRows] = await pool.query<RowDataPacket[]>(
        `SELECT
           SUM(event_type='NATIONAL_HOLIDAY') nationalHolidayCount,
           SUM(event_type='COLLECTIVE_LEAVE') collectiveLeaveAvailableCount
         FROM attendance_calendar_events
        WHERE cancelled_at IS NULL AND YEAR(event_date)=?`,
        [year]
      )
      const nationalHolidayCount = Number(
        calendarRows[0]?.nationalHolidayCount ?? 0
      )
      const collectiveLeaveAvailableCount = Number(
        calendarRows[0]?.collectiveLeaveAvailableCount ?? 0
      )
      const items = await Promise.all(
        sites.map(async (site) => {
          const [shiftRows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) eligibleEmployeeCount,
                    SUM(validAssignmentCount=0) withoutAssignmentCount,
                    SUM(validAssignmentCount>1) ambiguousAssignmentCount
               FROM (
                 SELECT e.id,
                   (SELECT COUNT(*) FROM employee_shift_assignments esa
                     JOIN shifts sh ON sh.id=esa.shift_id
                    WHERE esa.employee_id=e.id AND esa.effective_from<=?
                      AND (esa.effective_to IS NULL OR esa.effective_to>=?)
                      AND sh.site_id=h.site_id
                      AND JSON_LENGTH(esa.work_days_json)>0) validAssignmentCount
                 FROM employee_employment_histories h
                 JOIN employees e ON e.id=h.employee_id
                 JOIN employee_statuses es ON es.id=h.employee_status_id
                WHERE h.site_id=? AND h.effective_from<=?
                  AND (h.effective_to IS NULL OR h.effective_to>=?)
                  AND es.allows_attendance=1
                GROUP BY e.id,h.site_id
               ) readiness`,
            [today, today, site.id, today, today]
          )
          const shift = shiftRows[0] ?? {}
          const eligibleEmployeeCount = Number(shift.eligibleEmployeeCount ?? 0)
          const withoutAssignmentCount = Number(
            shift.withoutAssignmentCount ?? 0
          )
          const ambiguousAssignmentCount = Number(
            shift.ambiguousAssignmentCount ?? 0
          )
          const [deviceRows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) totalCount,
                    SUM(activated_at IS NOT NULL AND device_token_hash IS NOT NULL) readyCount,
                    SUM(activated_at IS NULL OR device_token_hash IS NULL) notReadyCount
               FROM scan_devices WHERE site_id=? AND is_active=1`,
            [site.id]
          )
          const totalCount = Number(deviceRows[0]?.totalCount ?? 0)
          const readyCount = Number(deviceRows[0]?.readyCount ?? 0)
          const notReadyCount = Number(deviceRows[0]?.notReadyCount ?? 0)
          const [selectedRows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) selectedCount
               FROM attendance_calendar_site_rules
              WHERE site_id=? AND rule_type='COLLECTIVE_LEAVE'
                AND cancelled_at IS NULL AND YEAR(business_date)=?`,
            [site.id, year]
          )
          const [rerunRows] = await pool.query<RowDataPacket[]>(
            `SELECT COUNT(*) rerunRequiredCount FROM attendance_daily_finalization_runs latest
              WHERE latest.site_id=? AND latest.business_date<=?
                AND latest.id=(SELECT MAX(previous.id)
                  FROM attendance_daily_finalization_runs previous
                 WHERE previous.site_id=latest.site_id
                   AND previous.business_date=latest.business_date)
                AND latest.status='SKIPPED'
                AND (JSON_UNQUOTE(JSON_EXTRACT(latest.summary,'$.invalidatedByShiftCorrection'))='true'
                  OR JSON_UNQUOTE(JSON_EXTRACT(latest.summary,'$.invalidatedByFirstShiftBackdate'))='true'
                  OR JSON_UNQUOTE(JSON_EXTRACT(latest.summary,'$.invalidatedByOnboardingReset'))='true')`,
            [site.id, today]
          )
          const [pendingRows] = await pool.query<RowDataPacket[]>(
            `SELECT
                 (SELECT COUNT(*) FROM attendance_corrections ac
                   JOIN attendance_records ar ON ar.id=ac.attendance_record_id
                  WHERE ar.site_id=? AND ac.approval_status='PENDING') pendingCorrectionCount,
                 (SELECT COUNT(*) FROM attendance_classification_requests acr
                  WHERE acr.site_id=? AND acr.approval_status='PENDING') pendingClassificationCount`,
            [site.id, site.id]
          )
          const pendingCorrectionCount = Number(
            pendingRows[0]?.pendingCorrectionCount ?? 0
          )
          const pendingClassificationCount = Number(
            pendingRows[0]?.pendingClassificationCount ?? 0
          )
          const rerunRequiredCount = Number(
            rerunRows[0]?.rerunRequiredCount ?? 0
          )
          const calendarConfigured =
            nationalHolidayCount > 0 || collectiveLeaveAvailableCount > 0
          const pendingTotal =
            pendingCorrectionCount + pendingClassificationCount
          const deviceAttentionCount =
            readyCount > 0 ? notReadyCount : Math.max(1, notReadyCount)
          const attentionCount =
            withoutAssignmentCount +
            ambiguousAssignmentCount +
            deviceAttentionCount +
            (calendarConfigured ? 0 : 1) +
            rerunRequiredCount +
            pendingTotal
          return {
            site: String(site.site),
            siteName: String(site.siteName),
            shift: {
              eligibleEmployeeCount,
              withoutAssignmentCount,
              ambiguousAssignmentCount,
              ready:
                withoutAssignmentCount === 0 && ambiguousAssignmentCount === 0,
            },
            devices: {
              totalCount,
              readyCount,
              notReadyCount,
              hasReadyDevice: readyCount > 0,
            },
            calendar: {
              nationalHolidayCount,
              collectiveLeaveAvailableCount,
              collectiveLeaveSelectedCount: Number(
                selectedRows[0]?.selectedCount ?? 0
              ),
              evidenceStatus: calendarConfigured
                ? ('CONFIGURED' as const)
                : ('NOT_CONFIGURED' as const),
            },
            finalization: { rerunRequiredCount },
            followUp: {
              pendingCorrectionCount,
              pendingClassificationCount,
              totalCount: pendingTotal,
            },
            attentionCount,
          }
        })
      )
      res.json({
        asOfDate: today,
        calendarYear: year,
        items,
        totals: {
          siteCount: items.length,
          attentionCount: items.reduce(
            (sum, item) => sum + item.attentionCount,
            0
          ),
          withoutAssignmentCount: items.reduce(
            (sum, item) => sum + item.shift.withoutAssignmentCount,
            0
          ),
          notReadyDeviceCount: items.reduce(
            (sum, item) => sum + item.devices.notReadyCount,
            0
          ),
          finalizationRerunCount: items.reduce(
            (sum, item) => sum + item.finalization.rerunRequiredCount,
            0
          ),
          pendingFollowUpCount: items.reduce(
            (sum, item) => sum + item.followUp.totalCount,
            0
          ),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceInsightsRouter.get(
  '/records/:uid/timeline',
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      const [records] = await pool.query<RowDataPacket[]>(
        `SELECT ar.id,ar.uid,e.id employeeId,e.uid employeeUid,
                e.employee_number employeeNumber,e.full_name employeeName,
                s.id siteId,s.code site,DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
                ar.attendance_status status,sh.name shiftName
           FROM attendance_records ar
           JOIN employees e ON e.id=ar.employee_id
           JOIN sites s ON s.id=ar.site_id
           LEFT JOIN shifts sh ON sh.id=ar.shift_id
          WHERE ar.uid=?`,
        [uid]
      )
      const record = records[0]
      if (!record) throw new ApiError(404, 'Attendance tidak ditemukan.')
      enforceSite(auth, String(record.site))
      const [scanRows, correctionRows, classificationRows, finalizationRows] =
        await Promise.all([
          pool.query<RowDataPacket[]>(
            `SELECT ase.uid,ase.event_type eventType,ase.result_status status,
                    ase.result_message description,
                    DATE_FORMAT(ase.scanned_at,'%Y-%m-%dT%H:%i:%s+07:00') occurredAt,
                    d.uid deviceUid,d.code deviceCode,d.name deviceName
               FROM attendance_scan_events ase
               LEFT JOIN scan_devices d ON d.id=ase.device_id
              WHERE ase.attendance_record_id=? ORDER BY ase.scanned_at DESC,ase.id DESC`,
            [record.id]
          ),
          pool.query<RowDataPacket[]>(
            `SELECT ac.uid,ac.correction_type correctionType,ac.approval_status status,
                    ac.reason description,
                    DATE_FORMAT(ac.requested_at,'%Y-%m-%dT%H:%i:%s+07:00') occurredAt,
                    requester.full_name actorName,ac.review_notes reviewNotes
               FROM attendance_corrections ac
               JOIN users requester ON requester.id=ac.requested_by
              WHERE ac.attendance_record_id=? ORDER BY ac.requested_at DESC,ac.id DESC`,
            [record.id]
          ),
          pool.query<RowDataPacket[]>(
            `SELECT acr.uid,acr.classification_type classificationType,
                    acr.approval_status status,acr.reason description,
                    DATE_FORMAT(acr.requested_at,'%Y-%m-%dT%H:%i:%s+07:00') occurredAt,
                    requester.full_name actorName,acd.outcome detailOutcome
               FROM attendance_classification_details acd
               JOIN attendance_classification_requests acr ON acr.id=acd.request_id
               JOIN users requester ON requester.id=acr.requested_by
              WHERE acd.attendance_record_id=? OR
                    (acd.employee_id=? AND acd.business_date=?)
              ORDER BY acr.requested_at DESC,acr.id DESC`,
            [record.id, record.employeeId, record.businessDate]
          ),
          pool.query<RowDataPacket[]>(
            `SELECT afr.uid,afr.status,afr.reason description,
                    DATE_FORMAT(afr.started_at,'%Y-%m-%dT%H:%i:%s+07:00') occurredAt,
                    requester.full_name actorName,afr.trigger_type triggerType
               FROM attendance_daily_finalization_runs afr
               LEFT JOIN users requester ON requester.id=afr.requested_by
              WHERE afr.site_id=? AND afr.business_date=?
              ORDER BY afr.started_at DESC,afr.id DESC`,
            [record.siteId, record.businessDate]
          ),
        ])
      const items = [
        ...scanRows[0].map((row) => ({
          uid: String(row.uid),
          type: 'SCAN' as const,
          occurredAt: String(row.occurredAt),
          title: row.eventType === 'CLOCK_IN' ? 'Scan Masuk' : 'Scan Pulang',
          status: String(row.status),
          description: String(row.description ?? 'Aktivitas scan Attendance.'),
          metadata: {
            eventType: row.eventType,
            deviceUid: row.deviceUid ?? null,
            deviceCode: row.deviceCode ?? null,
            deviceName: row.deviceName ?? null,
          },
        })),
        ...correctionRows[0].map((row) => ({
          uid: String(row.uid),
          type: 'CORRECTION' as const,
          occurredAt: String(row.occurredAt),
          title: `Koreksi ${row.correctionType}`,
          status: String(row.status),
          description: String(row.description),
          actorName: String(row.actorName),
          metadata: { reviewNotes: row.reviewNotes ?? null },
        })),
        ...classificationRows[0].map((row) => ({
          uid: String(row.uid),
          type: 'CLASSIFICATION' as const,
          occurredAt: String(row.occurredAt),
          title: `Klasifikasi ${row.classificationType}`,
          status: String(row.status),
          description: String(row.description),
          actorName: String(row.actorName),
          metadata: { detailOutcome: row.detailOutcome },
        })),
        ...finalizationRows[0].map((row) => ({
          uid: String(row.uid),
          type: 'FINALIZATION' as const,
          occurredAt: String(row.occurredAt),
          title: 'Finalisasi Attendance',
          status: String(row.status),
          description: String(row.description),
          ...(row.actorName ? { actorName: String(row.actorName) } : {}),
          metadata: { triggerType: row.triggerType },
        })),
      ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      res.json({
        attendance: {
          uid: String(record.uid),
          employeeUid: String(record.employeeUid),
          employeeNumber: String(record.employeeNumber),
          employeeName: String(record.employeeName),
          site: String(record.site),
          businessDate: String(record.businessDate),
          status: String(record.status),
          shiftName: record.shiftName ? String(record.shiftName) : null,
        },
        items,
      })
    } catch (error) {
      next(error)
    }
  }
)
