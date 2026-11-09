import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { isQcSession } from '@/features/auth/qc-access'
import { Dashboard } from '@/features/dashboard'

const dashboardSearchSchema = z.object({
  site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']).optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/')({
  beforeLoad: () => {
    if (isQcSession(useAuthStore.getState().session)) {
      throw redirect({ to: '/produksi/terminal-setoran' })
    }
  },
  validateSearch: dashboardSearchSchema,
  component: Dashboard,
})
