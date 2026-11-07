import { create } from 'zustand'
import { expireSession, onSessionExpired } from '@/lib/session-lifecycle'
import type { AuthSession, SignInCredentials } from '@/features/auth/domain'
import {
  httpAuthRepository,
  clearHttpSession,
  restoreHttpSession,
} from '@/features/auth/http-auth-repository'

interface AuthState {
  session: AuthSession | null
  isSigningIn: boolean
  signIn: (credentials: SignInCredentials) => Promise<void>
  signOut: () => Promise<void>
  refreshSession: () => Promise<AuthSession | null>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: httpAuthRepository.getSession(),
  isSigningIn: false,
  signIn: async (credentials) => {
    set({ isSigningIn: true })
    try {
      const session = await httpAuthRepository.signIn(credentials)
      set({ session })
    } finally {
      set({ isSigningIn: false })
    }
  },
  signOut: async () => {
    expireSession()
    clearHttpSession()
    set({ session: null })
    try {
      await httpAuthRepository.signOut()
    } catch {
      // Local logout must finish even when the server is unavailable.
    }
  },
  refreshSession: async () => {
    const session = await restoreHttpSession()
    set({ session })
    return session
  },
}))

onSessionExpired(() => {
  clearHttpSession()
  useAuthStore.setState({ session: null })
})
