import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import type { AuthContext } from '../middleware/authenticate.js'

type AuditInput = {
  auth: AuthContext
  request?: Request
  module?: string
  siteId?: number | null
  action:
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'GENERATE'
    | 'APPROVE'
    | 'REJECT'
    | 'EXPORT'
    | 'OTHER'
  table: string
  recordId?: number | null
  recordUid?: string | null
  description: string
  reason?: string | null
  beforeData?: Record<string, unknown> | null
  afterData?: Record<string, unknown> | null
  requestId?: string | null
}

export async function writeAudit(input: AuditInput, connection?: PoolConnection) {
  const executor = connection ?? pool
  const action = input.action === 'GENERATE' ? 'OTHER' : input.action
  await executor.execute(
    `INSERT INTO audit_logs(uid,user_id,site_id,module,action,table_name,record_id,record_uid,description,reason,before_data,after_data,request_id,ip_address,user_agent,created_by,updated_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      randomUUID(), input.auth.id, input.siteId ?? null, input.module ?? 'EMPLOYEES', action,
      input.table, input.recordId ?? null, input.recordUid ?? null, input.description,
      input.reason ?? null,
      input.beforeData ? JSON.stringify(input.beforeData) : null,
      input.afterData ? JSON.stringify(input.afterData) : null,
      input.requestId ?? null,
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
    `INSERT INTO audit_logs(uid,user_id,site_id,module,action,table_name,record_id,record_uid,description,reason,before_data,after_data,request_id,ip_address,user_agent,created_by,updated_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      randomUUID(),
      null,
      input.siteId ?? null,
      input.module ?? 'EMPLOYEES',
      input.action,
      input.table,
      input.recordId ?? null,
      input.recordUid ?? null,
      input.description,
      input.reason ?? null,
      input.beforeData ? JSON.stringify(input.beforeData) : null,
      input.afterData ? JSON.stringify(input.afterData) : null,
      input.requestId ?? null,
      null,
      null,
      null,
      null,
    ]
  )
}
