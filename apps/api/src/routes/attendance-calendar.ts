import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import { resolveAttendanceCalendarDay } from '../lib/attendance-calendar.js'
import {
  attendanceCalendarCancelInput,
  attendanceCalendarSiteRuleInput,
  attendanceCalendarSiteRuleUpdateInput,
  attendanceCalendarTypes,
  attendanceCollectiveLeaveSitesInput,
} from '../lib/attendance-calendar-policy.js'
import { jakartaBusinessDate } from '../lib/attendance-shift-policy.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const routeParam = (value: string | string[]) =>
  Array.isArray(value) ? value[0] : value

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

function enforceSite(auth: AuthContext, site: string) {
  if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

async function getSitesForUpdate(
  conn: PoolConnection,
  siteCodes: string[]
) {
  if (!siteCodes.length) return []
  const [sites] = await conn.query<RowDataPacket[]>(
    `SELECT id,code FROM sites
      WHERE is_active=1 AND code IN (${siteCodes.map(() => '?').join(',')})
      FOR UPDATE`,
    siteCodes
  )
  if (sites.length !== siteCodes.length) {
    throw new ApiError(422, 'Satu atau lebih site tidak valid atau tidak aktif.')
  }
  return sites
}

async function guardRuleHistory(
  conn: PoolConnection,
  siteId: number,
  businessDate: string
) {
  if (businessDate < jakartaBusinessDate()) {
    throw new ApiError(409, 'Aturan kalender historis tidak dapat diubah.')
  }
  const [attendance] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM attendance_records
      WHERE site_id=? AND business_date=? LIMIT 1 FOR UPDATE`,
    [siteId, businessDate]
  )
  if (attendance[0]) {
    throw new ApiError(409, 'Aturan kalender sudah dipakai Attendance.')
  }
  const [classification] = await conn.query<RowDataPacket[]>(
    `SELECT acd.id FROM attendance_classification_details acd
      JOIN attendance_classification_requests acr ON acr.id=acd.request_id
     WHERE acr.site_id=? AND acd.business_date=?
       AND acr.approval_status='APPROVED' LIMIT 1 FOR UPDATE`,
    [siteId, businessDate]
  )
  if (classification[0]) {
    throw new ApiError(409, 'Aturan kalender sudah dipakai klasifikasi Attendance.')
  }
  const [payroll] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM payroll_periods
      WHERE site_id=? AND status='CLOSED'
        AND ? BETWEEN period_start AND period_end LIMIT 1 FOR UPDATE`,
    [siteId, businessDate]
  )
  if (payroll[0]) {
    throw new ApiError(409, 'Aturan kalender menyentuh payroll yang sudah closing.')
  }
}

