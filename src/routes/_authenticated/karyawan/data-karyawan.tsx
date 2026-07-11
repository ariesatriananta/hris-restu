import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute('/_authenticated/karyawan/data-karyawan')({
  component: () => <ModulePlaceholder path='/karyawan/data-karyawan' />,
})
