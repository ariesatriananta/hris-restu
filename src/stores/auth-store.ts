import { create } from 'zustand'
import type { AuthSession, SignInCredentials } from '@/features/auth/domain'
import { mockAuthRepository } from '@/features/auth/mock-auth-repository'

interface AuthState {
  session: AuthSession | null
  isSigningIn: boolean
  signIn: (credentials: SignInCredentials) => Promise<void>
  signOut: () => Promise<void>
  refreshSession: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: mockAuthRepository.getSession(),
  isSigningIn: false,
  signIn: async (credentials) => {
    set({ isSigningIn: true })
    try {
      const session = await mockAuthRepository.signIn(credentials)
      set({ session })
    } finally {
      set({ isSigningIn: false })
    }
  },
  signOut: async () => {
    await mockAuthRepository.signOut()
    set({ session: null })
  },
  refreshSession: () => set({ session: mockAuthRepository.getSession() }),
}))
