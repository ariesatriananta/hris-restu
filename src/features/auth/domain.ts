export type SiteAccess = 'JEPARA' | 'SEMARANG' | 'KLATEN'

export interface AuthUser {
  uid: string
  name: string
  email: string
  role: 'SUPER_ADMIN'
  roleLabel: 'Super Admin'
  siteAccess: SiteAccess[]
}

export interface AuthSession {
  user: AuthUser
  expiresAt: number
}

export interface SignInCredentials {
  email: string
  password: string
}

export interface AuthRepository {
  getSession(): AuthSession | null
  signIn(credentials: SignInCredentials): Promise<AuthSession>
  signOut(): Promise<void>
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Email atau kata sandi tidak sesuai.')
    this.name = 'InvalidCredentialsError'
  }
}
