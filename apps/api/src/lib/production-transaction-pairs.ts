import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { ApiError } from './errors.js'

// Temporary business scope, intentionally hardcoded. See HRIS_BUSINESS_RULES.md.
export const BATIL_JOB_CODE = 'BORONGAN-BATIL'
export function assertLintingBatilScope(site: string, jobCode: string) {
  if (site !== 'KLATEN' || jobCode !== 'BORONGAN-LINTING')
    throw new ApiError(422, 'Pasangan Batil hanya tersedia untuk Linting site Klaten.')
}

export async function readProductionPairs(conn: Pool | PoolConnection, ids: number[]) {
  const result = new Map<number, {
    uid: string; role: 'LINTING' | 'BATIL';
    partner: { uid: string; transactionNumber: string; status: string;
      employee: {uid:string;employeeNumber:string;fullName:string};
      job: {uid:string;code:string;name:string} }
  }>()
  for (let offset = 0; offset < ids.length; offset += 1000) {
    const chunk = ids.slice(offset, offset + 1000)
    const placeholders = chunk.map(() => '?').join(',')
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT pair.uid pairUid,pair.linting_transaction_id lintingId,pair.batil_transaction_id batilId,
        tx.id,tx.uid,tx.transaction_number transactionNumber,tx.status,
        employee.uid employeeUid,employee.employee_number employeeNumber,employee.full_name fullName,
        job.uid jobUid,job.code jobCode,job.name jobName
       FROM production_transaction_pairs pair
       JOIN production_transactions tx ON tx.id IN (pair.linting_transaction_id,pair.batil_transaction_id)
       JOIN employees employee ON employee.id=tx.employee_id
       JOIN production_jobs job ON job.id=tx.production_job_id
       WHERE pair.linting_transaction_id IN (${placeholders}) OR pair.batil_transaction_id IN (${placeholders})`,
      [...chunk, ...chunk]
    )
    for (const row of rows) {
      const ownId = Number(row.id) === Number(row.lintingId) ? Number(row.batilId) : Number(row.lintingId)
      if (!chunk.includes(ownId)) continue
      result.set(ownId, {uid:String(row.pairUid),role:ownId === Number(row.lintingId) ? 'LINTING' : 'BATIL',
        partner:{uid:String(row.uid),transactionNumber:String(row.transactionNumber),status:String(row.status),
          employee:{uid:String(row.employeeUid),employeeNumber:String(row.employeeNumber),fullName:String(row.fullName)},
          job:{uid:String(row.jobUid),code:String(row.jobCode),name:String(row.jobName)}}})
    }
  }
  return result
}

export async function saveProductionPair(conn: PoolConnection, lintingId: number, batilId: number, actorId: number) {
  if (lintingId === batilId) throw new ApiError(422, 'Pasangan harus memiliki dua transaksi berbeda.')
  await conn.execute(`INSERT INTO production_transaction_pairs(uid,linting_transaction_id,batil_transaction_id,created_by,updated_by) VALUES(?,?,?,?,?)`,
    [randomUUID(),lintingId,batilId,actorId,actorId])
}
