import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import type { AuthContext } from '../middleware/authenticate.js'

type AuditInput = {
  auth: AuthContext
  request?: Request
  siteId?: number | null
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'OTHER'
  table: string
  recordId?: number | null
  recordUid?: string | null
  description: string
}

export async function writeAudit(input: AuditInput, connection?: PoolConnection) {
  const executor = connection ?? pool
  await executor.execute(
    `INSERT INTO audit_logs(uid,user_id,site_id,module,action,table_name,record_id,record_uid,description,ip_address,user_agent,created_by,updated_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      randomUUID(), input.auth.id, input.siteId ?? null, 'EMPLOYEES', input.action,
      input.table, input.recordId ?? null, input.recordUid ?? null, input.description,
      input.request?.ip ?? null, input.request?.get('user-agent') ?? null,
      input.auth.id, input.auth.id,
    ]
  )
}

type SystemAuditInput = Omit<AuditInput, 'auth' | 'request'>

export async function writeSystemAudit(
  input: SystemAuditInput,
  connection?: PoolConnection
) {
  const executor = connection ?? pool
  await executor.execute(
    `INSERT INTO audit_logs(uid,user_id,site_id,module,action,table_name,record_id,record_uid,description,ip_address,user_agent,created_by,updated_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      randomUUID(),
      null,
      input.siteId ?? null,
      'EMPLOYEES',
      input.action,
      input.table,
      input.recordId ?? null,
      input.recordUid ?? null,
      input.description,
      null,
      null,
      null,
      null,
    ]
  )
}
