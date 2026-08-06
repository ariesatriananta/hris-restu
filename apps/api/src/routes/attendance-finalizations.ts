import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import {
  finalizeAttendanceDay,
  hasDueAttendanceShift,
  type AttendanceFinalizationCounts,
} from '../lib/attendance-finalization.js'
import {
  attendanceFinalizationInput,
  canRunFinalization,
  finalizationStatus,
  jakartaDateTime,
} from '../lib/attendance-finalization-policy.js'
import { ApiError } from '../lib/errors.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const emptyCounts = (): AttendanceFinalizationCounts => ({
  eligible: 0,
  absent: 0,
  holiday: 0,
  preserved: 0,
  weeklyOff: 0,
  missingAssignment: 0,
  ambiguousAssignment: 0,
  ambiguousEmployment: 0,
  pendingDue: 0,
})
const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])

function parseObject<T>(value: unknown, fallback: T): T {
  if (!value) return fallback
  if (typeof value === 'object') return value as T
  try {
    return JSON.parse(String(value)) as T
  } catch {
    return fallback
  }
}

function enforceSite(auth: AuthContext, site: string) {
  if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

export const attendanceFinalizationsRouter = Router()

attendanceFinalizationsRouter.get(
  '/finalizations',
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const businessDate = z.string().date().parse(req.query.businessDate)
      const requestedSites = [
        ...new Set(
          z.array(siteCode).parse(
            String(req.query.site ?? '').split(',').filter(Boolean)
          )
        ),
      ]
      requestedSites.forEach((site) => enforceSite(auth, site))
      const scopeSites = auth.roles.includes('SUPER_ADMIN')
        ? requestedSites
        : requestedSites.length
          ? requestedSites
          : auth.siteAccess
      const where = ['s.is_active=1']
      const values: unknown[] = [businessDate]
      if (scopeSites.length) {
        where.push(`s.code IN (${scopeSites.map(() => '?').join(',')})`)
        values.push(...scopeSites)
      } else if (!auth.roles.includes('SUPER_ADMIN')) {
        where.push('1=0')
      }
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT s.id siteId,s.code site,r.uid,r.status rawStatus,r.trigger_type source,
                r.summary,r.warnings,r.error_message errorMessage,
                DATE_FORMAT(COALESCE(r.finished_at,r.started_at),'%Y-%m-%dT%H:%i:%s+07:00') lastRunAt
           FROM sites s
           LEFT JOIN attendance_daily_finalization_runs r ON r.id=(
             SELECT latest.id FROM attendance_daily_finalization_runs latest
              WHERE latest.site_id=s.id AND latest.business_date=?
              ORDER BY latest.id DESC LIMIT 1)
          WHERE ${where.join(' AND ')} ORDER BY s.code`,
        values
      )
      const today = jakartaDateTime().slice(0, 10)
      const items = await Promise.all(rows.map(async (row) => {
        const counts = {
          ...emptyCounts(),
          ...parseObject<Partial<AttendanceFinalizationCounts>>(row.summary, {}),
        }
        const warnings = parseObject<string[]>(row.warnings, [])
        const hasDueShift = await hasDueAttendanceShift({ siteId: Number(row.siteId), businessDate })
        const running = row.rawStatus === 'RUNNING'
        return {
          uid: row.uid ?? null,
          site: row.site,
          businessDate,
          status: finalizationStatus({ rawStatus: row.rawStatus, pendingDue: counts.pendingDue, blockingIssues: counts.missingAssignment + counts.ambiguousAssignment + counts.ambiguousEmployment }),
          lastRunAt: row.lastRunAt ?? null,
          source: row.source ?? null,
          counts,
          warnings,
          errorMessage: row.errorMessage ?? null,
          canRun: canRunFinalization({ businessDate, today, hasDueShift, running }),
        }
      }))
      res.json({ items })
    } catch (error) {
      next(error)
    }
  }
)

attendanceFinalizationsRouter.post(
  '/finalizations/run',
  requirePermission('attendance.finalize'),
  async (req, res, next) => {
    try {
      const input = attendanceFinalizationInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.siteCode)
      const [sites] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM sites WHERE code=? AND is_active=1',
        [input.siteCode]
      )
      if (!sites[0]) throw new ApiError(404, 'Site tidak ditemukan atau tidak aktif.')
      const now = new Date()
      const today = jakartaDateTime(now).slice(0, 10)
      const hasDueShift = await hasDueAttendanceShift({ siteId: Number(sites[0].id), businessDate: input.businessDate, now })
      if (!canRunFinalization({ businessDate: input.businessDate, today, hasDueShift })) {
        throw new ApiError(422, 'Tanggal belum dapat difinalisasi atau belum melewati grace Shift.')
      }
      const result = await finalizeAttendanceDay({ ...input, source: 'MANUAL', actor: auth, request: req, now })
      res.json({
        uid: result.uid,
        site: result.site,
        businessDate: result.businessDate,
        status: finalizationStatus({ rawStatus: result.rawStatus, pendingDue: result.counts.pendingDue, blockingIssues: result.counts.missingAssignment + result.counts.ambiguousAssignment + result.counts.ambiguousEmployment }),
        lastRunAt: result.finishedAt,
        source: result.source,
        counts: result.counts,
        warnings: result.warnings,
        errorMessage: null,
        canRun: true,
      })
    } catch (error) {
      next(error)
    }
  }
)
