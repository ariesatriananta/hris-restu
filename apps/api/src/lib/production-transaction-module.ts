import type { RowDataPacket } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import type { AuthContext } from '../middleware/authenticate.js'
import { ApiError } from './errors.js'

export const isQcUser = (auth: AuthContext) =>
  auth.roles.includes('QC') && !auth.roles.includes('SUPER_ADMIN')
export function assertQcEmployeeModule(
  auth: AuthContext,
  history: RowDataPacket
) {
  if (
    isQcUser(auth) &&
    !auth.productionModuleAccess?.includes(String(history.productionModuleUid))
  ) {
    throw new ApiError(
      403,
      'Modul Produksi karyawan tidak termasuk akses QC Anda.'
    )
  }
}

export function qcModulePredicate(auth: AuthContext, expression: string) {
  if (!isQcUser(auth)) return { sql: '1=1', params: [] as string[] }
  const modules = auth.productionModuleAccess ?? []
  return {
    sql: modules.length
      ? `EXISTS (SELECT 1 FROM production_modules permitted_module WHERE permitted_module.id=${expression} AND permitted_module.uid IN (${modules.map(() => '?').join(',')}))`
      : '1=0',
    params: modules,
  }
}

// Pair metadata and correction snapshots must never reveal an inaccessible peer.
export function qcTransactionPredicate(auth: AuthContext, alias = 'pt') {
  const own = qcModulePredicate(auth, `${alias}.production_module_id`)
  if (!isQcUser(auth)) return own
  const peer = qcModulePredicate(auth, 'qc_peer.production_module_id')
  return {
    sql: `${own.sql} AND NOT EXISTS (
      SELECT 1 FROM production_transaction_pairs qc_pair JOIN production_transactions qc_peer
        ON qc_peer.id IN (qc_pair.linting_transaction_id,qc_pair.batil_transaction_id)
      WHERE ${alias}.id IN (qc_pair.linting_transaction_id,qc_pair.batil_transaction_id) AND NOT (${peer.sql})
    ) AND NOT EXISTS (
      SELECT 1 FROM production_transaction_revisions qc_revision JOIN production_transactions qc_peer
        ON qc_peer.id IN (qc_revision.production_transaction_id,qc_revision.replacement_transaction_id)
      WHERE ${alias}.id IN (qc_revision.production_transaction_id,qc_revision.replacement_transaction_id) AND NOT (${peer.sql})
    )`,
    params: [...own.params, ...peer.params, ...peer.params],
  }
}

export async function assertQcTransactionAccess(
  conn: Pick<Pool, 'query'> | PoolConnection,
  id: number,
  auth: AuthContext
) {
  if (!isQcUser(auth)) return
  const scope = qcTransactionPredicate(auth)
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pt.id FROM production_transactions pt WHERE pt.id=? AND ${scope.sql}`,
    [id, ...scope.params]
  )
  if (!rows.length)
    throw new ApiError(
      404,
      'Transaksi Produksi tidak ditemukan dalam akses modul Anda.'
    )
}

export async function assertQcDailyGroupAccess(
  conn: PoolConnection,
  transaction: RowDataPacket,
  auth: AuthContext
) {
  if (!isQcUser(auth)) return
  const scope = qcTransactionPredicate(auth, 'pt')
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT pt.id FROM production_transactions pt WHERE pt.employee_id=? AND pt.site_id=?
      AND pt.production_job_id=? AND pt.business_date=? AND pt.status='POSTED' AND NOT (${scope.sql}) LIMIT 1 FOR UPDATE`,
    [
      transaction.employee_id,
      transaction.site_id,
      transaction.production_job_id,
      transaction.businessDateKey,
      ...scope.params,
    ]
  )
  if (rows.length)
    throw new ApiError(
      403,
      'Grup harian memuat transaksi di luar modul QC. Hubungi admin Produksi.'
    )
}

export async function snapshotTransactionModule(
  conn: PoolConnection,
  id: number,
  moduleId?: number | null
) {
  if (moduleId !== undefined) {
    await conn.execute(
      'UPDATE production_transactions SET production_module_id=? WHERE id=?',
      [moduleId, id]
    )
    return
  }
  await snapshotTransactionModules(conn, [id])
}

export async function snapshotTransactionModules(
  conn: PoolConnection,
  ids: number[]
) {
  if (!ids.length) return
  // Missing/overlapping historical placement stays NULL and is invisible to QC.
  await conn.execute(
    `UPDATE production_transactions tx
    JOIN employee_employment_histories module_history ON module_history.employee_id=tx.employee_id
      AND module_history.site_id=tx.site_id AND module_history.status='ACTIVE' AND module_history.effective_from<=tx.business_date
      AND (module_history.effective_to IS NULL OR module_history.effective_to>=tx.business_date)
    JOIN production_module_sections module_mapping ON module_mapping.id=module_history.production_module_section_id
    JOIN production_modules module ON module.id=module_mapping.production_module_id AND module.site_id=tx.site_id
    SET tx.production_module_id=module.id WHERE tx.id IN (${ids.map(() => '?').join(',')}) AND tx.production_module_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM employee_employment_histories conflict WHERE conflict.employee_id=tx.employee_id
        AND conflict.id<>module_history.id AND conflict.site_id=tx.site_id AND conflict.status='ACTIVE' AND conflict.effective_from<=tx.business_date
        AND (conflict.effective_to IS NULL OR conflict.effective_to>=tx.business_date))`,
    ids
  )
}
