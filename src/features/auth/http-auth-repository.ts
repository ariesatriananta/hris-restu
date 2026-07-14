import { apiClient } from '@/lib/api-client'
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
    return raw ? (JSON.parse(raw) as AuthSession) : null
  } catch {
    return null
  }
}
const persist = (session: AuthSession | null) => {
  if (session) localStorage.setItem(key, JSON.stringify(session))
  else localStorage.removeItem(key)
}
async function me(): Promise<AuthSession> {
  const { data } = await apiClient.get<{ user: AuthSession['user'] }>(
    '/auth/me'
  )
  const session = { user: data.user, expiresAt: Date.now() + 15 * 60 * 1000 }
  persist(session)
  return session
}
export async function restoreHttpSession() {
  try {
    return await me()
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
      return await me()
    } catch (error) {
      if (
        (error as { response?: { status?: number } }).response?.status === 401
      )
        throw new InvalidCredentialsError()
      throw error
    }
  },
  async signOut() {
    try {
      await apiClient.post('/auth/sign-out')
    } finally {
      persist(null)
    }
  },
}
export const apiCredentials = {
  email: 'admin@hris-restu.test',
  password: 'restu123',
}
