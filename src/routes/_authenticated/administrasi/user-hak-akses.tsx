import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { UserAccessPage } from '@/features/user-access/user-access-page'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])

export const Route = createFileRoute(
  '/_authenticated/administrasi/user-hak-akses'
)({
  validateSearch: z.object({
    tab: z.enum(['users', 'roles']).optional(),
    filter: z.string().optional(),
    site: z.array(siteCode).optional(),
    status: z.array(z.enum(['ACTIVE', 'INACTIVE', 'LOCKED'])).optional(),
    role: z.array(z.string().uuid()).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
  }),
  beforeLoad: () => {
    if (useAuthStore.getState().session?.user.role !== 'SUPER_ADMIN') {
      throw redirect({
        to: '/errors/$error',
        params: { error: 'forbidden' },
      })
    }
  },
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <UserAccessPage search={Route.useSearch()} navigate={Route.useNavigate()} />
  )
}
