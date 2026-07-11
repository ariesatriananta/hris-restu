import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute('/_authenticated/karyawan/cetak-id-card')({
  component: () => <ModulePlaceholder path='/karyawan/cetak-id-card' />,
})
