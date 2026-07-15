import { bigint, date, datetime, int, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core'

const audit = {
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
}
export const users = mysqlTable('users', {
  id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(), uid: varchar('uid', { length: 36 }).notNull(), username: varchar('username', { length: 100 }).notNull(), email: varchar('email', { length: 191 }), passwordHash: varchar('password_hash', { length: 255 }).notNull(), fullName: varchar('full_name', { length: 150 }).notNull(), status: varchar('status', { length: 20 }).notNull(), failedLoginAttempts: int('failed_login_attempts', { unsigned: true }).notNull(), lockedUntil: datetime('locked_until', { mode: 'date', fsp: 3 }), lastLoginAt: datetime('last_login_at', { mode: 'date', fsp: 3 }), ...audit,
})
export const sites = mysqlTable('sites', {
  id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(),
  uid: varchar('uid', { length: 36 }).notNull(),
  code: varchar('code', { length: 20 }).notNull(),
  employeeNumberPrefix: varchar('employee_number_prefix', { length: 3 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  ...audit,
})
export const employeeNumberSequences = mysqlTable('employee_number_sequences', {
  siteId: bigint('site_id', { mode: 'number', unsigned: true }).notNull(),
  joinDate: date('join_date', { mode: 'string' }).notNull(),
  lastSequence: int('last_sequence', { unsigned: true }).notNull(),
  ...audit,
})
export const contractTypes = mysqlTable('contract_types', {
  id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(),
  uid: varchar('uid', { length: 36 }).notNull(),
  code: varchar('code', { length: 30 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  isActive: int('is_active', { unsigned: true }).notNull(),
  ...audit,
})
export const userSessions = mysqlTable('user_sessions', {
  id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(), uid: varchar('uid', { length: 36 }).notNull(), userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(), refreshTokenHash: varchar('refresh_token_hash', { length: 255 }).notNull(), deviceName: varchar('device_name', { length: 150 }), ipAddress: varchar('ip_address', { length: 45 }), userAgent: varchar('user_agent', { length: 500 }), expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(), lastUsedAt: datetime('last_used_at', { mode: 'date', fsp: 3 }), revokedAt: datetime('revoked_at', { mode: 'date', fsp: 3 }), revokeReason: varchar('revoke_reason', { length: 255 }), ...audit,
})
export const files = mysqlTable('files', {
  id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(), uid: varchar('uid', { length: 36 }).notNull(), storageProvider: varchar('storage_provider', { length: 20 }).notNull(), storagePath: varchar('storage_path', { length: 500 }).notNull(), originalName: varchar('original_name', { length: 255 }).notNull(), storedName: varchar('stored_name', { length: 255 }).notNull(), mimeType: varchar('mime_type', { length: 150 }).notNull(), extension: varchar('extension', { length: 20 }), sizeBytes: bigint('size_bytes', { mode: 'number', unsigned: true }).notNull(), checksumSha256: varchar('checksum_sha256', { length: 64 }), visibility: varchar('visibility', { length: 20 }).notNull(), uploadedBy: bigint('uploaded_by', { mode: 'number', unsigned: true }), ...audit,
})
export const auditLogs = mysqlTable('audit_logs', { id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(), uid: varchar('uid', { length: 36 }).notNull(), userId: bigint('user_id', { mode: 'number', unsigned: true }), action: varchar('action', { length: 100 }).notNull(), module: varchar('module', { length: 50 }).notNull(), entityType: varchar('entity_type', { length: 100 }), entityUid: varchar('entity_uid', { length: 36 }), description: text('description'), ...audit })
