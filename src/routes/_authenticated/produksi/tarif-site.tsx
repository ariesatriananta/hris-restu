import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute('/_authenticated/produksi/tarif-site')({
  component: () => <ModulePlaceholder path='/produksi/tarif-site' />,
})
