import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expireSession, startSession } from '@/lib/session-lifecycle'
import { useAuthStore } from './auth-store'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: { get, post } }))

const user = {
  uid: '00000000-0000-4000-8000-000000000001',
  name: 'Administrator HRIS',
  email: 'admin@hris-restu.test',
  role: 'SUPER_ADMIN' as const,
  roleLabel: 'Super Admin' as const,
  siteAccess: ['JEPARA', 'SEMARANG', 'KLATEN'] as const,
}

describe('auth store', () => {
  beforeEach(() => {
    startSession()
    window.localStorage.clear()
    get.mockReset()
    post.mockReset()
    useAuthStore.setState({ session: null, isSigningIn: false })
  })

  it('membuat dan menyimpan session dari cookie API', async () => {
    post.mockResolvedValue({ status: 204 })
    get.mockResolvedValue({
      data: { user, permissions: ['attendance.view'] },
    })
    await useAuthStore
      .getState()
      .signIn({ username: 'administrator.hris', password: 'restu123' })
    expect(useAuthStore.getState().session?.user.role).toBe('SUPER_ADMIN')
    expect(useAuthStore.getState().session?.permissions).toEqual([
      'attendance.view',
    ])
    expect(window.localStorage.getItem('hris-restu.api-session')).toContain(
      'Administrator HRIS'
    )
  })

  it('menolak kredensial yang salah', async () => {
    post.mockRejectedValue({ response: { status: 401 } })
    await expect(
      useAuthStore.getState().signIn({ username: 'salah', password: 'salah' })
    ).rejects.toThrow('tidak sesuai')
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('menghapus session saat logout', async () => {
    post.mockResolvedValue({ status: 204 })
    get.mockResolvedValue({ data: { user, permissions: [] } })
    await useAuthStore
      .getState()
      .signIn({ username: 'administrator.hris', password: 'restu123' })
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().session).toBeNull()
    expect(window.localStorage.getItem('hris-restu.api-session')).toBeNull()
  })
  it('clears session immediately while sign-out is pending and keeps it cleared on failure', async () => {
    post.mockResolvedValueOnce({ status: 204 })
    get.mockResolvedValue({ data: { user, permissions: [] } })
    await useAuthStore.getState().signIn({ username: 'test', password: 'test' })
    let reject!: (error: Error) => void
    post.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        })
    )
    const logout = useAuthStore.getState().signOut()
    expect(useAuthStore.getState().session).toBeNull()
    expect(localStorage.getItem('hris-restu.api-session')).toBeNull()
    reject(new Error('Synthetic offline'))
    await expect(logout).resolves.toBeUndefined()
    expect(useAuthStore.getState().session).toBeNull()
  })
  it('expires locally without POST sign-out and prevents cookie restoration from logging back in', async () => {
    post.mockResolvedValueOnce({ status: 204 })
    get.mockResolvedValue({ data: { user, permissions: [] } })
    await useAuthStore.getState().signIn({ username: 'test', password: 'test' })
    post.mockClear()
    get.mockClear()
    expireSession()
    expireSession()
    expect(useAuthStore.getState().session).toBeNull()
    await expect(useAuthStore.getState().refreshSession()).resolves.toBeNull()
    expect(post).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})
