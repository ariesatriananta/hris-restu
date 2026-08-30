export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED'

export interface AccessOption {
  uid: string
  code: string
  name: string
}

export interface SiteAccessOption extends AccessOption {
  isActive?: boolean
}

export interface PermissionOption extends AccessOption {
  module: string
  description: string | null
}

export interface AccessManagementMeta {
  sites: SiteAccessOption[]
  roles: Array<AccessOption & { isActive: boolean; isSystem: boolean }>
  permissions: PermissionOption[]
}

export interface ManagedUser {
  uid: string
  fullName: string
  username: string
  email: string | null
  phone: string | null
  status: UserStatus
  mustChangePassword: boolean
  failedLoginAttempts: number
  lockedUntil: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  roles: AccessOption[]
  siteAccess: Array<SiteAccessOption & { isDefault: boolean }>
}

export interface ManagedRole {
  uid: string
  code: string
  name: string
  description: string | null
  isSystem: boolean
  isActive: boolean
  userCount: number
  permissionCount: number
  permissionsImmutable: boolean
  permissions?: PermissionOption[]
}

export interface UserListResult {
  data: ManagedUser[]
  meta: {
    total: number
    page: number
    pageSize: number
    summary: { total: number; active: number; inactive: number; locked: number }
  }
}

export interface UserListParams {
  query?: string
  site?: string[]
  status?: UserStatus[]
  role?: string[]
  page: number
  pageSize: number
}

export interface UserInput {
  fullName: string
  username: string
  email: string | null
  phone: string | null
  status: UserStatus
  roleUids: string[]
  siteUids: string[]
  defaultSiteUid: string | null
  initialPassword?: string
}

export interface ResetPasswordInput {
  newPassword: string
}

export interface RoleInput {
  permissionUids: string[]
}

export interface AccessManagementRepository {
  getMeta(): Promise<AccessManagementMeta>
  listUsers(input: UserListParams): Promise<UserListResult>
  getUser(uid: string): Promise<ManagedUser>
  createUser(input: UserInput): Promise<{ uid: string }>
  updateUser(uid: string, input: UserInput): Promise<void>
  resetPassword(uid: string, input: ResetPasswordInput): Promise<void>
  listRoles(): Promise<ManagedRole[]>
  getRole(uid: string): Promise<ManagedRole>
  updateRole(uid: string, input: RoleInput): Promise<void>
}
