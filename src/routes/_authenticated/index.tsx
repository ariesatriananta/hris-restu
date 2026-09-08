import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '@/features/dashboard'

const dashboardSearchSchema = z.object({
  site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']).optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: dashboardSearchSchema,
  component: Dashboard,
})
