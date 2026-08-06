import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import type { SystemSettingsTab } from '@/features/system-settings/domain'
import { SystemSettingsPage } from '@/features/system-settings/system-settings-page'

const tabSchema = z
  .enum([
    'kontrak',
    'profil-perusahaan',
    'attendance',
    'payroll',
    'notifikasi-integrasi',
  ])
  .optional()
  .catch(undefined)

export const Route = createFileRoute('/_authenticated/administrasi/pengaturan')(
  {
    validateSearch: z.object({ tab: tabSchema }),
    beforeLoad: () => {
      if (useAuthStore.getState().session?.user.role !== 'SUPER_ADMIN') {
        throw redirect({
          to: '/errors/$error',
          params: { error: 'forbidden' },
        })
      }
    },
    component: RouteComponent,
  }
)

function RouteComponent() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const tab: SystemSettingsTab = search.tab ?? 'kontrak'
  return (
    <SystemSettingsPage
      tab={tab}
      onTabChange={(next) =>
        void navigate({
          search: { tab: next === 'kontrak' ? undefined : next },
        })
      }
    />
  )
}
