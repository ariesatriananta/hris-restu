import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireAnyPermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/attendance/koreksi')({
  beforeLoad: ({ search }) => {
    requireAnyPermission(['attendance.correct', 'attendance.approve'])
    throw redirect({
      to: '/attendance/tindak-lanjut',
      search: { ...search, tab: 'correction' },
      replace: true,
    })
  },
  validateSearch: z.object({
    businessDate: z.string().date().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    approvalStatus: z
      .array(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']))
      .optional(),
  }),
})