async function getSiteRuleForUpdate(conn: PoolConnection, uid: string) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT acsr.*,DATE_FORMAT(acsr.business_date,'%Y-%m-%d') businessDate,
            s.code site
       FROM attendance_calendar_site_rules acsr
       JOIN sites s ON s.id=acsr.site_id
      WHERE acsr.uid=? FOR UPDATE`,
    [uid]
  )
  if (!rows[0]) throw new ApiError(404, 'Aturan kalender tidak ditemukan.')
  return rows[0]
}

export const attendanceCalendarRouter = Router()

attendanceCalendarRouter.get(
  '/work-calendar',
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const dateFrom = z.string().date().parse(req.query.dateFrom)
      const dateTo = z.string().date().parse(req.query.dateTo)
      if (dateTo < dateFrom) {
        throw new ApiError(422, 'Tanggal akhir tidak boleh sebelum tanggal awal.')
      }
      const selectedSites = String(req.query.site ?? '')
        .split(',')
        .filter(Boolean)
      const visibleSites = auth.roles.includes('SUPER_ADMIN')
        ? selectedSites
        : selectedSites.length
          ? selectedSites.filter((site) => auth.siteAccess.includes(site))
          : auth.siteAccess
      if (
        !auth.roles.includes('SUPER_ADMIN') &&
        selectedSites.some((site) => !auth.siteAccess.includes(site))
      ) {
        throw new ApiError(403, 'Akses site ditolak.')
      }
      const types = listFilter(req.query.type, attendanceCalendarTypes)
      const query = String(req.query.query ?? '').trim()
      const restrictVisibleSites = visibleSites.length > 0
      const siteRuleVisibility = restrictVisibleSites
        ? `AND sr.site_id IN (${visibleSites.map(() => '?').join(',')})`
        : auth.roles.includes('SUPER_ADMIN')
          ? ''
          : 'AND 1=0'
      const attendanceVisibility = restrictVisibleSites
        ? `AND ar.site_id IN (${visibleSites.map(() => '?').join(',')})`
        : auth.roles.includes('SUPER_ADMIN')
          ? ''
          : 'AND 1=0'
      const unionValues = restrictVisibleSites
        ? [...visibleSites, ...visibleSites]
        : []
      const where = ['calendarDate BETWEEN ? AND ?']
      const values: unknown[] = [dateFrom, dateTo]
      if (query) {
        where.push('name LIKE ?')
        values.push(`%${query}%`)
      }
      if (types.length) {
        where.push(`calendarType IN (${types.map(() => '?').join(',')})`)
        values.push(...types)
      }
      if (visibleSites.length) {
        where.push(
          `(scope<>'SITE' OR siteCode IN (${visibleSites.map(() => '?').join(',')}))`
        )
        values.push(...visibleSites)
      } else if (!auth.roles.includes('SUPER_ADMIN')) {
        where.push("scope<>'SITE'")
      }
      const union = `
        SELECT ace.uid,ace.event_type calendarType,
               DATE_FORMAT(ace.event_date,'%Y-%m-%d') calendarDate,ace.name,
               CASE WHEN ace.event_type='NATIONAL_HOLIDAY' THEN 'GLOBAL' ELSE 'CATALOG' END scope,
               NULL siteCode,ace.source_document sourceDocument,ace.source_url sourceUrl,
               ace.cancelled_at cancelledAt,ace.created_at createdAt,ace.updated_at updatedAt,
               (SELECT GROUP_CONCAT(s.code ORDER BY s.code SEPARATOR ',')
                  FROM attendance_calendar_site_rules sr JOIN sites s ON s.id=sr.site_id
                 WHERE sr.calendar_event_id=ace.id AND sr.rule_type='COLLECTIVE_LEAVE'
                   AND sr.cancelled_at IS NULL ${siteRuleVisibility}) siteCodes,
               (SELECT COUNT(*) FROM attendance_records ar
                 WHERE ar.business_date=ace.event_date
                   ${attendanceVisibility}
                   AND (ace.event_type='NATIONAL_HOLIDAY' OR EXISTS(
                     SELECT 1 FROM attendance_calendar_site_rules csr
                      WHERE csr.calendar_event_id=ace.id AND csr.site_id=ar.site_id
                        AND csr.cancelled_at IS NULL))) attendanceCount
          FROM attendance_calendar_events ace
        UNION ALL
        SELECT acsr.uid,acsr.rule_type calendarType,
               DATE_FORMAT(acsr.business_date,'%Y-%m-%d') calendarDate,acsr.name,
               'SITE' scope,s.code siteCode,NULL sourceDocument,NULL sourceUrl,
               acsr.cancelled_at cancelledAt,acsr.created_at createdAt,acsr.updated_at updatedAt,
               s.code siteCodes,
               (SELECT COUNT(*) FROM attendance_records ar
                 WHERE ar.site_id=acsr.site_id AND ar.business_date=acsr.business_date) attendanceCount
          FROM attendance_calendar_site_rules acsr
          JOIN sites s ON s.id=acsr.site_id
         WHERE acsr.rule_type IN ('SITE_HOLIDAY','WORKDAY_OVERRIDE')`
      const clause = where.join(' AND ')
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total FROM (${union}) calendar WHERE ${clause}`,
        [...unionValues, ...values]
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${union}) calendar WHERE ${clause}
          ORDER BY calendarDate,calendarType,uid LIMIT ? OFFSET ?`,
        [...unionValues, ...values, pageSize, (page - 1) * pageSize]
      )
      res.json({
        items: rows.map((row) => {
          const sites = row.siteCodes ? String(row.siteCodes).split(',') : []
          const cancelled = Boolean(row.cancelledAt)
          return {
            uid: row.uid,
            calendarType: row.calendarType,
            businessDate: row.calendarDate,
            name: row.name,
            scope: row.scope,
            sites,
            sourceDocument: row.sourceDocument,
            sourceUrl: row.sourceUrl,
            isReadOnly: row.scope !== 'SITE',
            status: cancelled ? 'CANCELLED' : 'ACTIVE',
            effectiveStatus: cancelled
              ? 'CANCELLED'
              : row.scope === 'GLOBAL'
                ? 'GLOBAL_ACTIVE'
                : row.scope === 'CATALOG'
                  ? sites.length
                    ? 'SELECTED'
                    : 'NOT_SELECTED'
                  : 'SITE_ACTIVE',
            attendanceCount: Number(row.attendanceCount ?? 0),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
        }),
        total: Number(countRows[0].total),
        page,
        pageSize,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceCalendarRouter.get(
  '/work-calendar/resolve',
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN']).parse(req.query.siteCode)
      const businessDate = z.string().date().parse(req.query.businessDate)
      enforceSite(auth, siteCode)
      const [sites] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM sites WHERE code=? AND is_active=1',
        [siteCode]
      )
      if (!sites[0]) throw new ApiError(404, 'Site tidak ditemukan.')
      const calendar = await resolveAttendanceCalendarDay({
        siteId: Number(sites[0].id),
        businessDate,
        scheduledByShift: false,
      })
      const hasRule = !['WEEKLY_OFF', 'SHIFT_WEEKDAY'].includes(calendar.reasonType)
      res.json({
        businessDate,
        siteCode,
        calendarType: hasRule ? calendar.reasonType : null,
        dayType: hasRule ? calendar.dayType : null,
        name: calendar.name,
        eventUid: calendar.eventUid,
        siteRuleUid: calendar.siteRuleUid,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceCalendarRouter.post(
  '/work-calendar',
  requirePermission('attendance.manage_calendar'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = attendanceCalendarSiteRuleInput.parse(req.body)
      if (input.businessDate < jakartaBusinessDate()) {
        throw new ApiError(422, 'Aturan kalender hanya dapat dibuat untuk hari ini atau masa depan.')
      }
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.siteCode)
      await conn.beginTransaction()
      const sites = await getSitesForUpdate(conn, [input.siteCode])
      await guardRuleHistory(conn, Number(sites[0].id), input.businessDate)
      const uid = randomUUID()
      await conn.execute(
        `INSERT INTO attendance_calendar_site_rules
          (uid,site_id,business_date,rule_type,name,reason,created_by,updated_by)
         VALUES(?,?,?,?,?,?,?,?)`,
        [uid, sites[0].id, input.businessDate, input.calendarType, input.name, input.reason, auth.id, auth.id]
      )
      await writeAudit({ auth, request: req, module: 'ATTENDANCE', siteId: Number(sites[0].id), action: 'CREATE', table: 'attendance_calendar_site_rules', recordUid: uid, description: `Menambah ${input.calendarType} ${input.businessDate}.`, reason: input.reason, afterData: input }, conn)
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

attendanceCalendarRouter.patch(
  '/work-calendar/:uid',
  requirePermission('attendance.manage_calendar'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = attendanceCalendarSiteRuleUpdateInput.parse(req.body)
      const uid = routeParam(req.params.uid)
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const rule = await getSiteRuleForUpdate(conn, uid)
      enforceSite(auth, rule.site)
      if (rule.rule_type === 'COLLECTIVE_LEAVE') throw new ApiError(409, 'Cuti bersama dikelola melalui pemilihan site.')
      if (rule.cancelled_at) throw new ApiError(409, 'Aturan kalender sudah dibatalkan.')
      await guardRuleHistory(conn, Number(rule.site_id), String(rule.businessDate))
      await conn.execute('UPDATE attendance_calendar_site_rules SET name=?,reason=?,updated_by=? WHERE id=?', [input.name, input.reason, auth.id, rule.id])
      await writeAudit({ auth, request: req, module: 'ATTENDANCE', siteId: Number(rule.site_id), action: 'UPDATE', table: 'attendance_calendar_site_rules', recordId: Number(rule.id), recordUid: uid, description: `Memperbarui aturan kalender ${rule.businessDate}.`, reason: input.reason, beforeData: { name: rule.name, reason: rule.reason }, afterData: input }, conn)
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

attendanceCalendarRouter.post(
  '/work-calendar/:uid/cancel',
  requirePermission('attendance.manage_calendar'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = attendanceCalendarCancelInput.parse(req.body)
      const uid = routeParam(req.params.uid)
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const rule = await getSiteRuleForUpdate(conn, uid)
      enforceSite(auth, rule.site)
      if (rule.rule_type === 'COLLECTIVE_LEAVE') throw new ApiError(409, 'Cuti bersama dikelola melalui pemilihan site.')
      if (rule.cancelled_at) throw new ApiError(409, 'Aturan kalender sudah dibatalkan.')
      await guardRuleHistory(conn, Number(rule.site_id), String(rule.businessDate))
      await conn.execute(`UPDATE attendance_calendar_site_rules SET cancelled_at=CURRENT_TIMESTAMP(3),cancelled_by=?,cancellation_reason=?,updated_by=? WHERE id=?`, [auth.id, input.reason, auth.id, rule.id])
      await writeAudit({ auth, request: req, module: 'ATTENDANCE', siteId: Number(rule.site_id), action: 'UPDATE', table: 'attendance_calendar_site_rules', recordId: Number(rule.id), recordUid: uid, description: `Membatalkan aturan kalender ${rule.businessDate}.`, reason: input.reason, beforeData: { status: 'ACTIVE' }, afterData: { status: 'CANCELLED' } }, conn)
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

attendanceCalendarRouter.put(
  '/work-calendar/collective-leave/:eventUid/sites',
  requirePermission('attendance.manage_calendar'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = attendanceCollectiveLeaveSitesInput.parse(req.body)
      const eventUid = routeParam(req.params.eventUid)
      const auth = res.locals.auth as AuthContext
      input.siteCodes.forEach((site) => enforceSite(auth, site))
      await conn.beginTransaction()
      const [events] = await conn.query<RowDataPacket[]>(
        `SELECT id,uid,name,DATE_FORMAT(event_date,'%Y-%m-%d') businessDate
           FROM attendance_calendar_events
          WHERE uid=? AND event_type='COLLECTIVE_LEAVE' AND cancelled_at IS NULL
          FOR UPDATE`,
        [eventUid]
      )
      const event = events[0]
      if (!event) throw new ApiError(404, 'Katalog cuti bersama tidak ditemukan.')
      if (event.businessDate < jakartaBusinessDate()) throw new ApiError(409, 'Pemilihan site untuk cuti bersama historis tidak dapat diubah.')
      const currentScope = auth.roles.includes('SUPER_ADMIN')
        ? { sql: '', params: [] as string[] }
        : {
            sql: `AND s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`,
            params: auth.siteAccess,
          }
      const [currentRows] = await conn.query<RowDataPacket[]>(
        `SELECT acsr.*,s.code site,DATE_FORMAT(acsr.business_date,'%Y-%m-%d') businessDate
           FROM attendance_calendar_site_rules acsr JOIN sites s ON s.id=acsr.site_id
          WHERE acsr.calendar_event_id=? AND acsr.rule_type='COLLECTIVE_LEAVE'
            AND acsr.cancelled_at IS NULL ${currentScope.sql} FOR UPDATE`,
        [event.id, ...currentScope.params]
      )
      currentRows.forEach((row) => enforceSite(auth, String(row.site)))
      const sites = await getSitesForUpdate(conn, input.siteCodes)
      const desired = new Set<string>(input.siteCodes)
      for (const current of currentRows) {
        if (!desired.has(String(current.site))) {
          await guardRuleHistory(conn, Number(current.site_id), String(current.businessDate))
          await conn.execute(`UPDATE attendance_calendar_site_rules SET cancelled_at=CURRENT_TIMESTAMP(3),cancelled_by=?,cancellation_reason=?,updated_by=? WHERE id=?`, [auth.id, input.reason, auth.id, current.id])
        }
      }
      const currentCodes = new Set(currentRows.map((row) => String(row.site)))
      for (const site of sites) {
        if (!currentCodes.has(String(site.code))) {
          await guardRuleHistory(conn, Number(site.id), String(event.businessDate))
          await conn.execute(
            `INSERT INTO attendance_calendar_site_rules
              (uid,site_id,business_date,rule_type,calendar_event_id,name,reason,created_by,updated_by)
             VALUES(?,?,?,'COLLECTIVE_LEAVE',?,?,?,?,?)`,
            [randomUUID(), site.id, event.businessDate, event.id, event.name, input.reason, auth.id, auth.id]
          )
        }
      }
      await writeAudit({ auth, request: req, module: 'ATTENDANCE', action: 'UPDATE', table: 'attendance_calendar_events', recordId: Number(event.id), recordUid: eventUid, description: `Memperbarui site cuti bersama ${event.businessDate}.`, reason: input.reason, beforeData: { siteCodes: [...currentCodes] }, afterData: { siteCodes: input.siteCodes } }, conn)
      await conn.commit()
      res.json({ eventUid, sites: input.siteCodes })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)
