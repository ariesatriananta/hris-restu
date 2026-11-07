import { apiClient } from '@/lib/api-client'
import {
  isSessionExpired,
  sessionGeneration,
  startSession,
} from '@/lib/session-lifecycle'
import {
  InvalidCredentialsError,
  type AuthRepository,
  type AuthSession,
  type SignInCredentials,
} from './domain'

const key = 'hris-restu.api-session'
const read = (): AuthSession | null => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const session = JSON.parse(raw) as Partial<AuthSession>
    // Session lama belum membawa permission. Paksa refresh /auth/me agar
    // sidebar dan route guard tidak memakai authorization context yang basi.
    return session.user &&
      Array.isArray(session.permissions) &&
      Array.isArray(session.user.roles) &&
      typeof session.user.mustChangePassword === 'boolean'
      ? (session as AuthSession)
      : null
  } catch {
    return null
  }
}
const persist = (session: AuthSession | null) => {
  if (session) localStorage.setItem(key, JSON.stringify(session))
  else localStorage.removeItem(key)
}
export const clearHttpSession = () => persist(null)
async function me(): Promise<AuthSession> {
  const { data } = await apiClient.get<{
    user: AuthSession['user']
    permissions: AuthSession['permissions']
  }>('/auth/me')
  const session: AuthSession = {
    user: data.user,
    permissions: data.permissions,
    expiresAt: Date.now() + 15 * 60 * 1000,
  }
  persist(session)
  return session
}
export async function restoreHttpSession() {
  if (isSessionExpired()) return null
  const generation = sessionGeneration()
  try {
    const session = await me()
    if (isSessionExpired() || generation !== sessionGeneration()) {
      persist(null)
      return null
    }
    return session
  } catch {
    persist(null)
    return null
  }
}
export const httpAuthRepository: AuthRepository = {
  getSession: read,
  async signIn(credentials: SignInCredentials) {
    try {
      await apiClient.post('/auth/sign-in', credentials)
      const session = await me()
      startSession()
      return session
    } catch (error) {
      if (
        (error as { response?: { status?: number } }).response?.status === 401
      )
        throw new InvalidCredentialsError()
      throw error
    }
  },
  async signOut() {
    persist(null)
    try {
      await apiClient.post('/auth/sign-out', undefined, { timeout: 15_000 })
    } finally {
      persist(null)
    }
  },
}
export const apiCredentials = {
  username: 'administrator.hris',
  password: 'restu123',
}
