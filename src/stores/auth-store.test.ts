import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    window.localStorage.clear()
    get.mockReset()
    post.mockReset()
    useAuthStore.setState({ session: null, isSigningIn: false })
  })

  it('membuat dan menyimpan session dari cookie API', async () => {
    post.mockResolvedValue({ status: 204 })
    get.mockResolvedValue({ data: { user } })
    await useAuthStore
      .getState()
      .signIn({ email: user.email, password: 'restu123' })
    expect(useAuthStore.getState().session?.user.role).toBe('SUPER_ADMIN')
    expect(window.localStorage.getItem('hris-restu.api-session')).toContain(
      'Administrator HRIS'
    )
  })

  it('menolak kredensial yang salah', async () => {
    post.mockRejectedValue({ response: { status: 401 } })
    await expect(
      useAuthStore
        .getState()
        .signIn({ email: 'salah@example.test', password: 'salah' })
    ).rejects.toThrow('tidak sesuai')
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('menghapus session saat logout', async () => {
    post.mockResolvedValue({ status: 204 })
    get.mockResolvedValue({ data: { user } })
    await useAuthStore
      .getState()
      .signIn({ email: user.email, password: 'restu123' })
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().session).toBeNull()
    expect(window.localStorage.getItem('hris-restu.api-session')).toBeNull()
  })
})
