import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import { paginationMeta } from '../lib/contract-lifecycle-policy.js'
import { authenticate, requirePermission } from '../middleware/authenticate.js'

const cronRunStatus = z.enum(['RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'])

export const systemRouter = Router()
systemRouter.use(authenticate)

systemRouter.get(
  '/cron-runs',
  requirePermission('audit.view'),
  async (req, res, next) => {
    try {
      const page = positiveInteger(req.query.page, 1)
      const pageSize = positiveInteger(req.query.pageSize, 50, 500)
      const status = req.query.status
        ? cronRunStatus.parse(req.query.status)
        : undefined
      const jobCode = String(req.query.jobCode ?? '').trim().slice(0, 50)
      const where: string[] = ['1=1']
      const values: unknown[] = []

      if (status) {
        where.push('status=?')
        values.push(status)
      }
      if (jobCode) {
        where.push('job_code=?')
        values.push(jobCode)
      }

      const predicate = where.join(' AND ')
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total FROM cron_runs WHERE ${predicate}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT uid,job_code jobCode,
                DATE_FORMAT(business_date,'%Y-%m-%d') businessDate,
                status,summary,error_message errorMessage,
                DATE_FORMAT(started_at,'%Y-%m-%dT%H:%i:%s+07:00') startedAt,
                DATE_FORMAT(finished_at,'%Y-%m-%dT%H:%i:%s+07:00') finishedAt,
                CASE WHEN finished_at IS NULL THEN NULL
                     ELSE ROUND(TIMESTAMPDIFF(MICROSECOND,started_at,finished_at)/1000)
                END durationMs
         FROM cron_runs
         WHERE ${predicate}
         ORDER BY started_at DESC,id DESC
         LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const [latestRows] = await pool.query<RowDataPacket[]>(
        `SELECT uid,job_code jobCode,
                DATE_FORMAT(business_date,'%Y-%m-%d') businessDate,
                status,summary,error_message errorMessage,
                DATE_FORMAT(started_at,'%Y-%m-%dT%H:%i:%s+07:00') startedAt,
                DATE_FORMAT(finished_at,'%Y-%m-%dT%H:%i:%s+07:00') finishedAt,
                CASE WHEN finished_at IS NULL THEN NULL
                     ELSE ROUND(TIMESTAMPDIFF(MICROSECOND,started_at,finished_at)/1000)
                END durationMs
         FROM cron_runs
         ORDER BY started_at DESC,id DESC
         LIMIT 1`
      )
      const [overviewRows] = await pool.query<RowDataPacket[]>(
        `SELECT
           (SELECT DATE_FORMAT(finished_at,'%Y-%m-%dT%H:%i:%s+07:00')
              FROM cron_runs
             WHERE status='SUCCEEDED'
             ORDER BY finished_at DESC,id DESC LIMIT 1) lastSucceededAt,
           SUM(status='RUNNING') runningCount,
           SUM(status='FAILED' AND started_at>=NOW(3)-INTERVAL 24 HOUR)
             failedLast24Hours
         FROM cron_runs`
      )
      const total = Number(countRows[0]?.total ?? 0)
      const overview = overviewRows[0] ?? {}

      res.json({
        items: rows.map((row) => ({
          ...row,
          summary: sanitizeSummary(row.summary),
          durationMs:
            row.durationMs === null || row.durationMs === undefined
              ? null
              : Number(row.durationMs),
        })),
        ...paginationMeta(total, page, pageSize),
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        overview: {
          lastRun: latestRows[0]
            ? {
                ...latestRows[0],
                summary: sanitizeSummary(latestRows[0].summary),
                durationMs:
                  latestRows[0].durationMs === null ||
                  latestRows[0].durationMs === undefined
                    ? null
                    : Number(latestRows[0].durationMs),
              }
            : null,
          lastSucceededAt: overview.lastSucceededAt ?? null,
          runningCount: Number(overview.runningCount ?? 0),
          failedLast24Hours: Number(overview.failedLast24Hours ?? 0),
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

function parseJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object') return value as Record<string, unknown>
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return null
  }
}

function positiveInteger(value: unknown, fallback: number, maximum?: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return maximum ? Math.min(parsed, maximum) : parsed
}

function sanitizeSummary(value: unknown) {
  const summary = parseJson(value)
  if (!summary) return null
  return {
    ...(typeof summary.reason === 'string'
      ? { reason: summary.reason.slice(0, 500) }
      : {}),
    contracts: sanitizeStage(summary.contracts ?? summary, [
      'activated',
      'expired',
      'activatedEmployees',
      'inactivatedEmployees',
      'legacyConflicts',
      'skippedConflicts',
    ]),
    scheduledMutations: sanitizeStage(summary.scheduledMutations, [
      'due',
      'applied',
      'failed',
      'skipped',
    ]),
    scheduledStatusChanges: sanitizeStage(summary.scheduledStatusChanges, [
      'due',
      'applied',
      'failed',
      'skipped',
    ]),
  }
}

function sanitizeStage(value: unknown, numericKeys: string[]) {
  if (!value || typeof value !== 'object') return null
  const stage = value as Record<string, unknown>
  return Object.fromEntries(
    numericKeys
      .filter((key) => typeof stage[key] === 'number')
      .map((key) => [key, Number(stage[key])])
  )
}
