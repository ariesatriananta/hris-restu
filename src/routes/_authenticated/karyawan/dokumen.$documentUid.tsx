import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticated/karyawan/dokumen/$documentUid'
)({ component: Outlet })
