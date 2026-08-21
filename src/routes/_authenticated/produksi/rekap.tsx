import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/produksi/rekap')({
  beforeLoad: () => requirePermission('production.view'),
  component: () => <ModulePlaceholder path='/produksi/rekap' />,
})
