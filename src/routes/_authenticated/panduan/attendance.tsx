import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'

const articleSchema = z
  .enum(['ringkasan', 'pengaturan', 'operasional', 'rekap'])
  .optional()
  .catch(undefined)

export const Route = createFileRoute('/_authenticated/panduan/attendance')({
  validateSearch: z.object({ artikel: articleSchema }),
  beforeLoad: ({ search }) => {
    const articleMap = {
      ringkasan: 'attendance-ringkasan',
      pengaturan: 'attendance-pengaturan',
      operasional: 'attendance-operasional',
      rekap: 'attendance-rekap',
    } as const
    throw redirect({
      to: '/panduan',
      search: {
        artikel: search.artikel
          ? articleMap[search.artikel]
          : 'attendance-ringkasan',
      },
      replace: true,
    })
  },
})
