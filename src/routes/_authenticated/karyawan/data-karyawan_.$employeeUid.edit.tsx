import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticated/karyawan/data-karyawan_/$employeeUid/edit'
)({
  validateSearch: z.object({ returnTo: z.string().optional() }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/karyawan/ubah-karyawan/$employeeUid',
      params: { employeeUid: params.employeeUid },
      search: { returnTo: search.returnTo },
      replace: true,
    })
  },
})
