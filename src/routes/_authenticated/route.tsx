import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const { session, refreshSession } = useAuthStore.getState()
    if (!session) await refreshSession()
    const currentSession = useAuthStore.getState().session
    if (!currentSession) {
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href.startsWith('/') ? location.href : '/',
        },
      })
    }
    if (
      currentSession.user.mustChangePassword &&
      location.pathname !== '/profil-saya'
    ) {
      throw redirect({ to: '/profil-saya' })
    }
  },
  component: AuthenticatedLayout,
})
