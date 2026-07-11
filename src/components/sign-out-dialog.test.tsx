import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { SignOutDialog } from './sign-out-dialog'

const navigate = vi.fn()
const signOut = vi.fn().mockResolvedValue(undefined)

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { signOut: typeof signOut }) => unknown) =>
    selector({ signOut }),
}))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
  useLocation: () => ({ href: '/payroll/periode' }),
}))

describe('SignOutDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('menghapus session dan kembali ke login', async () => {
    const screen = await render(<SignOutDialog open onOpenChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Keluar' }))
    expect(signOut).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith({
      to: '/sign-in',
      search: { redirect: '/payroll/periode' },
      replace: true,
    })
  })

  it('tidak logout saat dibatalkan', async () => {
    const screen = await render(<SignOutDialog open onOpenChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Batal' }))
    expect(signOut).not.toHaveBeenCalled()
  })
})
