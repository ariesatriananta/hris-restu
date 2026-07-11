import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute(
  '/_authenticated/administrasi/user-hak-akses'
)({
  component: () => <ModulePlaceholder path='/administrasi/user-hak-akses' />,
})
