export type SiteAccess = 'JEPARA' | 'SEMARANG' | 'KLATEN'

export type UserRole =
  | 'SUPER_ADMIN'
  | 'DIRECTOR'
  | 'HR_OFFICER'
  | 'PRODUCTION_ADMIN'
  | 'PAYROLL_FINANCE'
  | 'SITE_SUPERVISOR'

export type PermissionCode =
  | 'attendance.view'
  | 'attendance.scan'
  | 'attendance.correct'
  | 'attendance.approve'
  | 'attendance.manage_shift'
  | 'attendance.manage_device'
  | 'attendance.manage_calendar'
  | 'attendance.finalize'
  | 'attendance.export'
  | (string & {})

export interface AuthUser {
  uid: string
  name: string
  email: string | null
  role: UserRole
  roleLabel: string
  roles: UserRole[]
  siteAccess: SiteAccess[]
  mustChangePassword: boolean
}

export interface AuthSession {
  user: AuthUser
  permissions: PermissionCode[]
  expiresAt: number
}

export interface SignInCredentials {
  username: string
  password: string
}

export interface AuthRepository {
  getSession(): AuthSession | null
  signIn(credentials: SignInCredentials): Promise<AuthSession>
  signOut(): Promise<void>
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Username atau kata sandi tidak sesuai.')
    this.name = 'InvalidCredentialsError'
  }
}
