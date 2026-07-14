import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticated/karyawan/data-karyawan_/$employeeUid/edit'
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/karyawan/ubah-karyawan/$employeeUid',
      params: { employeeUid: params.employeeUid },
      replace: true,
    })
  },
})
