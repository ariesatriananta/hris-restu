import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute(
  '/_authenticated/administrasi/template-dokumen'
)({
  component: () => <ModulePlaceholder path='/administrasi/template-dokumen' />,
})
