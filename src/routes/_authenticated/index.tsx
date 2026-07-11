import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '@/features/dashboard'

const dashboardSearchSchema = z.object({
  site: z.enum(['ALL', 'JEPARA', 'SEMARANG', 'KLATEN']).catch('ALL').optional(),
  mockState: z
    .enum(['normal', 'loading', 'empty', 'error'])
    .catch('normal')
    .optional(),
})

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: dashboardSearchSchema,
  component: Dashboard,
})
