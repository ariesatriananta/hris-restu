import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import { businessDate, reconcileContracts } from './contract-lifecycle.js'
import { reconcileScheduledMutations } from './scheduled-mutations.js'

const lockName = 'hris:contracts:reconcile'

type CronRunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED'

async function createRun(
  connection: PoolConnection,
  status: CronRunStatus,
  businessDay: string,
  summary?: object,
  errorMessage?: string
) {
  const uid = randomUUID()
  await connection.execute(
    `INSERT INTO cron_runs(uid,job_code,business_date,status,summary,error_message,started_at,finished_at)
     VALUES(?,'CONTRACTS_RECONCILE',?,?,?, ?,CURRENT_TIMESTAMP(3),?)`,
    [
      uid,
      businessDay,
      status,
      summary ? JSON.stringify(summary) : null,
      errorMessage ?? null,
      status === 'RUNNING' ? null : new Date(),
    ]
  )
  return uid
}

async function finishRun(
  connection: PoolConnection,
  uid: string,
  status: Exclude<CronRunStatus, 'RUNNING'>,
  summary?: object,
  errorMessage?: string
) {
  await connection.execute(
    `UPDATE cron_runs
     SET status=?,summary=?,error_message=?,finished_at=CURRENT_TIMESTAMP(3)
     WHERE uid=?`,
    [status, summary ? JSON.stringify(summary) : null, errorMessage ?? null, uid]
  )
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.startsWith('Kontrak')) {
    return error.message.slice(0, 500)
  }
  return 'Proses rekonsiliasi gagal. Periksa log aplikasi dan audit trail.'
}

export async function runContractsReconcile() {
  const connection = await pool.getConnection()
  const today = businessDate()
  let lockHeld = false
  let runUid: string | undefined
  try {
    const [locks] = await connection.query<RowDataPacket[]>(
      'SELECT GET_LOCK(?, 0) acquired',
      [lockName]
    )
    lockHeld = Number(locks[0]?.acquired) === 1

    if (!lockHeld) {
      const skippedUid = await createRun(connection, 'SKIPPED', today, {
        reason: 'Rekonsiliasi lain masih berjalan.',
      })
      return {
        businessDate: today,
        status: 'SKIPPED' as const,
        runUid: skippedUid,
        reason: 'Rekonsiliasi lain masih berjalan.',
      }
    }

    runUid = await createRun(connection, 'RUNNING', today)
    const contracts = await reconcileContracts()
    const scheduledMutations = await reconcileScheduledMutations()
    const summary = { contracts, scheduledMutations }
    await finishRun(connection, runUid, 'SUCCEEDED', summary)
    return { ...contracts, scheduledMutations, status: 'SUCCEEDED' as const, runUid }
  } catch (error) {
    if (runUid) {
      await finishRun(connection, runUid, 'FAILED', undefined, safeErrorMessage(error))
    }
    throw error
  } finally {
    if (lockHeld) await connection.query('SELECT RELEASE_LOCK(?)', [lockName])
    connection.release()
  }
}
