import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { ProductionTerminalPage } from '@/features/production/production-terminal-page'

export const Route = createFileRoute(
  '/_authenticated/produksi/terminal-setoran'
)({
  beforeLoad: () => requirePermission('production.scan'),
  component: ProductionTerminalPage,
})
