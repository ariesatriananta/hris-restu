import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute(
  '/_authenticated/produksi/terminal-setoran'
)({ component: () => <ModulePlaceholder path='/produksi/terminal-setoran' /> })
