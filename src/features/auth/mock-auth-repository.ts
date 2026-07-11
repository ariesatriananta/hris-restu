import {
  InvalidCredentialsError,
  type AuthRepository,
  type AuthSession,
  type SignInCredentials,
} from './domain'

const SESSION_KEY = 'hris-restu.mock-session'
const DEMO_EMAIL = 'admin@hris-restu.test'
const DEMO_PASSWORD = 'restu123'

const administrator = {
  uid: 'usr-super-admin-001',
  name: 'Administrator HRIS',
  email: DEMO_EMAIL,
  role: 'SUPER_ADMIN',
  roleLabel: 'Super Admin',
  siteAccess: ['JEPARA', 'SEMARANG', 'KLATEN'],
} as const

function readSession(): AuthSession | null {
  if (typeof window === 'undefined') return null

  const value = window.localStorage.getItem(SESSION_KEY)
  if (!value) return null

  try {
    const session = JSON.parse(value) as AuthSession
    if (session.expiresAt <= Date.now()) {
      window.localStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch {
    window.localStorage.removeItem(SESSION_KEY)
    return null
  }
}

function delay(ms = 450) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export const mockAuthRepository: AuthRepository = {
  getSession: readSession,
  async signIn(credentials: SignInCredentials) {
    await delay()
    if (
      credentials.email.toLowerCase() !== DEMO_EMAIL ||
      credentials.password !== DEMO_PASSWORD
    ) {
      throw new InvalidCredentialsError()
    }

    const session: AuthSession = {
      user: { ...administrator, siteAccess: [...administrator.siteAccess] },
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    }
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return session
  },
  async signOut() {
    window.localStorage.removeItem(SESSION_KEY)
  },
}

export const mockCredentials = {
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
}
