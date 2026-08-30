export interface AuditRef {
  uid: string
  code?: string
  name: string
  username?: string
}
export interface AuditEntry {
  uid: string
  module: string
  action: string
  tableName: string
  recordUid: string | null
  description: string | null
  reason: string | null
  occurredAt: string
  actor: AuditRef | null
  site: AuditRef | null
}
export interface AuditDetail extends AuditEntry {
  requestId: string | null
  ipAddress: string | null
  userAgent: string | null
  beforeData: unknown
  afterData: unknown
}
export interface AuditMeta {
  modules: string[]
  actions: string[]
  sites: AuditRef[]
  users: AuditRef[]
}
export interface AuditListResult {
  data: AuditEntry[]
  meta: { page: number; pageSize: number; total: number }
}
export interface AuditListParams {
  search?: string
  module?: string[]
  action?: string[]
  site?: string[]
  userUid?: string
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
}
