import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticated/karyawan/data-karyawan/tambah'
)({
  beforeLoad: () => {
    throw redirect({ to: '/karyawan/tambah-karyawan', replace: true })
  },
})
