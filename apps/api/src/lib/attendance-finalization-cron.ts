import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import { env } from '../config.js'
import { pool } from '../db.js'
import {
  finalizeAttendanceDay,
  getAttendanceFinalizationRequirement,
  hasDueAttendanceShift,
} from './attendance-finalization.js'
import {
  jakartaDateTime,
  previousBusinessDate,
  hasFinalizationBlockingIssues,
} from './attendance-finalization-policy.js'

const lockName = 'hris:attendance:daily-finalize'

export async function runAttendanceDailyFinalization(now = new Date()) {
  const conn = await pool.getConnection()
  const today = jakartaDateTime(now).slice(0, 10)
  let lockHeld = false
  let runUid: string | undefined
  try {
    const [locks] = await conn.query<RowDataPacket[]>('SELECT GET_LOCK(?,0) acquired', [lockName])
    lockHeld = Number(locks[0]?.acquired) === 1
    if (!lockHeld) {
      runUid = randomUUID()
      await conn.execute(
        `INSERT INTO cron_runs(uid,job_code,business_date,status,summary,started_at,finished_at)
         VALUES(?,'ATTENDANCE_DAILY_FINALIZE',?,'SKIPPED',?,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))`,
        [runUid, today, JSON.stringify({ reason: 'Finalisasi Attendance lain masih berjalan.' })]
      )
      return { runUid, businessDate: today, status: 'SKIPPED' as const, results: [] }
    }
    runUid = randomUUID()
    await conn.execute(
      `INSERT INTO cron_runs(uid,job_code,business_date,status,started_at)
       VALUES(?,'ATTENDANCE_DAILY_FINALIZE',?,'RUNNING',CURRENT_TIMESTAMP(3))`,
      [runUid, today]
    )
    const [sites] = await conn.query<RowDataPacket[]>('SELECT id,code FROM sites WHERE is_active=1 ORDER BY code')
    const dates = [previousBusinessDate(today), today].filter(
      (date) => date >= env.ATTENDANCE_GO_LIVE_DATE
    )
    const results: Array<Record<string, unknown>> = []
    let failed = 0
    for (const date of dates) {
      for (const site of sites) {
        try {
          const requirement = await getAttendanceFinalizationRequirement({
            siteId: Number(site.id),
            businessDate: date,
            executor: conn,
          })
          if (!requirement.required) {
            results.push({
              site: String(site.code),
              businessDate: date,
              status: 'SKIPPED',
              reason: 'Tanggal tidak memerlukan finalisasi.',
            })
            continue
          }
          const hasDue = await hasDueAttendanceShift({ siteId: Number(site.id), businessDate: date, now })
          if (!hasDue) {
            results.push({ site: String(site.code), businessDate: date, status: 'SKIPPED', reason: 'Belum melewati grace Shift.' })
            continue
          }
          const [latestRows] = await conn.query<RowDataPacket[]>(
            `SELECT status,summary FROM attendance_daily_finalization_runs
              WHERE site_id=? AND business_date=? ORDER BY id DESC LIMIT 1`,
            [site.id, date]
          )
          const latest = latestRows[0]
          let latestCounts: Record<string, number> = {}
          try {
            latestCounts = typeof latest?.summary === 'string' ? JSON.parse(latest.summary) : (latest?.summary ?? {})
          } catch {
            latestCounts = {}
          }
          if (latest?.status === 'SUCCEEDED' && !hasFinalizationBlockingIssues(latestCounts)) {
            results.push({ site: String(site.code), businessDate: date, status: 'SKIPPED', reason: 'Sudah final.' })
            continue
          }
          const result = await finalizeAttendanceDay({
            siteCode: String(site.code),
            businessDate: date,
            goLiveDate: env.ATTENDANCE_GO_LIVE_DATE,
            source: 'CRON',
            reason: 'Finalisasi harian otomatis.',
            now,
          })
          results.push({ site: result.site, businessDate: date, status: 'SUCCEEDED', counts: result.counts })
        } catch {
          failed += 1
          results.push({ site: String(site.code), businessDate: date, status: 'FAILED' })
        }
      }
    }
    const status = failed ? 'FAILED' : 'SUCCEEDED'
    await conn.execute(
      `UPDATE cron_runs SET status=?,summary=?,error_message=?,finished_at=CURRENT_TIMESTAMP(3) WHERE uid=?`,
      [status, JSON.stringify({ results, failed }), failed ? `${failed} finalisasi site/tanggal gagal.` : null, runUid]
    )
    return { runUid, businessDate: today, status, results }
  } catch (error) {
    if (runUid) {
      await conn.execute(
        `UPDATE cron_runs SET status='FAILED',error_message=?,finished_at=CURRENT_TIMESTAMP(3) WHERE uid=? AND status='RUNNING'`,
        ['Finalisasi Attendance otomatis gagal. Periksa log aplikasi.', runUid]
      ).catch(() => undefined)
    }
    throw error
  } finally {
    if (lockHeld) await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined)
    conn.release()
  }
}
