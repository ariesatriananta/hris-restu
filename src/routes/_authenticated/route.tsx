import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const { session, refreshSession } = useAuthStore.getState()
    if (!session) refreshSession()
    if (!useAuthStore.getState().session) {
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href.startsWith('/') ? location.href : '/',
        },
      })
    }
  },
  component: AuthenticatedLayout,
})
