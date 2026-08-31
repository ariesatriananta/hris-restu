import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { ReportsCatalogPage } from '@/features/reports/reports-catalog-page'

export const Route = createFileRoute('/_authenticated/laporan')({
  beforeLoad: () => requirePermission('reports.view'),
  component: ReportsCatalogPage,
})
