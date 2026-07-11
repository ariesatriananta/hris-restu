import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { safeRedirect } from '@/features/auth/safe-redirect'
import { UserAuthForm } from './user-auth-form'

const signIn = vi.fn().mockResolvedValue(undefined)
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (
    selector: (state: {
      signIn: typeof signIn
      isSigningIn: boolean
    }) => unknown
  ) => selector({ signIn, isSigningIn: false }),
}))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))

describe('UserAuthForm', () => {
  it('menampilkan kredensial demo dan field berlabel', async () => {
    const screen = await render(<UserAuthForm />)
    await expect
      .element(screen.getByRole('textbox', { name: 'Email' }))
      .toHaveValue('admin@hris-restu.test')
    await expect
      .element(screen.getByLabelText('Kata sandi'))
      .toHaveValue('restu123')
    await expect
      .element(screen.getByRole('button', { name: 'Masuk ke HRIS' }))
      .toBeInTheDocument()
  })

  it('hanya menerima redirect internal', () => {
    expect(safeRedirect('/payroll/periode')).toBe('/payroll/periode')
    expect(safeRedirect('//example.com')).toBe('/')
    expect(safeRedirect('https://example.com')).toBe('/')
  })
})
