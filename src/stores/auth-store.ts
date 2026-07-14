import { create } from 'zustand'
import type { AuthSession, SignInCredentials } from '@/features/auth/domain'
import {
  httpAuthRepository,
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
    await httpAuthRepository.signOut()
    set({ session: null })
  },
  refreshSession: async () => {
    const session = await restoreHttpSession()
    set({ session })
    return session
  },
}))
