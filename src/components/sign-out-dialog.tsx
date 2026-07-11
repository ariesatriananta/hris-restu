import { useLocation, useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { safeRedirect } from '@/features/auth/safe-redirect'

export function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const signOut = useAuthStore((state) => state.signOut)
  async function handleSignOut() {
    await signOut()
    await navigate({
      to: '/sign-in',
      search: { redirect: safeRedirect(location.href) },
      replace: true,
    })
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title='Keluar dari HRIS?'
      desc='Sesi mock pada perangkat ini akan dihapus.'
      confirmText='Keluar'
      cancelBtnText='Batal'
      destructive
      handleConfirm={handleSignOut}
      className='sm:max-w-sm'
    />
  )
}
