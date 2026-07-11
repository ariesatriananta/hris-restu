import { beforeEach, describe, expect, it } from 'vitest'
import { mockCredentials } from '@/features/auth/mock-auth-repository'
import { useAuthStore } from './auth-store'

describe('auth store', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useAuthStore.setState({ session: null, isSigningIn: false })
  })

  it('membuat dan menyimpan session Administrator HRIS', async () => {
    await useAuthStore.getState().signIn(mockCredentials)
    expect(useAuthStore.getState().session?.user.role).toBe('SUPER_ADMIN')
    expect(window.localStorage.getItem('hris-restu.mock-session')).toContain(
      'Administrator HRIS'
    )
  })

  it('menolak kredensial yang salah', async () => {
    await expect(
      useAuthStore
        .getState()
        .signIn({ email: 'salah@example.test', password: 'salah' })
    ).rejects.toThrow('tidak sesuai')
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('menghapus session saat logout', async () => {
    await useAuthStore.getState().signIn(mockCredentials)
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().session).toBeNull()
    expect(window.localStorage.getItem('hris-restu.mock-session')).toBeNull()
  })
})
