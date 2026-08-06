import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { contractSettingsInput } from '../lib/contract-settings.js'
import { paginationMeta } from '../lib/contract-lifecycle-policy.js'
import { ApiError } from '../lib/errors.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const cronRunStatus = z.enum(['RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED'])

export const systemRouter = Router()
systemRouter.use(authenticate)

const requireSuperAdmin = (
  _req: Parameters<ReturnType<typeof requirePermission>>[0],
  res: Parameters<ReturnType<typeof requirePermission>>[1],
  next: Parameters<ReturnType<typeof requirePermission>>[2]
) => {
  const auth = res.locals.auth as AuthContext
  if (!auth.roles.includes('SUPER_ADMIN')) {
    return next(new ApiError(403, 'Pengaturan sistem hanya dapat dikelola oleh Super Admin.'))
  }
  next()
}

systemRouter.get(
  '/settings/contracts',
  requirePermission('settings.manage'),
  requireSuperAdmin,
  async (_req, res, next) => {
    try {
      res.json(await readContractSettings())
    } catch (error) {
      next(error)
    }
  }
)

systemRouter.put(
  '/settings/contracts',
  requirePermission('settings.manage'),
  requireSuperAdmin,
  async (req, res, next) => {
    const connection = await pool.getConnection()
    try {
      const input = contractSettingsInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      let updatedCount = 0
      await connection.beginTransaction()

      if (input.firstParty) {
        const [rows] = await connection.query<RowDataPacket[]>(
          `SELECT id,uid,setting_value settingValue
             FROM system_settings
            WHERE site_id IS NULL AND setting_key='contract.pkwt.first_party'
            FOR UPDATE`
        )
        const current = rows[0]
        const before = settingObject(current?.settingValue)
        if (!sameSetting(before, input.firstParty)) {
          const uid = current?.uid ?? randomUUID()
          await connection.execute(
            `INSERT INTO system_settings
               (uid,site_id,setting_key,setting_value,description,is_secret,created_by,updated_by)
             VALUES (?,NULL,'contract.pkwt.first_party',?,'Identitas pihak pertama pada template cetak PKWT.',0,?,?)
             ON DUPLICATE KEY UPDATE
               setting_value=VALUES(setting_value),description=VALUES(description),
               is_secret=0,updated_by=VALUES(updated_by)`,
            [uid, JSON.stringify(input.firstParty), auth.id, auth.id]
          )
          await writeAudit(
            {
              auth,
              request: req,
              module: 'SETTINGS',
              action: current ? 'UPDATE' : 'CREATE',
              table: 'system_settings',
              recordId: current?.id ?? null,
              recordUid: uid,
              description: 'Memperbarui identitas pihak pertama kontrak.',
              beforeData: current ? before : null,
              afterData: input.firstParty,
            },
            connection
          )
          updatedCount += 1
        }
      }

      for (const target of input.targets) {
        const [referenceRows] = await connection.query<RowDataPacket[]>(
          `SELECT s.id siteId,s.name siteName,ps.code sectionCode,ps.name sectionName
             FROM production_module_sections pms
             JOIN production_modules pm ON pm.id=pms.production_module_id
             JOIN sites s ON s.id=pm.site_id
             JOIN production_sections ps ON ps.id=pms.production_section_id
            WHERE s.code=? AND ps.code=? AND s.is_active=1 AND pm.is_active=1
              AND ps.is_active=1 AND pms.is_active=1
            LIMIT 1`,
          [target.siteCode.toUpperCase(), target.sectionCode.toUpperCase()]
        )
        const reference = referenceRows[0]
        if (!reference) {
          throw new ApiError(
            422,
            `Target ${target.siteCode} / ${target.sectionCode} tidak merujuk bagian produksi aktif.`
          )
        }
        const settingKey = `contract.pkwt.target.${reference.sectionCode}`
        const [settingRows] = await connection.query<RowDataPacket[]>(
          `SELECT id,uid,setting_value settingValue
             FROM system_settings
            WHERE site_id=? AND setting_key=?
            FOR UPDATE`,
          [reference.siteId, settingKey]
        )
        const current = settingRows[0]
        const before = settingObject(current?.settingValue)
        const after = { value: target.value, unit: target.unit }
        if (sameSetting(before, after)) continue

        const uid = current?.uid ?? randomUUID()
        await connection.execute(
          `INSERT INTO system_settings
             (uid,site_id,setting_key,setting_value,description,is_secret,created_by,updated_by)
           VALUES (?,?,?,?,?,0,?,?)
           ON DUPLICATE KEY UPDATE
             setting_value=VALUES(setting_value),description=VALUES(description),
             is_secret=0,updated_by=VALUES(updated_by)`,
          [
            uid,
            reference.siteId,
            settingKey,
            JSON.stringify(after),
            `Target PKWT untuk bagian ${reference.sectionName} di site ${reference.siteName}.`,
            auth.id,
            auth.id,
          ]
        )
        await writeAudit(
          {
            auth,
            request: req,
            module: 'SETTINGS',
            siteId: Number(reference.siteId),
            action: current ? 'UPDATE' : 'CREATE',
            table: 'system_settings',
            recordId: current?.id ?? null,
            recordUid: uid,
            description: `Memperbarui target kontrak bagian ${reference.sectionName}.`,
            beforeData: current ? before : null,
            afterData: after,
          },
          connection
        )
        updatedCount += 1
      }

      await connection.commit()
      res.json({ updatedCount })
    } catch (error) {
      await connection.rollback()
      next(error)
    } finally {
      connection.release()
    }
  }
)

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

