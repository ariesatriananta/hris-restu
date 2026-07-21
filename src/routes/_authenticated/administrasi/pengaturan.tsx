import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute('/_authenticated/administrasi/pengaturan')(
  {
    component: () => <ModulePlaceholder path='/administrasi/pengaturan' />,
  }
)
