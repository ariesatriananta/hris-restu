import { Outlet, createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/laporan')({
  beforeLoad: () => requirePermission('reports.view'),
  component: Outlet,
})