async function readContractSettings() {
  const [firstPartyRows] = await pool.query<RowDataPacket[]>(
    `SELECT setting_value settingValue,updated_at updatedAt
       FROM system_settings
      WHERE site_id IS NULL AND setting_key='contract.pkwt.first_party'
      LIMIT 1`
  )
  const [targetRows] = await pool.query<RowDataPacket[]>(
    `SELECT s.code siteCode,s.name siteName,
            ps.code sectionCode,ps.name sectionName,
            GROUP_CONCAT(DISTINCT pm.name ORDER BY pm.name SEPARATOR '||') moduleNames,
            ss.setting_value settingValue,ss.updated_at updatedAt
       FROM production_module_sections pms
       JOIN production_modules pm ON pm.id=pms.production_module_id
       JOIN sites s ON s.id=pm.site_id
       JOIN production_sections ps ON ps.id=pms.production_section_id
       LEFT JOIN system_settings ss
         ON ss.site_id=s.id
        AND ss.setting_key=CONCAT('contract.pkwt.target.',ps.code)
      WHERE pms.is_active=1 AND pm.is_active=1
        AND ps.is_active=1 AND s.is_active=1
      GROUP BY s.id,s.code,s.name,ps.id,ps.code,ps.name,
               ss.setting_value,ss.updated_at
      ORDER BY s.name,ps.name`
  )
  const firstParty = settingObject(firstPartyRows[0]?.settingValue)

  return {
    firstParty: {
      companyName: settingText(firstParty.companyName),
      directorName: settingText(firstParty.directorName),
      directorTitle: settingText(firstParty.directorTitle),
      headOfficeAddress: settingText(firstParty.headOfficeAddress),
      configured: Boolean(firstPartyRows[0]),
      updatedAt: firstPartyRows[0]?.updatedAt ?? null,
    },
    targets: targetRows.map((row) => {
      const target = settingObject(row.settingValue)
      const value = Number(target.value)
      return {
        siteCode: row.siteCode,
        siteName: row.siteName,
        sectionCode: row.sectionCode,
        sectionName: row.sectionName,
        moduleNames: String(row.moduleNames ?? '')
          .split('||')
          .filter(Boolean),
        value: Number.isFinite(value) && value > 0 ? value : null,
        unit: settingText(target.unit),
        configured: Boolean(row.settingValue),
        updatedAt: row.updatedAt ?? null,
      }
    }),
  }
}

function settingObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function settingText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function sameSetting(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  const keys = Object.keys(right)
  return keys.every((key) => left[key] === right[key])
}
